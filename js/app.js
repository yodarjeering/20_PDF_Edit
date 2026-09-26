import {PageModel} from './model.js';
import {DocumentStore} from './documents.js';
import {PdfRenderer} from './renderer.js';
import {exportPdf} from './exporter.js';
const $=id=>document.getElementById(id), model=new PageModel(), store=new DocumentStore(), renderer=new PdfRenderer(store);
let activeTab='output';
let pageClipboard=[];
const sourceViews=new Map();
const view=()=>activeTab==='output'?model:sourceViews.get(activeTab);
let busy=false, mode='open', dragged=[], previewKey='', revision=0, queue=[], running=false;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
function controls(){const readonly=activeTab!=='output';for(const id of ['open','add','all','go'])$(id).disabled=busy;for(const id of ['delete','left','right'])$(id).disabled=busy||readonly||!model.selected.size;$('undo').disabled=busy||readonly||!model.past.length;$('redo').disabled=busy||readonly||!model.future.length;$('save').disabled=busy||!model.pages.length;}
async function run(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){status(e.message,true);}finally{busy=false;controls();}}
const observer=new IntersectionObserver(entries=>{for(const entry of entries){const card=entry.target;if(entry.isIntersecting){if(!card.dataset.queued){card.dataset.queued='1';queue.push(card);}}else{card.querySelector('.thumb').replaceChildren();delete card.dataset.queued;}}pump();},{root:$('pages'),rootMargin:'200px'});
async function pump(){if(running)return;running=true;try{while(queue.length){const card=queue.shift();if(!card.isConnected||!card.dataset.queued)continue;const ref=view().pages.find(p=>p.id===card.dataset.id);if(!ref)continue;const canvas=document.createElement('canvas');card.querySelector('.thumb').replaceChildren(canvas);try{await renderer.render(ref,canvas,132,155);}catch(e){if(card.isConnected){card.querySelector('.thumb').textContent='描画できません';status(`ページ描画エラー: ${e.message}`,true);}}}}finally{running=false;}}
function updateSelection(){document.querySelectorAll('.page').forEach(card=>{card.classList.toggle('selected',view().selected.has(card.dataset.id));card.classList.toggle('active',view().active===card.dataset.id);card.setAttribute('aria-selected',String(view().selected.has(card.dataset.id)));});$('selection').textContent=`${view().selected.size} ページ選択中` ;controls();preview();}
function refresh(){renderTabs();revision++;observer.disconnect();queue=[];$('pages').replaceChildren();const fragment=document.createDocumentFragment();view().pages.forEach((ref,index)=>{const source=store.sources.get(ref.sourceId);const card=document.createElement('div');card.className='page';card.dataset.id=ref.id;card.draggable=activeTab==='output';card.tabIndex=0;card.setAttribute('role','option');card.setAttribute('aria-label',`${index+1}ページ、${source.name} 元ページ${ref.sourcePage}`);
const thumb=document.createElement('div');thumb.className='thumb';thumb.textContent='描画待ち';const info=document.createElement('div');info.className='page-info';info.textContent=`${index+1} ページ`;const badge=document.createElement('span');badge.className='badge';badge.textContent=`↻ ${ref.rotation}°`;info.append(badge);const origin=document.createElement('div');origin.className='origin';origin.textContent=`${source.name} · ${ref.sourcePage}`;origin.title=origin.textContent;card.append(thumb,info,origin);fragment.append(card);});$('pages').append(fragment);document.querySelectorAll('.page').forEach(card=>observer.observe(card));$('count').textContent=view().pages.length;$('jump').max=view().pages.length;updateSelection();store.collect(model,pageClipboard.map(page=>page.sourceId)).then(()=>{for(const id of sourceViews.keys())if(!store.sources.has(id))sourceViews.delete(id);}).catch(e=>status(e.message,true));}
async function preview(force=false){const ref=view().pages.find(p=>p.id===view().active);const key=ref?`${ref.id}:${ref.rotation}`:'';if(!force&&key===previewKey)return;previewKey=key;if(!ref){$('preview').replaceChildren();$('preview-title').textContent='プレビュー';$('source-label').textContent='ページがありません。PDFを追加してください。';return;}const canvas=document.createElement('canvas');$('preview').replaceChildren(canvas);$('preview-title').textContent=`${store.sources.get(ref.sourceId).name} · ${view().pages.indexOf(ref)+1} / ${view().pages.length}`;$('source-label').textContent=`${store.sources.get(ref.sourceId).name} · 元ページ ${ref.sourcePage}`;try{await renderer.render(ref,canvas,Math.max(100,$('preview').clientWidth-60),Math.max(100,$('preview').clientHeight-60));}catch(e){if(canvas.isConnected)status(`プレビューエラー: ${e.message}`,true);}}
async function load(files,replace){if(!files.length)return;await run(async()=>{status('PDFを読み込んでいます…');const before=new Set(store.sources.keys());const pages=[];try{for(const file of files){if(!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf')throw new Error('PDFファイルを選択してください。');pages.push(...await store.load(file));}}catch(e){await store.discard([...store.sources.keys()].filter(id=>!before.has(id)));throw e;}model.add(pages,replace);activeTab='output';previewKey='';refresh();status(`${files.length} ファイル・${pages.length} ページを読み込みました。`);});}
$('open').onclick=()=>{mode='open';$('file').click();};$('add').onclick=()=>{mode='add';$('file').click();};$('file').onchange=()=>{load([...$('file').files],mode==='open');$('file').value='';};
for(const [id,action]of Object.entries({delete:()=>model.remove(),left:()=>model.rotate(-90),right:()=>model.rotate(90),undo:()=>model.undo(),redo:()=>model.redo()}))$(id).onclick=()=>{if(busy)return;action();previewKey='';refresh();status(`${{delete:'削除',left:'左回転',right:'右回転',undo:'Undo',redo:'Redo'}[id]}しました。`);};
$('all').onclick=()=>{view().selected=new Set(view().pages.map(p=>p.id));updateSelection();};
$('go').onclick=()=>{const page=view().pages[Number($('jump').value)-1];if(page){view().select(page.id);updateSelection();document.querySelector(`[data-id="${page.id}"]`).scrollIntoView({block:'center'});}};
$('pages').onclick=e=>{if(busy)return;const card=e.target.closest('.page');if(card){view().select(card.dataset.id,{toggle:e.ctrlKey||e.metaKey,range:e.shiftKey});updateSelection();}};
$('pages').ondragstart=e=>{const card=e.target.closest('.page');if(busy||activeTab!=='output'||!card){e.preventDefault();return;}if(!model.selected.has(card.dataset.id))model.select(card.dataset.id);dragged=model.pages.filter(p=>model.selected.has(p.id)).map(p=>p.id);e.dataTransfer.setData('application/x-pdf-pages',JSON.stringify(dragged));e.dataTransfer.effectAllowed='move';updateSelection();};
function clearDrop(){document.querySelectorAll('.drop-before,.over').forEach(el=>el.classList.remove('drop-before','over'));}
$('pages').ondragover=e=>{if(!dragged.length||busy)return;e.preventDefault();clearDrop();e.target.closest('.page')?.classList.add('drop-before');};
$('pages').ondrop=e=>{if(!dragged.length||busy)return;e.preventDefault();model.move(dragged,e.target.closest('.page')?.dataset.id??null);dragged=[];previewKey='';refresh();status('ページを並び替えました。');};
$('end').ondragover=e=>{if(dragged.length){e.preventDefault();$('end').classList.add('over');}};$('end').ondrop=e=>{if(!dragged.length||busy)return;e.preventDefault();model.move(dragged);dragged=[];clearDrop();previewKey='';refresh();};document.addEventListener('dragend',()=>{dragged=[];clearDrop();});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();document.body.classList.add('file-over');}});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('file-over');});document.addEventListener('drop',e=>{document.body.classList.remove('file-over');if(e.dataTransfer.files.length){e.preventDefault();load([...e.dataTransfer.files],false);}});
$('save').onclick=()=>run(async()=>{status('PDFを生成しています…');const bytes=await exportPdf(model.pages,store.sources);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download='edited.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`${model.pages.length} ページのPDFを保存しました。`);});
document.addEventListener('keydown',e=>{if(busy||e.isComposing||e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const modifier=e.ctrlKey||e.metaKey;if(modifier&&!e.altKey&&!e.shiftKey&&['c','v','x'].includes(e.key.toLowerCase())){e.preventDefault();pageClipboardAction(e.key.toLowerCase());}else if(modifier&&e.key.toLowerCase()==='a'){e.preventDefault();$('all').click();}else if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}else if(modifier&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}else if(e.key==='Delete'){$('delete').click();}else if(e.target.closest('.page')&&[' ','Enter'].includes(e.key)){e.preventDefault();view().select(e.target.closest('.page').dataset.id,{toggle:modifier,range:e.shiftKey});updateSelection();}else if(activeTab==='output'&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const ids=model.pages.filter(p=>model.selected.has(p.id)).map(p=>p.id);const indexes=ids.map(id=>model.pages.findIndex(p=>p.id===id));if(!indexes.length)return;if(e.key==='ArrowUp'){const index=Math.min(...indexes);if(index>0)model.move(ids,model.pages[index-1].id);}else{const index=Math.max(...indexes);if(index<model.pages.length-1)model.move(ids,model.pages[index+2]?.id??null);}previewKey='';refresh();}});
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(view().pages.length)preview(true);},150);}).observe($('preview'));
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
