function createFrame(html){
 const frame=document.createElement('iframe');
 frame.title='生成されたゲームのプレビュー';
 frame.setAttribute('sandbox','allow-scripts allow-pointer-lock');
 frame.setAttribute('allow','fullscreen');
 frame.setAttribute('referrerpolicy','no-referrer');
 const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
 const probe=`<script>(function(){
  const send=(kind,message)=>{try{parent.postMessage({kind,message:String(message||'').slice(0,240)},'*');}catch(_){}};
  window.addEventListener('error',e=>send('preview-runtime-error',e.message||'JavaScript実行エラー'));
  window.addEventListener('unhandledrejection',e=>send('preview-runtime-error',e.reason?.message||e.reason||'非同期の実行エラー'));
  window.addEventListener('securitypolicyviolation',e=>send('preview-runtime-error','安全制限によって機能がブロックされました。'));
  function visibleCanvas(){
   return Array.from(document.querySelectorAll('canvas')).some(canvas=>{
    const rect=canvas.getBoundingClientRect(),style=getComputedStyle(canvas);
    if(rect.width<35||rect.height<35||rect.bottom<=0||rect.right<=0||rect.left>=innerWidth||rect.top>=innerHeight||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
    for(const xRatio of [0.22,0.5,0.78])for(const yRatio of [0.22,0.5,0.78]){
     const x=Math.max(2,Math.min(innerWidth-2,rect.left+rect.width*xRatio));
     const y=Math.max(2,Math.min(innerHeight-2,rect.top+rect.height*yRatio));
     const hit=document.elementFromPoint(x,y);
     if(hit===canvas||canvas.contains(hit))return true;
    }
    return false;
   });
  }
  document.addEventListener('click',e=>{
   const button=e.target.closest?.('button,[role="button"],input[type="button"],input[type="submit"]');
   if(!button||!/(開始|スタート|はじめる|プレイ|遊ぶ|start|play)/i.test(button.textContent||button.value||''))return;
   setTimeout(()=>{
    if(document.querySelector('canvas')&&!visibleCanvas())send('preview-play-warning','開始後もゲーム画面が隠れているか、表示領域の外にあります。');
   },750);
  },true);
 })();<\/script>`;
 frame.srcdoc=html.replace(/<head\b[^>]*>/i,match=>match+csp+probe);
 return frame;
}
function reportPreviewIssue(message){
 const wrap=$('#preview-wrap');
 let note=$('#preview-runtime-warning');
 if(!note){note=document.createElement('p');note.id='preview-runtime-warning';note.className='preview-runtime-warning';note.setAttribute('role','alert');wrap.insertAdjacentElement('afterend',note);}
 note.textContent='動作に問題が見つかりました：'+message+' 「ゲームを改善する」で修正できます。';
 const input=$('#refine-prompt');
 if(input&&!input.value.trim())input.value='開始ボタンを押しても遊べない問題を最優先で修正。開始→ゲーム画面表示→入力→得点/時間変化→結果→再挑戦をすべて正常に動作させ、Canvasが説明や透明オーバーレイに隠れないよう根本から修正して。'+message;
}
window.addEventListener('message',event=>{
 const frame=$('#preview-wrap iframe');
 if(!frame||event.source!==frame.contentWindow)return;
 if(event.data?.kind==='preview-runtime-error'||event.data?.kind==='preview-play-warning')reportPreviewIssue(String(event.data.message||'原因不明のエラー').slice(0,220));
});

