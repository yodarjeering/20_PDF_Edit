import {ensureTextFonts,textFont,fontCatalog,defaultFontId} from './fonts.js';
import {normalizeFontName} from './pdf-fonts.js';
const standardNames=['Courier','Courier-Bold','Courier-Oblique','Courier-BoldOblique','Helvetica','Helvetica-Bold','Helvetica-Oblique','Helvetica-BoldOblique','Times-Roman','Times-Bold','Times-Italic','Times-BoldItalic','Symbol','ZapfDingbats'];
export function canRender(parsed,text){try{return typeof parsed?.hasGlyphForCodePoint==='function'&&Array.from(text).every(char=>parsed.hasGlyphForCodePoint(char.codePointAt(0)));}catch{return false;}}
export class FontResolver{
  constructor(store){this.store=store;this.programs=new Map();this.documents=new WeakMap();}
  async resolveFont(object,newText,choice=object.fontChoice||'auto',skipOriginal=false){
    if(newText.length>10000||/[\r\n\t]/.test(newText))throw new Error('既存文字は1行・10,000文字以内で編集してください。');
    if(/[\u0590-\u0fff\u1780-\u17ff\u200e-\u200f\u202a-\u202e\u2066-\u2069]/u.test(newText))throw new Error('この文字列は現在の編集方式では安全に編集できません。双方向・複雑な文字組みは未対応です。');
    let reason='元フォントが未埋め込み、またはUnicode Glyphを再利用できません。';
    if(choice==='auto'&&!skipOriginal){
      const inspection=await this.store.fontInspection(object.sourceId,object.pageIndex);
      const original=inspection.records.find(font=>font.pdfFontRef===object.pdfFontRef);
      if(original?.embeddedFont){
        const key=`${object.sourceId}:${original.pdfFontRef}`;
        if(!this.programs.has(key)){
          try{
            const format=original.embeddedFont;
            if(format.kind!=='FontFile2'&&!(format.kind==='FontFile3'&&format.subtype==='OpenType'))throw new Error('Raw CFF/Type1 requires a separate adapter');
            const bytes=original.readEmbedded(),parsed=globalThis.fontkit.create(bytes);
            this.programs.set(key,{bytes,parsed});
          }catch{this.programs.set(key,null);}
        }
        const program=this.programs.get(key);
        if(program&&canRender(program.parsed,newText))return {kind:'original-embedded',key,bytes:program.bytes,label:original.fontName,reason:'元の埋め込みフォントとUnicode Glyphを再利用します。'};
        reason='元のSubset Fontに必要なUnicode Glyphがない、またはフォント形式を再利用できません。';
      }
      const name=normalizeFontName(object.fontName);
      if(!original?.embeddedFont&&standardNames.includes(name)){
        return {kind:'standard',key:'standard:'+name,standardName:name,label:name,reason:'同じPDF標準フォントを使用します。'};
      }
    }
    const bold=/bold|black|heavy|demi|semibold/i.test(object.normalizedFontName);
    const serif=!/sans|gothic|ゴシック/i.test(object.normalizedFontName)&&/serif|mincho|明朝|times/i.test(object.normalizedFontName);
    const candidates=choice==='auto'?[serif?'noto-serif':defaultFontId,...fontCatalog.map(font=>font.id)]:[choice];
    for(const fontId of new Set(candidates)){
      await ensureTextFonts(fontId,bold);const font=textFont(bold,fontId);
      if(canRender(font.parsed,newText))return {kind:'builtin',key:`builtin:${fontId}:${bold}`,bytes:font.bytes,fontId,bold,label:fontCatalog.find(font=>font.id===fontId).label,reason:choice==='auto'?reason:'指定した内蔵フォントを使用します。'};
    }
    throw new Error('この文字列は現在の編集方式では安全に編集できません。対応Glyphを持つフォントがありません。');
  }
  async embed(document,resolution,text){
    if(!this.documents.has(document))this.documents.set(document,new Map());
    const cache=this.documents.get(document);
    if(!cache.has(resolution.key)){
      document.registerFontkit(globalThis.fontkit);
      cache.set(resolution.key,await document.embedFont(resolution.standardName||resolution.bytes,{subset:true,features:{kern:false,liga:false}}));
    }
    const font=cache.get(resolution.key);font.encodeText(text);return font;
  }
  async prepare(document,object,text=object.text){
    let resolution=await this.resolveFont(object,text);
    try{return {resolution,font:await this.embed(document,resolution,text)};}
    catch(error){
      if(object.fontChoice!=='auto'&&object.fontChoice)throw error;
      resolution=await this.resolveFont(object,text,'auto',true);
      resolution.reason='元フォントで新しい文字をエンコードできないため内蔵フォントに切り替えました。';
      return {resolution,font:await this.embed(document,resolution,text)};
    }
  }
  discard(sourceId){for(const key of this.programs.keys())if(key.startsWith(sourceId+':'))this.programs.delete(key);}
}
