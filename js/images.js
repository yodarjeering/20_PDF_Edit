import {createShape,paintShape,shapeNames} from './shapes.js';
import {textCanvas} from './text.js';
// Images and shapes share one ordered object list and PDF coordinate system.
export function imageMatrix(item, viewport) {
  const angle=(item.angle||0)*Math.PI/180, c=Math.cos(angle), s=Math.sin(angle);
  const top=[item.x-s*item.height,item.y+c*item.height];
  const origin=viewport.convertToViewportPoint(...top);
  const right=viewport.convertToViewportPoint(top[0]+c,top[1]+s);
  const down=viewport.convertToViewportPoint(top[0]+s,top[1]-c);
  return [right[0]-origin[0],right[1]-origin[1],down[0]-origin[0],down[1]-origin[1],...origin];
}
export function loadImage(data) {
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('画像を読み込めません。PNG / JPEGを使用してください。'));img.src=data;});
}
export async function readImage(file) {
  if(!['image/png','image/jpeg'].includes(file.type))throw new Error('PNG / JPEG画像を選択してください。');
  if(file.size>30*1024*1024)throw new Error('画像は30MB以下にしてください。');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('画像の読み込みに失敗しました。'));reader.readAsDataURL(file);});
  const image=await loadImage(data);
  return {data,pixelWidth:image.naturalWidth,pixelHeight:image.naturalHeight};
}
export async function paintImages(ref,canvas,viewport,ratio) {
  for(const item of ref.images||[]) {
    const image=item.type==='shape'?null:item.type==='text'?textCanvas(item):await loadImage(item.data), matrix=imageMatrix(item,viewport);
    const ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(...matrix.map(v=>v*ratio));
    if(item.type==='shape')paintShape(ctx,item);else ctx.drawImage(image,0,0,item.width,item.height);
    ctx.restore();
  }
}

export class ImageOverlay {
  constructor({commit,select,editText}) {this.commit=commit;this.select=select;this.editText=editText;this.selected=null;}
  mount(stage,ref,viewport) {
    this.stage=stage;this.ref=ref;this.viewport=viewport;
    if(!(ref.images||[]).some(item=>item.id===this.selected))this.selected=null;
    stage.addEventListener('pointerdown',e=>{if(e.target===stage||e.target.tagName==='CANVAS')this.choose(null);});
    for(const item of ref.images||[]) {
      const box=document.createElement('div');box.className='image-object';box.dataset.imageId=item.id;box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label','貼り付け画像。ドラッグで移動');
      let img;
      if(item.type==='shape'){img=createShape(item);box.classList.add('shape-object');box.setAttribute('aria-label',shapeNames[item.shape]+'。ドラッグで移動');}
      else {img=document.createElement('img');img.src=item.type==='text'?textCanvas(item).toDataURL():item.data;img.draggable=false;img.alt=item.type==='text'?item.text:'貼り付け画像';}
      if(item.type==='text'){box.classList.add('text-object');box.setAttribute('aria-label','テキストボックス。ダブルクリックで文字編集');box.addEventListener('dblclick',()=>this.editText?.(item));}
      const handle=document.createElement('span');handle.className='image-resize';handle.title=['shape','text'].includes(item.type)?'ドラッグで幅・高さを変更':'ドラッグで拡大・縮小（縦横比を維持）';
      box.append(img,handle);stage.append(box);this.position(box,item);
      box.classList.toggle('image-selected',item.id===this.selected);
      box.addEventListener('focus',()=>this.choose(item.id));
      box.addEventListener('pointerdown',e=>this.start(e,box,item, e.target===handle));
    }
    this.select(this.selected);
  }
  choose(id){this.selected=id;this.stage?.querySelectorAll('.image-object').forEach(box=>box.classList.toggle('image-selected',box.dataset.imageId===id));this.select(id);}
  position(box,item){box.style.width=item.width+'px';box.style.height=item.height+'px';box.style.transform='matrix('+imageMatrix(item,this.viewport).join(',')+')';}
  start(event,box,item,resizing) {
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();this.choose(item.id);box.focus();box.setPointerCapture(event.pointerId);
    const viewport=this.viewport, rect=this.stage.getBoundingClientRect();
    const point=e=>viewport.convertToPdfPoint(e.clientX-rect.left,e.clientY-rect.top);
    const start=point(event);let next={...item};
    const move=e=>{
      const now=point(e), dx=now[0]-start[0],dy=now[1]-start[1];
      if(resizing){
        const a=(item.angle||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
        const localX=c*dx+s*dy,localY=s*dx-c*dy;
        const scale=Math.max(.05,Math.min(10,1+(localX*item.width+localY*item.height)/(item.width**2+item.height**2)));
        const flexible=['shape','text'].includes(item.type);
        const width=flexible?Math.max(12,item.width+localX):item.width*scale,height=flexible?Math.max(12,item.height+localY):item.height*scale;
        next={...item,width,height,x:item.x+s*(height-item.height),y:item.y-c*(height-item.height)};
      }else next={...item,x:item.x+dx,y:item.y+dy};
      this.position(box,next);
    };
    const finish=e=>{box.removeEventListener('pointermove',move);box.removeEventListener('pointerup',finish);box.removeEventListener('pointercancel',cancel);if(box.hasPointerCapture(e.pointerId))box.releasePointerCapture(e.pointerId);if(next.x!==item.x||next.y!==item.y||next.width!==item.width||next.height!==item.height)this.commit(this.ref.id,item.id,next);};
    const cancel=e=>{next=item;this.position(box,item);finish(e);};
    box.addEventListener('pointermove',move);box.addEventListener('pointerup',finish);box.addEventListener('pointercancel',cancel);
  }
}
