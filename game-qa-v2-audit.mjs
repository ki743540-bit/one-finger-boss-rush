/** Conservative static quality gate; cannot prove a game is playable. */
export function auditGameQuality(html){
 if(typeof html!=='string'||!html.trim())return ['ゲームのHTMLがありません。'];
 const errors=[];
 const js=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).join('\n');
 const hasCanvas=/<canvas\b/i.test(html);
 if(!/<meta\b[^>]*name\s*=\s*['"]?viewport\b/i.test(html))errors.push('スマホ画面の調整用viewport設定がありません。');
 if(!/<button\b|<input\b|<canvas\b/i.test(html))errors.push('プレイヤーが操作できるボタンまたはゲーム画面がありません。');
 if(!/(?:addEventListener\s*\(\s*['"](?:click|pointerdown|pointerup|touchstart|touchend|mousedown|mouseup|keydown|keyup)|\.on(?:click|pointerdown|touchstart|keydown)\s*=|on(?:click|pointerdown|touchstart|keydown)\s*=)/i.test(html))errors.push('ゲームの入力イベントが実装されていません。');
 if(/\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie\b/.test(js))errors.push('プレビュー内のlocalStorage等の保存APIは利用できません。保存機能なしで動作させてください。');
 if(hasCanvas){
  if(!/\.getContext\s*\(/.test(js))errors.push('Canvasを描画するためのgetContextが見つかりません。');
  if(!/\b(?:fillRect|strokeRect|fillText|strokeText|drawImage|arc|ellipse|lineTo|rect|roundRect|putImageData|fill\s*\(|stroke\s*\()\s*\(/.test(js))errors.push('Canvasへ描画する処理が見つかりません。');
 }
 return errors;
}
