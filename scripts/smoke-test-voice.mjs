// Run explicitly inside the voice container. Uses configured paid AI APIs.
import { synthesizeFull } from '../server/volcengine-tts.ts';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
const e = process.env;
const response = await fetch(`${e.RELAY_LLM_BASE_URL}/chat/completions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${e.RELAY_LLM_API_KEY}` },
  body: JSON.stringify({ model: e.RELAY_LLM_MODEL, messages: [{role:'user',content:'请只回复：测试成功'}], max_tokens: 32 }), signal: AbortSignal.timeout(45000)
});
assert.equal(response.status, 200, 'LLM HTTP status');
const result=await response.json();assert.ok(result.choices?.[0]?.message?.content);
console.log('DeepSeek: text response received');
const audio=await synthesizeFull('你好，这是语音面试测试。', {appId:'',accessToken:'',resourceId:e.DOUBAO_TTS_RESOURCE_ID,provider:'tokendance',apiKey:e.TOKENDANCE_API_KEY}, {speaker:e.DOUBAO_VOICE_ZH,format:'pcm',sampleRate:16000}, AbortSignal.timeout(45000));
assert.ok(audio.length>3200, 'TTS audio is nonempty');
console.log('TokenDance TTS:',audio.length,'PCM bytes');
await new Promise((resolve,reject)=>{
 const ws=new WebSocket('ws://127.0.0.1:8766');
 const timer=setTimeout(()=>{ws.close();reject(new Error('ASR transcript timeout'));},45000);
 const finish=(err)=>{clearTimeout(timer);ws.close();err?reject(err):resolve();};
 ws.on('error',finish);
 ws.on('open',()=>ws.send(JSON.stringify({type:'mic_test'})));
 ws.on('message',async raw=>{
  const msg=JSON.parse(raw.toString());
  if(msg.type==='error') return finish(new Error(msg.message));
  if(msg.type==='ready'){
   const pcm=Buffer.concat([audio,Buffer.alloc(16000*2*2)]);
   for(let i=0;i<pcm.length&&ws.readyState===WebSocket.OPEN;i+=3200){
    ws.send(JSON.stringify({type:'audio',data:pcm.subarray(i,i+3200).toString('hex')}));
    await new Promise(r=>setTimeout(r,100));
   }
  }
  if(msg.type==='asr_ended' && msg.text){
   console.log('DashScope ASR via relay:',msg.text);
   finish();
  }
 });
});
