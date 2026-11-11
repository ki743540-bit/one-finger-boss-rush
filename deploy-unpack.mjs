import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateSync } from 'node:zlib';

const packed = readFileSync(new URL('./game-forge-package.b64', import.meta.url), 'utf8').trim();
const files = JSON.parse(inflateSync(Buffer.from(packed, 'base64')).toString('utf8'));
let count = 0;
for (const [file, value] of Object.entries(files)) {
  if (file.startsWith('/') || file.split('/').includes('..') || !/^[a-zA-Z0-9._/-]+$/.test(file)) throw new Error('Unsafe package path');
  const target = join('game-forge-studio', file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof value === 'string' ? value : Buffer.from(value.base64, 'base64'));
  count++;
}
const aiSource=readFileSync(new URL('./free-tier-ai.mjs',import.meta.url),'utf8');
if(!aiSource.includes('Hugging Face')||!aiSource.includes('HF_TOKEN'))throw new Error('Free-tier AI module missing');
writeFileSync(join('game-forge-studio','lib','ai.mjs'),aiSource);
const serverPath=join('game-forge-studio','server.mjs');
const serverSource=readFileSync(serverPath,'utf8');
const oldCall='await generateGame(instruction,{previous:previousDraft,feedback})';
const newCall="await generateGame(instruction,{previous:previousDraft,feedback,onProgress:(message)=>log(p,'thinking',message)})";
if(!serverSource.includes(oldCall))throw new Error('Server AI call patch target missing');
writeFileSync(serverPath,serverSource.replace(oldCall,newCall));
const clientPath=join('game-forge-studio','public','app.js');
const clientSource=readFileSync(clientPath,'utf8');
const oldMessage='AI未接続：生成にはサーバー側のAPIキー設定が必要です。';
const newMessage='AI未接続：無料枠のHugging Faceを利用するには、サーバー側でHF_TOKENを設定してください。';
if(!clientSource.includes(oldMessage))throw new Error('Client configuration message missing');
writeFileSync(clientPath,clientSource.replace(oldMessage,newMessage));
console.log('Game Forge assets verified and restored:',count,'with Hugging Face adapter');

await import('./game-qa-v2-build.mjs');

await import('./game-team-v3-build.mjs');
