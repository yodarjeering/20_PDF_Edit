import {ExistingTextEditor} from './existing-text-editor.js';
import {setupLocalFonts} from './local-fonts.js';
import {ensureTextFonts,validateText,fontCatalog,defaultFontId} from './fonts.js';
import {fitText} from './text.js';
import {ImageOverlay,readImage} from './images.js';
import {PageModel} from './model.js';
import {DocumentStore} from './documents.js';
import {PdfRenderer} from './renderer.js';
import {exportPdf} from './exporter.js';
const $=id=>document.getElementById(id), model=new PageModel(), store=new DocumentStore(), renderer=new PdfRenderer(store);
let activeTab='output';
let pageClipboard=[];
let objectClipboard=null;
const objectClipboardToken="PDF Studio object "+crypto.randomUUID();
const sourceViews=new Map();
const documentColors=new Map();
const view=()=>activeTab==='output'?model:sourceViews.get(activeTab);
let busy=false, mode='open', dragged=[], previewKey='', revision=0, queue=[], running=false;
let zoom='width';
let pageListKey='';
const overlay=new ImageOverlay({commit:(pageId,imageId,changes)=>{if(busy||activeTab!=='output')return;model.updateImage(pageId,imageId,changes.type==='text'?fitText(changes):changes);previewKey='';refresh();status('オブジェクトの位置・サイズを変更しました。');},select:id=>{$('image-delete').disabled=busy||activeTab!=='output'||!id;$('object-rotate').disabled=busy||activeTab!=='output'||!id;syncShapeControls();syncTextControls();},commitText:commitInlineText,error:error=>status(error.message,true)});
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
const existingEditor=new ExistingTextEditor({store,
  commit:(pageId,object)=>{model.updateTextObject(pageId,object);previewKey='';},
  reset:(pageId,id)=>{model.resetTextObject(pageId,id);previewKey='';},
  select:()=>overlay.choose(null)});
function controls(){existingEditor.setBusy(busy||activeTab!=='output');const readonly=activeTab!=='output';$('text-bold').disabled=busy||readonly||fontCatalog.some(font=>font.id===$('text-font').value&&font.local);for(const id of ['text-add','text-font','text-size','text-color','text-bold','text-align','shape-width-custom'])$(id).disabled=busy||readonly;document.querySelectorAll('.shape-pictogram').forEach(button=>button.disabled=busy||readonly);$('shape-add').disabled=busy||readonly;$('object-rotate').disabled=busy||readonly||!overlay.selected;for(const id of ['shape-kind','shape-stroke','shape-fill','shape-no-fill','shape-width'])$(id).disabled=busy||readonly;$('image-add').disabled=busy||readonly;$('image-delete').disabled=busy||readonly||!overlay.selected;for(const id of ['open','add','all','go'])$(id).disabled=busy;for(const id of ['delete','left','right'])$(id).disabled=busy||readonly||!model.selected.size;$('undo').disabled=busy||readonly||!model.past.length;$('redo').disabled=busy||readonly||!model.future.length;$('save').disabled=busy||!model.pages.length;}
async function run(fn){if(busy)return;busy=true;controls();try{await existingEditor.apply();await fn();}catch(e){status(e.message,true);}finally{busy=false;controls();}}
const observer=new IntersectionObserver(entries=>{for(const entry of entries){const card=entry.target;if(entry.isIntersecting){if(!card.dataset.queued){card.dataset.queued='1';queue.push(card);}}else{card.querySelector('.thumb').replaceChildren();delete card.dataset.queued;}}pump();},{root:$('pages'),rootMargin:'200px'});
async function pump(){if(running)return;running=true;try{while(queue.length){const card=queue.shift();if(!card.isConnected||!card.dataset.queued)continue;const ref=view().pages.find(p=>p.id===card.dataset.id);if(!ref)continue;const canvas=document.createElement('canvas');card.querySelector('.thumb').replaceChildren(canvas);try{await renderer.render(ref,canvas,132,155,{images:false});}catch(e){if(card.isConnected){card.querySelector('.thumb').textContent='描画できません';status(`ページ描画エラー: ${e.message}`,true);}}}}finally{running=false;}}
function updateSelection(){document.querySelectorAll('.page').forEach(card=>{card.classList.toggle('selected',view().selected.has(card.dataset.id));card.classList.toggle('active',view().active===card.dataset.id);card.setAttribute('aria-selected',String(view().selected.has(card.dataset.id)));});$('selection').textContent=`${view().selected.size} ページ選択中` ;controls();preview();}
function refresh(){const listKey=JSON.stringify([activeTab,view().pages.map(ref=>[ref.id,ref.rotation])]);if(listKey===pageListKey){updateSelection();return;}renderTabs();pageListKey=JSON.stringify([activeTab,view().pages.map(ref=>[ref.id,ref.rotation])]);revision++;observer.disconnect();queue=[];$('pages').replaceChildren();const fragment=document.createDocumentFragment();view().pages.forEach((ref,index)=>{const source=store.sources.get(ref.sourceId);const card=document.createElement('div');card.className='page';card.dataset.id=ref.id;card.draggable=activeTab==='output';card.tabIndex=0;card.setAttribute('role','option');card.setAttribute('aria-label',`${index+1}ページ、${source.name} 元ページ${ref.sourcePage}`);
const thumb=document.createElement('div');thumb.className='thumb';thumb.textContent='描画待ち';const info=document.createElement('div');info.className='page-info';info.textContent=`${index+1} ページ`;const badge=document.createElement('span');badge.className='badge';badge.textContent=`↻ ${ref.rotation}°`;info.append(badge);const origin=document.createElement('div');origin.className='origin';origin.textContent=`${source.name} · ${ref.sourcePage}`;origin.title=origin.textContent;card.append(thumb,info,origin);fragment.append(card);});$('pages').append(fragment);document.querySelectorAll('.page').forEach(card=>observer.observe(card));$('count').textContent=view().pages.length;$('jump').max=view().pages.length;updateSelection();store.collect(model,pageClipboard.map(page=>page.sourceId)).then(()=>{for(const id of sourceViews.keys())if(!store.sources.has(id))sourceViews.delete(id);}).catch(e=>status(e.message,true));}
async function preview(force=false){if(overlay.editing&&!overlay.finishTextEditing())return;const ref=view().pages.find(p=>p.id===view().active);const key=ref?`${ref.id}:${ref.rotation}`:'empty:'+model.documentIds.join(',');if(!force&&key===previewKey)return;previewKey=key;if(!ref){existingEditor.clear();overlay.choose(null);$('preview').replaceChildren();const empty=document.createElement('div');empty.className='empty';const title=document.createElement('h2');title.textContent='編集結果は空です';const hint=document.createElement('p');hint.textContent=model.documentIds.length?'各PDFタブでページをコピー（Ctrl+C）し、この編集結果に貼り付け（Ctrl+V）してください。':'PDFを開くか、ここへドラッグ＆ドロップしてください。';empty.append(title,hint);$('preview').append(empty);$('preview-title').textContent='プレビュー';$('source-label').textContent='保存するページを編集結果へ追加してください。';return;}if(!(ref.images||[]).some(image=>image.id===overlay.selected))overlay.choose(null);const canvas=document.createElement('canvas');const stage=document.createElement('div');stage.className='page-stage';stage.append(canvas);$('preview').replaceChildren(stage);$('preview-title').textContent=`${store.sources.get(ref.sourceId).name} · ${view().pages.indexOf(ref)+1} / ${view().pages.length}`;$('source-label').textContent=`${store.sources.get(ref.sourceId).name} · 元ページ ${ref.sourcePage}`;try{const viewport=await renderer.render(ref,canvas,Math.max(100,$('preview').clientWidth-32),zoom==='width'?Infinity:Math.max(100,$('preview').clientHeight-32),{images:false,scale:['fit','width'].includes(zoom)?null:Number(zoom)});if(stage.isConnected&&viewport){stage.style.width=viewport.width+'px';stage.style.height=viewport.height+'px';if(activeTab==='output'){overlay.mount(stage,ref,viewport);await existingEditor.mount(stage,ref,viewport);}else existingEditor.clear();}}catch(e){if(canvas.isConnected)status(`プレビューエラー: ${e.message}`,true);}}
async function load(files,replace){if(!files.length)return;await run(async()=>{status('PDFを読み込んでいます…');const before=new Set(store.sources.keys());const pages=[];try{for(const file of files){if(!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf')throw new Error('PDFファイルを選択してください。');pages.push(...await store.load(file));}}catch(e){await store.discard([...store.sources.keys()].filter(id=>!before.has(id)));throw e;}model.add(pages,replace,!(replace&&files.length>1));activeTab='output';previewKey='';refresh();status(`${files.length} ファイル・${pages.length} ページを読み込みました。`);});}
$('open').onclick=()=>{mode='open';$('file').click();};$('add').onclick=()=>{mode='add';$('file').click();};$('file').onchange=()=>{load([...$('file').files],mode==='open');$('file').value='';};
for(const [id,action]of Object.entries({delete:()=>model.remove(),left:()=>model.rotate(-90),right:()=>model.rotate(90),undo:()=>model.undo(),redo:()=>model.redo()}))$(id).onclick=()=>{if(busy)return;action();previewKey='';refresh();status(`${{delete:'削除',left:'左回転',right:'右回転',undo:'Undo',redo:'Redo'}[id]}しました。`);};
$('all').onclick=()=>{view().selected=new Set(view().pages.map(p=>p.id));updateSelection();};
$('go').onclick=()=>{const page=view().pages[Number($('jump').value)-1];if(page){view().select(page.id);updateSelection();document.querySelector(`[data-id="${page.id}"]`).scrollIntoView({block:'center'});}};
$('pages').onclick=e=>{if(busy)return;const card=e.target.closest('.page');if(card){overlay.choose(null);view().select(card.dataset.id,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey});updateSelection();}};
$('pages').ondragstart=e=>{const card=e.target.closest('.page');if(busy||activeTab!=='output'||!card){e.preventDefault();return;}if(!model.selected.has(card.dataset.id))model.select(card.dataset.id);dragged=model.pages.filter(p=>model.selected.has(p.id)).map(p=>p.id);e.dataTransfer.setData('application/x-pdf-pages',JSON.stringify(dragged));e.dataTransfer.effectAllowed='move';updateSelection();};
function clearDrop(){document.querySelectorAll('.drop-before,.over').forEach(el=>el.classList.remove('drop-before','over'));}
$('pages').ondragover=e=>{if(!dragged.length||busy)return;e.preventDefault();clearDrop();e.target.closest('.page')?.classList.add('drop-before');};
$('pages').ondrop=e=>{if(!dragged.length||busy)return;e.preventDefault();model.move(dragged,e.target.closest('.page')?.dataset.id??null);dragged=[];previewKey='';refresh();status('ページを並び替えました。');};
$('end').ondragover=e=>{if(dragged.length){e.preventDefault();$('end').classList.add('over');}};$('end').ondrop=e=>{if(!dragged.length||busy)return;e.preventDefault();model.move(dragged);dragged=[];clearDrop();previewKey='';refresh();};document.addEventListener('dragend',()=>{dragged=[];clearDrop();});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();document.body.classList.add('file-over');}});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('file-over');});document.addEventListener('drop',e=>{document.body.classList.remove('file-over');if(e.dataTransfer.files.length){e.preventDefault();load([...e.dataTransfer.files],false);}});
$('save').onclick=()=>run(async()=>{status('PDFを生成しています…');const bytes=await exportPdf(model.pages,store.sources,store.fontResolver);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download='edited.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`${model.pages.length} ページのPDFを保存しました。`);});
document.addEventListener('keydown',e=>{if(busy||e.isComposing||e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const modifier=e.ctrlKey||e.metaKey;if(modifier&&e.key.toLowerCase()==='a'){e.preventDefault();$('all').click();}else if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}else if(modifier&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}else if(e.key==='Delete'){if(activeTab==='output'&&overlay.selected){$('image-delete').click();}else $('delete').click();}else if(e.target.closest('.page')&&[' ','Enter'].includes(e.key)){e.preventDefault();view().select(e.target.closest('.page').dataset.id,{toggle:modifier,range:e.shiftKey});updateSelection();}else if(activeTab==='output'&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const ids=model.pages.filter(p=>model.selected.has(p.id)).map(p=>p.id);const indexes=ids.map(id=>model.pages.findIndex(p=>p.id===id));if(!indexes.length)return;if(e.key==='ArrowUp'){const index=Math.min(...indexes);if(index>0)model.move(ids,model.pages[index-1].id);}else{const index=Math.max(...indexes);if(index<model.pages.length-1)model.move(ids,model.pages[index+2]?.id??null);}previewKey='';refresh();}});
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(view().pages.length&&!overlay.editing)preview(true);},150);}).observe($('preview'));
// Scroll long lists while dragging near their top or bottom edge.
$('pages').addEventListener('dragover',e=>{if(!dragged.length)return;const bounds=$('pages').getBoundingClientRect();if(e.clientY<bounds.top+55)$('pages').scrollTop-=18;else if(e.clientY>bounds.bottom-55)$('pages').scrollTop+=18;});
controls();

function renderTabs(){
  const ids=model.documentIds;
  if(activeTab!=='output'&&!ids.includes(activeTab))activeTab='output';
  const tabs=$('document-tabs');tabs.replaceChildren();
  const entries=[['output','編集結果',model.pages.length],...ids.map(id=>[id,store.sources.get(id).name,store.sources.get(id).pdf.numPages])];
  for(const [id,name,count]of entries){
    if(id!=='output'&&!sourceViews.has(id)){const m=new PageModel();m.add(store.sources.get(id).pages.map(p=>({...p})));sourceViews.set(id,m);}
    const tab=document.createElement('button');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(id===activeTab));tab.setAttribute('aria-controls','workspace');tab.id='tab-'+id;tab.tabIndex=id===activeTab?0:-1;tab.title=name;tab.textContent=name+' ('+count+')';
    if(id!=='output'){if(!documentColors.has(id))documentColors.set(id,documentColors.size%6);tab.dataset.color=documentColors.get(id);}
    tab.onclick=()=>{if(busy)return;activeTab=id;previewKey='';refresh();};
    tabs.append(tab);
  }
  $('workspace').setAttribute('aria-labelledby','tab-'+activeTab);
  const name=activeTab==='output'?'編集結果':store.sources.get(activeTab).name;
  $('document-name').textContent=name;$('document-name').title=name;
  $('view-description').textContent=activeTab==='output'?'結合・並び替え・回転・削除を行う出力ビュー':'元PDFの閲覧ビュー · 編集は「編集結果」タブで行えます';
  $('end').hidden=activeTab!=='output';
  $('save').textContent='↓ 編集結果を保存';
}
$('document-tabs').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();const tabs=[...$('document-tabs').children];const current=tabs.indexOf(document.activeElement);const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[index].click();$('document-tabs').children[index].focus();
});
renderTabs();

function pageClipboardAction(key) {
  if (key !== 'c' && activeTab !== 'output') {
    status('切り取り・貼り付けは「編集結果」タブで行ってください。元PDFタブではCtrl+Cでコピーできます。');
    return;
  }
  if (key === 'v') {
    if (!pageClipboard.length) { status('ページを選択してCtrl+CまたはCtrl+Xでコピーしてください。'); return; }
    model.paste(pageClipboard);
    previewKey='';
    refresh();
    document.querySelector('[data-id="'+model.active+'"]')?.scrollIntoView({block:'nearest'});
    status(pageClipboard.length+' ページを貼り付けました。Undoで戻せます。');
    return;
  }
  const selected=view().pages.filter(page=>view().selected.has(page.id));
  if (!selected.length) { status('コピーするページを選択してください。'); return; }
  pageClipboard=selected.map(page=>({...page}));
  if (key === 'x') { model.remove(); previewKey=''; refresh(); }
  status(selected.length+(key==='x'?' ページを切り取りました。':' ページをコピーしました。')+' 編集結果でCtrl+Vを押すと、選択範囲の直後（未選択なら末尾）に貼り付けます。');
}

const isTextInput=target=>target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
for(const [eventName,key] of [['copy','c'],['cut','x']]){
  document.addEventListener(eventName,e=>{
    if(busy||isTextInput(e.target))return;
    e.preventDefault();

    const object=selectedObject();
    if(object&&activeTab==='output'){
      objectClipboard={item:{...object},pageId:model.active,rotation:overlay.viewport.rotation,pastes:0};
      e.clipboardData?.setData('text/plain',objectClipboardToken);
      if(key==='x'){$('image-delete').click();}
      status((object.type==='shape'?'図形':object.type==='text'?'テキスト':'画像')+(key==='x'?'を切り取りました。':'をコピーしました。')+'Ctrl+Vで貼り付けられます。');
      return;
    }
    objectClipboard=null;
    pageClipboardAction(key);
    if(pageClipboard.length)e.clipboardData?.setData('text/plain','PDF Studio: '+pageClipboard.length+' pages');
  });
}
document.addEventListener('paste',e=>{
  if(busy||isTextInput(e.target))return;
  const item=[...(e.clipboardData?.items||[])].find(item=>item.type.startsWith('image/'));
  if(item){e.preventDefault();const file=item.getAsFile();if(file)insertImage(file);}
  else if(objectClipboard&&e.clipboardData?.getData('text/plain')===objectClipboardToken){e.preventDefault();pasteObject();}
  else if(pageClipboard.length){e.preventDefault();pageClipboardAction('v');}
});
$('image-add').onclick=()=>$('image-file').click();
$('image-file').onchange=()=>{const file=$('image-file').files[0];if(file)insertImage(file);$('image-file').value='';};
$('image-delete').onclick=()=>{
  if(busy||activeTab!=='output'||!overlay.selected)return;
  model.removeImage(model.active,overlay.selected);overlay.choose(null);previewKey='';refresh();status('選択オブジェクトを削除しました。');
};
$('zoom').onchange=()=>{zoom=$('zoom').value;$('view-scale').textContent='表示：'+(zoom==='width'?'幅に合わせる':zoom==='fit'?'ページ全体':Math.round(Number(zoom)*100)+'%');preview(true);};
async function insertImage(file){
  if(activeTab!=='output'){status('画像は「編集結果」タブへ貼り付けてください。');return;}
  await run(async()=>{
    const image=await readImage(file);
    let ref=model.pages.find(page=>page.id===model.active),created=false;
    if(!ref){
      const blank=await PDFLib.PDFDocument.create();blank.addPage([595.28,841.89]);
      const refs=await store.load(new File([await blank.save()],'画像用ページ.pdf',{type:'application/pdf'}));
      ref=refs[0];created=true;
    }
    const page=await store.page(ref),viewport=page.getViewport({scale:1,rotation:((page.rotate+ref.rotation)%360+360)%360});
    const scale=Math.min(viewport.width*.65/image.pixelWidth,viewport.height*.65/image.pixelHeight,1);
    const width=image.pixelWidth*scale,height=image.pixelHeight*scale;
    const [x,y]=viewport.convertToPdfPoint((viewport.width-width)/2,(viewport.height+height)/2);
    const item={id:crypto.randomUUID(),data:image.data,x,y,width,height,angle:page.rotate+ref.rotation};
    if(created)model.add([{...ref,images:[item]}]);else model.addImage(ref.id,item);
    overlay.selected=item.id;previewKey='';refresh();status('画像を貼り付けました。ドラッグで移動、角のハンドルで拡大・縮小できます。');
  });
}

function selectedObject(){return model.pages.find(page=>page.id===model.active)?.images?.find(item=>item.id===overlay.selected);}
function syncShapeControls(){
  const item=selectedObject();
  if(item?.type!=='shape')return;
  $('shape-stroke').value=item.stroke;
  $('shape-fill').value=item.fill==='none'?'#bfdbfe':item.fill;
  $('shape-no-fill').checked=item.fill==='none';
  setStrokeWidth(item.strokeWidth);
}
async function objectTarget(){
  let ref=model.pages.find(page=>page.id===model.active),created=false;
  if(!ref){
    const blank=await PDFLib.PDFDocument.create();blank.addPage([595.28,841.89]);
    [ref]=await store.load(new File([await blank.save()],'オブジェクト用ページ.pdf',{type:'application/pdf'}));created=true;
  }
  const page=await store.page(ref),rotation=page.rotate+ref.rotation;
  return {ref,created,rotation,viewport:page.getViewport({scale:1,rotation:((rotation%360)+360)%360})};
}
function commitObject(target,item){
  if(target.created)model.add([{...target.ref,images:[item]}]);else model.addImage(target.ref.id,item);
  overlay.selected=item.id;previewKey='';refresh();
}
async function pasteObject(){
  if(activeTab!=='output'){status('編集結果タブへ貼り付けてください。');return;}
  await run(async()=>{
    const target=await objectTarget(),clip=objectClipboard;clip.pastes++;
    const item={...clip.item,id:crypto.randomUUID()};
    if(clip.pageId===target.ref.id){
      const [dx,dy]=[12*clip.pastes,12*clip.pastes];
      const a=target.rotation*Math.PI/180;
      item.x+=Math.cos(a)*dx+Math.sin(a)*dy;item.y+=Math.sin(a)*dx-Math.cos(a)*dy;
    }else{
      item.angle=(item.angle||0)+target.rotation-clip.rotation;
      const [cx,cy]=target.viewport.convertToPdfPoint(target.viewport.width/2,target.viewport.height/2);
      const a=item.angle*Math.PI/180;
      item.x=cx-Math.cos(a)*item.width/2+Math.sin(a)*item.height/2;
      item.y=cy-Math.sin(a)*item.width/2-Math.cos(a)*item.height/2;
    }
    commitObject(target,item);status('オブジェクトを貼り付けました。');
  });
}
$('shape-add').onclick=()=>{
  if(activeTab!=='output')return;
  run(async()=>{
    const target=await objectTarget(),width=Math.min(180,target.viewport.width*.6),height=Math.min(100,target.viewport.height*.4);
    const [x,y]=target.viewport.convertToPdfPoint((target.viewport.width-width)/2,(target.viewport.height+height)/2);
    commitObject(target,{id:crypto.randomUUID(),type:'shape',shape:$('shape-kind').value,x,y,width,height,angle:target.rotation,stroke:$('shape-stroke').value,fill:$('shape-no-fill').checked?'none':$('shape-fill').value,strokeWidth:strokeWidth()});
    status('図形を挿入しました。ドラッグで移動、角で幅・高さを変更できます。');
  });
};
for(const id of ['shape-stroke','shape-fill','shape-no-fill','shape-width','shape-width-custom']){
  $(id).onchange=()=>{
    if(id==='shape-width-custom'){if(!$('shape-width-custom').reportValidity())return;setStrokeWidth(Number($('shape-width-custom').value));}
    if(id==='shape-width'&&$('shape-width').value!=='custom')$('shape-width-custom').value=$('shape-width').value;
    const item=selectedObject();if(busy||activeTab!=='output'||item?.type!=='shape')return;
    model.updateImage(model.active,item.id,{stroke:$('shape-stroke').value,fill:$('shape-no-fill').checked?'none':$('shape-fill').value,strokeWidth:strokeWidth()});
    previewKey='';refresh();
  };
}
$('object-rotate').onclick=()=>{
  const item=selectedObject();if(busy||activeTab!=='output'||!item)return;
  const a=(item.angle||0)*Math.PI/180,b=a+Math.PI/2;
  const cx=item.x+Math.cos(a)*item.width/2-Math.sin(a)*item.height/2,cy=item.y+Math.sin(a)*item.width/2+Math.cos(a)*item.height/2;
  model.updateImage(model.active,item.id,{angle:(item.angle||0)+90,x:cx-Math.cos(b)*item.width/2+Math.sin(b)*item.height/2,y:cy-Math.sin(b)*item.width/2-Math.cos(b)*item.height/2});
  previewKey='';refresh();
};

function strokeWidth(){const n=Number($('shape-width-custom').value);return Number.isFinite(n)?Math.min(100,Math.max(.1,n)):2;}
function setStrokeWidth(value){
  $('shape-width-custom').value=value;
  $('shape-width').value=[...$('shape-width').options].some(option=>option.value===String(value))?String(value):'custom';
}
for(const button of document.querySelectorAll('.shape-pictogram')){
  button.onclick=()=>{
    $('shape-kind').value=button.dataset.shape;
    document.querySelectorAll('.shape-pictogram').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  };
}
function syncTextControls(){
  const item=selectedObject();
  if(activeTab!=='output'||item?.type!=='text')return;
  $('text-font').value=item.fontId||defaultFontId;$('text-size').value=item.fontSize;$('text-color').value=item.color;$('text-bold').checked=item.bold;$('text-bold').disabled=busy||fontCatalog.some(font=>font.id===$('text-font').value&&font.local);$('text-align').value=item.align;
}
function textValues(){
  return {fontId:$('text-font').value,fontSize:Number($('text-size').value),color:$('text-color').value,bold:fontCatalog.some(font=>font.id===$('text-font').value&&font.local)?false:$('text-bold').checked,align:$('text-align').value};
}
function commitInlineText(pageId,id,text){
  const item=model.pages.find(page=>page.id===pageId)?.images?.find(item=>item.id===id);
  if(!item)return;
  validateText(text,item.bold,item.fontId);
  if(item.text===text)return;
  model.updateImage(pageId,id,fitText({...item,text}));previewKey='';controls();
  const ref=model.pages.find(page=>page.id===pageId);
  if(overlay.ref?.id===pageId)overlay.ref=ref;
  // Keep click targets and focus intact when a pointer press blurs the editor.
  status('テキストを更新しました。');
}
for(const font of fontCatalog){const option=document.createElement('option');option.value=font.id;option.textContent=font.label;$('text-font').append(option);}
setupLocalFonts({isBusy:()=>busy,onAdded:font=>{
  for(const id of ['text-font','existing-font']){
    if([...$(id).options].some(option=>option.value===font.id))continue;
    const option=document.createElement('option');option.value=font.id;option.textContent=font.label;$(id).append(option);
  }
}});
$('text-add').onclick=()=>{
  if(activeTab!=='output'||!$('text-size').reportValidity())return;
  const values=textValues();
  run(async()=>{
    await ensureTextFonts(values.fontId,values.bold);
    const target=await objectTarget(),width=Math.min(260,target.viewport.width*.7),height=70;
    const [x,y]=target.viewport.convertToPdfPoint((target.viewport.width-width)/2,(target.viewport.height+height)/2);
    const item=fitText({id:crypto.randomUUID(),type:'text',x,y,width,height,angle:target.rotation,...values,text:''});
    overlay.pendingTextEdit=item.id;commitObject(target,item);
    status('ページ上のテキストボックスに入力してください。外側をクリックで確定、Escで変更を取り消します。');
  });
};
for(const id of ['text-font','text-size','text-color','text-bold','text-align'])$(id).addEventListener('change',()=>{
  const local=fontCatalog.some(font=>font.id===$('text-font').value&&font.local);if(local)$('text-bold').checked=false;$('text-bold').disabled=busy||activeTab!=='output'||local;
  const item=selectedObject();
  if(busy||activeTab!=='output'||item?.type!=='text'||!$('text-size').reportValidity())return;
  const values=textValues(),pageId=model.active;
  run(async()=>{
    try{
      await ensureTextFonts(values.fontId,values.bold);validateText(item.text,values.bold,values.fontId);
      model.updateImage(pageId,item.id,fitText({...item,...values}));previewKey='';refresh();status('文字の書式を変更しました。');
    }catch(error){syncTextControls();throw error;}
  });
});
// Invalid text must be corrected before another action can export or discard it.
document.addEventListener('click',event=>{
  if(overlay.editing&&!overlay.editing.box.contains(event.target)&&!overlay.finishTextEditing()){
    event.preventDefault();event.stopImmediatePropagation();
  }
},true);

// All editing panels start collapsed; only one is expanded at a time.
function setEditorPanel(kind) {
  existingEditor.setEnabled(kind==='existing');
  for(const name of ['image','shape','text','existing']) {
    const expanded=name===kind;
    $('editor-'+name).hidden=!expanded;
    $('editor-tab-'+name).setAttribute('aria-expanded',String(expanded));
  }
}
for(const name of ['image','shape','text','existing']) {
  $('editor-tab-'+name).onclick=()=>{setEditorPanel($('editor-'+name).hidden?name:null);if(name==='existing')preview(true);};
  $('editor-'+name).addEventListener('keydown',event=>{
    if(event.key==='Escape'){setEditorPanel(null);$('editor-tab-'+name).focus();}
  });
}

$('existing-apply').onclick=()=>run(async()=>{previewKey='';refresh();status('既存文字をOverlay方式で更新しました。元文字はPDF内部に残ります。');});
$('existing-cancel').onclick=()=>existingEditor.cancel();
$('existing-reset').onclick=()=>{if(busy)return;existingEditor.restore();refresh();};
// Commit a draft before navigation/history/save, without removing its click target
// between pointerdown and pointerup. Failed validation keeps the draft in place.
document.addEventListener('click',event=>{
  if(!existingEditor.dirty||event.target.closest('#editor-existing'))return;
  event.preventDefault();event.stopImmediatePropagation();
  const target=event.target,init={bubbles:true,cancelable:true,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,altKey:event.altKey};
  let applied=false;
  run(async()=>{applied=true;}).then(()=>{
    if(!applied)return;
    if(target.isConnected)target.dispatchEvent(new MouseEvent('click',init));
    previewKey='';refresh();
  });
},true);

document.addEventListener('keydown',event=>{
  if(!existingEditor.dirty||event.target.closest('#editor-existing')||isTextInput(event.target)||event.isComposing)return;
  const modifier=event.ctrlKey||event.metaKey;
  if(!['Enter','Delete'].includes(event.key)&&!(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key))&&!(modifier&&['z','y','a'].includes(event.key.toLowerCase())))return;
  event.preventDefault();event.stopImmediatePropagation();
  const target=event.target,init={key:event.key,bubbles:true,cancelable:true,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,altKey:event.altKey};
  let applied=false;run(async()=>{applied=true;}).then(()=>{if(applied){if(target.isConnected)target.dispatchEvent(new KeyboardEvent('keydown',init));previewKey='';refresh();}});
},true);
document.addEventListener('dragstart',event=>{
  if(existingEditor.dirty&&event.target.closest('.page')){event.preventDefault();status('既存文字の変更を適用または取り消してからページを移動してください。');}
},true);
