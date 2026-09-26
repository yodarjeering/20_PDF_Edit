export async function exportPdf(pages,sources) {
  if(!pages.length)throw new Error('保存するページがありません。');
  const {PDFDocument,degrees}=globalThis.PDFLib;
  const output=await PDFDocument.create(), loaded=new Map();
  for(const ref of pages){
    if(!loaded.has(ref.sourceId))loaded.set(ref.sourceId,await PDFDocument.load(sources.get(ref.sourceId).bytes));
    const [page]=await output.copyPages(loaded.get(ref.sourceId),[ref.sourcePage-1]);
    page.setRotation(degrees(((page.getRotation().angle+ref.rotation)%360+360)%360));output.addPage(page);
  }
  return output.save();
}
