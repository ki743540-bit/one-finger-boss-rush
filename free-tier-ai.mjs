import { readFile } from 'node:fs/promises';

const promptUrl=new URL('../prompts/game-developer.md',import.meta.url);
export function providerConfig(){
 if(process.env.HF_TOKEN) return {provider:'Hugging Face',model:process.env.HF_MODEL||'Qwen/Qwen3-Coder-480B-A35B-Instruct:cheapest'};
 if(process.env.GEMINI_API_KEY) return {provider:'Gemini',model:process.env.GEMINI_MODEL||'gemini-3.6-flash'};
 if(process.env.OPENAI_API_KEY) return {provider:'OpenAI',model:process.env.OPENAI_MODEL||'gpt-5.5'};
 return null;
}

function extractOpenAI(payload){
 if(typeof payload.output_text==='string')return payload.output_text;
 return (payload.output||[]).flatMap(x=>(x.content||[]).filter(v=>v.type==='output_text').map(v=>v.text||'')).join('\n');
}
function errorResponse(status,body){
 const detail=body?.error?.message||body?.message||`HTTP ${status}`;
 let safe=String(detail).slice(0,250);
 for(const secret of [process.env.HF_TOKEN,process.env.GEMINI_API_KEY,process.env.OPENAI_API_KEY])if(secret&&secret.length>=8)safe=safe.split(secret).join('[非表示]');
 throw new Error(`AIサービスに接続できませんでした (${status}): ${safe}`);
}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function oneRequest(url,headers,body){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),115000);
 try{
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
  const payload=await response.json().catch(()=>({}));
  return {response,payload};
 }catch(err){if(err.name==='AbortError')throw new Error('AIの応答が制限時間を超えました。');throw err;}
 finally{clearTimeout(timeout);}
}

export async function generateGame(prompt,{previous='',feedback='',onProgress=()=>{}}={}){
 const config=providerConfig();if(!config)throw new Error('AIの接続設定がありません。HF_TOKEN、GEMINI_API_KEY または OPENAI_API_KEY をサーバー環境変数に設定してください。');
 const instructions=await readFile(promptUrl,'utf8');
 const input=previous?`以下の既存ゲームを改善してください。変更指示:\n${prompt}\n${feedback?`直すべきエラー: ${feedback}\n`:''}\n既存HTML:\n${previous}`:`以下の指示で新しいゲームを制作してください。\n${prompt}${feedback?`\n前回の生成エラーを解消してください: ${feedback}`:''}`;
 let url,headers,body;
  if(config.provider==='Hugging Face'){
   url='https://router.huggingface.co/v1/chat/completions';
   headers={'content-type':'application/json','authorization':`Bearer ${process.env.HF_TOKEN}`};
   body={model:config.model,messages:[{role:'system',content:instructions},{role:'user',content:input}],stream:false,temperature:0.65,max_tokens:10000};
  } else if(config.provider==='Gemini'){
   url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
   headers={'content-type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY};
   body={systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:input}]}],generationConfig:{maxOutputTokens:12000,thinkingConfig:{thinkingLevel:'LOW'}}};
  } else {
   url='https://api.openai.com/v1/responses';
   headers={'content-type':'application/json','authorization':`Bearer ${process.env.OPENAI_API_KEY}`};
   body={model:config.model,instructions,input,max_output_tokens:18000,store:false};
  }
  const models=config.provider==='Gemini'
   ?[config.model,config.model,...(config.model==='gemini-3.5-flash'?[]:['gemini-3.5-flash'])]
   :[config.model];
  let payload;
  for(let i=0;i<models.length;i++){
   if(i>0){
    const switching=models[i]!==models[i-1];
    onProgress(switching?'Geminiが混雑しているため、別の無料モデルへ切り替えています。':'Geminiが混雑しているため、少し待って自動再試行しています。');
    await pause(Math.min(5000,750*2**(i-1)));
   }
   const attemptUrl=config.provider==='Gemini'?`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[i])}:generateContent`:url;
   const result=await oneRequest(attemptUrl,headers,body);
   payload=result.payload;
   if(result.response.ok)break;
   if(config.provider==='Gemini'&&result.response.status===503){
    if(i<models.length-1)continue;
    throw new Error('Geminiのサーバーが混雑しています（503）。無料モデルでも自動再試行しましたが応答できませんでした。少し時間をおいて再度お試しください。');
   }
   errorResponse(result.response.status,payload);
  }
  const output=config.provider==='Gemini'?(payload.candidates||[]).flatMap(c=>(c.content?.parts||[]).map(p=>p.text||'')).join('\n'):config.provider==='Hugging Face'?(payload.choices||[]).map(c=>c.message?.content||'').join('\n'):extractOpenAI(payload);
  if(!output.trim())throw new Error('AIからゲームのソースコードが返ってきませんでした。');
  return output;
}
