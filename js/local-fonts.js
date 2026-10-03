import {registerLocalFont} from './fonts.js';

export function setupLocalFonts({onAdded,isBusy=()=>false}){
  const dialog=document.createElement('dialog');dialog.id='local-font-dialog';
  dialog.setAttribute('aria-labelledby','local-font-title');
  dialog.innerHTML=`<div class="local-font-heading"><h2 id="local-font-title">Windowsのフォントを追加</h2><button type="button" id="local-font-close" aria-label="閉じる">閉じる</button></div>
    <p>このPCにインストールされたフォントを、テキストの追加・既存文字の編集に使えます。</p>
    <ol><li>「アクセスを許可して一覧を取得」を押します。</li><li>ブラウザの確認画面で、ローカルフォントへのアクセスを許可します。</li><li>一覧からフォントを選び、「編集用に追加」を押します。</li></ol>
    <p>許可するとフォント名の一覧を読み取ります。フォント本体は選んだものだけ読み込み、このブラウザ内で処理します。外部へ送信しません。使用した文字のフォントは保存するPDFに埋め込まれます。</p>
    <p>追加したフォントはこの画面を閉じても使えます。アプリを再読み込みすると追加一覧は消えます。アクセス許可を取り消すには、ブラウザのサイト設定で「ローカルフォント」をブロックしてください。</p>
    <p class="local-font-help">Chrome / Edgeのデスクトップ版で使用してください。HTMLを直接開いて許可できない場合は、ローカルサーバーを起動して http://127.0.0.1:8080 を開いてください。</p>
    <button type="button" id="local-font-request" class="primary">アクセスを許可して一覧を取得</button>
    <p id="local-font-state" role="status" aria-live="polite"></p>
    <div id="local-font-picker" hidden><label for="local-font-search">フォント名で検索</label><input id="local-font-search" type="search" placeholder="例：游ゴシック、Meiryo、Arial">
    <label for="local-font-list">使用するフォント</label><select id="local-font-list" size="8"></select>
    <p>太字・斜体は一覧からその書体を選択してください。使用できない形式やPDFへの埋め込みが制限されたフォントは追加できません。フォントの利用条件に従って使用してください。</p>
    <button type="button" id="local-font-add">編集用に追加</button></div>`;
  document.body.append(dialog);
  const find=id=>dialog.querySelector('#'+id),state=find('local-font-state'),request=find('local-font-request'),add=find('local-font-add'),list=find('local-font-list');
  let fonts=[],loading=false;
  const report=(message,error=false)=>{state.textContent=message;state.classList.toggle('error',error);};
  function filter(){
    const query=find('local-font-search').value.toLocaleLowerCase();list.replaceChildren();
    fonts.forEach((font,index)=>{
      const label=`${font.fullName||font.family} · ${font.style} (${font.postscriptName})`;
      if(!label.toLocaleLowerCase().includes(query))return;
      const option=document.createElement('option');option.value=String(index);option.textContent=label;list.append(option);
    });
    list.selectedIndex=list.options.length?0:-1;add.disabled=loading||!list.options.length;
  }
  function open(){
    if(isBusy())return;
    request.disabled=!globalThis.isSecureContext||typeof globalThis.queryLocalFonts!=='function';
    if(request.disabled)report('この環境ではローカルフォントAPIを使用できません。Chrome / Edgeでローカルサーバーの画面を開いてください。',true);
    dialog.showModal();
  }
  for(const id of ['local-font-open','existing-local-font-open'])document.getElementById(id).onclick=open;
  find('local-font-close').onclick=()=>dialog.close();
  find('local-font-search').oninput=filter;
  request.onclick=async()=>{
    if(loading||isBusy())return;
    loading=true;request.disabled=true;add.disabled=true;report('ブラウザの確認画面でアクセスを許可してください。');
    try{
      // Invoke directly in the trusted click, before any asynchronous work.
      const result=await globalThis.queryLocalFonts();
      fonts=[...new Map(result.map(font=>[font.postscriptName,font])).values()].sort((a,b)=>a.fullName.localeCompare(b.fullName,'ja'));
      find('local-font-picker').hidden=false;filter();report(fonts.length?`${fonts.length} 書体が見つかりました。使用するフォントを選択してください。`:'利用できるフォントが見つかりませんでした。ブラウザのサイト設定と実行環境を確認してください。');
    }catch(error){
      report(error.name==='NotAllowedError'?'アクセスが許可されませんでした。再試行する場合は、ブラウザのサイト設定でローカルフォントの許可を確認してください。':error.name==='SecurityError'?'ブラウザがアクセスを制限しています。Chrome / Edgeで http://127.0.0.1:8080 を直接開き、サイト設定を確認してください。':`フォント一覧を取得できませんでした: ${error.message}`,true);
    }finally{loading=false;request.disabled=false;filter();}
  };
  add.onclick=async()=>{
    if(loading||isBusy()||list.selectedIndex<0)return;
    const font=fonts[Number(list.value)];loading=true;add.disabled=true;request.disabled=true;report('選択したフォントを読み込み、PDF保存に使用できるか確認しています…');
    try{const definition=await registerLocalFont(font);onAdded(definition);report(`${font.fullName} を追加しました。編集パネルのフォント一覧から選択できます。`);}
    catch(error){report(`追加できませんでした: ${error.message}`,true);}
    finally{loading=false;request.disabled=false;filter();}
  };
}
