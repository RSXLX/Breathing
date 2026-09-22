/** App navigation and editor integration; browser emulation is not native-device proof. */
import { createRequire } from 'node:module';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.mjs';
import { JobStore } from '../server/store.mjs';
import { createHttpApp } from '../server/http.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=await mkdtemp(join(tmpdir(),'breathe-app-')),out=resolve('test-results/bc3');await mkdir(out,{recursive:true});
const store=new JobStore(directory),config=loadConfig({PORT:'0'}),app=createHttpApp({config,store,providers:{},publicDir:resolve('public')});app.listen(0,'127.0.0.1');await once(app,'listening');const url=`http://127.0.0.1:${app.address().port}`;
const browser=await chromium.launch({headless:true}),checks=[],errors=[],external=[];const check=(name,value)=>{assert.ok(value,name);checks.push({name,passed:true});};
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().startsWith('http')&&!r.url().startsWith(url))external.push(r.url());});await page.goto(url+'/app.html');await page.waitForFunction(()=>document.body.dataset.appPage==='discover'&&document.querySelector('#draft-state').textContent.includes('已保存'));
 check('Ionic component navigation is registered and styled',await page.evaluate(()=>!!customElements.get('ion-tab-button')&&document.querySelector('ion-tab-button').classList.contains('ios')));check('home shows product and usable imports',await page.locator('#app-import').isVisible());await page.screenshot({path:join(out,'app-home-mobile.png')});
 await page.locator('.app-tabbar').getByRole('tab',{name:'创作',exact:true}).click();await page.locator('#creator').waitFor({state:'visible'});check('editor uses one tool panel at a time',await page.locator('#intensity').isVisible()&&!await page.locator('#ratio').isVisible());
 await page.locator('ion-segment-button[value=selection]').click();await page.locator('#ratio').selectOption('landscape');await page.locator('#poly-tool').click();const rect=await page.locator('#selection').boundingBox();for(const [x,y]of [[.2,.2],[.8,.2],[.8,.8],[.2,.8]])await page.mouse.click(rect.x+rect.width*x,rect.y+rect.height*y);await page.locator('#finish-poly').click();
 const geometry=await page.evaluate(()=>{const a=document.querySelector('#stage').getBoundingClientRect(),b=document.querySelector('#selection').getBoundingClientRect();return Math.abs(a.width-b.width)<1&&Math.abs(a.height-b.height)<1;});check('selection overlay matches actual preview geometry',geometry);
 await page.locator('ion-segment-button[value=motion]').click();await page.locator('[data-motion=sway]').click();await page.locator('#intensity').fill('0.5');await page.screenshot({path:join(out,'app-editor-mobile.png')});
 await page.locator('#app-export').click();await page.locator('#export').click();await page.locator('#result[open]').waitFor({timeout:20000});const info=await page.locator('#result-video').evaluate(async v=>{if(v.readyState<2)await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});await v.play();return {width:v.videoWidth,height:v.videoHeight,duration:v.duration};});check('app shell exports playable six-second video',info.width===1280&&info.height===720&&Math.abs(info.duration-6)<.5);await page.locator('.dialog-close').click();
 await page.locator('.app-tabbar').getByRole('tab',{name:'作品',exact:true}).click();await page.locator('#library').waitFor({state:'visible'});await page.locator('#work-list .card').waitFor({state:'visible'});check('library shows exported work',await page.locator('#work-list .card').count()===1);await page.screenshot({path:join(out,'app-library-mobile.png')});
 await page.reload();await page.locator('#library').waitFor({state:'visible'});await page.locator('#work-list .card').waitFor({state:'visible'});check('app deep link and local work survive reload',await page.locator('#work-list .card').count()===1);
 check('mobile document has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('app component assets are locally bundled',external.length===0);check('no app browser exceptions',errors.length===0);
 await writeFile(join(out,'app-browser-report.json'),JSON.stringify({mode:'Chromium 390x844; not installed native App',checks,info,errors,external},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,info,errors}));
}finally{await browser.close();app.closeAllConnections();await new Promise(r=>app.close(r));store.close();await rm(directory,{recursive:true,force:true});}
