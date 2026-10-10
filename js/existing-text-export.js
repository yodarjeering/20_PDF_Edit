import {textGeometry} from './text-objects.js';
export function validateExistingEdit(item){
  if(item.source!=='pdf'||item.editMode!=='overlay'||item.unsupportedReason)throw new Error(item.unsupportedReason||'この文字列は現在の編集方式では安全に編集できません。');
  if(!Number.isFinite(item.fontSize)||item.fontSize<1||item.fontSize>300)throw new Error('文字サイズは1〜300 ptで指定してください。');
  if(!/^#[0-9a-f]{6}$/i.test(item.color||'')||!/^#[0-9a-f]{6}$/i.test(item.background||''))throw new Error('文字色・背景色を指定してください。元の色が不明な場合は文字色を選択してください。');
  if(item.transform?.length!==6||!item.transform.every(Number.isFinite)||Math.abs(item.transform[0]*item.transform[3]-item.transform[1]*item.transform[2])<1e-8)throw new Error('文字の座標を安全に扱えません。');
  const geometry=textGeometry(item);
  if(item.annotationKind==='FreeText'&&(!Number.isInteger(item.annotationIndex)||item.annotationIndex<0||item.annotationRect?.length!==4||!item.annotationRect.every(Number.isFinite)))throw new Error('元の注釈を安全に特定できません。');
  if(![geometry.width,geometry.height,...geometry.basis].every(Number.isFinite)||geometry.width<=0||geometry.height<=0)throw new Error('文字の範囲を安全に扱えません。');
}
export async function applyExistingTextEdits(page,edits,resolver){
  const lib=globalThis.PDFLib;
  const removedAnnotations=[];
  for(const item of Object.values(edits||{})){
    if(!item.isModified)continue;validateExistingEdit(item);
    const {font}=await resolver.prepare(page.doc,item),geometry=textGeometry(item);
    const rgb=hex=>lib.rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
    if(item.annotationKind==='FreeText'){
      const annots=page.node.Annots(),entry=annots?.get(item.annotationIndex),annotation=entry&&page.doc.context.lookup(entry);
      if(!(annotation instanceof lib.PDFDict)||annotation.get(lib.PDFName.of('Subtype'))?.toString()!=='/FreeText')throw new Error('元のテキストボックス注釈を特定できません。');
      const lines=item.text.split(/\r\n?|\n/),lineHeight=item.fontSize*1.2;
      const maxWidth=Math.max(0,...lines.map(line=>font.widthOfTextAtSize(line,item.fontSize)));
      const scale=Math.min(1,(geometry.width-4)/Math.max(1,maxWidth),(geometry.height-4)/Math.max(1,lines.length*lineHeight));
      if(scale<=0)throw new Error('テキストボックス注釈の範囲が小さすぎます。');
      page.drawRectangle({x:item.x,y:item.y,width:geometry.width,height:geometry.height,color:rgb(item.background)});
      lines.forEach((line,index)=>{if(line)page.drawText(line,{x:item.x+2,y:item.y+geometry.height-2-item.fontSize*scale-index*lineHeight*scale,font,size:item.fontSize*scale,color:rgb(item.color)});});
      removedAnnotations.push(item.annotationIndex);continue;
    }
    // Stage A: opaque cover + new text. The original stream/text remains in the
    // document and can still be extracted. This is NOT redaction or direct editing.
    page.pushOperators(lib.pushGraphicsState(),lib.concatTransformationMatrix(...geometry.basis));
    page.drawRectangle({x:-1,y:geometry.bottom-1,width:geometry.width+2,height:geometry.height+2,color:rgb(item.background)});
    // Preserve baseline, orientation and font size. Long replacements compress
    // horizontally to the original width rather than spilling into adjacent text.
    const width=font.widthOfTextAtSize(item.text,item.fontSize),scale=width>0?Math.min(1,geometry.width/width):1;
    page.pushOperators(lib.concatTransformationMatrix(scale,0,0,1,0,0));
    if(item.text)page.drawText(item.text,{x:0,y:0,font,size:item.fontSize,color:rgb(item.color)});
    page.pushOperators(lib.popGraphicsState());
  }
  // Copying pages renumbers references, but preserves the Annots array order.
  for(const index of [...new Set(removedAnnotations)].sort((a,b)=>b-a))page.node.Annots().remove(index);
}
