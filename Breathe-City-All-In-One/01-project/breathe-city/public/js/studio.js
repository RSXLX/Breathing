import { MOTIONS, validParameters, validatePolygon, normalizedPointer } from './motion-domain.js';
import { MotionRenderer } from './motion-renderer.js';
import { StudioInput, blobFromCanvas, recordMotion, saveDownload } from './studio-media.js';
import { StudioStore } from './studio-store.js';
import { GenerationClient } from './generation-client.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const cloud=new GenerationClient();
const input=new StudioInput(),store=new StudioStore(),renderer=new MotionRenderer($('#stage'));
const state={id:crypto.randomUUID(),name:'楼宇示例',example:true,ratio:'portrait',focus:{x:.5,y:.5},polygon:[[.16,.18],[.84,.18],[.84,.84],[.16,.84]],parameters:{motion:'breathe',intensity:.6,cycle:4,version:1},inputMode:'image',sourceTime:0,playing:true,compare:false,showSelection:true,tool:'rect',points:[],drag:null,busy:false,recording:false,time:0,frame:null,currentWork:null,workUrl:null,originalUrl:null,urls:[],dirty:false,saveTimer:null,raf:null,previous:null};
let exportAbort=null,toastTimer,cloudQuote=null,cloudPoll=null,jobCursor=null,jobPageLimit=1;
state.pendingSubmission=null;
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=error?'error':'';el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,error?6500:3500);}
async function action(fn){if(state.busy||state.recording)return;state.busy=true;$('.controls').inert=true;$('.preview-bottom').inert=true;$('#import-top').disabled=true;$('#duration').disabled=true;try{await fn();}catch(err){toast(err.message||'操作未完成，请重试',true);}finally{state.busy=false;$('.controls').inert=false;$('.preview-bottom').inert=false;$('#import-top').disabled=false;$('#duration').disabled=false;}}
function settings(){return {ratio:state.ratio,focus:{...state.focus},polygon:state.polygon.map(p=>[...p]),parameters:{...state.parameters}};}
function drawSelection(){
  const canvas=$('#selection'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if(!state.showSelection||state.compare||state.recording||input.kind==='camera')return;
  const points=state.drag?[state.drag.start,[state.drag.end[0],state.drag.start[1]],state.drag.end,[state.drag.start[0],state.drag.end[1]]]:state.points.length?state.points:state.polygon;
  if(!points.length)return;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));if(!state.points.length)ctx.closePath();ctx.fillStyle='#d9ec9513';ctx.fill();ctx.strokeStyle='#e6ffa9';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.stroke();ctx.setLineDash([]);
  for(const [x,y]of points){ctx.beginPath();ctx.arc(x*w,y*h,4,0,Math.PI*2);ctx.fillStyle='#f2ffd4';ctx.fill();}
}
function syncUI(){
  $$('.controls button,.controls input,.controls select,#duration,#import-top,#save-draft').forEach(el=>el.disabled=state.recording);
  $('#source-label').textContent=state.name;$('#ratio').value=state.ratio;$('#focus-x').value=state.focus.x;$('#focus-y').value=state.focus.y;
  $('#intensity').value=state.parameters.intensity;$('#intensity-label').textContent=`${Math.round(state.parameters.intensity*100)}%`;$('#cycle').value=state.parameters.cycle;$('#cycle-label').textContent=`${state.parameters.cycle.toFixed(1)} 秒`;
  $$('#motion-options button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.motion===state.parameters.motion)));
  const video=input.kind==='video';$('#video-options').hidden=!video;$('#input-mode').value=state.inputMode==='video-edit'?'video-edit':'video-frame';$('#shutter').hidden=input.kind!=='camera';
  $('#tripod-label').hidden=state.inputMode!=='video-edit';$('#video-note').textContent=state.inputMode==='video-edit'?'只支持固定机位与位置稳定的物体；保留原视频运动，输出静音。':'只使用这一帧，不保留原视频运动与声音。';
  $('#export').disabled=state.recording||input.kind==='camera'||!input.source;$('#snapshot').disabled=state.recording||!input.source;
  $('#mode-badge').textContent=input.kind==='camera'?'相机取景 · 拍下后创作':state.inputMode==='video-edit'?'原视频局部动画 · 固定机位':state.inputMode==='video-frame'?'视频选帧动画':'本地原物体动画';
  $('#preview-note').textContent=state.example?'原创插画示例 · 本机形变 · 非 AI 生成':'原物体局部形变 · 本机处理 · 不上传素材';
  $('#play').textContent=state.playing?'暂停':'播放';$('#play').setAttribute('aria-pressed',String(state.playing));$('#compare').setAttribute('aria-pressed',String(state.compare));$('#compare-tag').hidden=!state.compare;
  $('#show-selection').setAttribute('aria-pressed',String(state.showSelection));$('#rect-tool').setAttribute('aria-pressed',String(state.tool==='rect'));$('#poly-tool').setAttribute('aria-pressed',String(state.tool==='polygon'));$('#finish-poly').hidden=state.tool!=='polygon';$('#undo-poly').hidden=state.tool!=='polygon';
  $('#selection-help').textContent=state.tool==='polygon'?'依次点击物体轮廓的顶点，点击“完成选区”。':'在画面上拖动，圈出想让它动起来的区域。';
  const overlay=$('#selection');if(overlay.width!==renderer.canvas.width||overlay.height!==renderer.canvas.height){overlay.width=renderer.canvas.width;overlay.height=renderer.canvas.height;}drawSelection();
}
function markDirty(){cloudQuote=null;$('#generate').disabled=!state.pendingSubmission;$('#quote-detail').textContent='';state.dirty=true;$('#draft-state').textContent='草稿待保存…';clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveDraft().catch(e=>toast(e.message,true)),600);}
async function saveDraft(){
  clearTimeout(state.saveTimer);if(!input.originalBlob||input.kind==='camera')return;
  const row=await store.put('drafts',{id:state.id,name:state.name,example:state.example,sourceBlob:input.originalBlob,settings:settings(),inputMode:state.inputMode,sourceTime:state.sourceTime,pendingSubmission:state.pendingSubmission,createdAt:Date.now()});
  state.dirty=false;$('#draft-state').textContent=row.saved?'草稿已保存到本机':'草稿仅在当前页面，离开前请导出';return row;
}
async function newSource(blob,name,example=false){
  if(state.dirty)await saveDraft();state.frame=null;
  if(!await input.load(blob))return;state.id=crypto.randomUUID();state.name=name;state.example=example;state.pendingSubmission=null;state.sourceTime=0;state.inputMode=input.kind==='video'?'video-frame':'image';state.time=0;state.points=[];$('#tripod').checked=false;
  if(input.kind==='video'){$('#seek').max=Math.max(0,input.source.duration-.05);$('#seek').value=0;$('#seek-time').textContent='0.0 秒';}
  renderer.resize(state.ratio);syncUI();markDirty();location.hash='/camera';
}
async function example(id){
  const samples={blocks:'/assets/blocks.svg',park:'/assets/park.svg',rooftop:'/assets/rooftop.svg'};
  const response=await fetch(samples[id]);if(!response.ok)throw new Error('示例加载失败');await newSource(await response.blob(),`${{blocks:'楼宇',park:'树冠',rooftop:'屋顶'}[id]} · 原创插画示例`,true);
}
async function restore(row){
  if(state.dirty)await saveDraft();state.frame=null;if(!await input.load(row.sourceBlob))return;Object.assign(state,{id:row.id,name:row.name,example:row.example,...row.settings,inputMode:row.inputMode||'image',sourceTime:row.sourceTime||0,pendingSubmission:row.pendingSubmission||null,time:0,points:[],dirty:false});
  renderer.resize(state.ratio);if(input.kind==='video'){await input.seek(state.sourceTime);$('#seek').max=input.source.duration-.05;$('#seek').value=state.sourceTime;$('#seek-time').textContent=`${state.sourceTime.toFixed(1)} 秒`;}
  $('#tripod').checked=false;syncUI();$('#draft-state').textContent=row.saved?'已恢复本机草稿':'已恢复临时草稿';if(state.pendingSubmission){$('#generate').disabled=false;$('#generate').textContent='恢复这次未确认提交';}location.hash='/camera';
}
function selectedSource(){return state.frame||input.source;}
function loop(now){
  state.raf=requestAnimationFrame(loop);if(document.hidden)return;const delta=state.previous?Math.min(.1,(now-state.previous)/1000):0;state.previous=now;
  if(state.recording||$('#creator').hidden)return;if(state.playing)state.time+=delta;
  const source=selectedSource();if(source){renderer.renderAt(state.time,source,settings(),{compare:state.compare||input.kind==='camera'});$('#render-stat').textContent=`${renderer.frameMs.toFixed(1)} ms · ${renderer.canvas.width}×${renderer.canvas.height}`;}
}
async function makeThumbnail(){const c=document.createElement('canvas');c.width=180;c.height=Math.round(180*renderer.canvas.height/renderer.canvas.width);c.getContext('2d').drawImage(renderer.canvas,0,0,c.width,c.height);return blobFromCanvas(c);}
async function persistWork(result){
  const motion=MOTIONS.find(m=>m.id===state.parameters.motion);const row=await store.put('works',{id:crypto.randomUUID(),title:`${motion.title} · ${state.name}`,createdAt:Date.now(),...result,thumbnail:await makeThumbnail(),settings:settings(),source:state.inputMode,provenance:state.example?'original-illustration-local-motion':'original-image-local-motion',rendererVersion:1,width:renderer.canvas.width,height:renderer.canvas.height});
  await showResult(row);await updateCount();toast(row.saved?'作品已保存到本机':'作品暂存在当前页面，请先下载',!row.saved);
}
async function showResult(work){
  state.currentWork=work;if(state.workUrl)URL.revokeObjectURL(state.workUrl);state.workUrl=URL.createObjectURL(work.blob);if(state.originalUrl)URL.revokeObjectURL(state.originalUrl);state.originalUrl=work.sourceBlob?URL.createObjectURL(work.sourceBlob):null;
  $('#result-original').hidden=true;$('#result-original').removeAttribute('src');if(state.originalUrl)$('#result-original').src=state.originalUrl;$('#compare-result').textContent='对比原始画面';
  $('#quality-controls').hidden=work.provenance!=='runway-api';$('#compare-result').disabled=!work.sourceBlob;$('#revise-result').disabled=!work.sourceBlob;
  $('#quality-note').textContent=!work.sourceBlob?'原始画面已过期，当前仍可保存结果。':work.qualityDecision==='accepted'?'已标记满意。':work.qualityDecision==='rejected'?'已标记待修改；重新生成前会再次报价。':'检查原物体是否仍可辨认、动作是否自然，以及背景有没有意外变化。';
  const video=work.blob.type.startsWith('video/');$('#result-video').hidden=!video;$('#result-image').hidden=video;$('#result-video').pause();$('#result-video').removeAttribute('src');$('#result-image').removeAttribute('src');
  $(video?'#result-video':'#result-image').src=state.workUrl;$('#result-title').textContent=work.title||'已经动起来了。';$('#result-meta').textContent=`${work.width||'—'} × ${work.height||'—'} · ${video?`${work.duration||'—'} 秒 · `:''}${work.blob.type} · ${(work.blob.size/1024/1024).toFixed(1)} MB`;
  $('#result-storage').textContent=work.saved?(window.BreatheNative?.isNative()?'保存在这台设备，卸载 App 或清除数据会删除作品。':'保存在当前浏览器，清理网站数据会删除作品。'):'仅当前页面临时保存，请保存文件后再离开。';$('#result').showModal();
}
async function exportVideo(){
  if(state.points.length)throw new Error('请先完成选区');validatePolygon(state.polygon);validParameters(state.parameters);
  if(input.kind==='camera')throw new Error('请先拍下这一帧');
  if(state.inputMode==='video-edit'&&!$('#tripod').checked)throw new Error('原视频处理请先确认固定机位');
  const requested=Number($('#duration').value),duration=state.inputMode==='video-edit'?Math.min(requested,input.source.duration-state.sourceTime):requested;
  if(duration<1)throw new Error('起始点距视频结尾太近，请往前选择');
  await saveDraft();state.recording=true;document.body.classList.add('recording');exportAbort=new AbortController();$('#cancel-export').hidden=false;$('#export-progress').hidden=false;syncUI();
  const snapshot=settings();let source=input.source;
  try{
    if(state.inputMode==='video-edit'){await input.seek(state.sourceTime);input.source.loop=false;await input.source.play();}
    else if(input.kind==='video'){const img=new Image(),url=URL.createObjectURL(await input.frame());try{img.src=url;await img.decode();source=img;}finally{URL.revokeObjectURL(url);}}
    const result=await recordMotion(renderer.canvas,t=>{if(state.inputMode==='video-edit'&&(input.source.error||Math.abs((input.source.currentTime-state.sourceTime)-t)>1.5))throw new Error('视频播放中断');renderer.renderAt(t,source,snapshot);},{duration,signal:exportAbort.signal,onProgress:p=>$('#export-progress').value=p});
    await persistWork({...result,type:'video'});
  }finally{try{if(input.kind==='video'){input.source.pause();await input.seek(state.sourceTime);}}finally{state.recording=false;document.body.classList.remove('recording');$('#cancel-export').hidden=true;$('#export-progress').hidden=true;exportAbort=null;syncUI();}}
}
async function updateCount(){$('#work-count').textContent=(await store.list('works')).length;}
function button(label,handler){const b=document.createElement('button');b.textContent=label;b.onclick=()=>action(handler);return b;}
function card(row,isDraft){
  const el=document.createElement('article');el.className='card';if(row.thumbnail){const img=document.createElement('img'),url=URL.createObjectURL(row.thumbnail);state.urls.push(url);img.src=url;img.alt='作品缩略图';el.append(img);}
  const body=document.createElement('div');body.className='card-body';const title=document.createElement('h3');title.textContent=row.title||row.name||'旧版作品';const p=document.createElement('p');p.textContent=`${new Date(row.updatedAt||row.createdAt).toLocaleDateString()} · ${row.saved?'本机保存':'临时保存'}${row.qualityDecision==='rejected'?' · 待修改':row.qualityDecision==='accepted'?' · 满意':''}`;const actions=document.createElement('div');actions.className='inline-actions';
  actions.append(button(isDraft?'继续编辑':'打开',()=>isDraft?restore(row):showResult(row)),button('删除',async()=>{if(!confirm(`删除${isDraft?'草稿':'作品'}？此操作无法撤销。`))return;await store.remove(isDraft?'drafts':'works',row.id);await library();await updateCount();}));body.append(title,p,actions);el.append(body);return el;
}
async function library(){
  state.urls.forEach(u=>URL.revokeObjectURL(u));state.urls=[];
  for(const [name,selector]of [['drafts','#draft-list'],['works','#work-list']]){const rows=await store.list(name),container=$(selector);container.replaceChildren();if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent=name==='drafts'?'还没有草稿':'去拍一处日常，让它动起来。';container.append(p);}else rows.forEach(r=>container.append(card(r,name==='drafts')));}
}
async function route(){const isLibrary=location.hash==='#/library',isDiscover=document.body.classList.contains('mobile-app')&&location.hash==='#/discover';if(state.recording){location.hash='/camera';return;}$('#creator').hidden=isLibrary||isDiscover;$('#library').hidden=!isLibrary;$('#nav-create').classList.toggle('active',!isLibrary);$('#nav-library').classList.toggle('active',isLibrary);if(isLibrary){if(input.kind==='camera'){input.clear();toast('已关闭相机，请返回创作后重新打开');}else if(input.kind==='video')input.source.pause();await saveDraft();await library();}}

for(const motion of MOTIONS){const b=document.createElement('button');b.textContent=motion.title;b.title=motion.description;b.dataset.motion=motion.id;b.onclick=()=>{if(state.recording)return;state.parameters.motion=motion.id;state.time=0;syncUI();markDirty();};$('#motion-options').append(b);}
for(const id of ['#import','#import-top'])$(id).onclick=()=>$('#file').click();
$('#file').onchange=()=>{const file=$('#file').files[0];$('#file').value='';if(!file)return;void action(async()=>{if(file.type==='image/svg+xml')throw new Error('请导入 JPG、PNG 或 WebP 图片');await newSource(file,file.name);});};
$$('[data-example]').forEach(b=>b.onclick=()=>action(()=>example(b.dataset.example)));
$('#camera').onclick=()=>action(async()=>{await saveDraft();if(window.BreatheNative?.isNative()){await newSource(await window.BreatheNative.capture(),'相机照片');return;}state.frame=null;if(!await input.camera())return;state.name='相机取景 · 拍下后制作动画';syncUI();});
$('#shutter').onclick=()=>action(async()=>{const blob=await input.frame();await newSource(blob,'相机照片');});
$('#input-mode').onchange=()=>action(async()=>{state.inputMode=$('#input-mode').value;state.frame=null;input.source.pause();$('#tripod').checked=false;syncUI();markDirty();});
$('#seek').onchange=()=>action(async()=>{state.sourceTime=Number($('#seek').value);await input.seek(state.sourceTime);$('#seek-time').textContent=`${state.sourceTime.toFixed(1)} 秒`;markDirty();});
$('#tripod').onchange=()=>action(async()=>{if($('#tripod').checked&&state.playing){input.source.loop=true;await input.source.play();}else input.source.pause();});
for(const [id,key]of [['#intensity','intensity'],['#cycle','cycle']])$(id).oninput=()=>{state.parameters[key]=Number($(id).value);syncUI();markDirty();};
$('#ratio').onchange=()=>{state.ratio=$('#ratio').value;renderer.resize(state.ratio);state.polygon=[[.16,.18],[.84,.18],[.84,.84],[.16,.84]];state.points=[];syncUI();markDirty();toast('画幅改变，请重新确认选区');};
for(const [id,key]of [['#focus-x','x'],['#focus-y','y']])$(id).oninput=()=>{state.focus[key]=Number($(id).value);syncUI();markDirty();};
$('#play').onclick=()=>action(async()=>{state.playing=!state.playing;if(input.kind==='video'&&state.inputMode==='video-edit'){if(state.playing&&$('#tripod').checked){input.source.loop=true;await input.source.play();}else input.source.pause();}syncUI();});
$('#compare').onclick=()=>{if(state.recording)return;state.compare=!state.compare;syncUI();};$('#show-selection').onclick=()=>{state.showSelection=!state.showSelection;syncUI();};
$('#rect-tool').onclick=()=>{state.tool='rect';state.points=[];syncUI();};$('#poly-tool').onclick=()=>{state.tool='polygon';state.points=[];syncUI();};$('#undo-poly').onclick=()=>{state.points.pop();drawSelection();};
$('#finish-poly').onclick=()=>action(async()=>{state.polygon=validatePolygon(state.points);state.points=[];drawSelection();markDirty();});
$('#reset-selection').onclick=()=>{state.polygon=[[.16,.18],[.84,.18],[.84,.84],[.16,.84]];state.points=[];syncUI();markDirty();};
const overlay=$('#selection');overlay.onpointerdown=e=>{if(state.busy||state.recording||input.kind==='camera')return;const p=normalizedPointer(e.clientX,e.clientY,overlay.getBoundingClientRect());if(state.tool==='polygon'){if(state.points.length>=32)return toast('选区最多 32 个点',true);state.points.push(p);}else{state.drag={start:p,end:p};overlay.setPointerCapture(e.pointerId);}drawSelection();};
overlay.onpointermove=e=>{if(!state.drag)return;state.drag.end=normalizedPointer(e.clientX,e.clientY,overlay.getBoundingClientRect());drawSelection();};overlay.onpointerup=()=>{if(!state.drag)return;const {start:a,end:b}=state.drag;state.drag=null;const points=[[Math.min(a[0],b[0]),Math.min(a[1],b[1])],[Math.max(a[0],b[0]),Math.min(a[1],b[1])],[Math.max(a[0],b[0]),Math.max(a[1],b[1])],[Math.min(a[0],b[0]),Math.max(a[1],b[1])]];try{state.polygon=validatePolygon(points);markDirty();}catch(err){toast(err.message,true);}drawSelection();};overlay.onpointercancel=()=>{state.drag=null;drawSelection();};
$('#export').onclick=()=>action(exportVideo);$('#cancel-export').onclick=()=>exportAbort?.abort();$('#save-draft').onclick=()=>action(saveDraft);
$('#snapshot').onclick=()=>action(async()=>{await persistWork({blob:await blobFromCanvas(renderer.canvas,'image/png'),type:'still',filename:`breathe-city-${Date.now()}.png`,duration:0});});
$('#download-result').onclick=()=>action(async()=>{const w=state.currentWork;if(w)await saveDownload(w.blob,w.filename||`breathe-city-${w.id}.${w.blob.type.includes('mp4')?'mp4':w.blob.type.startsWith('video')?'webm':'png'}`);});
$('#share-result').onclick=()=>action(async()=>{const w=state.currentWork;if(window.BreatheNative?.isNative())return window.BreatheNative.share(w.blob,w.filename||'breathe-city.mp4');const file=new File([w.blob],w.filename||'breathe-city.png',{type:w.blob.type});if(!navigator.canShare?.({files:[file]}))return toast('当前环境不支持文件分享，请先下载');try{await navigator.share({files:[file],title:'呼吸城市'});}catch(err){if(err.name!=='AbortError')throw err;}});
$('#compare-result').onclick=()=>{const original=$('#result-original'),show=original.hidden;original.hidden=!show;$('#result-video').hidden=show;if(show)$('#result-video').pause();$('#compare-result').textContent=show?'返回生成结果':'对比原始画面';};
$('#accept-result').onclick=()=>action(async()=>{const work=await store.put('works',{...state.currentWork,qualityDecision:'accepted'});state.currentWork=work;$('#quality-note').textContent=work.saved?'已标记满意，保存在本机。':'满意标记仅在当前页面，离开前请下载。';});
$('#revise-result').onclick=()=>action(async()=>{
  const work=state.currentWork;if(!work.sourceBlob||!work.settings)throw new Error('原始画面已不可用，请重新导入素材');
  await store.put('works',{...work,qualityDecision:'rejected'});$('#result').close();await newSource(work.sourceBlob,'云任务原始画面 · 修改动作');Object.assign(state,work.settings);renderer.resize(state.ratio);state.inputMode='image';syncUI();markDirty();toast('已恢复原图与动作。调整后可本地导出；重新云生成需要再次报价确认。');
});
$('#result').addEventListener('close',()=>{$('#result-video').pause();});
window.addEventListener('hashchange',()=>route().catch(e=>toast(e.message,true)));
document.addEventListener('visibilitychange',()=>{state.previous=null;if(document.hidden){if(input.kind==='camera'){input.clear();state.name='相机已关闭，返回后可重新打开';syncUI();}else if(input.kind==='video')input.source.pause();void saveDraft();}});
window.addEventListener('breathe-native-background',()=>{exportAbort?.abort();if(input.kind==='camera')input.clear();else if(input.kind==='video')input.source.pause();void saveDraft();});
window.addEventListener('pagehide',()=>{exportAbort?.abort();input.clear();cancelAnimationFrame(state.raf);});
window.addEventListener('pageshow',e=>{if(e.persisted){state.previous=null;state.raf=requestAnimationFrame(loop);toast('已返回，请恢复草稿或重新打开相机');}});
const jobLabels={queued:'排队中',submitting:'正在提交',running:'生成中',ingesting:'校验与保存视频',succeeded:'生成完成',failed:'生成失败',needs_review:'提交需核对',monitoring_stopped:'跟踪已停止',ingest_failed:'下载需恢复',cancelled:'已取消'};
async function refreshJobs(){
  if(!cloud.csrf)return;const items=[];let cursor=null;for(let i=0;i<jobPageLimit;i++){const page=await cloud.jobs(cursor);items.push(...page.items);cursor=page.nextCursor;if(!cursor)break;}if(!cloud.csrf)return;jobCursor=cursor;$('#more-jobs').hidden=!cursor;const container=$('#job-list');container.replaceChildren();
  for(const job of items){const div=document.createElement('div');div.className='job';const p=document.createElement('p');p.textContent=`${jobLabels[job.state]||job.state} · ${job.id.slice(0,8)} · ${Math.floor(job.elapsedMs/1000)} 秒`;div.append(p);if(job.state==='succeeded'&&!job.resultMediaId){const note=document.createElement('p');note.textContent='云端视频已到期或清理；已下载的作品仍可在本机查看。';div.append(note);}
    if(job.resultMediaId)div.append(button('下载并保存作品',async()=>{const blob=await cloud.result(job.resultMediaId);let sourceBlob=null;try{sourceBlob=await cloud.result(job.sourceMediaId);}catch{}const video=document.createElement('video'),url=URL.createObjectURL(blob);try{video.src=url;await new Promise((r,j)=>{video.onloadedmetadata=r;video.onerror=()=>j(new Error('视频无法解码'));});const work=await store.put('works',{id:'cloud-'+job.id,title:`AI ${job.presetId} · ${job.id.slice(0,8)}`,blob,type:'video',filename:`breathe-city-${job.id}.mp4`,duration:video.duration,width:video.videoWidth,height:video.videoHeight,createdAt:job.createdAt,provenance:'runway-api',source:job.inputMode,sourceBlob,settings:job.settings,qualityDecision:'not_reviewed'});await showResult(work);await updateCount();}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}}));
    for(const [key,label]of [['stop','停止跟踪'],['resume','恢复查询']])if(job.actions[key])div.append(button(label,async()=>{await cloud.control(job.id,key);await refreshJobs();}));container.append(div);
  }
}
$('#connect-cloud').onclick=()=>action(async()=>{await cloud.connect($('#invite').value);$('#invite').value='';$('#quote').disabled=false;$('#delete-cloud-data').disabled=false;$('#cloud-status').textContent='会话已连接，生成前会展示素材上传范围与报价。';await refreshJobs();clearInterval(cloudPoll);cloudPoll=setInterval(()=>{if(!document.hidden)refreshJobs().catch(()=>{});},5000);});
$('#quote').onclick=()=>action(async()=>{
  if(state.pendingSubmission)throw new Error('先恢复或核对尚未确认的提交，避免重复生成');
  if(state.inputMode==='video-edit'||input.kind==='camera')throw new Error('当前云模型接入仅支持照片或视频选定帧，请先选择该模式');
  if(!$('#cloud-consent').checked)throw new Error('请先确认愿意上传选定画面，再获取报价');
  renderer.sourceFrame(selectedSource(),state.focus);const blob=await blobFromCanvas(renderer.raw),media=await cloud.upload(blob);
  const body={mediaId:media.id,inputMode:state.inputMode,presetId:state.parameters.motion,presetVersion:1,selection:{points:state.polygon},parameters:{...state.parameters},ratio:state.ratio==='portrait'?'9:16':'16:9'};
  const q=await cloud.quote(body);cloudQuote={...q,body};$('#quote-detail').textContent=`本次最大预留 ${q.maxCostUnits} ${q.currency}，生成 ${q.snapshot.duration} 秒视频；报价于 ${new Date(q.expiresAt).toLocaleTimeString()} 失效。`;
  $('#generate').textContent='确认生成';$('#generate').disabled=false;
});
$('#generate').onclick=()=>action(async()=>{
  if(!state.pendingSubmission){if(!cloudQuote||cloudQuote.expiresAt<Date.now())throw new Error('请重新获取报价');if(!$('#cloud-consent').checked)throw new Error('需要确认上传与费用');state.pendingSubmission={ownerSessionId:cloud.sessionId,key:crypto.randomUUID(),body:{...cloudQuote.body,quoteId:cloudQuote.quoteId,confirmed:true}};const saved=await saveDraft();if(!saved?.saved)throw new Error('无法持久保存提交记录，暂不能开始付费生成。请在允许本机存储的浏览器重试');}
  const pending=state.pendingSubmission;
  if(!pending.ownerSessionId||pending.ownerSessionId!==cloud.sessionId)throw new Error('此提交属于原来的云会话，当前不能代为重试。请保留草稿和提交记录，联系管理员核对原任务。');
  const persisted=await saveDraft();if(!persisted?.saved)throw new Error('提交记录尚未持久保存，不能开始付费生成');
  try{const result=await cloud.submit(pending.body,pending.key);state.pendingSubmission=null;await saveDraft();$('#generate').disabled=true;cloudQuote=null;toast(result.reused?'已找到原来的任务':'生成任务已创建，可在这里查看进度');await refreshJobs();}
  catch(error){
    if(error.noJobCreated){state.pendingSubmission=null;cloudQuote=null;await saveDraft();$('#generate').disabled=true;$('#generate').textContent='确认生成';$('#quote-detail').textContent='服务已确认本次未创建任务。处理提示后可重新报价。';}
    else{$('#generate').textContent='恢复这次未确认提交';$('#generate').disabled=false;}
    throw error;
  }
});
$('#more-jobs').onclick=()=>action(async()=>{if(jobCursor){jobPageLimit++;await refreshJobs();}});
$('#delete-cloud-data').onclick=()=>action(async()=>{
  if(!confirm('清理本次会话所有云端素材并结束会话？本机作品保留；已提交的生成可能继续计费，第三方留存需另行处理。'))return;
  const result=await cloud.deleteData();clearInterval(cloudPoll);cloudPoll=null;jobPageLimit=1;jobCursor=null;cloudQuote=null;
  $('#job-list').replaceChildren();$('#more-jobs').hidden=true;$('#quote').disabled=true;$('#generate').disabled=true;$('#delete-cloud-data').disabled=true;$('#quote-detail').textContent='';
  $('#cloud-status').textContent=result.pending?'访问已撤销，剩余文件正在清理。':'本次会话云端素材已清理，会话已结束。';
  state.pendingSubmission=null;await saveDraft();
});
async function cloudStatus(){if(window.BreatheNative?.isNative()){$('#cloud-controls').hidden=true;$('#cloud-status').textContent='App 本地创作已可使用；云端服务连接将在完成部署后启用。';return;}try{const c=await cloud.config();$('#cloud-controls').hidden=!c.videoGenerationEnabled;$('#cloud-status').textContent=c.videoGenerationEnabled?'云服务可用，请连接邀请会话。':'云生成尚未启用；本地动作无需上传或付费。';if(c.videoGenerationEnabled){try{await cloud.restore();$('#quote').disabled=false;$('#delete-cloud-data').disabled=false;await refreshJobs();cloudPoll=setInterval(()=>{if(!document.hidden)refreshJobs().catch(()=>{});},5000);}catch{}}}catch{$('#cloud-status').textContent='视频生成服务尚未配置。本地动作现在即可使用。';}}
async function start(){const initialHash=location.hash;await store.open();await updateCount();await example('blocks');if(initialHash==='#/library'||document.body.classList.contains('mobile-app')&&initialHash)location.hash=initialHash;await route();void cloudStatus();state.raf=requestAnimationFrame(loop);}
start().catch(e=>toast(e.message,true));
