import {analyzeContent} from './pdf-content.js';
export function normalizeFontName(name=''){return name.replace(/^[A-Z]{6}\+/,'');}
const nameValue=value=>value?.decodeText?.()??null;
// PDF dictionaries are inspected through pdf-lib, not PDF.js private font objects.
export function inspectPageFonts(document,pageIndex,lib=globalThis.PDFLib){
  const {PDFName,PDFDict,PDFArray,decodePDFRawStream}=lib,context=document.context;
  const lookup=value=>value?context.lookup(value):null;
  const get=(dict,key)=>dict instanceof PDFDict?lookup(dict.get(PDFName.of(key))):null;
  const page=document.getPages()[pageIndex],resources=page.node.Resources(),fonts=get(resources,'Font'),records=[];
  for(const [key,ref]of fonts instanceof PDFDict?fonts.entries():[]){
    const dictionary=lookup(ref),subtype=nameValue(get(dictionary,'Subtype'));
    const descendants=get(dictionary,'DescendantFonts'),descendant=descendants instanceof PDFArray?lookup(descendants.get(0)):null;
    const descriptor=get(descendant||dictionary,'FontDescriptor');
    let embeddedFont=null;
    for(const kind of ['FontFile','FontFile2','FontFile3']){
      const stream=get(descriptor,kind);
      if(stream){embeddedFont={kind,subtype:nameValue(get(stream.dict,'Subtype')),ref:descriptor.get(PDFName.of(kind))?.toString()};break;}
    }
    const fontName=nameValue(get(dictionary,'BaseFont'))||nameValue(get(descriptor,'FontName'))||key.decodeText();
    const encoding=get(dictionary,'Encoding'),toUnicode=get(dictionary,'ToUnicode');
    records.push({resourceName:key.decodeText(),pdfFontRef:ref.toString(),fontName,normalizedFontName:normalizeFontName(fontName),subtype,
      descendantSubtype:nameValue(get(descendant,'Subtype')),encoding:nameValue(encoding)||(encoding?'dictionary/stream':null),
      hasToUnicode:Boolean(toUnicode),isSubset:/^[A-Z]{6}\+/.test(fontName),embeddedFont,
      readEmbedded:()=>{
        if(!embeddedFont)return null;
        const stream=get(descriptor,embeddedFont.kind);
        return new Uint8Array(decodePDFRawStream(stream).decode());
      }});
  }
  let content;
  try{
    const contents=lookup(page.node.Contents()),streams=contents instanceof PDFArray?contents.asArray().map(lookup):contents?[contents]:[];
    const decoder=new TextDecoder('latin1');
    content=analyzeContent(streams.map(stream=>decoder.decode(decodePDFRawStream(stream).decode())).join('\n'));
  }catch(error){content={parsed:false,fonts:[],operators:[],directSupported:false,reason:error.message};}
  return {records,content};
}
export function matchPdfFonts(inspection,operatorList,OPS){
  const assignments=operatorList.fnArray.flatMap((fn,i)=>fn===OPS.setFont?[operatorList.argsArray[i][0]]:[]);
  const names=inspection.content.fonts,result=new Map();
  // Form XObjects have independent resources. Do not guess a mapping by index.
  if(!inspection.content.parsed||inspection.content.hasXObjects||assignments.length!==names.length)return result;
  assignments.forEach((id,i)=>{
    const record=inspection.records.find(font=>font.resourceName===names[i]);
    if(result.has(id)&&result.get(id)?.pdfFontRef!==record?.pdfFontRef)result.set(id,null);
    else if(record&&!result.has(id))result.set(id,record);
  });
  return result;
}
