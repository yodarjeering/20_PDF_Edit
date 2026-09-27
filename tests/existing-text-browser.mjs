import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=process.env.PDF_TEST_RUNTIME||'C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(root+'/playwright'),lib=require(root+'/pdf-lib');
const fontkit=require('../vendor/fontkit/package/dist/fontkit.umd.min.js');
const {PDFDocument,StandardFonts,PDFName,rgb,degrees}=lib;
await mkdir('tests/output',{recursive:true});
const normal=await PDFDocument.create(),helvetica=await normal.embedFont(StandardFonts.Helvetica);
for(let i=0;i<2;i++){
  const page=normal.addPage([500,650]);
  page.drawText('Voltage: 24V',{x:55,y:500,size:20,font:helvetica,color:rgb(.8,.1,.2)});
  page.drawText('Duplicate',{x:55,y:440,size:16,font:helvetica});page.drawText('Duplicate',{x:260,y:350,size:16,font:helvetica});
  if(i)page.setRotation(degrees(90));
}
await writeFile('tests/output/existing-normal.pdf',await normal.save());
const complex=await PDFDocument.create(),base=await complex.embedFont(StandardFonts.Helvetica),cp=complex.addPage([500,650]);
cp.node.set(PDFName.of('Resources'),complex.context.obj({Font:{F1:base.ref}}));
cp.node.addContentStream(complex.context.register(complex.context.flateStream('q BT /F1 18 Tf 1 0 0 1 55 500 Tm [(Volt) -40 (age: ) 30 <323456>] TJ 0 -40 Td (Same) Tj 24 TL (Quote) \' 0 0 (Double) " ET Q')));
await writeFile('tests/output/existing-tj.pdf',await complex.save());
for(const [name,path,subset]of [['subset','vendor/fonts/NotoSansJP-Regular.otf',true],['embedded','vendor/fonts/MPLUSRounded1c-Regular.ttf',false]]){
  const document=await PDFDocument.create();document.registerFontkit(fontkit);const font=await document.embedFont(await readFile(path),{subset}),page=document.addPage([500,650]);
  page.drawText('日本語の電圧 24V',{x:55,y:500,size:20,font,color:rgb(.1,.3,.7)});await writeFile(`tests/output/existing-${name}.pdf`,await document.save());
}
const unsafe=await PDFDocument.create(),unsafeFont=await unsafe.embedFont(StandardFonts.Helvetica),unsafePage=unsafe.addPage([500,650]);
unsafePage.drawText('Transparent',{x:55,y:500,size:20,font:unsafeFont,opacity:.5});
await writeFile('tests/output/existing-unsafe.pdf',await unsafe.save());
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1200}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('http://127.0.0.1:8080');
  const load=async name=>{
    await page.locator('#open').click();await page.locator('#file').setInputFiles(`tests/output/existing-${name}.pdf`);
    await page.waitForFunction(()=>!document.querySelector('#open').disabled);
    if(await page.locator('#editor-existing').isHidden())await page.locator('#editor-tab-existing').click();
    await page.waitForSelector('.existing-text-hit');
  };
  await load('normal');
  await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).click();
  assert.match(await page.locator('#existing-info').textContent(),/Original Font: Helvetica/);
  assert.equal(await page.locator('#existing-size').inputValue(),'20');
  assert.equal(await page.locator('#existing-color').inputValue(),'#cc1a33');
  await page.locator('#existing-content').fill('Voltage: 24V');await page.locator('#existing-apply').click();
  await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  assert.match(await page.locator('#existing-state').textContent(),/文字列を変更/);
  await page.locator('#existing-content').fill('Voltage: 12V');await page.locator('#existing-apply').click();
  await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  await page.getByRole('button',{name:'既存文字: Voltage: 12V',exact:true}).waitFor();
  await page.locator('#undo').click();await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).waitFor();
  await page.locator('#redo').click();await page.getByRole('button',{name:'既存文字: Voltage: 12V',exact:true}).waitFor();
  await page.getByRole('button',{name:'既存文字: Duplicate',exact:true}).nth(1).click();
  await page.locator('#existing-content').fill('Changed');await page.locator('#existing-apply').click();
  await page.getByRole('button',{name:'既存文字: Changed',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'既存文字: Duplicate',exact:true}).count(),1);
  await page.locator('#zoom').selectOption('1.5');await page.waitForTimeout(300);
  await page.getByRole('button',{name:'既存文字: Voltage: 12V',exact:true}).click();assert.equal(await page.locator('#existing-content').inputValue(),'Voltage: 12V');
  await page.locator('#zoom').selectOption('fit');await page.waitForTimeout(250);
  await page.locator('.page').nth(1).click();await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).waitFor();
  await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).click();
  await page.locator('#existing-content').fill('Rotated 12V');
  const download=page.waitForEvent('download');await page.locator('#save').click();await(await download).saveAs('tests/output/existing-edited.pdf');
  const result=await page.evaluate(async()=>{
    const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs'),pdf=await getDocument('/tests/output/existing-edited.pdf').promise,result=[];
    for(let i=1;i<=pdf.numPages;i++){
      const p=await pdf.getPage(i),viewport=p.getViewport({scale:1}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
      await p.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      result.push({rotate:p.rotate,text:(await p.getTextContent()).items.map(item=>item.str).join('|')});
    }return result;
  });
  assert.ok(result[0].text.includes('Voltage: 24V'),'overlay retains original text (not redaction)');
  assert.ok(result[0].text.includes('Voltage: 12V'));assert.ok(result[0].text.includes('Changed'));
  assert.ok(result[1].text.includes('Rotated 12V'));assert.equal(result[1].rotate,90);
  await page.getByRole('button',{name:'既存文字: Rotated 12V',exact:true}).waitFor();
  const pixels=await page.evaluate(async()=>{
    const preview=document.querySelector('.page-stage>canvas'),before=preview.getContext('2d').getImageData(0,0,preview.width,preview.height).data;
    const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs'),pdf=await getDocument('/tests/output/existing-edited.pdf').promise,p=await pdf.getPage(2);
    const base=p.getViewport({scale:1}),v=p.getViewport({scale:parseFloat(preview.style.width)/base.width}),canvas=document.createElement('canvas');canvas.width=preview.width;canvas.height=preview.height;
    await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
    const after=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let changed=0,red=0;for(let i=0;i<before.length;i+=4){if([0,1,2].some(j=>Math.abs(before[i+j]-after[i+j])>3))changed++;if(after[i]>100&&after[i]>after[i+1]*2&&after[i]>after[i+2]*2)red++;}
    return {changed,red};
  });
  assert.ok(pixels.changed<20,`preview/export differ at ${pixels.changed} pixels`);assert.ok(pixels.red>50,'original text color is retained in the rendered PDF');
  await page.screenshot({path:'tests/output/existing-text-editor.png'});
  for(const name of ['tj','subset','embedded']){
    await load(name);await page.locator('.existing-text-hit').first().click();
    const original=await page.locator('#existing-content').inputValue();
    const replacement=name==='tj'?'Voltage: 12V':'日本語の電圧 12V 変更';
    await page.locator('#existing-content').fill(replacement);await page.locator('#existing-apply').click();
    await page.waitForFunction(()=>!document.querySelector('#open').disabled);
    assert.ok(!(await page.locator('#status').getAttribute('class'))?.includes('error'),await page.locator('#status').textContent());
    await page.getByRole('button',{name:'既存文字: '+replacement,exact:true}).waitFor();
    const pending=page.waitForEvent('download');await page.locator('#save').click();await(await pending).saveAs(`tests/output/existing-${name}-edited.pdf`);
    const output=await page.evaluate(async name=>{
      const {getDocument}=await import('/vendor/pdfjs/build/pdf.mjs'),pdf=await getDocument(`/tests/output/existing-${name}-edited.pdf`).promise,p=await pdf.getPage(1),v=p.getViewport({scale:1}),canvas=document.createElement('canvas');canvas.width=v.width;canvas.height=v.height;
      await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
      return (await p.getTextContent()).items.map(item=>item.str).join('');
    },name);
    assert.ok(output.includes(replacement));assert.ok(output.includes(original));
    if(name==='embedded')assert.match(await page.locator('#existing-state').textContent(),/元の埋め込みフォント/);
    if(name==='subset')assert.match(await page.locator('#existing-state').textContent(),/Subset Font/);
  }
  await load('unsafe');await page.locator('.existing-text-hit').first().click();
  assert.ok(await page.locator('#existing-apply').isDisabled());assert.match(await page.locator('#existing-state').textContent(),/透過/);
  await load('normal');await page.locator('.existing-text-hit').first().click();
  await page.locator('#existing-content').fill('two\nlines');await page.locator('#existing-apply').click();
  await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
  assert.equal(await page.locator('#existing-content').inputValue(),'two\nlines');
  await page.locator('#existing-cancel').click();assert.equal(await page.locator('#existing-content').inputValue(),'Voltage: 24V');
  await page.locator('#existing-content').fill('Size change');await page.locator('#existing-size').fill('15');await page.locator('#existing-font').selectOption('noto-serif');
  await page.locator('#existing-background').fill('#e6f2cc');await page.locator('#existing-apply').click();
  await page.getByRole('button',{name:'既存文字: Size change',exact:true}).waitFor();
  assert.equal(await page.locator('#existing-size').inputValue(),'15');assert.match(await page.locator('#existing-state').textContent(),/Noto Serif/);
  await page.locator('#existing-reset').click();await page.getByRole('button',{name:'既存文字: Voltage: 24V',exact:true}).waitFor();
  await page.locator('#undo').click();await page.getByRole('button',{name:'既存文字: Size change',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: existing text selection, font/color/position, duplicate runs, undo/redo, zoom, rotation, pending save, TJ/hex/quotes, Japanese Type0 subset fallback, embedded TrueType reuse and rendered exports');
}finally{await browser.close();}
