import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PageModel} from '../js/model.js';
const pages=['a','b','c','d','e'].map((id,i)=>({id,sourceId:i<3?'A':'B',sourcePage:i<3?i+1:i-2,rotation:0}));
test('paste preserves origin and rotation, generates unique IDs and supports history',()=>{
 const m=new PageModel();m.add(pages.slice(0,3));m.select('a');m.select('c',{toggle:true});
 const clipboard=[{...pages[3],rotation:270},{...pages[0]}];m.paste(clipboard);
 assert.deepEqual(m.pages.map(p=>p.sourcePage),[1,2,3,1,1]);assert.equal(m.pages[3].rotation,270);
 assert.deepEqual(m.documentIds,['A','B']);assert.equal(new Set(m.pages.map(p=>p.id)).size,5);
 const firstIds=[...m.selected];m.paste(clipboard);assert.equal(m.pages.length,7);assert.ok([...m.selected].every(id=>!firstIds.includes(id)));
 m.undo();assert.equal(m.pages.length,5);m.undo();assert.deepEqual(m.documentIds,['A']);m.redo();assert.equal(m.pages.length,5);
 m.selected=new Set(m.pages.map(p=>p.id));m.remove();m.paste(clipboard);assert.equal(m.pages.length,2);assert.equal(m.pages[0].rotation,270);
});
test('mixed sources, selection, move, rotate, delete and history round-trip',()=>{
 const m=new PageModel();m.add(pages);m.select('d');m.move(['d'],'b');assert.deepEqual(m.pages.map(p=>p.id),['a','d','b','c','e']);m.select('a');m.select('b',{range:true});assert.deepEqual([...m.selected],['a','d','b']);m.rotate(-90);assert.deepEqual(m.pages.map(p=>p.rotation),[270,270,270,0,0]);m.remove();assert.deepEqual(m.pages.map(p=>p.id),['c','e']);m.undo();assert.equal(m.pages.length,5);m.undo();assert.ok(m.pages.every(p=>p.rotation===0));m.redo();assert.equal(m.pages[1].sourceId,'B');m.redo();assert.equal(m.pages.length,2);m.undo();m.rotate(90);assert.equal(m.future.length,0);
});
test('append/open undo, delete all, no-op move and toggling',()=>{const m=new PageModel();m.add(pages.slice(0,3));m.add(pages.slice(3));m.undo();assert.equal(m.pages.length,3);m.redo();m.select('a');m.select('c',{toggle:true});assert.deepEqual([...m.selected],['a','c']);m.move(['a','c']);assert.deepEqual(m.pages.map(p=>p.id),['b','d','e','a','c']);const n=m.past.length;m.move(['a'],'a');assert.equal(m.past.length,n);m.selected=new Set(m.pages.map(p=>p.id));m.remove();assert.equal(m.active,null);m.undo();assert.equal(m.pages.length,5);m.add([],true);m.undo();assert.equal(m.pages.length,5);});
