import {exportShape} from './shapes.js';
import {textCanvas} from './text.js';
export async function exportPdf(pages,sources) {
  if(!pages.length)throw new Error('保存するページがありません。');
  const {PDFDocument,degrees}=globalThis.PDFLib;
  const output=await PDFDocument.create(), loaded=new Map();
  for(const ref of pages){
    if(!loaded.has(ref.sourceId))loaded.set(ref.sourceId,await PDFDocument.load(sources.get(ref.sourceId).bytes));
    const [page]=await output.copyPages(loaded.get(ref.sourceId),[ref.sourcePage-1]);
    for(const item of ref.images||[]) {
      if(item.type==='shape'){exportShape(page,item,globalThis.PDFLib);continue;}
      const data=item.type==='text'?textCanvas(item).toDataURL('image/png'):item.data;
      const image=data.startsWith('data:image/png')?await output.embedPng(data):await output.embedJpg(data);
      page.drawImage(image,{x:item.x,y:item.y,width:item.width,height:item.height,rotate:degrees(item.angle||0)});
    }
    page.setRotation(degrees(((page.getRotation().angle+ref.rotation)%360+360)%360));output.addPage(page);
  }
  return output.save();
}
