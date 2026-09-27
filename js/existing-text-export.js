import {textGeometry} from './text-objects.js';
export function validateExistingEdit(item){
  if(item.source!=='pdf'||item.editMode!=='overlay'||item.unsupportedReason)throw new Error(item.unsupportedReason||'この文字列は現在の編集方式では安全に編集できません。');
  if(!Number.isFinite(item.fontSize)||item.fontSize<1||item.fontSize>300)throw new Error('文字サイズは1〜300 ptで指定してください。');
  if(!/^#[0-9a-f]{6}$/i.test(item.color||'')||!/^#[0-9a-f]{6}$/i.test(item.background||''))throw new Error('文字色・背景色を指定してください。元の色が不明な場合は文字色を選択してください。');
  if(item.transform?.length!==6||!item.transform.every(Number.isFinite)||Math.abs(item.transform[0]*item.transform[3]-item.transform[1]*item.transform[2])<1e-8)throw new Error('文字の座標を安全に扱えません。');
  const geometry=textGeometry(item);
  if(![geometry.width,geometry.height,...geometry.basis].every(Number.isFinite)||geometry.width<=0||geometry.height<=0)throw new Error('文字の範囲を安全に扱えません。');
}
export async function applyExistingTextEdits(page,edits,resolver){
  const lib=globalThis.PDFLib;
  for(const item of Object.values(edits||{})){
    if(!item.isModified)continue;validateExistingEdit(item);
    const {font}=await resolver.prepare(page.doc,item),geometry=textGeometry(item);
    const rgb=hex=>lib.rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
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
}
