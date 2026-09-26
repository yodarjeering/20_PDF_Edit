export const shapeNames={rectangle:'四角形',ellipse:'楕円',line:'直線',arrow:'矢印'};
export function shapePath(item) {
  const w=item.width,h=item.height,p=Math.min(item.strokeWidth/2,w/4,h/4),r=w-p,b=h-p;
  if(item.shape==='rectangle')return `M ${p} ${p} L ${r} ${p} L ${r} ${b} L ${p} ${b} Z`;
  if(item.shape==='ellipse'){
    const cx=w/2,cy=h/2,rx=cx-p,ry=cy-p,k=.552284749831;
    return `M ${cx+rx} ${cy} C ${cx+rx} ${cy+k*ry} ${cx+k*rx} ${cy+ry} ${cx} ${cy+ry} C ${cx-k*rx} ${cy+ry} ${cx-rx} ${cy+k*ry} ${cx-rx} ${cy} C ${cx-rx} ${cy-k*ry} ${cx-k*rx} ${cy-ry} ${cx} ${cy-ry} C ${cx+k*rx} ${cy-ry} ${cx+rx} ${cy-k*ry} ${cx+rx} ${cy} Z`;
  }
  if(item.shape==='line')return `M ${p} ${h/2} L ${r} ${h/2}`;
  const head=Math.min(w*.25,h*.7);
  return `M ${p} ${h/2} L ${r} ${h/2} M ${r-head} ${h/2-head/2} L ${r} ${h/2} L ${r-head} ${h/2+head/2}`;
}
export const shapeFill=item=>['rectangle','ellipse'].includes(item.shape)?item.fill:'none';
export function createShape(item) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',`0 0 ${item.width} ${item.height}`);svg.setAttribute('preserveAspectRatio','none');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',shapePath(item));path.setAttribute('stroke',item.stroke);path.setAttribute('stroke-width',item.strokeWidth);path.setAttribute('fill',shapeFill(item));svg.append(path);return svg;
}
export function paintShape(ctx,item) {
  const path=new Path2D(shapePath(item));
  if(shapeFill(item)!=='none'){ctx.fillStyle=item.fill;ctx.fill(path);}
  ctx.strokeStyle=item.stroke;ctx.lineWidth=item.strokeWidth;ctx.stroke(path);
}
export function exportShape(page,item,lib) {
  const color=hex=>lib.rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
  const a=(item.angle||0)*Math.PI/180;
  page.drawSvgPath(shapePath(item),{x:item.x-Math.sin(a)*item.height,y:item.y+Math.cos(a)*item.height,rotate:lib.degrees(item.angle||0),borderColor:color(item.stroke),borderWidth:item.strokeWidth,...(shapeFill(item)!=='none'?{color:color(item.fill)}:{})});
}
