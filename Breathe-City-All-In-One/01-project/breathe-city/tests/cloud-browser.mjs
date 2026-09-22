/** Full browser -> session -> upload -> quote -> worker -> private media. Provider is injected. */
import { createRequire } from 'node:module';
import { mkdtemp,rm,readFile,writeFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { GenerationStore,hash } from '../server/generation-store.mjs';
import { MediaStore } from '../server/media-store.mjs';
import { GenerationWorker } from '../server/generation-worker.mjs';
import { createGenerationApp } from '../server/generation-app.mjs';
import { createHttpApp } from '../server/http.mjs';
import { JobStore } from '../server/store.mjs';
import { loadConfig } from '../server/config.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=await mkdtemp(join(tmpdir(),'breathe-cloud-browser-')),config={enabled:true,inviteHash:hash('test-invite'),cost:10,dayBudget:100,totalBudget:100,sessionBudget:100,priceVersion:'test-only',currency:'test-units',model:'gen4.5',pollMs:0,resultHosts:['test.example']};
const store=new GenerationStore(dir,config),media=new MediaStore(dir,store),base=loadConfig({PORT:'0'}),legacy=new JobStore(':memory:');let submits=0;
const provider={submit:async()=>{submits++;return 'test-provider-id';},poll:async()=>({state:'succeeded',url:'https://test.example/video.mp4'})};
const worker=new GenerationWorker(store,media,provider,{download:async()=>readFile('docs/qa/demo.mp4')}),api=await createGenerationApp(base,{config,store,media,provider,worker});
const app=createHttpApp({config:base,store:legacy,providers:{},generationApp:api,publicDir:resolve('public')});app.listen(0,'127.0.0.1');await once(app,'listening');const url=`http://127.0.0.1:${app.address().port}`;base.origin=url;api.start();
const browser=await chromium.launch({headless:true});const checks=[],errors=[];
function check(name,value){assert.ok(value,name);checks.push({name,passed:true});}
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('.cloud-box summary').click();await page.locator('#cloud-controls').waitFor({state:'visible'});await page.locator('#invite').fill('test-invite');await page.locator('#connect-cloud').click();await page.waitForFunction(()=>!document.querySelector('#quote').disabled);
 check('session established without exposing invite',await page.locator('#invite').inputValue()==='');
 await page.locator('#cloud-consent').check();await page.locator('#quote').click();await page.waitForFunction(()=>!document.querySelector('#generate').disabled);check('quote shows explicit budget',/10 test-units/.test(await page.locator('#quote-detail').innerText()));
 // A definite pre-submission rejection must allow a fresh quote, without paid calls.
 store.db.prepare('UPDATE quotes SET expires_at=0').run();await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#quote-detail').textContent.includes('未创建任务'));
 check('expired quote clears a definitively rejected submission',submits===0&&await page.locator('#generate').isDisabled());
 await page.locator('#quote').click();await page.waitForFunction(()=>!document.querySelector('#generate').disabled);
 // Lose the first submission response after the server has accepted it.
 let first=true;await page.route('**/api/v1/generations',async route=>{if(route.request().method()==='POST'&&first){first=false;await route.fetch();await route.abort();}else await route.continue();});
 await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#generate').textContent.includes('恢复'));await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#job-list').textContent.includes('生成完成'),{timeout:15000});check('uncertain response retries same task and submits once',submits===1&&store.db.prepare('SELECT COUNT(*) AS n FROM generations').get().n===1);
 await page.getByRole('button',{name:'下载并保存作品'}).click();await page.locator('#result[open]').waitFor();check('verified cloud file reaches gallery',await page.locator('#work-count').innerText()==='1');
 const info=await page.locator('#result-video').evaluate(async v=>{await v.play();return {w:v.videoWidth,h:v.videoHeight,duration:v.duration};});check('returned video actually decodes',info.w>0&&info.duration>1);
 await page.locator('#compare-result').click();check('cloud result can be compared with its original uploaded frame',await page.locator('#result-original').isVisible()&&await page.locator('#result-video').isHidden());await page.locator('#compare-result').click();await page.locator('#accept-result').click();await page.waitForFunction(()=>document.querySelector('#quality-note').textContent.includes('已标记满意'));
 await page.locator('#revise-result').click();await page.waitForFunction(()=>document.querySelector('#source-label').textContent.includes('修改动作'));check('rejected result returns to editable original without another paid submission',submits===1&&await page.locator('#ratio').inputValue()==='portrait');
 await page.reload();await page.locator('.cloud-box summary').click();await page.waitForFunction(()=>document.querySelector('#job-list').textContent.includes('生成完成'));check('session and task recover after reload',true);
 page.once('dialog',d=>d.accept());await page.locator('#delete-cloud-data').click();await page.waitForFunction(()=>document.querySelector('#cloud-status').textContent.includes('会话已结束'));
 check('cloud cleanup revokes session and removes all private media',store.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE revoked=0").get().n===0&&store.db.prepare("SELECT COUNT(*) AS n FROM media WHERE state='ready'").get().n===0);
 check('cloud cleanup keeps downloaded local work',await page.locator('#work-count').innerText()==='1');
 check('no page exceptions',!errors.length);await mkdir('test-results/bc3',{recursive:true});await writeFile('test-results/bc3/cloud-browser-report.json',JSON.stringify({provider:'injected test provider, no paid calls',checks,submits,errors},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,submits,errors}));
}finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));await api.close();legacy.close();await rm(dir,{recursive:true,force:true});}
