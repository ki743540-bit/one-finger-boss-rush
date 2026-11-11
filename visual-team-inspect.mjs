import fs from 'node:fs';
const lines=fs.readFileSync('game-forge-studio/lib/team.mjs','utf8').split('\n');
console.log('[VISUAL_INSPECT_START]');
lines.forEach((line,i)=>{
 if(/export |async function|function |generateGame\(|review|inspect|audit|const .*Prompt|prompt|feedback|repair|grade/i.test(line)){
   const from=Math.max(0,i-1),to=Math.min(lines.length,i+2);
   console.log('[LINE:'+String(i+1)+'] '+lines.slice(from,to).join(' | ').slice(0,450));
 }
});
console.log('[VISUAL_INSPECT_END]');