import * as pdfjs from '../vendor/pdfjs/build/pdf.mjs';
import {inspectPageFonts,matchPdfFonts} from './pdf-fonts.js';
import {createTextObjects,textPaints} from './text-objects.js';
import {FontResolver} from './font-resolver.js';
import {applyExistingTextEdits} from './existing-text-export.js';
const standalone=globalThis.__PDF_STUDIO_STANDALONE__;
pdfjs.GlobalWorkerOptions.workerSrc=standalone?.workerSrc||new URL('../vendor/pdfjs/build/pdf.worker.mjs',import.meta.url).href;
if(standalone?.workerPort)pdfjs.GlobalWorkerOptions.workerPort=standalone.workerPort;
const assets=standalone?.assetsBase||new URL('../vendor/pdfjs/',import.meta.url).href;
const pdfOptions={cMapUrl:assets+'cmaps/',cMapPacked:true,standardFontDataUrl:assets+'standard_fonts/',wasmUrl:assets+'wasm/',isEvalSupported:false,...(standalone?{useWorkerFetch:true,useSystemFonts:false}:{})};
export class DocumentStore {
  sources=new Map();
  fontResolver=new FontResolver(this);
  renderUses=new WeakMap();
  async load(file) {
    const bytes=new Uint8Array(await file.arrayBuffer());
    const task=pdfjs.getDocument({data:bytes.slice(),...pdfOptions});
    // Password protected files are rejected consistently by both engines.
    task.onPassword=()=>task.destroy();
    let pdf;
    try {pdf=await task.promise;await PDFLib.PDFDocument.load(bytes);}
    catch(error){await task.destroy();throw new Error(`${file.name}: PDFを読み込めません。破損・暗号化されたPDFには対応していません。`,{cause:error});}
    const id=crypto.randomUUID();const source={id,name:file.name,bytes,pdf,textObjects:new Map(),inspections:new Map(),previews:new Map(),previewUsers:new Map()};this.sources.set(id,source);
    const pages=Array.from({length:pdf.numPages},(_,i)=>({id:crypto.randomUUID(),sourceId:id,sourcePage:i+1,rotation:0}));
    source.pages=pages.map(p=>({...p}));
    return pages;
  }
  page(ref){return this.sources.get(ref.sourceId).pdf.getPage(ref.sourcePage);}
  // Future text analysis uses the same source identity and viewport as rendering.
  async textContent(ref){return (await this.page(ref)).getTextContent();}
  async fontInspection(sourceId,pageIndex){
    const source=this.sources.get(sourceId);
    if(!source)throw new Error('元PDFが見つかりません。');
    if(!source.inspections.has(pageIndex))source.inspections.set(pageIndex,(async()=>{
      source.libDocument??=globalThis.PDFLib.PDFDocument.load(source.bytes);
      return inspectPageFonts(await source.libDocument,pageIndex);
    })());
    return source.inspections.get(pageIndex);
  }
  async textObjects(ref){
    const source=this.sources.get(ref.sourceId);
    if(!source.textObjects.has(ref.sourcePage))source.textObjects.set(ref.sourcePage,(async()=>{
      const page=await this.page(ref);
      const [content,operators,inspection]=await Promise.all([page.getTextContent(),page.getOperatorList(),this.fontInspection(ref.sourceId,ref.sourcePage-1)]);
      return createTextObjects(content,{sourceId:ref.sourceId,pageIndex:ref.sourcePage-1,fontMap:matchPdfFonts(inspection,operators,pdfjs.OPS),paintFor:textPaints(operators,pdfjs.OPS)});
    })().catch(error=>{source.textObjects.delete(ref.sourcePage);throw error;}));
    const originals=await source.textObjects.get(ref.sourcePage);
    return originals.map(item=>ref.textEdits?.[item.id]||item);
  }
  async renderPage(ref){
    if(!Object.keys(ref.textEdits||{}).length)return this.page(ref);
    const source=this.sources.get(ref.sourceId),key=ref.sourcePage+':'+JSON.stringify(ref.textEdits);
    if(!source.previews.has(key))source.previews.set(key,(async()=>{
      const output=await globalThis.PDFLib.PDFDocument.create();
      source.libDocument??=globalThis.PDFLib.PDFDocument.load(source.bytes);
      const [page]=await output.copyPages(await source.libDocument,[ref.sourcePage-1]);output.addPage(page);
      await applyExistingTextEdits(page,ref.textEdits,this.fontResolver);
      return pdfjs.getDocument({data:await output.save(),...pdfOptions}).promise;
    })().catch(error=>{source.previews.delete(key);throw error;}));
    source.previewUsers.set(key,(source.previewUsers.get(key)||0)+1);
    try{
      const document=await source.previews.get(key),page=await document.getPage(1);
      this.renderUses.set(page,{source,key});return page;
    }catch(error){source.previewUsers.set(key,source.previewUsers.get(key)-1);throw error;}
  }
  releaseRenderPage(page){
    const usage=this.renderUses.get(page);if(!usage)return;
    const {source,key}=usage;source.previewUsers.set(key,Math.max(0,source.previewUsers.get(key)-1));
    // Bound preview copies while retaining documents used by concurrent renders.
    for(const [oldKey,promise]of source.previews){
      if(source.previews.size<=6)break;
      if(source.previewUsers.get(oldKey))continue;
      source.previews.delete(oldKey);source.previewUsers.delete(oldKey);
      promise.then(document=>document.destroy()).catch(()=>{});
    }
  }
  async discard(ids){for(const id of ids){const source=this.sources.get(id);this.sources.delete(id);this.fontResolver.discard(id);if(source){await source.pdf.destroy();for(const preview of source.previews.values())try{await(await preview).destroy();}catch{}}}}
  async collect(model, retainedSourceIds=[]){const retained=new Set([model.snapshot(),...model.past,...model.future].flatMap(s=>s.documentIds));retainedSourceIds.forEach(id=>retained.add(id));await this.discard([...this.sources.keys()].filter(id=>!retained.has(id)));}
}
