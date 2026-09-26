import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const root=process.env.PDF_TEST_RUNTIME || 'C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(root+'/playwright');
const {PDFDocument,StandardFonts,degrees}=require(root+'/pdf-lib');
await mkdir('tests/output',{recursive:true});
for(const [name,count]of [['A',3],['B',2]]){const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);for(let i=1;i<=count;i++){const p=doc.addPage([400+i*10,600]);p.drawText(`${name}-${i}`,{x:80,y:450,size:48,font});if(name==='B'&&i===2)p.setRotation(degrees(90));}await writeFile(`tests/output/${name}.pdf`,await doc.save());}
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
const page=await browser.newPage({viewport:{width:1400,height:1200}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:8080');await page.waitForTimeout(200);assert.equal(await page.locator('.empty').count(),1);await page.locator('#file').setInputFiles('tests/output/A.pdf');await page.waitForFunction(()=>document.querySelectorAll('.page canvas').length===3);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('読み込みました'));
assert.equal(await page.locator('.page').count(),3);
await page.locator('.page').nth(2).dragTo(page.locator('.page').nth(0));assert.match(await page.locator('.origin').first().textContent(),/A.pdf · 3/);
await page.locator('#undo').click();assert.match(await page.locator('.origin').first().textContent(),/A.pdf · 1/);await page.locator('#redo').click();
await page.locator('.page').nth(0).click();await page.locator('.page').nth(1).click({modifiers:['Control']});await page.locator('#right').click();assert.deepEqual(await page.locator('.badge').allTextContents(),['↻ 90°','↻ 90°','↻ 0°']);
await page.locator('#delete').click();assert.equal(await page.locator('.page').count(),1);await page.locator('#undo').click();assert.equal(await page.locator('.page').count(),3);
await page.locator('#add').click();await page.locator('#file').setInputFiles('tests/output/B.pdf');await page.waitForFunction(()=>document.querySelectorAll('.page').length===5);await page.waitForFunction(()=>!document.querySelector('#add').disabled);
assert.deepEqual(await page.getByRole('tab').allTextContents(),['編集結果 (5)','A.pdf (3)','B.pdf (2)']);
await page.getByRole('tab',{name:'A.pdf (3)',exact:true}).click();
assert.equal(await page.locator('#document-name').textContent(),'A.pdf');assert.equal(await page.locator('.page').count(),3);
assert.deepEqual(await page.locator('.origin').allTextContents(),['A.pdf · 1','A.pdf · 2','A.pdf · 3']);
assert.ok(await page.locator('#delete').isDisabled());assert.deepEqual(await page.locator('.badge').allTextContents(),['↻ 0°','↻ 0°','↻ 0°']);
await page.locator('.page').nth(2).click();await page.getByRole('tab',{name:'B.pdf (2)',exact:true}).click();assert.equal(await page.locator('.page').count(),2);assert.equal(await page.locator('#document-name').textContent(),'B.pdf');
await page.getByRole('tab',{name:'A.pdf (3)',exact:true}).click();assert.match(await page.locator('#preview-title').textContent(),/A.pdf · 3/);
await page.getByRole('tab',{name:'編集結果 (5)',exact:true}).click();assert.equal(await page.locator('.page').count(),5);
await page.locator('.page').nth(4).dragTo(page.locator('.page').nth(1));
assert.deepEqual(await page.locator('.origin').allTextContents(),['A.pdf · 3','B.pdf · 2','A.pdf · 1','A.pdf · 2','B.pdf · 1']);
await page.locator('.page').nth(1).click();await page.locator('#right').click();
await page.locator('.page').nth(3).click();await page.locator('.page').nth(4).click({modifiers:['Shift']});await page.locator('#delete').click();assert.equal(await page.locator('.page').count(),3);
const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;await download.saveAs('tests/output/edited.pdf');
const saved=await PDFDocument.load(await readFile('tests/output/edited.pdf'));assert.deepEqual(saved.getPages().map(p=>p.getWidth()),[430,420,410]);assert.deepEqual(saved.getPages().map(p=>p.getRotation().angle),[90,180,90]);
await page.locator('.page').nth(0).click();await page.waitForTimeout(700);await page.screenshot({path:'tests/output/editor.png'});
const content=await page.evaluate(async()=>{const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs');const doc=await getDocument('/tests/output/edited.pdf').promise;const result=[];for(let i=1;i<=doc.numPages;i++)result.push((await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(''));return result;});assert.deepEqual(content,['A-3','B-2','A-1']);
await page.locator('#all').click();await page.locator('#delete').click();assert.equal(await page.locator('.page').count(),0);assert.equal(await page.locator('#save').isDisabled(),true);await page.locator('#undo').click();assert.equal(await page.locator('.page').count(),3);
await page.getByRole('tab',{name:'B.pdf (2)',exact:true}).click();await page.screenshot({path:'tests/output/tabs.png'});await page.getByRole('tab',{name:'編集結果 (3)',exact:true}).click();
// Exercise actual file drop, long-list lazy rendering, jump and failed import rollback.
const large=await PDFDocument.create();for(let i=0;i<100;i++)large.addPage([400,600]);
const data=[...await large.save()];await page.evaluate(bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'large.pdf',{type:'application/pdf'}));document.querySelector('#preview').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));},data);
await page.waitForFunction(()=>document.querySelectorAll('.page').length===103&&!document.querySelector('#add').disabled);assert.ok(await page.locator('.page canvas').count()<40);
await page.locator('#jump').fill('103');await page.locator('#go').click();await page.waitForFunction(()=>document.querySelector('.page:last-child canvas')?.width>0);await page.locator('#undo').click();assert.equal(await page.locator('.page').count(),3);
await page.locator('#file').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));assert.equal(await page.locator('.page').count(),3);

await page.getByRole('tab',{name:'B.pdf (2)',exact:true}).click();
await page.locator('.page').nth(1).click();await page.keyboard.press('Control+c');
await page.keyboard.press('Control+x');assert.equal(await page.locator('.page').count(),2);
await page.getByRole('tab',{name:'編集結果 (3)',exact:true}).click();
await page.locator('.page').first().click();await page.keyboard.press('Control+v');
assert.deepEqual(await page.locator('.origin').allTextContents(),['A.pdf · 3','B.pdf · 2','B.pdf · 2','A.pdf · 1']);
await page.keyboard.press('Control+z');assert.equal(await page.locator('.page').count(),3);
await page.keyboard.press('Control+Shift+z');assert.equal(await page.locator('.page').count(),4);
await page.locator('.page').first().click();await page.locator('.page').nth(1).click({modifiers:['Shift']});
await page.keyboard.press('Control+x');assert.equal(await page.locator('.page').count(),2);
await page.keyboard.press('Control+z');assert.equal(await page.locator('.page').count(),4);
await page.keyboard.press('Control+y');assert.equal(await page.locator('.page').count(),2);
await page.keyboard.press('Control+v');assert.equal(await page.locator('.page').count(),4);
assert.deepEqual(await page.locator('.badge').allTextContents(),['↻ 90°','↻ 90°','↻ 90°','↻ 0°']);
await page.keyboard.press('Control+v');assert.equal(await page.locator('.page').count(),6);
assert.equal(await page.locator('.page').evaluateAll(cards=>new Set(cards.map(c=>c.dataset.id)).size),6);
await page.locator('#jump').focus();await page.keyboard.press('Control+v');assert.equal(await page.locator('.page').count(),6);
assert.deepEqual(errors,[]);console.log('PASS: load, thumbnails, drag reorder, multi-select, rotate, delete, merge, undo/redo, export order/text/rotation, file drop, 103-page list, failed import rollback; no console errors');
}finally{await browser.close();}

