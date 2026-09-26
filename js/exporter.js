import {exportShape} from './shapes.js';
import {drawTextBox} from './text.js';
import {ensureTextFonts,textFont} from './fonts.js';
export async function exportPdf(pages,sources) {
  if(!pages.length)throw new Error('保存するページがありません。');
  const {PDFDocument,degrees}=globalThis.PDFLib;
  const output=await PDFDocument.create(), loaded=new Map(),fonts=new Map();
  if(pages.some(page=>page.images?.some(item=>item.type==='text'))){await ensureTextFonts();output.registerFontkit(globalThis.fontkit);}
  for(const ref of pages){
    if(!loaded.has(ref.sourceId))loaded.set(ref.sourceId,await PDFDocument.load(sources.get(ref.sourceId).bytes));
    const [page]=await output.copyPages(loaded.get(ref.sourceId),[ref.sourcePage-1]);
    for(const item of ref.images||[]) {
      if(item.type==='shape'){exportShape(page,item,globalThis.PDFLib);continue;}
      if(item.type==='text'){
        const bold=Boolean(item.bold);
        if(!fonts.has(bold))fonts.set(bold,await output.embedFont(textFont(bold).bytes,{subset:true,features:{kern:false,liga:false}}));
        drawTextBox(page,item,fonts.get(bold),globalThis.PDFLib);continue;
      }
      const data=item.data;
      const image=data.startsWith('data:image/png')?await output.embedPng(data):await output.embedJpg(data);
      page.drawImage(image,{x:item.x,y:item.y,width:item.width,height:item.height,rotate:degrees(item.angle||0)});
    }
    page.setRotation(degrees(((page.getRotation().angle+ref.rotation)%360+360)%360));output.addPage(page);
  }
  return output.save();
}
