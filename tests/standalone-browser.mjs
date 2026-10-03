import {createRequire} from 'node:module';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=process.env.PDF_TEST_RUNTIME||'C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(root+'/playwright'),lib=require(root+'/pdf-lib');
const {PDFDocument,PDFName,PDFString,StandardFonts,rgb,degrees}=lib;
await mkdir('tests/output/standalone-isolated',{recursive:true});
const isolated=resolve('tests/output/standalone-isolated/editor.html');
await copyFile('PDF-Studio-standalone.html',isolated);
const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
for(let i=0;i<2;i++){const page=doc.addPage([500,650]);page.drawText('Voltage: 24V',{x:45,y:550,size:20,font,color:rgb(.1,.2,.7)});if(i)page.setRotation(degrees(90));}
await writeFile('tests/output/standalone-input.pdf',await doc.save());
// No ToUnicode or embedded program: the worker needs the bundled Japanese CMaps.
const cjk=await PDFDocument.create(),cjkPage=cjk.addPage([400,600]);
const descriptor=cjk.context.register(cjk.context.obj({Type:'FontDescriptor',FontName:'HeiseiMin-W3',Flags:6,FontBBox:[0,-200,1000,900],Ascent:880,Descent:-120,CapHeight:700,ItalicAngle:0,StemV:80}));
const descendant=cjk.context.register(cjk.context.obj({Type:'Font',Subtype:'CIDFontType0',BaseFont:'HeiseiMin-W3',FontDescriptor:descriptor,CIDSystemInfo:{Registry:PDFString.of('Adobe'),Ordering:PDFString.of('Japan1'),Supplement:5},DW:1000}));
const cjkFont=cjk.context.register(cjk.context.obj({Type:'Font',Subtype:'Type0',BaseFont:'HeiseiMin-W3',Encoding:'UniJIS-UTF16-H',DescendantFonts:[descendant]}));
cjkPage.node.set(PDFName.of('Resources'),cjk.context.obj({Font:{F1:cjkFont}}));
cjkPage.node.addContentStream(cjk.context.register(cjk.context.flateStream('BT /F1 20 Tf 1 0 0 1 50 480 Tm <65e5672c8a9e> Tj ET')));
await writeFile('tests/output/standalone-cmap.pdf',await cjk.save());
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const context=await browser.newContext({viewport:{width:1500,height:1150},offline:true});
  const page=await context.newPage(),errors=[],remote=[],extraFiles=[],workers=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('worker',worker=>workers.push(worker));
  context.on('request',request=>{
    const url=request.url();if(/^https?:/.test(url))remote.push(url);
    if(url.startsWith('file:')&&url!==pathToFileURL(isolated).href)extraFiles.push(url);
  });
  await page.goto(pathToFileURL(isolated).href,{timeout:60000});
  await page.waitForFunction(()=>globalThis.__PDF_STUDIO_READY__,{},{timeout:60000});
  assert.equal(await page.locator('#editor-text').isVisible(),false);
  await page.locator('#theme-toggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.locator('#theme-toggle').click();
  await page.locator('#standalone-licenses').click();assert.ok(await page.locator('#license-dialog').isVisible());await page.locator('#license-dialog button').click();
  await page.locator('#file').setInputFiles('tests/output/standalone-cmap.pdf');
  await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  await page.locator('#editor-tab-existing').click();await page.getByRole('button',{name:'既存文字: 日本語',exact:true}).waitFor().catch(async error=>{console.log({status:await page.locator('#status').textContent(),info:await page.locator('#existing-info').textContent(),labels:await page.locator('.existing-text-hit').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),errors,remote});throw error;});
  assert.ok(workers.length>0,'real PDF.js worker created from embedded code');
  const decoderChecks=await workers.at(-1).evaluate(async()=>{
    const result=[];
    for(const name of ['jbig2.wasm','openjpeg.wasm','qcms_bg.wasm']){
      const response=await fetch('https://pdf-studio.invalid/embedded/wasm/'+name);
      const data=await response.arrayBuffer();await WebAssembly.compile(data);result.push(data.byteLength);
      if(name==='qcms_bg.wasm'){
        if(globalThis.fetchSync('https://pdf-studio.invalid/embedded/wasm/'+name).byteLength!==data.byteLength)throw new Error('ICC synchronous asset mismatch');
      }
    }
    const fallback=globalThis.__pdfStudioLoadOpenJPEG('https://pdf-studio.invalid/embedded/wasm/openjpeg_nowasm_fallback.js');
    if(typeof fallback.default!=='function')throw new Error('OpenJPEG JS fallback missing');
    return result;
  });
  assert.ok(decoderChecks.every(size=>size>0));
  await page.locator('#open').click();await page.locator('#file').setInputFiles('tests/output/standalone-input.pdf');
  await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).click();
  await page.evaluate(()=>{globalThis.savedPageCard=document.querySelector('.page');globalThis.savedThumb=globalThis.savedPageCard.querySelector('canvas');});
  assert.equal(await page.locator('#zoom').inputValue(),'width');
  assert.equal(await page.locator('#pages').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),1);
  await page.locator('#existing-content').fill('Voltage: 12V');await page.locator('#existing-apply').click();
  assert.ok(await page.evaluate(()=>globalThis.savedPageCard===document.querySelector('.page')&&globalThis.savedThumb===document.querySelector('.page canvas')));
  await page.getByRole('button',{name:'既存文字: Voltage: 12V',exact:true}).waitFor();
  await page.locator('#undo').click();await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).waitFor();
  await page.locator('#redo').click();await page.getByRole('button',{name:'既存文字: Voltage: 12V',exact:true}).waitFor();
  await page.locator('#editor-tab-text').click();
  const options=await page.locator('#text-font option').evaluateAll(options=>options.map(option=>option.value));
  for(const id of options)for(const bold of [false,true]){
    await page.locator('.page-stage>canvas').click({position:{x:10,y:10}});
    await page.locator('#text-font').selectOption(id);await page.locator('#text-bold').setChecked(bold);
    await page.locator('#text-add').click();const editor=page.locator('.inline-text-editor');await editor.waitFor();
    await editor.fill(`日本語 ${id} ${bold?'Bold':'Regular'}`);await editor.press('Control+Enter');
  }
  await page.locator('#editor-tab-shape').click();await page.locator('#shape-add').click();await page.waitForSelector('.shape-object');
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,20,20);return canvas.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.querySelectorAll('.image-object').length===14);
  const download=page.waitForEvent('download');await page.locator('#save').click();await(await download).saveAs('tests/output/standalone-edited.pdf');
  const output=await readFile('tests/output/standalone-edited.pdf');
  const content=await page.evaluate(async bytes=>{
    const {getDocument}=await import('pdf-studio/vendor/pdfjs/build/pdf.mjs');
    const runtime=globalThis.__PDF_STUDIO_STANDALONE__,pdf=await getDocument({data:new Uint8Array(bytes),cMapUrl:runtime.assetsBase+'cmaps/',cMapPacked:true,standardFontDataUrl:runtime.assetsBase+'standard_fonts/',wasmUrl:runtime.assetsBase+'wasm/',useWorkerFetch:true,useSystemFonts:false}).promise;
    const first=await pdf.getPage(1),items=(await first.getTextContent()).items;
    const canvas=document.createElement('canvas'),viewport=first.getViewport({scale:1});canvas.width=viewport.width;canvas.height=viewport.height;
    await first.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    return {count:pdf.numPages,text:items.map(item=>item.str).join(''),rotation:(await pdf.getPage(2)).rotate};
  },[...output]);
  assert.equal(content.count,2);assert.equal(content.rotation,90);assert.ok(content.text.includes('Voltage: 12V'));
  for(const id of options)for(const weight of ['Regular','Bold'])assert.ok(content.text.includes(`日本語 ${id} ${weight}`));
  await page.screenshot({path:'tests/output/standalone-editor.png'});
  assert.deepEqual(remote,[],'no HTTP requests, even for PDF decoder assets');assert.deepEqual(extraFiles,[],'no sibling files read');assert.deepEqual(errors,[]);
  console.log('PASS: isolated file:// HTML, offline, real Worker, Japanese CMaps, embedded WASM/fallback, 12 fonts, existing edits/history, images/shapes, PDF save/render, theme/licenses; no external requests or console errors');
}finally{await browser.close();}
