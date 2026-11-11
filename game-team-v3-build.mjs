import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {inflateSync} from 'node:zlib';

const bundle=readFileSync(new URL('./game-team-v3-package.b64',import.meta.url),'utf8').replace(/\s+/g,'');
const files=JSON.parse(inflateSync(Buffer.from(bundle,'base64')).toString('utf8'));
const allowed=new Set(['server.mjs','lib/ai.mjs','lib/team.mjs','lib/scene-audit.mjs','prompts/game-developer.md','public/app.js','tests/team.test.mjs','tests/scene-audit.test.mjs']);
if(Object.keys(files).length!==allowed.size||Object.keys(files).some(name=>!allowed.has(name)||typeof files[name]!=='string'))throw new Error('Invalid Game Forge team bundle');
if(!files['server.mjs'].includes('TEAM_MODE')||!files['lib/team.mjs'].includes('runTeamPipeline')||!files['lib/scene-audit.mjs'].includes('inspectBasketballScene'))throw new Error('Game team validation failed');
for(const [file,content] of Object.entries(files)){
 const dest=join('game-forge-studio',file);
 mkdirSync(dirname(dest),{recursive:true});
 writeFileSync(dest,content);
}
console.log('Game Forge multi-worker QA v3 installed:',allowed.size,'source files');
