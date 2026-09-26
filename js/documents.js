import * as pdfjs from '../vendor/pdfjs/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/build/pdf.worker.mjs',import.meta.url).href;
const assets=new URL('../vendor/pdfjs/',import.meta.url).href;
export class DocumentStore {
  sources=new Map();
  async load(file) {
    const bytes=new Uint8Array(await file.arrayBuffer());
    const task=pdfjs.getDocument({data:bytes.slice(),cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',isEvalSupported:false});
    // Password protected files are rejected consistently by both engines.
    task.onPassword=()=>task.destroy();
    let pdf;
    try {pdf=await task.promise;await PDFLib.PDFDocument.load(bytes);}
    catch(error){await task.destroy();throw new Error(`${file.name}: PDFを読み込めません。破損・暗号化されたPDFには対応していません。`,{cause:error});}
    const id=crypto.randomUUID();const source={id,name:file.name,bytes,pdf};this.sources.set(id,source);
    const pages=Array.from({length:pdf.numPages},(_,i)=>({id:crypto.randomUUID(),sourceId:id,sourcePage:i+1,rotation:0}));
    source.pages=pages.map(p=>({...p}));
    return pages;
  }
  page(ref){return this.sources.get(ref.sourceId).pdf.getPage(ref.sourcePage);}
  // Future text analysis uses the same source identity and viewport as rendering.
  async textContent(ref){return (await this.page(ref)).getTextContent();}
  async discard(ids){for(const id of ids){const source=this.sources.get(id);this.sources.delete(id);await source?.pdf.destroy();}}
  async collect(model, retainedSourceIds=[]){const retained=new Set([model.snapshot(),...model.past,...model.future].flatMap(s=>s.documentIds));retainedSourceIds.forEach(id=>retained.add(id));await this.discard([...this.sources.keys()].filter(id=>!retained.has(id)));}
}
