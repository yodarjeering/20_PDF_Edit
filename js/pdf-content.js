// Read-only lexical analysis. Never use string replacement to rewrite a PDF stream:
// operands can be escaped strings, hexadecimal strings, TJ arrays or encoded CIDs.
const whitespace=/[\0\t\n\f\r ]/;
const delimiter=/[\0\t\n\f\r ()<>\[\]{}/%]/;
export function tokenizeContent(source){
  const tokens=[];let i=0;
  while(i<source.length){
    if(whitespace.test(source[i])){i++;continue;}
    if(source[i]==='%'){while(i<source.length&&!/[\r\n]/.test(source[i]))i++;continue;}
    const start=i,ch=source[i++];
    if(ch==='('){
      let depth=1;
      while(i<source.length&&depth){const c=source[i++];if(c==='\\'){if(source[i]==='\r'&&source[i+1]==='\n')i+=2;else i++;}else if(c==='(')depth++;else if(c===')')depth--;}
      if(depth)throw new Error('Unterminated PDF string');
      tokens.push({type:'string',raw:source.slice(start,i),start,end:i});continue;
    }
    if(ch==='<'&&source[i]!=='<'){
      while(i<source.length&&source[i]!=='>')i++;
      if(i===source.length)throw new Error('Unterminated hexadecimal string');
      i++;tokens.push({type:'hex',raw:source.slice(start,i),start,end:i});continue;
    }
    if('[]<>'.includes(ch)){if(source[i]===ch&&'<>'.includes(ch))i++;tokens.push({type:'delimiter',raw:source.slice(start,i),start,end:i});continue;}
    if(ch==='/'){
      while(i<source.length&&!delimiter.test(source[i]))i++;
      tokens.push({type:'name',value:source.slice(start+1,i).replace(/#([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))),start,end:i});continue;
    }
    while(i<source.length&&!delimiter.test(source[i]))i++;
    const value=source.slice(start,i);
    if(value==='BI')throw new Error('Inline images require a binary-aware parser');
    tokens.push({type:/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)?'number':'operator',value,start,end:i});
  }
  return tokens;
}
export function analyzeContent(source){
  try{
    const tokens=tokenizeContent(source),operators=tokens.filter(t=>t.type==='operator').map(t=>t.value),fonts=[];
    tokens.forEach((token,i)=>{if(token.type==='operator'&&token.value==='Tf'&&tokens[i-2]?.type==='name'&&tokens[i-1]?.type==='number')fonts.push(tokens[i-2].value);});
    return {parsed:true,operators,fonts,hasXObjects:operators.includes('Do'),hasTJ:operators.includes('TJ'),hasHex:tokens.some(t=>t.type==='hex'),
      // Stage B is intentionally disabled until byte ranges can be mapped to
      // TextItems and re-encoded with Encoding/ToUnicode/TJ positioning intact.
      directSupported:false,reason:'文字と描画命令の対応・再エンコードを未検証のためOverlayを使用します。'};
  }catch(error){return {parsed:false,fonts:[],operators:[],directSupported:false,reason:error.message};}
}
export const directEditStrategy={
  classify:()=>({mode:'overlay',reason:'Content Stream直接編集は未実装です。'}),
  apply:()=>{throw new Error('この文字列は現在のDirect編集方式では安全に編集できません。');},
};
