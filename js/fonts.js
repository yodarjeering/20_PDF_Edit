const loaded=new Map();
let pending;
export const textFontFamily='PDFStudioNotoSansJP';
export function ensureTextFonts() {
  if(!pending)pending=Promise.all([false,true].map(async bold=>{
    const filename=bold?'NotoSansJP-Bold.otf':'NotoSansJP-Regular.otf';
    const response=await fetch(new URL('../vendor/fonts/'+filename,import.meta.url));
    if(!response.ok)throw new Error('日本語フォントを読み込めません。ローカルサーバーの起動を確認してください。');
    const bytes=await response.arrayBuffer();
    const parsed=globalThis.fontkit.create(new Uint8Array(bytes));
    const face=new FontFace(textFontFamily,bytes,{weight:bold?'700':'400'});
    await face.load();document.fonts.add(face);loaded.set(bold,{bytes,parsed});
  })).catch(error=>{pending=null;throw error;});
  return pending;
}
export function textFont(bold=false){const font=loaded.get(Boolean(bold));if(!font)throw new Error('日本語フォントの準備が完了していません。');return font;}
export function textWidth(value,item){const font=textFont(item.bold).parsed;return Array.from(value).reduce((sum,char)=>sum+font.glyphForCodePoint(char.codePointAt(0)).advanceWidth,0)*item.fontSize/font.unitsPerEm;}
export function textAscent(item){const font=textFont(item.bold).parsed;return font.ascent*item.fontSize/font.unitsPerEm;}
export function textDescent(item){const font=textFont(item.bold).parsed;return -font.descent*item.fontSize/font.unitsPerEm;}
export function validateText(value,bold){
  const font=textFont(bold).parsed;
  const missing=[...new Set(Array.from(value).filter(char=>!['\n','\r','\t'].includes(char)&&!font.hasGlyphForCodePoint(char.codePointAt(0))))];
  if(missing.length)throw new Error('現在のフォントで表示できない文字があります: '+missing.slice(0,10).join(' '));
}
