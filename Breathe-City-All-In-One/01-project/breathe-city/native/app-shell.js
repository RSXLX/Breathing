// UI foundation: Ionic's official JavaScript components + Capacitor native plugins.
import { initialize } from '@ionic/core/components';
import { defineCustomElement as defineApp } from '@ionic/core/components/ion-app.js';
import { defineCustomElement as defineTabBar } from '@ionic/core/components/ion-tab-bar.js';
import { defineCustomElement as defineTabButton } from '@ionic/core/components/ion-tab-button.js';
import { defineCustomElement as defineSegment } from '@ionic/core/components/ion-segment.js';
import { defineCustomElement as defineSegmentButton } from '@ionic/core/components/ion-segment-button.js';
import { defineCustomElement as defineLabel } from '@ionic/core/components/ion-label.js';
import { defineCustomElement as defineIcon } from 'ionicons/components/ion-icon.js';
import { compassOutline,cameraOutline,albumsOutline,addOutline,arrowForwardOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Camera,CameraResultType,CameraSource } from '@capacitor/camera';
import { Filesystem,Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
initialize({mode:Capacitor.getPlatform()==='android'?'md':'ios'});
for(const register of [defineApp,defineTabBar,defineTabButton,defineSegment,defineSegmentButton,defineLabel,defineIcon])register();
const native=Capacitor.isNativePlatform();
window.BreatheNative={
 isNative:()=>native,
 async capture(){const photo=await Camera.getPhoto({quality:94,width:1920,height:1920,correctOrientation:true,resultType:CameraResultType.Uri,source:CameraSource.Camera,saveToGallery:false});if(!photo.webPath)throw new Error('相机没有返回照片');const response=await fetch(photo.webPath);if(!response.ok)throw new Error('照片读取失败');return response.blob();},
 async share(blob,name){
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
  const safeName=name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`breathe-exports/${Date.now()}-${safeName}`;
  const file=await Filesystem.writeFile({path,data:base64,directory:Directory.Cache,recursive:true});
  // The receiving app may read the URI after the chooser closes. Keep it until a later launch.
  await Share.share({title:'呼吸城市',files:[file.uri],dialogTitle:'保存或分享作品'});
 }
};
if(native){
 Filesystem.mkdir({path:'breathe-exports',directory:Directory.Cache,recursive:true}).catch(()=>{}).then(()=>Filesystem.readdir({path:'breathe-exports',directory:Directory.Cache})).then(({files})=>Promise.all(files.filter(file=>/^\d+-/.test(file.name)&&Date.now()-Number(file.name.split('-')[0])>86400000).map(file=>Filesystem.deleteFile({path:`breathe-exports/${file.name}`,directory:Directory.Cache}).catch(()=>{})))).catch(()=>{});
 document.documentElement.classList.add('native-runtime');App.addListener('appStateChange',({isActive})=>{if(!isActive)window.dispatchEvent(new Event('breathe-native-background'));});}
const $=s=>document.querySelector(s);
const app=document.createElement('ion-app');app.className='breathe-app';while(document.body.firstChild)app.append(document.body.firstChild);document.body.append(app);
$('.topbar').classList.add('app-topbar');$('.local-chip').textContent=native?'随手一点，让日常动起来':'APP PREVIEW';
const home=document.createElement('section');home.id='discover';home.innerHTML=`
 <div class="home-heading"><p class="eyebrow">A LITTLE WONDER, EVERY DAY</p><h1>今天，唤醒哪里？</h1><p>给熟悉的世界，一点意想不到的动作。</p></div>
 <div class="capture-card"><div class="capture-art"><img src="/assets/blocks.svg" alt="原创楼宇插画"><span>MAKE YOUR CITY BREATHE</span></div><div class="capture-copy"><h2>让日常，动起来。</h2><p>一张照片，也可以有生命力。</p><div class="capture-actions"><button class="primary" id="app-import"><ion-icon data-icon="add"></ion-icon>导入素材</button><button id="app-camera"><ion-icon data-icon="camera"></ion-icon>拍一张</button></div></div></div>
 <div class="shelf-heading"><h2>先试一点想象力</h2><span>原创插画示例</span></div>
 <div class="inspiration-shelf"><button data-example="blocks" class="scene-card"><img src="/assets/blocks.svg" alt="楼宇插画"><span><b>楼宇在呼吸</b><small>让立面轻轻舒展</small></span></button><button data-example="park" class="scene-card"><img src="/assets/park.svg" alt="树冠插画"><span><b>风经过树梢</b><small>试试一阵轻轻的摇摆</small></span></button><button data-example="rooftop" class="scene-card"><img src="/assets/rooftop.svg" alt="屋顶插画"><span><b>屋顶的波纹</b><small>给静止一点流动</small></span></button></div>
 <div class="home-footnote"><span class="brand-mark">◒</span><p>拍下你自己的日常。<br>本地动作无需上传素材。</p></div>`;
$('main').prepend(home);
const workspace=$('.workspace'),controls=$('.controls'),output=$('.output-panel');
const sections=[...controls.querySelectorAll('.control-section')];
const source=document.createElement('div');source.dataset.editorPanel='source';source.append(sections[0],$('#video-options'));controls.prepend(source);
sections.filter(s=>s!==sections[0]&&s.id!=='video-options').forEach((s,i)=>s.dataset.editorPanel=i===0?'selection':'motion');output.dataset.editorPanel='export';
const dock=document.createElement('div');dock.className='editor-dock';dock.innerHTML=`<ion-segment id="editor-tools" value="motion"><ion-segment-button value="source"><ion-label>素材</ion-label></ion-segment-button><ion-segment-button value="selection"><ion-label>选区</ion-label></ion-segment-button><ion-segment-button value="motion"><ion-label>动作</ion-label></ion-segment-button><ion-segment-button value="export"><ion-label>导出</ion-label></ion-segment-button></ion-segment><div class="dock-panels"></div>`;dock.querySelector('.dock-panels').append(controls,output);workspace.append(dock);
function selectPanel(value){document.body.dataset.editorPanel=value;}
$('#editor-tools').addEventListener('ionChange',e=>selectPanel(e.detail.value));selectPanel('motion');
const editorHeader=document.createElement('div');editorHeader.className='editor-header';editorHeader.innerHTML='<span>让它动起来</span><button id="app-export" class="primary">导出 ↗</button>';$('#creator').prepend(editorHeader);
const nav=document.createElement('ion-tab-bar');nav.className='app-tabbar';nav.innerHTML=`<ion-tab-button tab="discover" href="#/discover"><ion-icon data-icon="compass"></ion-icon><ion-label>发现</ion-label></ion-tab-button><ion-tab-button tab="camera" href="#/camera"><ion-icon data-icon="camera"></ion-icon><ion-label>创作</ion-label></ion-tab-button><ion-tab-button tab="library" href="#/library"><ion-icon data-icon="albums"></ion-icon><ion-label>作品</ion-label></ion-tab-button>`;app.append(nav);nav.addEventListener('ionTabButtonClick',e=>{if(['#/discover','#/camera','#/library'].includes(e.detail.href))location.hash=e.detail.href;});
const icons={compass:compassOutline,camera:cameraOutline,albums:albumsOutline,add:addOutline,arrow:arrowForwardOutline};document.querySelectorAll('ion-icon[data-icon]').forEach(el=>el.icon=icons[el.dataset.icon]);
$('#app-import').onclick=()=>$('#import').click();$('#app-camera').onclick=()=>{location.hash='/camera';$('#camera').click();};$('#app-export').onclick=()=>{selectPanel('export');$('#editor-tools').value='export';};
function route(){const path=location.hash||'#/discover';home.hidden=path!=='#/discover';document.body.dataset.appPage=path.slice(2);nav.querySelectorAll('ion-tab-button').forEach(b=>b.selected=b.getAttribute('href')===path);$('.topbar').hidden=path==='#/camera';}
window.addEventListener('hashchange',route);if(!location.hash)location.hash='/discover';route();
if(native){$('#download-result').textContent='保存 / 分享';$('#share-result').hidden=true;$('#storage-note').textContent='作品保存在这台设备，卸载 App 或清除数据会删除本机作品。';$('#export-note').textContent='导出期间请保持 App 在前台。';$('.legacy-link').hidden=true;}
