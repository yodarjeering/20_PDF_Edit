import test from 'node:test';
import assert from 'node:assert/strict';
import {PageModel} from '../js/model.js';
import {tokenizeContent,analyzeContent,directEditStrategy} from '../js/pdf-content.js';
import {normalizeFontName,matchPdfFonts} from '../js/pdf-fonts.js';
import {createTextObjects,textGeometry,multiplyMatrices} from '../js/text-objects.js';
import {base64ToBytes,registerEmbeddedFont,fontCatalog} from '../js/fonts.js';
import {canRender} from '../js/font-resolver.js';
import {validateExistingEdit} from '../js/existing-text-export.js';

test('existing text edits retain originals, survive history and are independent in copied pages',()=>{
  const model=new PageModel();model.add([{id:'page',sourceId:'source',sourcePage:1,rotation:0}]);
  const object={id:'source:0:0',text:'ABD',originalText:'ABC',source:'pdf'};
  model.updateTextObject('page',object);assert.equal(model.pages[0].textEdits[object.id].originalText,'ABC');
  model.paste([model.pages[0]]);const copy=model.pages[1].id;
  model.updateTextObject(copy,{...object,text:'Copied'});
  assert.equal(model.pages[0].textEdits[object.id].text,'ABD');
  model.undo();assert.equal(model.pages[1].textEdits[object.id].text,'ABD');
  model.redo();assert.equal(model.pages[1].textEdits[object.id].text,'Copied');
  model.resetTextObject(copy,object.id);assert.equal(Object.keys(model.pages[1].textEdits).length,0);
  model.undo();assert.equal(model.pages[1].textEdits[object.id].text,'Copied');
});
test('font names preserve non-subset prefixes and reject ambiguous resource assignments',()=>{
  assert.equal(normalizeFontName('ABCDEE+ArialMT'),'ArialMT');assert.equal(normalizeFontName('AbCDEE+ArialMT'),'AbCDEE+ArialMT');
  const inspection={content:{parsed:true,fonts:['F1','F2']},records:[{resourceName:'F1',pdfFontRef:'1 0 R'},{resourceName:'F2',pdfFontRef:'2 0 R'}]};
  const result=matchPdfFonts(inspection,{fnArray:[1,1],argsArray:[['g1'],['g1']]},{setFont:1});assert.equal(result.get('g1'),null);
  inspection.content.hasXObjects=true;assert.equal(matchPdfFonts(inspection,{fnArray:[],argsArray:[]},{setFont:1}).size,0);
});
test('read-only stream analysis distinguishes strings, escapes, hex, TJ, quote operators and inline images',()=>{
  const stream='% /Fake 99 Tf\nBT /F#31 12 Tf 1 0 0 1 20 30 Tm [(Tj \\(nested\\)) -20 <323456>] TJ 0 -12 Td 0 -12 TD T* (single) \' 1 2 (double) " ET';
  const analysis=analyzeContent(stream);assert.equal(analysis.parsed,true);assert.deepEqual(analysis.fonts,['F1']);assert.equal(analysis.hasTJ,true);assert.equal(analysis.hasHex,true);
  for(const op of ['BT','ET','Tf','Tm','Td','TD','T*','TJ',"'",'"'])assert.ok(analysis.operators.includes(op));
  assert.ok(!analysis.operators.includes('Tj'));assert.equal(tokenizeContent('(BI bytes EI)').length,1);
  assert.equal(analyzeContent('BI /W 1 ID binary EI').parsed,false);
  assert.equal(analyzeContent('(unterminated').parsed,false);
  assert.throws(()=>directEditStrategy.apply(),/安全/);assert.equal(directEditStrategy.classify().mode,'overlay');
});
test('text objects preserve source identity, transform and original metrics for repeated text',()=>{
  const item={str:'ABC',fontName:'f1',transform:[10,0,0,10,40,80],width:25,height:10,dir:'ltr'};
  const objects=createTextObjects({items:[item,item],styles:{f1:{ascent:.8,descent:-.2,fontFamily:'sans-serif'}}},{sourceId:'doc',pageIndex:2,paintFor:()=>({color:'#123456',renderMode:0,opacity:1,complex:false})});
  assert.notEqual(objects[0].id,objects[1].id);assert.equal(objects[0].originalText,'ABC');assert.equal(objects[0].pageIndex,2);assert.deepEqual(objects[0].position,{x:40,y:80});
  const geometry=textGeometry(objects[0]);assert.deepEqual(geometry.basis,[1,0,0,1,40,80]);assert.equal(geometry.width,25);
  const rotated=multiplyMatrices([0,2,2,0,0,0],geometry.css);assert.equal(rotated[4],176);assert.equal(rotated[5],80);
  const vertical=createTextObjects({items:[item],styles:{f1:{vertical:true}}},{sourceId:'doc',pageIndex:0});assert.equal(vertical[0].editMode,'unsupported');
});
test('base64 registration is additive and glyph checks reject unavailable code points',()=>{
  assert.deepEqual([...base64ToBytes('AAEC/w==')],[0,1,2,255]);
  assert.throws(()=>base64ToBytes(''),/Base64/);
  const count=fontCatalog.length;registerEmbeddedFont({id:'test-registered',label:'Test font',regular:'AA==',bold:'AA=='});assert.equal(fontCatalog.length,count+1);
  assert.throws(()=>registerEmbeddedFont({id:'test-registered',regular:'AA==',bold:'AA=='}),/登録済み/);
  assert.equal(canRender({hasGlyphForCodePoint:code=>code<128},'ABC'),true);assert.equal(canRender({hasGlyphForCodePoint:code=>code<128},'日本語'),false);
});
test('unsafe overlay data fails closed before writing a PDF',()=>{
  const item={source:'pdf',editMode:'overlay',fontSize:12,width:50,height:12,color:'#112233',background:'#ffffff',transform:[12,0,0,12,30,40]};
  assert.doesNotThrow(()=>validateExistingEdit(item));
  assert.throws(()=>validateExistingEdit({...item,color:null}),/文字色/);
  assert.throws(()=>validateExistingEdit({...item,editMode:'unsupported'}),/安全/);
  assert.throws(()=>validateExistingEdit({...item,transform:[0,0,0,0,30,40]}),/座標/);
});
