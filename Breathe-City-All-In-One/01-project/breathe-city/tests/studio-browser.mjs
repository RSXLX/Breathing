/** Real HTTP browser integration. PLAYWRIGHT_MODULE may point to an installed package. */
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.mjs';
import { JobStore } from '../server/store.mjs';
import { createHttpApp } from '../server/http.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=await mkdtemp(join(tmpdir(),'breathe-browser-')),out=resolve('test-results/bc3');await mkdir(out,{recursive:true});
const store=new JobStore(directory),config=loadConfig({PORT:'0'}),app=createHttpApp({config,store,providers:{},publicDir:resolve('public')});app.listen(0,'127.0.0.1');await once(app,'listening');const url=`http://127.0.0.1:${app.address().port}`;
const browser=await chromium.launch({headless:true}),checks=[],errors=[];
const check=(name,value)=>{assert.ok(value,name);checks.push({name,passed:true});};
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#draft-state').textContent.includes('已保存'));
  check('app serves over HTTP and original sample is labelled', (await page.locator('#source-label').innerText()).includes('原创插画'));
  const pixelProof=await page.evaluate(async()=>{
    const {MotionRenderer}=await import('/js/motion-renderer.js');const src=document.createElement('canvas');src.width=320;src.height=240;const c=src.getContext('2d');c.fillStyle='#345';c.fillRect(0,0,320,240);for(let x=0;x<320;x+=12){c.fillStyle=x%24?'#cf9':'#e98';c.fillRect(x,0,5,240);}const out=document.createElement('canvas'),r=new MotionRenderer(out);r.resize('landscape');const s={focus:{x:.5,y:.5},polygon:[[.2,.2],[.8,.2],[.8,.8],[.2,.8]],parameters:{motion:'sway',intensity:1,cycle:4}};
    r.renderAt(0,src,s,{compare:true});const original=r.ctx.getImageData(0,0,out.width,out.height).data;r.renderAt(1,src,s);const moved=r.ctx.getImageData(0,0,out.width,out.height).data;let changed=0,outside=0;
    for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const i=(y*out.width+x)*4;if(original[i]!==moved[i]||original[i+1]!==moved[i+1]||original[i+2]!==moved[i+2]){changed++;if(x<out.width*.19||x>out.width*.81||y<out.height*.19||y>out.height*.81)outside++;}}
    r.renderAt(1,src,s);const repeated=r.ctx.getImageData(0,0,out.width,out.height).data;return {changed,outside,deterministic:repeated.every((v,i)=>v===moved[i])};
  });
  check('original object pixels move and exterior pixels stay fixed',pixelProof.changed>1000&&pixelProof.outside===0);check('renderAt is pixel deterministic',pixelProof.deterministic);
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='#b2c1c8';ctx.fillRect(0,0,640,480);ctx.fillStyle='#475f54';ctx.fillRect(120,80,350,400);for(let y=110;y<450;y+=40)for(let x=150;x<450;x+=40){ctx.fillStyle='#f4c98e';ctx.fillRect(x,y,18,24);}return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#file').setInputFiles({name:'building-fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>document.querySelector('#source-label').textContent==='building-fixture.png');
  check('personal image input replaces demo provenance',!(await page.locator('#preview-note').innerText()).includes('示例'));
  await page.locator('#file').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not-an-image')});await page.locator('#toast').waitFor({state:'visible'});await page.waitForTimeout(200);
  check('failed replacement preserves usable source',await page.locator('#source-label').innerText()==='building-fixture.png'&&!(await page.locator('#export').isDisabled()));

  await page.locator('#ratio').selectOption('landscape');await page.locator('#poly-tool').click();const rect=await page.locator('#selection').boundingBox();for(const [x,y]of [[.2,.2],[.8,.2],[.8,.8],[.2,.8]])await page.mouse.click(rect.x+rect.width*x,rect.y+rect.height*y);await page.locator('#finish-poly').click();
  await page.locator('[data-motion=sway]').click();await page.locator('#intensity').fill('0.75');await page.locator('#save-draft').click();
  await page.locator('#export').click();await page.locator('#result[open]').waitFor({timeout:20000});
  const meta=await page.locator('#result-meta').innerText();check('real video exported',/video\/(mp4|webm)/.test(meta));
  const video=await page.locator('#result-video').evaluate(async v=>{if(v.readyState<1)await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=j;});await v.play();await new Promise(r=>setTimeout(r,300));v.pause();return {duration:v.duration,w:v.videoWidth,h:v.videoHeight,currentTime:v.currentTime};});
  check('exported video decodes with correct dimensions',video.w===1280&&video.h===720&&video.currentTime>0);check('export duration is six seconds',Math.abs(video.duration-6)<.5);
  const download=page.waitForEvent('download');await page.locator('#download-result').click();await(await download).saveAs(join(out,'local-motion-export'+(meta.includes('mp4')?'.mp4':'.webm')));
  await page.locator('.dialog-close').click();await page.goto(url+'/#/library');await page.waitForTimeout(1200);await page.locator('#nav-library').click();await page.waitForFunction(()=>document.querySelectorAll('#work-list .card').length===1);check('durable gallery survives reload',await page.locator('#work-list .card').count()===1);
  const savedDraft=page.locator('#draft-list .card').filter({hasText:'building-fixture.png'});await savedDraft.getByRole('button',{name:'继续编辑'}).click();await page.waitForFunction(()=>document.querySelector('#source-label').textContent==='building-fixture.png');check('draft restores motion and crop settings',await page.locator('#ratio').inputValue()==='landscape'&&await page.locator('#intensity').inputValue()==='0.75');
  await page.locator('#export').click();await page.locator('#cancel-export').waitFor({state:'visible'});await page.locator('#cancel-export').click();await page.waitForFunction(()=>!document.body.classList.contains('recording'));check('cancelled export does not create a second work',await page.locator('#work-count').innerText()==='1');
  await page.screenshot({path:join(out,'studio-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(out,'studio-mobile-layout.png'),fullPage:true});check('mobile layout has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('no uncaught browser errors',errors.length===0);
  await writeFile(join(out,'browser-report.json'),JSON.stringify({mode:'actual HTTP Chromium, synthetic input, no phone or provider calls',checks,pixelProof,video,errors},null,2));
  console.log(JSON.stringify({checks:checks.length,passed:true,pixelProof,video,errors},null,2));
}finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));store.close();await rm(directory,{recursive:true,force:true});}
