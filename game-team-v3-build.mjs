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

const clientFile=join('game-forge-studio','public','app.js');
let client=readFileSync(clientFile,'utf8');
const oldHero="document.querySelector('.hero-copy p')";
const newHero="document.querySelector('.hero-sub')";
if(client.includes(oldHero))client=client.replace(oldHero,newHero);
else if(!client.includes(newHero))throw new Error('Team mode hero patch marker missing');
const oldDetail="renderLogs(p);\n const working=";
const newDetail="renderLogs(p);updateQualityReport(p);\n const working=";
if(client.includes(oldDetail))client=client.replace(oldDetail,newDetail);
else if(!client.includes('renderLogs(p);updateQualityReport(p);'))throw new Error('Team QA detail patch marker missing');
if(!client.includes('function updateQualityReport(p)'))client+=`
function updateQualityReport(p){
 const parent=document.querySelector('#detail-step');if(!parent)return;
 let node=document.querySelector('#qa-report');
 if(!node){node=document.createElement('p');node.id='qa-report';node.className='muted';node.style.cssText='font-size:12px;line-height:1.6;margin:6px 0 0';parent.insertAdjacentElement('afterend',node);}
 const q=p.quality;
 node.textContent=q?('AI制作チーム：'+q.passes+'回の制作・修正 / 配置・物理AIレビュー完了 / 実際のプレイ検査は未実施'):(['thinking','checking','repairing'].includes(p.status)?'AI制作チームが作業中':'');
}
`;
writeFileSync(clientFile,client);
const {installVisualUpgrade}=await import('./visual-v5.mjs');
installVisualUpgrade('game-forge-studio');
console.log('Game Forge visual director v5: scene art, UI, physical review instructions installed');
