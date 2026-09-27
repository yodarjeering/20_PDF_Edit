import {createShape,paintShape,shapeNames} from './shapes.js';
import {textCanvas,fitText} from './text.js';
import {textFontFamily} from './fonts.js';
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
  constructor({commit,select,commitText,error}) {this.commit=commit;this.select=select;this.commitText=commitText;this.error=error;this.selected=null;this.editing=null;}
  mount(stage,ref,viewport) {
    this.stage=stage;this.ref=ref;this.viewport=viewport;
    if(!(ref.images||[]).some(item=>item.id===this.selected))this.selected=null;
    stage.addEventListener('pointerdown',e=>{if(e.target===stage||e.target.tagName==='CANVAS')this.choose(null);});
    for(const item of ref.images||[]) {
      const box=document.createElement('div');box.className='image-object';box.dataset.imageId=item.id;box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label','貼り付け画像。ドラッグで移動');
      let img;
      if(item.type==='shape'){img=createShape(item);box.classList.add('shape-object');box.setAttribute('aria-label',shapeNames[item.shape]+'。ドラッグで移動');}
      else {img=document.createElement('img');img.src=item.type==='text'?textCanvas(item).toDataURL():item.data;img.draggable=false;img.alt=item.type==='text'?item.text:'貼り付け画像';}
      if(item.type==='text'){
        box.classList.add('text-object');box.setAttribute('aria-label','テキストボックス。ダブルクリックまたはEnterで文字編集');
        box.addEventListener('dblclick',()=>this.beginTextEditing(item.id));
        box.addEventListener('keydown',event=>{
          if(event.target===box&&['Enter','F2'].includes(event.key)){event.preventDefault();this.beginTextEditing(item.id);}
        });
      }
      const handle=document.createElement('span');handle.className='image-resize';handle.title=['shape','text'].includes(item.type)?'ドラッグで幅・高さを変更':'ドラッグで拡大・縮小（縦横比を維持）';
      box.append(img,handle);stage.append(box);this.position(box,item);
      box.classList.toggle('image-selected',item.id===this.selected);
      box.addEventListener('focus',()=>this.choose(item.id));
      box.addEventListener('pointerdown',e=>this.start(e,box,this.ref.images.find(current=>current.id===item.id),e.target===handle));
    }
    this.select(this.selected);
    if(this.pendingTextEdit){const id=this.pendingTextEdit;this.pendingTextEdit=null;this.beginTextEditing(id);}
  }
  beginTextEditing(id) {
    if(this.editing?.item.id===id)return;
    if(!this.finishTextEditing())return;
    const item=this.ref.images?.find(item=>item.id===id&&item.type==='text');
    const box=[...this.stage.querySelectorAll('.text-object')].find(box=>box.dataset.imageId===id);
    if(!item||!box)return;
    this.choose(id);
    const input=document.createElement('textarea');
    input.className='inline-text-editor';input.value=item.text;input.maxLength=10000;
    input.setAttribute('aria-label','テキストボックスの文字');input.placeholder='ここに文字を入力';input.spellcheck=false;
    Object.assign(input.style,{fontFamily:textFontFamily(item.fontId),fontSize:item.fontSize+'px',fontWeight:item.bold?'700':'400',color:item.color,textAlign:item.align,lineHeight:item.fontSize*1.4+'px'});
    const editing={item,box,input,pageId:this.ref.id,composing:false};this.editing=editing;
    box.classList.add('text-editing');box.append(input);
    input.addEventListener('pointerdown',event=>event.stopPropagation());
    input.addEventListener('dblclick',event=>event.stopPropagation());
    input.addEventListener('compositionstart',()=>editing.composing=true);
    input.addEventListener('compositionend',()=>editing.composing=false);
    input.addEventListener('input',()=>{
      const fitted=fitText({...item,text:input.value});this.position(box,fitted);
    });
    input.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.isComposing||editing.composing||event.keyCode===229)return;
      if(event.key==='Escape'){event.preventDefault();this.finishTextEditing(true);box.focus();}
      else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();if(this.finishTextEditing())box.focus();}
    });
    input.addEventListener('blur',()=>this.finishTextEditing());
    input.focus();input.setSelectionRange(input.value.length,input.value.length);
  }
  finishTextEditing(cancel=false) {
    const editing=this.editing;if(!editing)return true;
    if(editing.composing&&!cancel)return false;
    const {item,box,input,pageId}=editing;
    if(!cancel){
      try{this.commitText(pageId,item.id,input.value);}
      catch(error){this.error?.(error);input.setAttribute('aria-invalid','true');queueMicrotask(()=>{if(this.editing===editing)input.focus();});return false;}
    }
    this.editing=null;box.classList.remove('text-editing');input.remove();
    const updated=cancel?item:fitText({...item,text:input.value});
    const img=box.querySelector('img');img.src=textCanvas(updated).toDataURL();img.alt=updated.text;this.position(box,updated);
    return true;
  }
  choose(id){this.selected=id;this.stage?.querySelectorAll('.image-object').forEach(box=>box.classList.toggle('image-selected',box.dataset.imageId===id));this.select(id);}
  position(box,item){box.style.width=item.width+'px';box.style.height=item.height+'px';box.style.transform='matrix('+imageMatrix(item,this.viewport).join(',')+')';}
  start(event,box,item,resizing) {
    if(event.button!==0||!item)return;
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
