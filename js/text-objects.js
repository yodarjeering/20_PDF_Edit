import {normalizeFontName} from './pdf-fonts.js';
export function multiplyMatrices(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function textGeometry(item){
  const [a,b,c,d,e,f]=item.transform,size=item.originalFontSize||item.fontSize;
  const xScale=Math.hypot(a,b)/size;
  const top=(item.ascent??.8)*size,bottom=(item.descent??-.2)*size;
  return {width:item.width/xScale,height:top-bottom,top,bottom,basis:[a/size,b/size,c/size,d/size,e,f],
    css:[a/size,b/size,-c/size,-d/size,e+c/size*top,f+d/size*top]};
}
const normalize=value=>value.normalize('NFKC').replace(/\s/g,'');
// Operator-list glyphs provide color and rendering mode; getTextContent remains
// the sole source of text, geometry and styles. Ambiguous matches stay unknown.
export function textPaints(operatorList,OPS){
  const chars=[],paints=[],stack=[];let state={color:'#000000',font:null,renderMode:0,opacity:1,complex:false};
  for(let i=0;i<operatorList.fnArray.length;i++){
    const op=operatorList.fnArray[i],args=operatorList.argsArray[i]||[];
    if(op===OPS.save||op===OPS.paintFormXObjectBegin)stack.push({...state});
    else if(op===OPS.restore||op===OPS.paintFormXObjectEnd)state=stack.pop()||{...state,complex:true};
    else if(op===OPS.setFont)state.font=args[0];
    else if(op===OPS.setFillRGBColor)state.color=typeof args[0]==='string'?args[0]:null;
    else if(op===OPS.setFillColorN||op===OPS.setFillTransparent)state.color=null;
    else if(op===OPS.setTextRenderingMode)state.renderMode=args[0];
    else if(op===OPS.clip||op===OPS.eoClip||op===OPS.beginGroup)state.complex=true;
    else if(op===OPS.setGState){for(const [key,value]of args[0]||[]){if(key==='ca')state.opacity=value;if(key==='SMask'||key==='BM')state.complex=true;}}
    else if(op===OPS.showText||op===OPS.showSpacedText||op===OPS.nextLineShowText||op===OPS.nextLineSetSpacingShowText){
      const glyphs=args.find(Array.isArray)||[];
      for(const glyph of glyphs)if(glyph&&typeof glyph==='object'&&typeof glyph.unicode==='string')for(const char of normalize(glyph.unicode)){chars.push(char);paints.push({...state});}
    }
  }
  let cursor=0;const text=chars.join('');
  return item=>{
    const needle=normalize(item.str);if(!needle)return null;
    // Compare code points, including supplementary Unicode characters.
    const index=text.indexOf(needle,cursor);if(index<0)return null;
    const start=Array.from(text.slice(0,index)).length,states=paints.slice(start,start+Array.from(needle).length);cursor=index+needle.length;
    const first=states[0];
    return first&&states.every(p=>p.font===item.fontName&&p.color===first.color&&p.renderMode===first.renderMode&&p.opacity===first.opacity&&p.complex===first.complex)?first:null;
  };
}
export function createTextObjects(content,{sourceId,pageIndex,fontMap=new Map(),paintFor=()=>null}){
  return content.items.flatMap((item,index)=>{
    if(typeof item.str!=='string'||!item.str.trim())return [];
    const style=content.styles[item.fontName]||{},font=fontMap.get(item.fontName),paint=paintFor(item);
    const transform=[...item.transform],fontSize=Math.hypot(transform[2],transform[3]);
    const valid=transform.every(Number.isFinite)&&fontSize>0&&item.width>0&&Math.abs(transform[0]*transform[3]-transform[1]*transform[2])>1e-8;
    let reason=null;
    if(!valid)reason='文字の座標・変換行列を安全に扱えません。';
    else if(font?.subtype==='Type3')reason='Type3の字形描画による文字編集は未対応です。';
    else if(style.vertical||item.dir==='ttb')reason='縦書きの既存文字編集は未対応です。';
    else if(item.dir==='rtl')reason='右から左への複雑な文字組みは未対応です。';
    else if(paint&&(paint.renderMode!==0||paint.opacity!==1||paint.complex))reason='クリップ・透過・輪郭描画などの文字は未対応です。';
    const fontName=font?.fontName||item.fontName;
    return [{id:`${sourceId}:${pageIndex}:${index}`,sourceId,pageIndex,source:'pdf',text:item.str,originalText:item.str,
      x:transform[4],y:transform[5],position:{x:transform[4],y:transform[5]},width:item.width,height:item.height,size:{width:item.width,height:item.height},
      fontName,normalizedFontName:normalizeFontName(fontName),originalFontIdentified:Boolean(font),fontFamily:style.fontFamily||'sans-serif',pdfjsFontName:item.fontName,
      fontSize,originalFontSize:fontSize,transform,ascent:style.ascent??.8,descent:style.descent??-.2,
      color:paint?.color||null,originalColor:paint?.color||null,pdfFontRef:font?.pdfFontRef||null,embeddedFont:font?.embeddedFont||null,
      fontSubtype:font?.subtype||null,encoding:font?.encoding||null,hasToUnicode:font?.hasToUnicode||false,
      isModified:false,fontChoice:'auto',background:'#ffffff',editMode:reason?'unsupported':'overlay',unsupportedReason:reason}];
  });
}
