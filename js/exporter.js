import {exportShape} from './shapes.js';
import {drawTextBox} from './text.js';
import {ensureTextFonts,textFont,fontKey} from './fonts.js';
import {applyExistingTextEdits} from './existing-text-export.js';
export async function exportPdf(pages,sources,resolver) {
  if(!pages.length)throw new Error('保存するページがありません。');
  const {PDFDocument,degrees}=globalThis.PDFLib;
  const output=await PDFDocument.create(), loaded=new Map(),fonts=new Map();
  if(pages.some(page=>page.images?.some(item=>item.type==='text'))){output.registerFontkit(globalThis.fontkit);}
  for(const ref of pages){
    if(!loaded.has(ref.sourceId))loaded.set(ref.sourceId,await PDFDocument.load(sources.get(ref.sourceId).bytes));
    const [page]=await output.copyPages(loaded.get(ref.sourceId),[ref.sourcePage-1]);
    if(Object.keys(ref.textEdits||{}).length){if(!resolver)throw new Error('既存文字のフォント解決が準備されていません。');await applyExistingTextEdits(page,ref.textEdits,resolver);}
    for(const item of ref.images||[]) {
      if(item.type==='shape'){exportShape(page,item,globalThis.PDFLib);continue;}
      if(item.type==='text'){
        const key=fontKey(item.bold,item.fontId);
        if(!fonts.has(key)){await ensureTextFonts(item.fontId,item.bold);fonts.set(key,await output.embedFont(textFont(item.bold,item.fontId).bytes,{subset:true,features:{kern:false,liga:false}}));}
        drawTextBox(page,item,fonts.get(key),globalThis.PDFLib);continue;
      }
      const data=item.data;
      const image=data.startsWith('data:image/png')?await output.embedPng(data):await output.embedJpg(data);
      page.drawImage(image,{x:item.x,y:item.y,width:item.width,height:item.height,rotate:degrees(item.angle||0)});
    }
    page.setRotation(degrees(((page.getRotation().angle+ref.rotation)%360+360)%360));output.addPage(page);
  }
  return output.save();
}
