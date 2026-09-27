import {fontCatalog} from './fonts.js';
import {multiplyMatrices,textGeometry} from './text-objects.js';
import {validateExistingEdit} from './existing-text-export.js';
const $=id=>document.getElementById(id);
export class ExistingTextEditor{
  constructor({store,commit,reset,select}){
    Object.assign(this,{store,commit,reset,onSelect:select,enabled:false,dirty:false,selected:null,sequence:0,busy:false});
    for(const font of fontCatalog){const option=document.createElement('option');option.value=font.id;option.textContent=font.label;$('existing-font').append(option);}
    for(const id of ['existing-content','existing-font','existing-size','existing-color','existing-background']){
      $(id).addEventListener('input',()=>{if(this.selected){this.dirty=true;if(id==='existing-color')this.colorExplicit=true;$('existing-state').textContent='未適用の変更があります。適用または保存で反映します。';}});
      $(id).addEventListener('change',()=>{if(this.selected){this.dirty=true;if(id==='existing-color')this.colorExplicit=true;}});
    }
    this.setBusy(false);
  }
  setBusy(busy){
    this.busy=busy;const unsupported=this.selected?.object.editMode==='unsupported';
    for(const id of ['existing-content','existing-font','existing-size','existing-color','existing-background','existing-apply'])$(id).disabled=busy||!this.selected||unsupported;
    $('existing-reset').disabled=busy||!this.selected;$('existing-cancel').disabled=busy||!this.selected;
  }
  setEnabled(value){this.enabled=value;this.layer?.classList.toggle('enabled',value);}
  async mount(stage,ref,viewport){
    const sequence=++this.sequence;this.layer=null;
    if(this.selected?.pageId!==ref.id){this.selected=null;this.dirty=false;$('existing-info').textContent='「既存文字」タブを開いて、PDF上の文字をクリックしてください。';this.setBusy(this.busy);}
    if(!this.enabled)return;
    const objects=await this.store.textObjects(ref);if(!stage.isConnected||sequence!==this.sequence)return;
    const layer=document.createElement('div');layer.className='existing-text-layer enabled';this.layer=layer;
    for(const object of objects){
      const geometry=textGeometry(object);if(![geometry.width,geometry.height,...geometry.css].every(Number.isFinite))continue;
      const button=document.createElement('button');button.type='button';button.className='existing-text-hit';button.dataset.textId=object.id;
      button.setAttribute('aria-label',`既存文字: ${object.text}`);button.title=object.text;
      const matrix=multiplyMatrices(viewport.transform,geometry.css);
      Object.assign(button.style,{width:Math.max(1,geometry.width)+'px',height:Math.max(1,geometry.height)+'px',transform:`matrix(${matrix.join(',')})`});
      button.classList.toggle('selected',this.selected?.object.id===object.id);
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.onclick=event=>{event.stopPropagation();if(!this.busy)this.choose(ref.id,object);};layer.append(button);
    }
    stage.append(layer);
    if(this.selected&&!this.dirty){const object=objects.find(item=>item.id===this.selected.object.id);if(object)this.choose(ref.id,object,false);}
    if(!objects.length)$('existing-info').textContent='このページには抽出可能な文字がありません。スキャン画像のOCRは未対応です。';
  }
  choose(pageId,object,focus=true){
    this.selected={pageId,object};this.dirty=false;this.colorExplicit=Boolean(object.color);
    $('existing-content').value=object.text;$('existing-font').value=object.fontChoice||'auto';$('existing-size').value=object.fontSize;
    $('existing-color').value=object.color||'#000000';$('existing-background').value=object.background||'#ffffff';
    $('existing-info').textContent=`Font: ${object.normalizedFontName}\nOriginal Font: ${object.originalFontIdentified?object.fontName:'未特定（PDF.js ID: '+object.pdfjsFontName+'）'}\n元サイズ: ${object.originalFontSize.toFixed(3)} pt · 座標: ${object.x.toFixed(2)}, ${object.y.toFixed(2)} · 元ページ: ${object.pageIndex+1}\nSource: Existing PDF · Edit mode: ${object.editMode==='unsupported'?'Unsupported':'Overlay'} · 埋め込み: ${object.embeddedFont?.kind||'なし／未特定'} · ${object.fontSubtype||'Font種別未特定'}${object.hasToUnicode?' · ToUnicodeあり':''}`;
    $('existing-state').textContent=object.unsupportedReason||(object.resolvedFont?`使用フォント: ${object.resolvedFont.label} — ${object.resolvedFont.reason}`:object.color?'文字列を変更し「変更を適用」を押してください。':'元の文字色を特定できません。文字色を選択してから適用してください。');
    this.layer?.querySelectorAll('.existing-text-hit').forEach(button=>button.classList.toggle('selected',button.dataset.textId===object.id));
    this.onSelect?.();this.setBusy(this.busy);if(focus&&!$('existing-content').disabled)$('existing-content').focus();
  }
  async apply(){
    if(!this.dirty||!this.selected)return;
    const {pageId,object}=this.selected;
    const edited={...object,text:$('existing-content').value,fontChoice:$('existing-font').value,fontSize:Number($('existing-size').value),
      color:this.colorExplicit?$('existing-color').value:null,background:$('existing-background').value,isModified:true};
    if(['text','fontChoice','fontSize','color','background'].every(key=>edited[key]===object[key])){this.choose(pageId,object,false);return;}
    validateExistingEdit(edited);
    const document=await globalThis.PDFLib.PDFDocument.create();
    const {resolution}=await this.store.fontResolver.prepare(document,edited);
    // Exercise subsetting before accepting the edit, not only when saving.
    await document.save();
    edited.resolvedFont={kind:resolution.kind,label:resolution.label,reason:resolution.reason};
    this.commit(pageId,edited);this.choose(pageId,edited,false);
  }
  cancel(){
    if(!this.selected)return;this.dirty=false;this.choose(this.selected.pageId,this.selected.object,false);
  }
  restore(){
    if(!this.selected)return;const {pageId,object}=this.selected;this.dirty=false;this.reset(pageId,object.id);this.selected=null;
  }
  clear(){this.sequence++;this.layer=null;this.selected=null;this.dirty=false;this.setBusy(this.busy);}
}
