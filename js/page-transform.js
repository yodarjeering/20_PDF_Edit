// Keep the original PDF coordinates for editing; apply page geometry on export.
export function transformPage(page,ref,lib){
  const scale=ref.pageScale||1;
  const rotation=((page.getRotation().angle+ref.rotation)%360+360)%360;
  const swap=rotation===90||rotation===270;
  const flipX=swap?ref.mirrorY:ref.mirrorX;
  const flipY=swap?ref.mirrorX:ref.mirrorY;
  const crop=page.getCropBox();
  const boxes=[['getMediaBox','setMediaBox'],['getCropBox','setCropBox'],['getBleedBox','setBleedBox'],['getTrimBox','setTrimBox'],['getArtBox','setArtBox']].map(([get,set])=>[set,page[get]()]);
  const a=flipX?-scale:scale,d=flipY?-scale:scale;
  const e=flipX?scale*(2*crop.x+crop.width):0;
  const f=flipY?scale*(2*crop.y+crop.height):0;
  if(scale!==1||flipX||flipY){
    // Normalize and flush any content added by the editing tools before wrapping.
    page.getContentStream();page.node.normalize();
    const context=page.doc.context;
    const start=context.register(context.flateStream(`q\n${a} 0 0 ${d} ${e} ${f} cm\n`));
    const end=context.register(context.flateStream('Q\n'));
    page.node.wrapContentStreams(start,end);
    for(const [set,box] of boxes){
      page[set](box.x*scale,box.y*scale,box.width*scale,box.height*scale);
    }
    // Annotation geometry lives outside the page content stream.
    const {PDFName,PDFArray,PDFDict,PDFNumber,PDFRawStream}=lib;
    const point=(x,y)=>[a*x+e,d*y+f];
    for(const entry of page.node.Annots()?.asArray()||[]){
      const annotation=context.lookup(entry,PDFDict);
      for(const name of ['Rect','QuadPoints','Vertices','L','CL']){
        const values=annotation.lookupMaybe(PDFName.of(name),PDFArray);
        if(!values)continue;
        const numbers=values.asArray().map(n=>context.lookup(n,PDFNumber).asNumber());
        let result=[];for(let i=0;i+1<numbers.length;i+=2)result.push(...point(numbers[i],numbers[i+1]));
        if(name==='Rect')result=[Math.min(result[0],result[2]),Math.min(result[1],result[3]),Math.max(result[0],result[2]),Math.max(result[1],result[3])];
        annotation.set(PDFName.of(name),context.obj(result));
      }
      if(flipX||flipY){
        const ap=annotation.lookupMaybe(PDFName.of('AP'),PDFDict);
        if(!ap)continue;
        const clone=ap.clone(context);annotation.set(PDFName.of('AP'),clone);
        const reflect=stream=>{
          if(!(stream instanceof PDFRawStream))return stream;
          const dict=stream.dict.clone(context);
          const matrix=dict.lookupMaybe(PDFName.of('Matrix'),PDFArray)?.asArray().map(n=>context.lookup(n,PDFNumber).asNumber())||[1,0,0,1,0,0];
          // Reflection of appearance space; viewers fit it into the transformed Rect.
          dict.set(PDFName.of('Matrix'),context.obj([matrix[0]*(flipX?-1:1),matrix[1]*(flipY?-1:1),matrix[2]*(flipX?-1:1),matrix[3]*(flipY?-1:1),matrix[4]*(flipX?-1:1),matrix[5]*(flipY?-1:1)]));
          return context.register(PDFRawStream.of(dict,stream.contents));
        };
        for(const [key,value] of clone.entries()){
          const appearance=context.lookup(value);
          if(appearance instanceof PDFDict){const states=appearance.clone(context);for(const [state,stream] of states.entries())states.set(state,reflect(context.lookup(stream)));clone.set(key,states);}
          else clone.set(key,reflect(appearance));
        }
      }
    }
  }
  page.setRotation(lib.degrees(rotation));
}
