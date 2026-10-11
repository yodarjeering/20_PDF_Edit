import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {transformPage} from '../js/page-transform.js';
const require=createRequire(import.meta.url);
const lib=require((process.env.PDF_TEST_RUNTIME||'C:/Users/Owner/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')+'/pdf-lib');
const {PDFDocument,PDFName,PDFNumber}=lib;
test('export resizes all boxes and mirrors rotated content and annotations',async()=>{
 for(const rotation of [0,90,180,270]){
  const doc=await PDFDocument.create(),page=doc.addPage([400,600]);
  page.setCropBox(20,30,300,500);page.drawRectangle({x:40,y:70,width:20,height:30});
  const ap=doc.context.register(doc.context.flateStream('0 0 20 30 re f',{Type:'XObject',Subtype:'Form',BBox:[0,0,20,30],Resources:{}}));
  page.node.set(PDFName.of('Annots'),doc.context.obj([doc.context.register(doc.context.obj({Type:'Annot',Subtype:'FreeText',Rect:[40,70,60,100],AP:{N:ap}}))]));
  transformPage(page,{rotation,pageScale:2,mirrorX:true},lib);
  const saved=await PDFDocument.load(await doc.save()),result=saved.getPage(0);
  assert.deepEqual(result.getMediaBox(),{x:0,y:0,width:800,height:1200});
  assert.deepEqual(result.getCropBox(),{x:40,y:60,width:600,height:1000});
  assert.deepEqual(result.getTrimBox(),result.getCropBox());assert.equal(result.getRotation().angle,rotation);
  const annotation=result.node.Annots().lookup(0);
  const rect=annotation.lookup(PDFName.of('Rect')).asArray().map(n=>n.asNumber());
  assert.deepEqual(rect,rotation%180===0?[560,140,600,200]:[80,920,120,980]);
  const matrix=annotation.lookup(PDFName.of('AP')).lookup(PDFName.of('N')).dict.lookup(PDFName.of('Matrix'));
  assert.equal(matrix.lookup(rotation%180===0?0:3,PDFNumber).asNumber(),-1);
 }
});
