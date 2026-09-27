import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {posix,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fontCatalog} from '../js/fonts.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path)=>readFile(resolve(root,path));
const source=async path=>(await read(path)).toString('utf8');
const escapeHtml=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inlineScript=value=>value.replace(/<\/script/gi,'<\\/script');
const payload=(id,data,attributes='')=>`<script type="application/octet-stream" id="${id}" ${attributes}>${Buffer.from(data).toString('base64')}</script>\n`;
const resources=[];
for(const folder of ['cmaps','standard_fonts','wasm']){
  for(const name of (await readdir(resolve(root,'vendor/pdfjs',folder))).sort()){
    if(name.startsWith('LICENSE'))continue;
    const mime=name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream';
    let data=await read(`vendor/pdfjs/${folder}/${name}`);
    if(name==='openjpeg_nowasm_fallback.js'){
      let fallback=data.toString('utf8');
      if(fallback.split('export default OpenJPEG;').length!==2)throw new Error('Review OpenJPEG fallback adapter');
      fallback=fallback.replace('export default OpenJPEG;','globalThis.__pdfStudioOpenJPEG=OpenJPEG;').replaceAll('import.meta.url','self.location.href');
      data=Buffer.from(fallback);
    }
    resources.push(payload(`resource-${folder}-${name}`,data,`data-pdf-resource="${folder}/${name}" data-mime="${mime}"`));
  }
}
for(const font of fontCatalog)for(const weight of ['Regular','Bold']){
  const name=`${font.file}-${weight}`;
  // Use existing embedded payloads verbatim; do not generate extra font variants.
  const data=(await source(`vendor/fonts/${name}.base64.js`)).match(/export default "([A-Za-z0-9+/=]+)";/)?.[1];
  if(!data)throw new Error(`Invalid font module: ${name}`);
  resources.push(`<script type="application/octet-stream" id="font-${name}">${data}</script>\n`);
}
let worker=await source('vendor/pdfjs/build/pdf.worker.mjs');
// These two version-checked adapters cover synchronous ICC reads and dynamic
// OpenJPEG fallback imports, which cannot use the asynchronous fetch adapter.
for(const [before,after]of [
  ['function fetchSync(url) {','function fetchSync(url) {\n  if(url.startsWith("https://pdf-studio.invalid/embedded/"))return __pdfStudioAssetBytes(url).buffer;'],
]){
  if(worker.split(before).length!==2)throw new Error('PDF.js worker changed; review standalone adapter: '+before);
  worker=worker.replace(before,after);
}
worker=worker.replace(/^\/\/# sourceMappingURL=.*$/gm,'');
if(worker.split('export { WorkerMessageHandler };').length!==2||worker.split('import.meta.url').length!==3)throw new Error('Review classic Worker adapter');
worker=worker.replace('export { WorkerMessageHandler };','').replaceAll('import.meta.url','self.location.href');
const fallbackImport=/const mod = await import\(\s*\/\*webpackIgnore: true\*\/\s*\/\*@vite-ignore\*\/\s*path\);/g;
if([...worker.matchAll(fallbackImport)].length!==1)throw new Error('Review classic Worker fallback import');
worker=worker.replace(fallbackImport,'const mod = __pdfStudioLoadOpenJPEG(path);');
resources.push(payload('pdf-worker-source',worker));
resources.push(payload('pdf-lib-source',await read('vendor/pdf-lib/pdf-lib.min.js')));
resources.push(payload('fontkit-source',await read('vendor/fontkit/package/dist/fontkit.umd.min.js')));
const modules=['vendor/pdfjs/build/pdf.mjs',...(await readdir(resolve(root,'js'))).filter(name=>name.endsWith('.js')&&name!=='theme.js').sort().map(name=>'js/'+name)];
for(const path of modules){
  let code=await source(path);
  code=code.replace(/^(import\s+[^;\n]+?\s+from\s+)(['"])(\.[^'"]+)\2/gm,(_,prefix,quote,specifier)=>{
    const target=posix.normalize(posix.join(posix.dirname(path),specifier));
    if(!modules.includes(target))throw new Error(`Unbundled import: ${path} -> ${target}`);
    return `${prefix}${quote}pdf-studio/${target}${quote}`;
  }).replace(/^\/\/# sourceMappingURL=.*$/gm,'');
  resources.push(payload('module-'+path.replaceAll('/','-'),code,`data-pdf-module="pdf-studio/${path}"`));
}
const licensePaths=['vendor/pdf-lib/LICENSE.md','vendor/fontkit/NOTICE.md','vendor/pdfjs/LICENSE'];
for(const folder of ['vendor/fonts','vendor/pdfjs/cmaps','vendor/pdfjs/standard_fonts','vendor/pdfjs/wasm']){
  for(const name of (await readdir(resolve(root,folder))).sort())if(name.includes('LICENSE'))licensePaths.push(`${folder}/${name}`);
}
const licenses=[];
for(const path of licensePaths)licenses.push(`<h3>${escapeHtml(path)}</h3><pre>${escapeHtml(await source(path))}</pre>`);
const licenseUi='<button type="button" id="standalone-licenses" style="font-size:12px">ライセンス</button>';
const licenseDialog=`<dialog id="license-dialog" style="max-width:850px;width:85vw;max-height:85vh;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:9px"><form method="dialog"><button>閉じる</button></form><h2>同梱ライブラリ・フォントのライセンス</h2><p>PDF.js Workerの読み込み先を、このHTMLに埋め込まれたデータへ切り替えています。</p><div style="white-space:normal;overflow-wrap:anywhere">${licenses.join('\n')}</div></dialog>`;
let html=await source('index.html');
html=html.replace('<script src="js/theme.js"></script>',`<script>${inlineScript(await source('js/theme.js'))}</script>`)
  .replace('<link rel="stylesheet" href="style.css">',`<style>${await source('style.css')}</style>`)
  .replace('<link rel="stylesheet" href="theme.css">',`<style>${await source('theme.css')}\n#license-dialog pre{white-space:pre-wrap;font:12px/1.6 monospace}</style>`)
  .replace('<div class="header-actions">','<div class="header-actions">'+licenseUi)
  .replace(/<script src="vendor\/pdf-lib\/pdf-lib.min.js"><\/script><script src="vendor\/fontkit\/package\/dist\/fontkit.umd.min.js"><\/script><script type="module" src="js\/app.js"><\/script>/,'')
  .replace('準備完了</div>','起動しています…</div>')
  .replace('</body>',`${licenseDialog}\n${resources.join('')}<script>document.getElementById('standalone-licenses').onclick=()=>document.getElementById('license-dialog').showModal();\n${inlineScript(await source('scripts/standalone-bootstrap.js'))}</script></body>`);
if(/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html))throw new Error('Standalone HTML still has external scripts or styles.');
const output=resolve(root,'PDF-Studio-standalone.html');await writeFile(output,html);
console.log(`${output}\n${((await stat(output)).size/1024/1024).toFixed(1)} MiB; ${fontCatalog.length*2} fonts; ${modules.length} modules; all resources embedded.`);
