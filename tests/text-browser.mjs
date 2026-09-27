import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fontCatalog} from '../js/fonts.js';
const require=createRequire(import.meta.url);
const root=process.env.PDF_TEST_RUNTIME||'C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(root+'/playwright');
await mkdir('tests/output',{recursive:true});
// Check every base64 payload against its distributable original.
for(const font of fontCatalog)for(const weight of ['Regular','Bold']){
  const {default:base64}=await import(`../vendor/fonts/${font.file}-${weight}.base64.js`);
  assert.deepEqual(Buffer.from(base64,'base64'),await readFile(`vendor/fonts/${font.file}-${weight}.${font.extension}`));
}
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[],fontRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('.base64.js'))fontRequests.push(request.url());});
  await page.route(/\/vendor\/fonts\/.*\.(otf|ttf)$/,route=>route.abort());
  await page.goto('http://127.0.0.1:8080');
  assert.equal(fontRequests.length,0,'fonts are lazy loaded');
  await page.locator('#editor-tab-text').click();
  await page.locator('#text-add').click();
  const editor=page.locator('.inline-text-editor');await editor.waitFor();
  assert.equal(await editor.inputValue(),'');
  assert.equal(fontRequests.length,1,'only selected font and weight are loaded');
  await editor.fill('直接入力\n二行目');
  await page.screenshot({path:'tests/output/direct-text-input.png'});
  // IME Enter/Escape must never confirm or cancel the composition session.
  await editor.dispatchEvent('compositionstart');
  await editor.dispatchEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true});
  await editor.dispatchEvent('keydown',{key:'Escape',isComposing:true});
  assert.equal(await editor.count(),1);
  await editor.dispatchEvent('compositionend');
  await editor.press('Control+Enter');await editor.waitFor({state:'detached'});
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.text-object img').getAttribute('alt'),'直接入力\n二行目');
  const movedBox=await page.locator('.text-object').boundingBox();
  await page.mouse.move(movedBox.x+10,movedBox.y+10);await page.mouse.down();await page.mouse.move(movedBox.x+40,movedBox.y+30,{steps:5});await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.text-object img').getAttribute('alt'),'直接入力\n二行目','dragging after direct edit retains new text');
  await page.locator('.text-object').dblclick();await editor.fill('取り消す内容');await editor.press('Escape');
  assert.equal(await page.locator('.text-object img').getAttribute('alt'),'直接入力\n二行目');
  await page.locator('.text-object').press('Enter');await editor.fill('保存直前の文字');
  const firstDownload=page.waitForEvent('download');await page.locator('#save').click();
  await(await firstDownload).saveAs('tests/output/direct-text.pdf');
  const extracted=await page.evaluate(async()=>{
    const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs');
    const pdf=await getDocument('/tests/output/direct-text.pdf').promise;
    return (await(await pdf.getPage(1)).getTextContent()).items.map(item=>item.str).join('');
  });
  assert.equal(extracted,'保存直前の文字','clicking Save commits the active draft');
  await page.locator('.text-object').dblclick();await editor.fill('未対応\u{10ffff}');
  await editor.press('Control+Enter');assert.equal(await editor.getAttribute('aria-invalid'),'true');
  assert.equal(await editor.inputValue(),'未対応\u{10ffff}','unsupported glyphs retain the draft');
  await editor.press('Escape');
  // Resize while typing must preserve the draft and caret.
  await page.locator('.text-object').dblclick();await editor.fill('画面サイズ変更中');
  await page.setViewportSize({width:1250,height:950});await page.waitForTimeout(250);
  assert.equal(await editor.inputValue(),'画面サイズ変更中');await editor.press('Escape');
  await page.setViewportSize({width:1500,height:1100});await page.waitForTimeout(250);
  await page.locator('.text-object').dblclick();await editor.fill('タブ移動でも保持');
  await page.locator('#document-tabs button').nth(1).click({delay:200});await page.waitForTimeout(200);
  assert.equal(await editor.count(),0);assert.equal(await page.locator('.text-object').count(),0);
  await page.locator('#document-tabs button').first().click();await page.waitForTimeout(200);
  assert.equal(await page.locator('.text-object img').getAttribute('alt'),'タブ移動でも保持');
  for(const font of fontCatalog)for(const bold of [false,true]){
    await page.locator('.page-stage>canvas').click({position:{x:10,y:10}});
    await page.locator('#text-font').selectOption(font.id);
    await page.waitForFunction(()=>!document.querySelector('#text-font').disabled);
    await page.locator('#text-bold').setChecked(bold);
    await page.waitForFunction(()=>!document.querySelector('#text-bold').disabled);
    await page.locator('#text-add').click();await editor.waitFor();
    await editor.fill(`日本語 ${font.id} ${bold?'Bold':'Regular'}`);
    await editor.press('Control+Enter');await page.waitForTimeout(150);
  }
  assert.equal(new Set(fontRequests).size,12);
  const download=page.waitForEvent('download');await page.locator('#save').click();
  await(await download).saveAs('tests/output/all-fonts.pdf');
  const result=await page.evaluate(async()=>{
    const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs');
    const pdf=await getDocument('/tests/output/all-fonts.pdf').promise,p=await pdf.getPage(1);
    const content=await p.getTextContent();
    const canvas=document.createElement('canvas'),viewport=p.getViewport({scale:1});canvas.width=viewport.width;canvas.height=viewport.height;
    await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    return {text:content.items.map(item=>item.str).join(''),fonts:Object.keys(content.styles).length};
  });
  assert.equal(result.fonts,12,'all font/weight pairs are embedded independently');
  for(const font of fontCatalog)for(const weight of ['Regular','Bold'])assert.ok(result.text.includes(`日本語 ${font.id} ${weight}`));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'tests/output/direct-text-editor.png'});
  console.log('PASS: direct editing, commit-on-save, cancel, IME event handling, resize, invalid glyph recovery, 12 embedded font variants and searchable PDF');
}finally{await browser.close();}
