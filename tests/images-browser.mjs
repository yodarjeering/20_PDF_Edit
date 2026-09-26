import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const root=process.env.PDF_TEST_RUNTIME||'C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(root+'/playwright');
const {PDFDocument,degrees}=require(root+'/pdf-lib');
await mkdir('tests/output',{recursive:true});
const doc=await PDFDocument.create();doc.addPage([400,600]).setRotation(degrees(90));
await writeFile('tests/output/rotated.pdf',await doc.save());
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  const context=await browser.newContext({viewport:{width:1500,height:1100},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:8080');
  // A real clipboard PNG with asymmetric colors checks orientation as well as placement.
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);ctx.fillStyle='#0000ff';ctx.fillRect(100,0,100,100);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve));
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
  });
  await page.keyboard.press('Control+v');
  await page.waitForSelector('.image-object');assert.equal(await page.locator('.page').count(),1);
  await page.locator('#undo').click();assert.equal(await page.locator('.page').count(),0);
  await page.locator('#redo').click();await page.waitForSelector('.image-object');
  await page.locator('#file').setInputFiles('tests/output/rotated.pdf');await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  await page.keyboard.press('Control+v');await page.waitForSelector('.image-object');
  let box=await page.locator('.image-object').boundingBox();
  assert.ok(box.width>box.height,'clipboard is upright on a rotated page');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+30,{steps:5});await page.mouse.up();
  await page.waitForTimeout(150);let moved=await page.locator('.image-object').boundingBox();
  assert.ok(Math.abs(moved.x-box.x-40)<2);assert.ok(Math.abs(moved.y-box.y-30)<2);
  let handle=await page.locator('.image-resize').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+60,handle.y+handle.height/2+30,{steps:5});await page.mouse.up();
  await page.waitForTimeout(150);let resized=await page.locator('.image-object').boundingBox();assert.ok(resized.width>moved.width+40);assert.ok(Math.abs(resized.width/resized.height-2)<.01);
  await page.locator('#undo').click();await page.waitForTimeout(100);assert.ok(Math.abs((await page.locator('.image-object').boundingBox()).width-moved.width)<2);
  await page.locator('#redo').click();await page.waitForSelector('.image-object');
  await page.locator('#zoom').selectOption('2');await page.waitForTimeout(250);
  assert.equal(await page.locator('.page-stage').evaluate(el=>Math.round(el.getBoundingClientRect().width)),1200);
  await page.locator('#zoom').selectOption('fit');await page.waitForTimeout(250);
  const expected=await page.locator('.image-object').evaluate(el=>{const a=el.getBoundingClientRect(),s=el.parentElement.getBoundingClientRect();return{x:(a.x-s.x)/s.width,y:(a.y-s.y)/s.height,w:a.width/s.width,h:a.height/s.height};});
  const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();await(await downloadPromise).saveAs('tests/output/image-edited.pdf');
  const colors=await page.evaluate(async expected=>{
    const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs');const pdf=await getDocument('/tests/output/image-edited.pdf').promise;
    const p=await pdf.getPage(1),v=p.getViewport({scale:1}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;
    await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
    return [.25,.75].map(t=>[...canvas.getContext('2d').getImageData(Math.round((expected.x+expected.w*t)*v.width),Math.round((expected.y+expected.h*.5)*v.height),1,1).data]);
  },expected);
  assert.deepEqual(colors,[[255,0,0,255],[0,0,255,255]],'saved image matches UI position, size and orientation');
  await page.screenshot({path:'tests/output/image-editor.png'});
  await page.locator('#image-delete').click();assert.equal(await page.locator('.image-object').count(),0);assert.equal(await page.locator('.page').count(),1);
  await page.locator('#undo').click();await page.waitForSelector('.image-object');

  await page.locator('.image-object').first().click();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');
  await page.waitForFunction(()=>document.querySelectorAll('.image-object').length===2);
  assert.equal(await page.locator('.page').count(),1,'image copy does not duplicate the page');
  const sizes=await page.locator('.image-object').evaluateAll(nodes=>nodes.map(n=>[n.style.width,n.style.height]));
  assert.deepEqual(sizes[0],sizes[1],'image paste preserves dimensions');
  await page.keyboard.press('Control+v');await page.waitForFunction(()=>document.querySelectorAll('.image-object').length===3);
  assert.equal(await page.locator('.image-object').evaluateAll(nodes=>new Set(nodes.map(n=>n.dataset.imageId)).size),3);
  await page.locator('#undo').click();await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelectorAll('.image-object').length===1);
  for(const kind of ['rectangle','ellipse','line','arrow']){
    await page.locator(`[data-shape="${kind}"]`).click();
    await page.locator('#shape-stroke').fill('#10b981');await page.locator('#shape-stroke').dispatchEvent('change');
    await page.locator('#shape-fill').fill('#10b981');await page.locator('#shape-fill').dispatchEvent('change');
    await page.locator('#shape-no-fill').uncheck();
    await page.locator('#shape-width').selectOption('4');
    await page.locator('#shape-add').click();await page.waitForSelector('.shape-object');
    assert.equal(await page.locator('.shape-object').count(),1);
    if(kind==='rectangle'){
      const old=await page.locator('.shape-object').boundingBox(),h=await page.locator('.shape-object .image-resize').boundingBox();
      await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+50,h.y+h.height/2+5,{steps:4});await page.mouse.up();await page.waitForTimeout(120);
      const resized=await page.locator('.shape-object').boundingBox();assert.ok(resized.width>old.width+40);assert.ok(resized.height<old.height+10);
      await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await page.waitForFunction(()=>document.querySelectorAll('.shape-object').length===2);
      await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelectorAll('.shape-object').length===1);
      await page.locator('.shape-object').click();
      await page.locator('#object-rotate').click();await page.waitForSelector('.shape-object');
    }
    const sample=await page.locator('.shape-object').evaluate(el=>{const a=el.getBoundingClientRect(),s=el.parentElement.getBoundingClientRect();return{x:(a.x+a.width/2-s.x)/s.width,y:(a.y+a.height/2-s.y)/s.height};});
    const pending=page.waitForEvent('download');await page.locator('#save').click();await(await pending).saveAs('tests/output/shape-'+kind+'.pdf');
    const pixel=await page.evaluate(async({kind,sample})=>{
      const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs');const pdf=await getDocument('/tests/output/shape-'+kind+'.pdf').promise,p=await pdf.getPage(1),v=p.getViewport({scale:1}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;const ctx=c.getContext('2d');await p.render({canvasContext:ctx,viewport:v}).promise;return [...ctx.getImageData(Math.round(sample.x*v.width),Math.round(sample.y*v.height),1,1).data];
    },{kind,sample});
    assert.deepEqual(pixel,[16,185,129,255],kind+' export matches its UI center and color');
    await page.locator('#image-delete').click();assert.equal(await page.locator('.shape-object').count(),0);
  }
  await page.locator('#shape-width-custom').fill('3.7');await page.locator('#shape-width-custom').dispatchEvent('change');
  assert.equal(await page.locator('#shape-width').inputValue(),'custom');
  await page.locator('[data-shape="rectangle"]').click();await page.locator('#shape-add').click();await page.waitForSelector('.shape-object');
  assert.equal(await page.locator('.shape-object path').getAttribute('stroke-width'),'3.7');await page.locator('#image-delete').click();
  await page.locator('#text-content').fill('日本語テキスト\nPDF Studio');await page.locator('#text-size').fill('24');await page.locator('#text-color').fill('#7431b5');
  await page.locator('#text-add').click();await page.waitForSelector('.text-object');
  await page.locator('.text-object').dblclick();assert.ok(await page.locator('#text-content').evaluate(el=>el===document.activeElement));
  await page.locator('#text-content').fill('日本語の文字\n編集したテキスト');await page.locator('#text-bold').check();await page.locator('#text-apply').click();await page.waitForTimeout(150);
  assert.equal(await page.locator('.text-object img').getAttribute('alt'),'日本語の文字\n編集したテキスト');
  await page.locator('#undo').click();await page.waitForTimeout(100);assert.equal(await page.locator('.text-object img').getAttribute('alt'),'日本語テキスト\nPDF Studio');await page.locator('#redo').click();await page.waitForSelector('.text-object');
  await page.locator('.text-object').click();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');await page.waitForFunction(()=>document.querySelectorAll('.text-object').length===2);await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelectorAll('.text-object').length===1);
  const sampleText=await page.locator('.text-object').evaluate(async el=>{
    const img=el.querySelector('img');await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    let point=null;for(let y=2;y<c.height-2&&!point;y++)for(let x=2;x<c.width-2;x++)if([[0,0],[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>pixels[((y+dy)*c.width+x+dx)*4+3]===255)){point={x,y};break;}
    if(!point)throw Error('No text pixels');const b=el.getBoundingClientRect(),s=el.parentElement.getBoundingClientRect();return{x:(b.x-s.x+b.width*point.x/c.width)/s.width,y:(b.y-s.y+b.height*point.y/c.height)/s.height};
  });
  const textDownload=page.waitForEvent('download');await page.locator('#save').click();await(await textDownload).saveAs('tests/output/text-edited.pdf');
  const textPixel=await page.evaluate(async sample=>{const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs');const pdf=await getDocument('/tests/output/text-edited.pdf').promise,p=await pdf.getPage(1),v=p.getViewport({scale:3}),c=document.createElement('canvas');c.width=v.width;c.height=v.height;const ctx=c.getContext('2d');await p.render({canvasContext:ctx,viewport:v}).promise;return [...ctx.getImageData(Math.round(sample.x*v.width),Math.round(sample.y*v.height),1,1).data];},sampleText);
  assert.ok(Math.abs(textPixel[0]-116)<20&&Math.abs(textPixel[1]-49)<20&&Math.abs(textPixel[2]-181)<20,'Japanese text placement/color preserved in PDF');
  await page.screenshot({path:'tests/output/text-editor.png'});
  assert.deepEqual(errors,[]);console.log('PASS: images, clipboard, pictograms, 4 shapes, custom stroke width, Japanese text add/edit/copy/history and exported pixels, no console errors');
} finally {await browser.close();}
