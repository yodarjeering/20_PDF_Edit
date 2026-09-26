// New text boxes are rasterized locally so Japanese system fonts export identically.
const family='"Yu Gothic", "Meiryo", sans-serif';
export function textLines(item,context) {
  context.font=`${item.bold?'bold':'normal'} ${item.fontSize}px ${family}`;
  const lines=[],width=Math.max(1,item.width-12);
  for(const paragraph of item.text.replace(/\r/g,'').split('\n')){
    let line='';
    for(const character of Array.from(paragraph)){
      if(line&&context.measureText(line+character).width>width){lines.push(line);line='';}
      line+=character;
    }
    lines.push(line);
  }
  return lines;
}
export function fitText(item) {
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  const height=Math.max(item.height,textLines(item,context).length*item.fontSize*1.4+12);
  const a=(item.angle||0)*Math.PI/180,delta=height-item.height;
  return {...item,height,x:item.x+Math.sin(a)*delta,y:item.y-Math.cos(a)*delta};
}
export function textCanvas(item,scale=3) {
  const canvas=document.createElement('canvas');
  scale=Math.min(scale,Math.sqrt(16000000/(item.width*item.height)));
  canvas.width=Math.max(1,Math.ceil(item.width*scale));canvas.height=Math.max(1,Math.ceil(item.height*scale));
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  const lines=textLines(item,ctx);ctx.fillStyle=item.color;ctx.textBaseline='top';ctx.textAlign=item.align||'left';
  const x=item.align==='center'?item.width/2:item.align==='right'?item.width-6:6;
  lines.forEach((line,index)=>ctx.fillText(line,x,6+index*item.fontSize*1.4));
  return canvas;
}
