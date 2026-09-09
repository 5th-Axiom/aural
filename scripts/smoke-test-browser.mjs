// Local browser check against the deployed test gateway; never logs credentials.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.env.test.local','utf8')).split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const browser=await chromium.launch({channel:"chrome",headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try {
 const context=await browser.newContext({ignoreHTTPSErrors:true,permissions:['microphone']});
 const page=await context.newPage();
 const origin=env.NEXT_PUBLIC_APP_URL;
 for(const path of ['/dashboard','/supabase/rest/v1/profiles','/ws/voice']) {
  const r=await context.request.get(origin+path,{maxRedirects:0});
  assert.equal(r.status(),302,`unauthenticated ${path}`);
 }
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.getByLabel('访问密码').fill(env.TEST_ACCESS_PASSWORD);
 await Promise.all([page.waitForURL('**/login'),page.getByRole('button',{name:'进入项目'}).click()]);
 await page.locator('#phone').fill(process.env.AURAL_SMOKE_PHONE || '13800138000');
 await page.locator('#code').fill('123456');
 await Promise.all([page.waitForURL('**/dashboard'),page.getByRole('button',{name:'登录 / 注册',exact:true}).click()]);
 await page.waitForLoadState('networkidle');
 assert.equal(await page.evaluate(()=>isSecureContext),true);
 const mic=await page.evaluate(async()=>{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());return true;});
 assert.equal(mic,true);
 const response=await context.request.get(origin+'/supabase/rest/v1/profiles?select=id&limit=1',{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`}});
 assert.equal(response.status(),200);
 await page.evaluate(() => new Promise((resolve, reject) => {
   const ws = new WebSocket(`wss://${location.host}/ws/voice`);
   const timer = setTimeout(() => { ws.close(); reject(new Error('WSS ready timeout')); }, 20000);
   ws.onopen = () => ws.send(JSON.stringify({type:'mic_test'}));
   ws.onerror = () => { clearTimeout(timer); reject(new Error('WSS failed')); };
   ws.onmessage = event => {
     const msg = JSON.parse(event.data);
     if (msg.type === 'ready') { clearTimeout(timer); ws.close(); resolve(true); }
     if (msg.type === 'error') { clearTimeout(timer); ws.close(); reject(new Error(msg.message)); }
   };
 }));
 if (process.env.AURAL_CHECK_SIGNED_URL === '1') {
   const signed=(await readFile('/tmp/aural-signed-url.txt','utf8')).trim();
   const r=await context.request.get(signed);
   assert.equal(r.status(),200);
   assert.equal(await r.text(),'aural signed link check');
   console.log('Browser signed storage download: passed');
 }
 await page.screenshot({path:'/tmp/aural-test-dashboard.png',fullPage:true});
 console.log('IP HTTPS, password gate, shared login, dashboard, microphone secure context, Supabase proxy: passed');
 console.log('Dashboard text:',(await page.locator('body').innerText()).slice(0,1200));
 if (process.env.AURAL_CREATE_DEMO === '1') {
   const call = async (method, input) => {
     const r = await context.request.post(origin+'/api/trpc/'+method, {data:{json:input}});
     const body = await r.json();
     assert.ok(r.ok() && body.result, `${method}: ${JSON.stringify(body)}`);
     return body.result.data.json;
   };
   const interview = await call('interview.create', {title:'部署验证 · 中文语音面试',description:'测试环境体验用，5 分钟，包含两道问题。',voiceEnabled:true,language:'zh',timeLimitMinutes:5,followUpDepth:'LIGHT',antiCheatingEnabled:false});
   for (const [order,text] of ['请简要介绍你自己，以及最近参与的一个项目。','在这个项目中，你解决过什么技术难题？'].entries()) await call('question.create',{interviewId:interview.id,order,text,type:'OPEN_ENDED'});
   await call('interview.update',{id:interview.id,requireInvite:false});
   const published=await call('interview.publish',{id:interview.id});
   await page.goto(origin+'/i/'+published.slug,{waitUntil:'networkidle'});
   console.log('Candidate page:',(await page.locator('body').innerText()).slice(0,1600));
   await writeFile('/tmp/aural-demo.json',JSON.stringify({id:interview.id,url:origin+'/i/'+published.slug}));
   await page.screenshot({path:'/tmp/aural-test-candidate.png',fullPage:true});
 }
} finally {await browser.close();}
