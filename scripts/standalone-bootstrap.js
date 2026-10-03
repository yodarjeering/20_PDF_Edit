// Included by build-standalone.mjs after the inert embedded resources.
(async()=>{
  const urls=[];
  const bytes=element=>Uint8Array.from(atob(element.textContent.trim()),char=>char.charCodeAt(0));
  const text=element=>new TextDecoder().decode(bytes(element));
  const blob=(data,type)=>{const url=URL.createObjectURL(new Blob([data],{type}));urls.push(url);return url;};
  const asset=id=>{const element=document.getElementById(id);if(!element)throw new Error('埋め込みデータが見つかりません: '+id);return element;};
  try{
    const imports={},resources={},assetsBase='https://pdf-studio.invalid/embedded/';
    for(const element of document.querySelectorAll('script[data-pdf-resource]')){
      resources[element.dataset.pdfResource]={base64:element.textContent.trim(),mime:element.dataset.mime||'application/octet-stream'};
    }
    const nativeFetch=globalThis.fetch.bind(globalThis);
    globalThis.fetch=(input,options)=>{
      const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
      if(url.startsWith(assetsBase)){
        const resource=resources[url.slice(assetsBase.length)];
        if(!resource)return Promise.reject(new Error('Missing embedded PDF asset: '+url));
        return Promise.resolve(new Response(Uint8Array.from(atob(resource.base64),char=>char.charCodeAt(0)),{headers:{'Content-Type':resource.mime}}));
      }
      return nativeFetch(input,options);
    };
    // Only this reserved prefix is routed to embedded bytes. A missing asset
    // fails locally, instead of making a request to the network or filesystem.
    const workerPrefix=`const __pdfStudioResources=${JSON.stringify(resources)};
const __pdfStudioAssetBytes=url=>{
  const key=url.slice(${assetsBase.length});
  if(!__pdfStudioResources[key])throw new Error('Missing embedded PDF asset: '+key);
  return Uint8Array.from(atob(__pdfStudioResources[key].base64),char=>char.charCodeAt(0));
};
const __pdfStudioFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,options)=>{
  if(typeof input==='string'&&input.startsWith(${JSON.stringify(assetsBase)})){
    return Promise.resolve(new Response(__pdfStudioAssetBytes(input),{headers:{'Content-Type':__pdfStudioResources[input.slice(${assetsBase.length})].mime}}));
  }
  return __pdfStudioFetch(input,options);
};
function __pdfStudioLoadOpenJPEG(url){
  if(!globalThis.__pdfStudioOpenJPEG){
    const scriptURL=URL.createObjectURL(new Blob([__pdfStudioAssetBytes(url)],{type:'text/javascript'}));
    try{importScripts(scriptURL);}finally{URL.revokeObjectURL(scriptURL);}
  }
  return {default:globalThis.__pdfStudioOpenJPEG};
}
`;
    const workerSrc=blob(workerPrefix+text(asset('pdf-worker-source')),'text/javascript');
    // Classic Blob workers work on file://, where module workers may be blocked.
    const workerPort=new Worker(workerSrc);
    globalThis.__PDF_STUDIO_STANDALONE__={assetsBase,workerSrc,workerPort,getFontBase64:name=>asset('font-'+name).textContent.trim()};
    for(const element of document.querySelectorAll('script[data-pdf-module]'))imports[element.dataset.pdfModule]=blob(bytes(element),'text/javascript');
    const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);
    for(const id of ['pdf-lib-source','fontkit-source']){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=blob(bytes(asset(id)),'text/javascript');script.onload=resolve;
        script.onerror=()=>reject(new Error('ライブラリの初期化に失敗しました: '+id));document.head.append(script);
      });
    }
    await import('pdf-studio/js/app.js');
    document.getElementById('status').textContent='準備完了 · 単一HTML／オフライン版';
    globalThis.__PDF_STUDIO_READY__=true;
  }catch(error){
    console.error(error);const status=document.getElementById('status');status.textContent='起動できません: '+error.message;status.classList.add('error');
  }
  // Keep URLs valid for deferred imports, PDF workers and decoder fallback.
  window.addEventListener('pagehide',event=>{if(!event.persisted){globalThis.__PDF_STUDIO_STANDALONE__?.workerPort.terminate();for(const url of urls)URL.revokeObjectURL(url);}});
})();
