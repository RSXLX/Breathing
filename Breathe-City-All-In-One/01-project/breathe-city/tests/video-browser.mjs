/** Video semantics and camera lifecycle with generated moving fixture and fake camera. */
import { createRequire } from 'node:module';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import ffmpeg from 'ffmpeg-static';
import { loadConfig } from '../server/config.mjs';
import { JobStore } from '../server/store.mjs';
import { createHttpApp } from '../server/http.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=await mkdtemp(join(tmpdir(),'breathe-video-')),out=resolve('test-results/bc3'),fixture=join(directory,'moving-fixture.mp4');await mkdir(out,{recursive:true});
await promisify(execFile)(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','12','-c:v','libx264','-pix_fmt','yuv420p',fixture]);
const store=new JobStore(directory),config=loadConfig({PORT:'0'}),app=createHttpApp({config,store,providers:{},publicDir:resolve('public')});app.listen(0,'127.0.0.1');await once(app,'listening');const url=`http://127.0.0.1:${app.address().port}`;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}),checks=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push({name,passed:true});};
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['camera']}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.cameraTracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async opts=>{const stream=await original(opts);window.cameraTracks.push(...stream.getTracks());return stream;};});
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#draft-state').textContent.includes('已保存'));await page.locator('#file').setInputFiles(fixture);await page.waitForFunction(()=>document.querySelector('#source-label').textContent==='moving-fixture.mp4');
 await page.locator('#ratio').selectOption('landscape');await page.locator('#seek').fill('1');await page.locator('#seek').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#seek-time').textContent==='1.0 秒');
 check('video defaults to explicit single-frame mode',(await page.locator('#video-note').innerText()).includes('不保留原视频运动'));
 // Compare original pixels so this cannot pass merely from local deformation.
 await page.locator('#compare').click();const stillA=await page.locator('#stage').evaluate(c=>c.toDataURL());await page.waitForTimeout(500);const stillB=await page.locator('#stage').evaluate(c=>c.toDataURL());check('single-frame preview freezes original video',stillA===stillB);
 await page.locator('#input-mode').selectOption('video-edit');await page.locator('#export').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('先确认固定机位'));check('video editing requires fixed-camera confirmation',!await page.locator('body').evaluate(e=>e.classList.contains('recording')));
 await page.locator('#tripod').check();const movingA=await page.locator('#stage').evaluate(c=>c.toDataURL());await page.waitForTimeout(550);const movingB=await page.locator('#stage').evaluate(c=>c.toDataURL());check('video-edit preview preserves source motion',movingA!==movingB);
 await page.locator('#compare').click();await page.locator('#duration').selectOption('10');await page.locator('#export').click();await page.locator('#result[open]').waitFor({timeout:25000});
 const video=await page.locator('#result-video').evaluate(async v=>{if(v.readyState<2)await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});const sample=async t=>{const done=new Promise(r=>v.addEventListener('seeked',r,{once:true}));v.currentTime=t;await done;const c=document.createElement('canvas');c.width=128;c.height=72;c.getContext('2d').drawImage(v,0,0,128,72);return c.toDataURL();};const first=await sample(.5),later=await sample(2.5);return {w:v.videoWidth,h:v.videoHeight,duration:v.duration,moving:first!==later};});
 check('ten-second video edit exports playable moving video',video.w===1280&&video.h===720&&Math.abs(video.duration-10)<.5&&video.moving);
 const download=page.waitForEvent('download');await page.locator('#download-result').click();await(await download).saveAs(join(out,'video-edit-export'+((await page.locator('#result-meta').innerText()).includes('mp4')?'.mp4':'.webm')));await page.locator('.dialog-close').click();
 // Background interruption is deterministic here; actual OS suspension remains a device check.
 await page.locator('#export').click();await page.locator('#cancel-export').waitFor({state:'visible'});await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>!document.body.classList.contains('recording'));check('background-interrupted export is not saved',await page.locator('#work-count').innerText()==='1');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 for(let i=0;i<3;i++){await page.locator('#camera').click();await page.locator('#shutter').waitFor({state:'visible'});await page.locator('#shutter').click();await page.waitForFunction(()=>document.querySelector('#source-label').textContent==='相机照片');}
 check('camera capture produces editable photo',await page.locator('#mode-badge').innerText()==='本地原物体动画');check('capture releases every acquired camera track',await page.evaluate(()=>window.cameraTracks.length===3&&window.cameraTracks.every(t=>t.readyState==='ended')));
 await page.locator('#camera').click();await page.locator('#shutter').waitFor({state:'visible'});await page.locator('#nav-library').click();await page.locator('#library').waitFor({state:'visible'});check('leaving camera for library releases track',await page.evaluate(()=>window.cameraTracks.every(t=>t.readyState==='ended')));
 const hiddenCamera=await page.evaluate(async()=>{const {StudioInput}=await import('/js/studio-media.js');const input=new StudioInput();Object.defineProperty(document,'hidden',{configurable:true,value:true});try{return {opened:await input.camera(),ended:window.cameraTracks.every(t=>t.readyState==='ended')};}finally{delete document.hidden;input.clear();}});
 check('camera completing while page is hidden releases its new stream',hiddenCamera.opened===false&&hiddenCamera.ended);
 check('no browser exceptions',errors.length===0);await writeFile(join(out,'video-browser-report.json'),JSON.stringify({mode:'Chromium synthetic moving video and fake camera; no real device',checks,video,errors},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,video,errors}));
}finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));store.close();await rm(directory,{recursive:true,force:true});}
