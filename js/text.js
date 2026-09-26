import {textFontFamily,textWidth,textAscent,textDescent} from './fonts.js';
// Preview and PDF output share the same font, metrics and line layout.
const family=textFontFamily;
export function textLines(item,context) {
  context.font=`${item.bold?'bold':'normal'} ${item.fontSize}px ${family}`;
  const lines=[],width=Math.max(1,item.width-12);
  for(const paragraph of item.text.replace(/\r/g,'').replace(/\t/g,'    ').split('\n')){
    let line='';
    for(const character of Array.from(paragraph)){
      if(line&&textWidth(line+character,item)>width){lines.push(line);line='';}
      line+=character;
    }
    lines.push(line);
  }
  return lines;
}
export function fitText(item) {
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  const height=Math.max(item.height,(textLines(item,context).length-1)*item.fontSize*1.4+textAscent(item)+textDescent(item)+12);
  const a=(item.angle||0)*Math.PI/180,delta=height-item.height;
  return {...item,height,x:item.x+Math.sin(a)*delta,y:item.y-Math.cos(a)*delta};
}
export function textCanvas(item,scale=3) {
  const canvas=document.createElement('canvas');
  scale=Math.min(scale,Math.sqrt(16000000/(item.width*item.height)));
  canvas.width=Math.max(1,Math.ceil(item.width*scale));canvas.height=Math.max(1,Math.ceil(item.height*scale));
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  const lines=textLines(item,ctx);ctx.fillStyle=item.color;ctx.textBaseline='alphabetic';
  lines.forEach((line,index)=>{
    let x=lineX(line,item);const y=6+textAscent(item)+index*item.fontSize*1.4;
    for(const character of Array.from(line)){ctx.fillText(character,x,y);x+=textWidth(character,item);}
  });
  return canvas;
}
export function lineX(line,item){const width=textWidth(line,item);return item.align==='center'?(item.width-width)/2:item.align==='right'?item.width-6-width:6;}
export function drawTextBox(page,item,font,lib){
  const context=document.createElement('canvas').getContext('2d');
  const a=(item.angle||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const topX=item.x-s*item.height,topY=item.y+c*item.height;
  const color=lib.rgb(parseInt(item.color.slice(1,3),16)/255,parseInt(item.color.slice(3,5),16)/255,parseInt(item.color.slice(5,7),16)/255);
  textLines(item,context).forEach((line,index)=>{
    if(!line)return;
    const x=lineX(line,item),y=6+textAscent(item)+index*item.fontSize*1.4;
    page.drawText(line,{font,size:item.fontSize,color,x:topX+c*x+s*y,y:topY+s*x-c*y,rotate:lib.degrees(item.angle||0)});
  });
}
