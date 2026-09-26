export const normalizeRotation = n => ((n % 360) + 360) % 360;
export class PageModel {
  pages = []; documentIds = []; selected = new Set(); active = null; anchor = null; past = []; future = [];
  snapshot() { return {pages:this.pages.map(p=>({...p})), documentIds:[...this.documentIds], selected:[...this.selected], active:this.active, anchor:this.anchor}; }
  restore(s) {this.pages=s.pages.map(p=>({...p})); this.documentIds=[...s.documentIds]; this.selected=new Set(s.selected); this.active=s.active; this.anchor=s.anchor;}
  change(fn) {const before=this.snapshot(); fn(); if(JSON.stringify(before)===JSON.stringify(this.snapshot()))return; this.past.push(before); if(this.past.length>100)this.past.shift(); this.future=[];}
  add(pages, replace=false) {this.change(()=>{this.documentIds=[...new Set([...(replace?[]:this.documentIds),...pages.map(p=>p.sourceId)])];this.pages=replace ? pages : [...this.pages,...pages]; this.selected=new Set(pages.length?[pages[0].id]:[]);this.active=pages[0]?.id??null;this.anchor=this.active;});}
  select(id,{toggle=false,range=false}={}) {
    if(range && this.anchor && this.pages.some(p=>p.id===this.anchor)) {
      const a=this.pages.findIndex(p=>p.id===this.anchor), b=this.pages.findIndex(p=>p.id===id);
      if(!toggle)this.selected.clear(); this.pages.slice(Math.min(a,b),Math.max(a,b)+1).forEach(p=>this.selected.add(p.id));
    } else {if(toggle){this.selected.has(id)?this.selected.delete(id):this.selected.add(id);}else this.selected=new Set([id]);this.anchor=id;}
    this.active=id;
  }
  remove() {this.change(()=>{const index=this.pages.findIndex(p=>p.id===this.active);this.pages=this.pages.filter(p=>!this.selected.has(p.id));this.active=this.pages[Math.min(Math.max(index,0),this.pages.length-1)]?.id??null;this.selected=new Set(this.active?[this.active]:[]);this.anchor=this.active;});}
  rotate(delta) {this.change(()=>{this.pages=this.pages.map(p=>this.selected.has(p.id)?{...p,rotation:normalizeRotation(p.rotation+delta)}:p);});}
  move(ids,beforeId=null) {this.change(()=>{const set=new Set(ids);if(set.has(beforeId))return;const moving=this.pages.filter(p=>set.has(p.id));const rest=this.pages.filter(p=>!set.has(p.id));const index=beforeId===null?rest.length:rest.findIndex(p=>p.id===beforeId);if(index<0)return;rest.splice(index,0,...moving);this.pages=rest;});}
  undo(){if(!this.past.length)return;this.future.push(this.snapshot());this.restore(this.past.pop());}
  paste(refs) {
    if (!refs.length) return;
    this.change(() => {
      const copies = refs.map(ref => ({...ref, id:crypto.randomUUID()}));
      const selectedIndexes = this.pages.flatMap((page, index) => this.selected.has(page.id) ? [index] : []);
      const index = selectedIndexes.length ? Math.max(...selectedIndexes) + 1 : this.pages.length;
      this.pages.splice(index, 0, ...copies);
      this.documentIds = [...new Set([...this.documentIds, ...copies.map(page => page.sourceId)])];
      this.selected = new Set(copies.map(page => page.id));
      this.active = copies[0].id;
      this.anchor = this.active;
    });
  }
  redo(){if(!this.future.length)return;this.past.push(this.snapshot());this.restore(this.future.pop());}
}
