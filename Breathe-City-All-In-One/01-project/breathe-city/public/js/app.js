import { EFFECTS, DEMOS, SceneRouter, classifyPixels, coverageOf, chooseScene, escapeHtml, filenameFor, makeId } from './domain.js';
import { MediaInput, CanvasRecorder, canvasBlob, downloadBlob } from './media.js';
import { CityRenderer } from './engine.js';
import { LocalGallery } from './storage.js';
import { SemanticClient } from './segmentation.js';
import { GlbViewer } from './glb.js';
import { RealtimeSession } from './realtime.js';

const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
const media=new MediaInput(),renderer=new CityRenderer($('#stage'),media),recorder=new CanvasRecorder(),gallery=new LocalGallery(),router=new SceneRouter(2);
const state={page:'studio',demo:DEMOS[0],effect:'auto',config:null,backend:false,semantic:false,semanticMs:null,works:[],currentWork:null,workUrl:null,galleryUrls:[],viewer:null,offlineJobs:[],pending:new Map(),capturing:false,recordMeta:null,sourceVersion:0};
let toastTimer,lastPrompt='',lastAnalysis=0,lastJobRefresh=0;
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,error?6500:3600);}
function errorText(err){return err instanceof Error?err.message:'操作失败，请重试。';}
async function confirmAction(title,copy){const d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-copy').textContent=copy;d.returnValue='cancel';d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true}));}
function goPage(page){
  state.page=page;$$('.page').forEach(el=>el.hidden=el.id!==`page-${page}`);$$('.nav-tab').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  if(page==='gallery')void refreshGallery();
  if(page==='connections'){void refreshServices();void refreshJobs();if(!state.viewer)void loadModelUrl('/assets/seedpod.glb','原创建模样例 · 不是 Tripo 生成结果').catch(err=>$('#model-label').textContent=errorText(err));}
  window.scrollTo({top:0,behavior:'instant'});
}
async function api(path,{method='GET',body}={}){
  if(!state.backend)throw new Error('该操作需要本地 API 服务，请运行 npm start。');
  const headers={'X-Breathe-Request':'1'},token=$('#admin-token').value.trim();if(token)headers.Authorization=`Bearer ${token}`;if(body)headers['Content-Type']='application/json';
  let response;
  try {response=await fetch(path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(24000)});}
  catch {throw new Error('本地 API 暂不可达。提交结果可能不确定，再次提交会复用同一幂等键。');}
  let result;try{result=await response.json();}catch{throw new Error('服务器没有返回有效 JSON。');}
  if(!response.ok)throw new Error(result.error||`请求失败 (${response.status})`);return result;
}
async function refreshServices(){
  if(location.protocol==='file:'){state.backend=false;state.config=null;renderServiceStatus();return;}
  try{const r=await fetch('/api/config',{signal:AbortSignal.timeout(3000)});if(!r.ok)throw new Error();state.config=await r.json();state.backend=true;}catch{state.backend=false;state.config=null;}
  renderServiceStatus();
}
function renderServiceStatus(){
  $('#server-status').textContent=state.backend?'本地服务已连接':'离线预览';
  $('#backend-state').textContent=state.backend?(state.config.adminRequired?'服务已连接；任务列表和生成操作需要本地管理令牌。':'本地服务已连接。演示任务可直接运行，真实 API 默认关闭。'):'独立预览模式：相机、导入、特效和作品库可用；真实模型接入需运行源码中的本地服务。';
  for(const kind of ['tripo','world','decart']){const ready=!!state.config?.providers?.[kind],el=$(`#${kind}-status`);el.textContent=ready?'已配置 · 待实机验收':kind==='decart'?'未配置':'本地演示';el.classList.toggle('available',ready);}
  $('#session-limit').textContent=`${state.config?.maxSessionSeconds||30} 秒`;
  $('#start-live').disabled=!state.config?.providers?.decart||!$('#cloud-consent').checked||live.active;
}
function markSource(){
  for(const [id,kind] of [['#source-demo','demo'],['#source-camera','camera'],['#source-upload','upload']])$(id).classList.toggle('active',kind==='upload'?['video','image'].includes(media.kind):media.kind===kind);
  $('#input-name').textContent=media.label;
  $('#input-badge').textContent=media.kind==='demo'?'原创演示场景 · 非实拍':media.kind==='camera'?'实时相机 · 本机处理':media.kind==='video'?'本地视频 · 未上传':'本地图片 · 未上传';
  $$('.demo-chip').forEach(el=>el.classList.toggle('active',media.kind==='demo'&&el.dataset.demo===state.demo.id));
}
function applyScene(scene){
  renderer.setScene(scene);const effect=EFFECTS[scene];$('#effect-badge').textContent=`${effect.title} / ${effect.en}`;$('#effect-description').textContent=effect.subtitle;
  if(live.active && effect.prompt!==lastPrompt){lastPrompt=effect.prompt;void live.setPrompt(lastPrompt);}
}
function updateMask(map,w,h,source){
  renderer.setMask(map,w,h,source);
  if(state.effect==='auto'){
    const next=source==='preset'?state.demo.scene:router.update(chooseScene(coverageOf(map)));
    applyScene(next);
  }else applyScene(state.effect);
  $('#analysis-status').textContent=source==='preset'?'预设蒙版 · 非 AI 识别':source==='semantic'?'语义模型 · 本机低频推理':'颜色规则 · 非 AI 识别';
}
async function loadDemo(demo=state.demo){
  if(state.capturing)return;const version=++state.sourceVersion;live.disconnect();semantic.invalidate();state.demo=demo;router.reset();renderer.map=null;renderer.anchors=[];$('#preview-loading').hidden=false;
  try{await media.demo(demo.image,demo.label);if(version!==state.sourceVersion)return;await renderer.demoMask(demo.mask);if(version!==state.sourceVersion)return;updateMask(renderer.map,renderer.maskW,renderer.maskH,'preset');markSource();}
  catch(err){toast(errorText(err),true);}finally{$('#preview-loading').hidden=true;}
}
async function changeSource(work){
  if(state.capturing)return;const version=++state.sourceVersion;renderer.maskEpoch=(renderer.maskEpoch||0)+1;live.disconnect();semantic.invalidate();router.reset();renderer.map=null;renderer.anchors=[];applyScene('unknown');$('#preview-loading').hidden=false;
  try{await work();if(version!==state.sourceVersion)return;markSource();lastAnalysis=0;}
  catch(err){if(version!==state.sourceVersion)return;toast(errorText(err),true);await loadDemo();}finally{$('#preview-loading').hidden=true;}
}
const semantic=new SemanticClient((status,message)=>{
  $('#semantic-status').textContent=message;
  if(status==='error'){$('#semantic-toggle').checked=false;state.semantic=false;toast(message,true);}
},data=>{
  if(!state.semantic||media.kind==='demo')return;
  state.semanticMs=data.inferenceMs;updateMask(new Uint8Array(data.map),data.width,data.height,'semantic');
});
const remoteVideo=document.createElement('video');remoteVideo.muted=true;remoteVideo.playsInline=true;
const live=new RealtimeSession((status,message)=>{
  $('#live-status').textContent=message;$('#stop-live').hidden=!live.active;$('#studio-stop-live').hidden=!live.active;$('#start-live').hidden=live.active;
  $('#live-tag').innerHTML=live.active?'<i></i> CLOUD AI':'<i></i> LOCAL RENDER';
  $('#privacy-note').textContent=live.active?'云会话正在发送原始画面给 Decart。不会发送麦克风音频；点击断开或切出页面可结束。':'本地模式不上传画面，不采集声音、定位或心率。演示场景为原创程序化插画。';
  renderServiceStatus();if(status==='error')toast(message,true);
},stream=>{
  if(stream){remoteVideo.srcObject=stream;renderer.remote=remoteVideo;void remoteVideo.play().catch(()=>{live.disconnect();toast('浏览器拒绝播放返回的生成画面。',true);});}
  else{remoteVideo.pause();remoteVideo.srcObject?.getTracks().forEach(t=>t.stop());remoteVideo.srcObject=null;renderer.remote=null;}
});
function setHolding(held){renderer.held=held;$('#breathe').classList.toggle('holding',held);$('#breathe').setAttribute('aria-pressed',String(held));$('#breathe-label').textContent=held?'它在回应你':'按住，唤醒城市';$('#rhythm-state').textContent=held?'光，正随着你慢慢苏醒':'城市正在安静呼吸';}
function bindHold(el,change){el.addEventListener('pointerdown',e=>{if(el.disabled)return;e.preventDefault();el.setPointerCapture(e.pointerId);change(true);});for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,()=>change(false));el.addEventListener('keydown',e=>{if(e.code==='Enter'){e.preventDefault();change(true);}});el.addEventListener('keyup',e=>{if(e.code==='Enter')change(false);});}
function lockCapture(active){state.capturing=active;$$('.record-lock,.effect-option').forEach(el=>el.disabled=active);$('#compare').disabled=active;$('#snapshot').disabled=active;$('#mask-toggle').disabled=active;$('#semantic-toggle').disabled=active;$('#effect-toggle').disabled=active;$('#record').classList.toggle('recording',active);$('#record-indicator').hidden=!active;$('#record-label').textContent=active?'结束录制':`录制 ${$('#duration').value} 秒`;}
async function persistWork(blob,type,meta={}){
  const thumb=document.createElement('canvas');thumb.width=480;thumb.height=Math.round(480*renderer.canvas.height/renderer.canvas.width);thumb.getContext('2d').drawImage(renderer.canvas,0,0,thumb.width,thumb.height);
  const row={id:makeId(),title:`${EFFECTS[meta.scene||renderer.scene].title} · ${new Date().toLocaleDateString('zh-CN')}`,createdAt:Date.now(),blob,type,thumbnail:await canvasBlob(thumb,'image/jpeg',.8),scene:meta.scene||renderer.scene,source:meta.source||media.kind,analysis:meta.analysis||renderer.maskSource,width:meta.width||renderer.canvas.width,height:meta.height||renderer.canvas.height,filename:meta.filename||filenameFor('still','png'),duration:meta.duration||0,renderMode:meta.renderMode||'local-vfx',saved:true};
  try{row.saved=await gallery.put(row);if(!row.saved)toast('浏览器不支持持久存储，作品仅临时保留；请及时下载。',true);}catch(err){row.saved=false;toast(errorText(err),true);}
  state.currentWork=row;await refreshGallery();openWork(row);return row;
}
async function takeSnapshot(){if(state.capturing)return;try{const row=await persistWork(await canvasBlob(renderer.canvas),'image',{renderMode:live.active?'cloud-ai':'local-vfx'});if(row.saved)toast('画面已保存到城市回忆。');}catch(err){toast(errorText(err),true);}}
async function toggleRecord(){
  if(recorder.active){recorder.stop();return;}
  renderer.compare=false;renderer.debug=false;$('#mask-toggle').checked=false;
  const meta={scene:renderer.scene,source:media.kind,analysis:renderer.maskSource,width:renderer.canvas.width,height:renderer.canvas.height,renderMode:live.active?'cloud-ai':'local-vfx'};
  try{
    const promise=recorder.start(renderer.canvas,Number($('#duration').value));lockCapture(true);
    const result=await promise;lockCapture(false);const row=await persistWork(result.blob,'video',{...meta,...result});if(row.saved)toast('短片已保存；可播放或下载。');
  }catch(err){lockCapture(false);toast(errorText(err),true);}
}
async function refreshGallery(){
  try{state.works=await gallery.list();}catch{state.works=[];}
  $('#gallery-count').textContent=state.works.length;$('#gallery-storage-mode').textContent=gallery.persistent?'那些你停下来、城市回应你的瞬间。只保存在这台设备的浏览器中。':'当前浏览器不支持持久存储，作品仅保留在本次会话；刷新前请下载备份。';$('#gallery-empty').hidden=state.works.length>0;
  state.galleryUrls.forEach(u=>URL.revokeObjectURL(u));state.galleryUrls=[];const grid=$('#gallery-grid');grid.replaceChildren();
  for(const work of state.works){const url=URL.createObjectURL(work.thumbnail);state.galleryUrls.push(url);const button=document.createElement('button');button.className='work-card';button.innerHTML=`<img src="${url}" alt="${escapeHtml(work.title)}" loading="lazy"><div class="work-card-body"><h3>${escapeHtml(work.title)}</h3><p><span>${work.type==='video'?`${work.duration.toFixed(1)} 秒 · 视频`:'静态画面'} / ${work.renderMode==='cloud-ai'?'AI 编辑':'本地 VFX'}</span><span>${new Date(work.createdAt).toLocaleDateString('zh-CN')}</span></p></div>`;button.onclick=()=>openWork(work);grid.append(button);}
}
function openWork(work){
  state.currentWork=work;if(state.workUrl)URL.revokeObjectURL(state.workUrl);state.workUrl=URL.createObjectURL(work.blob);
  const container=$('#work-media');container.replaceChildren();const el=document.createElement(work.type==='video'?'video':'img');el.src=state.workUrl;
  if(work.type==='video'){el.controls=true;el.playsInline=true;el.loop=true;}else el.alt=work.title;container.append(el);
  $('#work-title').value=work.title;$('#work-meta').textContent=`${work.width} × ${work.height} · ${work.type==='video'?`${work.duration.toFixed(1)} 秒 · ${work.blob.type.split(';')[0]}`:'PNG'} · ${(work.blob.size/1024/1024).toFixed(2)} MB · ${work.renderMode==='cloud-ai'?'云端生成画面':'本地程序化 VFX'}`;
  $('#work-storage-note').textContent=work.saved?'已保存在当前浏览器。清理网站数据会删除作品；重要成片请下载备份。':'当前作品未能写入本地库，请立即下载，关闭后可能丢失。';
  if(!$('#work-dialog').open)$('#work-dialog').showModal();
}
async function loadModelBuffer(buffer,label){
  if(!state.viewer)state.viewer=new GlbViewer($('#model-canvas'));
  renderer.asset=null;$('#clear-model').hidden=true;$('#apply-model').disabled=true;
  const result=await state.viewer.load(buffer);$('#model-label').textContent=`${label} · ${result.triangles.toLocaleString()} 面${state.viewer.software?' · 软件预览（无贴图）':''}`;$('#apply-model').disabled=false;
}
async function loadModelUrl(url,label){
  if(!(url.startsWith('/assets/')||url.startsWith('data:')||url.startsWith('https://')))throw new Error('模型地址不受支持。');
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('模型下载失败；也可手动下载后导入 GLB。');
  const length=Number(r.headers.get('content-length')||0);if(length>24*1024*1024)throw new Error('模型超过 24 MB，请先简化。');
  const reader=r.body?.getReader();if(!reader)throw new Error('模型响应为空');
  const chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>24*1024*1024){await reader.cancel();throw new Error('模型超过 24 MB，请先简化。');}chunks.push(value);}}finally{reader.releaseLock();}
  const buffer=new Uint8Array(total);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  await loadModelBuffer(buffer.buffer,label);
}
async function createJob(kind){
  const mode=$(`#${kind}-mode`).value,prompt=$(`#${kind}-prompt`).value.trim();
  if(prompt.length<3)return toast('请先填写完整的形态或空间描述。',true);
  if(mode==='real'){
    if(!state.config?.providers?.[kind])return toast('真实服务未配置。请在 .env 中配置对应 Key、ADMIN_TOKEN 并打开付费开关。',true);
    if(!await confirmAction('调用真实生成服务？','该操作会把文字提示词发送给服务商，并产生真实费用。\n没有上传你的本地相机画面。失败不会自动重试提交。'))return;
  }
  const form=$(`#${kind}-form`),button=form.querySelector('button[type=submit]');button.disabled=true;
  const signature=JSON.stringify({kind,mode,prompt});let payload=state.pending.get(signature);
  if(!payload){payload={kind,mode,prompt,confirmed:mode==='real',idempotencyKey:makeId()};state.pending.set(signature,payload);}
  try{
    if(state.backend){await api('/api/jobs',{method:'POST',body:payload});}
    else if(mode==='demo'){
      const existing=state.offlineJobs.find(j=>j.idempotencyKey===payload.idempotencyKey);
      if(!existing){const job={...payload,id:makeId(),state:'queued',createdAt:Date.now(),providerId:null,result:null};state.offlineJobs.unshift(job);setTimeout(()=>{job.state='succeeded';job.result=kind==='tripo'?{modelUrl:'/assets/seedpod.glb',provenance:'procedural-demo-not-tripo'}:{worldUrl:null,provenance:'standalone-demo',message:'程序化空间请在源码本地服务中打开'};renderJobs(state.offlineJobs);},1400);}
    }else throw new Error('真实任务需要本地服务');
    state.pending.delete(signature);await refreshJobs();toast(mode==='demo'?'演示任务已创建；不调用外部模型。':'真实任务已提交。结果可在任务列表中查看。');
  }catch(err){toast(errorText(err),true);}finally{button.disabled=false;}
}
async function refreshJobs(){
  if(!state.backend){renderJobs(state.offlineJobs);return;}
  if(state.config?.adminRequired&&!$('#admin-token').value.trim()){$('#job-list').textContent='输入本地管理令牌后查看持久化任务。';return;}
  try{const r=await api('/api/jobs');renderJobs(r.jobs);}catch(err){$('#job-list').textContent=errorText(err);}
}
const JOB_LABELS={queued:'等待处理',submitting:'提交中',polling:'处理中',succeeded:'已完成',failed:'失败',needs_review:'需要核对',cancelled:'已取消',monitoring_stopped:'已停止跟踪'};
function renderJobs(jobs){
  const root=$('#job-list');root.replaceChildren();
  if(!jobs.length){const p=document.createElement('p');p.className='micro-copy';p.textContent='还没有任务。先试一次演示流程，不会产生服务商费用。';root.append(p);return;}
  for(const job of jobs){
    const row=document.createElement('div');row.className=`job-row ${job.mode}`;
    row.innerHTML=`<span class="job-type">${job.kind==='tripo'?'3D ASSET':'WORLD'}<br><small>${job.mode==='demo'?'演示 · 非 AI':'真实 API'}</small></span><div class="job-main"><strong>${escapeHtml(job.prompt)}</strong><p>${escapeHtml(job.error||job.result?.message||job.result?.provenance||new Date(job.createdAt).toLocaleString('zh-CN'))}${job.providerId?` · ID: ${escapeHtml(job.providerId)}`:''}</p></div><span class="job-state">${JOB_LABELS[job.state]||escapeHtml(job.state)}${job.mode==='real'&&job.state==='polling'&&Number.isFinite(job.progress)?` ${Math.round(job.progress)}%`:''}</span><div class="job-actions"></div>`;
    const actions=row.querySelector('.job-actions');
    const action=(label,fn)=>{const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await fn();}catch(err){toast(errorText(err),true);}finally{button.disabled=false;}};actions.append(button);};
    if(job.result?.modelUrl){
      action('加载到预览',async()=>{await loadModelUrl(job.result.modelUrl,job.mode==='demo'?'原创程序化样例 · 非 Tripo':'Tripo API 生成资产');toast('模型已加载，可应用到树冠或天空。');});
      const a=document.createElement('a');a.textContent='模型文件 ↗';a.href=job.result.modelUrl;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);
    }
    if(job.result?.worldUrl){const a=document.createElement('a');a.textContent=job.mode==='demo'?'程序化空间 ↗':'World Labs 世界 ↗';a.href=job.result.worldUrl;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}
    if(state.backend&&['queued','polling','needs_review'].includes(job.state))action(job.state==='queued'?'取消排队':'停止跟踪',async()=>{
      if(job.state!=='queued'&&!await confirmAction('只停止本地跟踪？','云端生成不会被取消，费用不会因此退回。你可以继续在服务商控制台查看。'))return;
      await api(`/api/jobs/${job.id}/stop`,{method:'POST',body:{}});await refreshJobs();});
    if(state.backend&&['monitoring_stopped','needs_review'].includes(job.state)){
      if(job.providerId||job.mode==='demo')action('恢复查询',async()=>{await api(`/api/jobs/${job.id}/resume`,{method:'POST',body:{}});await refreshJobs();});
      else action('关联任务 ID',async()=>{const id=window.prompt('在服务商控制台核对后，粘贴已有任务 ID。此操作只恢复查询，不创建新生成。');if(!id)return;await api(`/api/jobs/${job.id}/attach`,{method:'POST',body:{providerId:id.trim()}});await refreshJobs();});
    }
    root.append(row);
  }
}
// All interactions are wired; no decorative dead-end buttons.
$$('.nav-tab').forEach(el=>el.onclick=()=>goPage(el.dataset.page));$('.brand').onclick=e=>{e.preventDefault();goPage('studio');};$('#connection-badge').onclick=()=>goPage('connections');$('#gallery-to-studio').onclick=()=>goPage('studio');
$('#source-demo').onclick=()=>void loadDemo();$('#source-camera').onclick=()=>void changeSource(()=>media.camera());$('#source-upload').onclick=()=>$('#media-file').click();
$('#media-file').onchange=e=>{const file=e.target.files[0];if(file)void changeSource(()=>media.file(file));e.target.value='';};
$$('.demo-chip').forEach(el=>el.onclick=()=>void loadDemo(DEMOS.find(d=>d.id===el.dataset.demo)));
$$('.effect-option').forEach(el=>el.onclick=()=>{state.effect=el.dataset.effect;$$('.effect-option').forEach(b=>b.classList.toggle('selected',b===el));if(state.effect==='auto')applyScene(media.kind==='demo'?state.demo.scene:chooseScene(renderer.coverage||{}));else applyScene(state.effect);});
bindHold($('#breathe'),setHolding);bindHold($('#compare'),value=>{renderer.compare=value;});
$('#strength').oninput=e=>{renderer.strength=Number(e.target.value)/100;$('#strength-value').textContent=`${e.target.value}%`;};
$('#cycle').oninput=e=>{renderer.cycle=Number(e.target.value);$('#cycle-value').textContent=`${Number(e.target.value).toFixed(1)} s`;};
$('#ratio').onchange=async e=>{if(state.capturing)return;live.disconnect();semantic.invalidate();renderer.resize(e.target.value);$('#viewport').classList.toggle('portrait',e.target.value==='portrait');$('#resolution-label').textContent=`${renderer.canvas.width} × ${renderer.canvas.height}`;if(media.kind==='demo'){await renderer.demoMask(state.demo.mask);updateMask(renderer.map,renderer.maskW,renderer.maskH,'preset');}lastAnalysis=0;};
$('#duration').onchange=()=>$('#record-label').textContent=`录制 ${$('#duration').value} 秒`;$('#snapshot').onclick=()=>void takeSnapshot();$('#record').onclick=()=>void toggleRecord();
$('#semantic-toggle').onchange=async e=>{state.semantic=e.target.checked;semantic.invalidate();state.semanticMs=null;if(state.semantic){try{await semantic.start();}catch(err){state.semantic=false;e.target.checked=false;toast(errorText(err),true);}}else{semantic.stop();$('#semantic-status').textContent='未加载模型。实拍默认使用颜色规则，不等同于 AI 语义识别。';lastAnalysis=0;}};
$('#mask-toggle').onchange=e=>renderer.debug=e.target.checked;$('#effect-toggle').onchange=e=>renderer.enabled=e.target.checked;
$('#show-guide').onclick=()=>$('#guide-dialog').showModal();$('#close-guide').onclick=()=>$('#guide-dialog').close();$('#close-work').onclick=()=>$('#work-dialog').close();
$('#work-dialog').addEventListener('close',()=>{const v=$('#work-media video');v?.pause();$('#work-media').replaceChildren();if(state.workUrl){URL.revokeObjectURL(state.workUrl);state.workUrl=null;}});
$('#download-work').onclick=()=>{if(state.currentWork)downloadBlob(state.currentWork.blob,state.currentWork.filename);};
$('#rename-work').onclick=async()=>{const w=state.currentWork;if(!w)return;w.title=$('#work-title').value.trim()||w.title;try{w.saved=await gallery.put({...w,saved:true});await refreshGallery();toast(w.saved?'名称已保存。':'名称已临时修改，请下载备份。');}catch(err){toast(errorText(err),true);}};
$('#delete-work').onclick=async()=>{const w=state.currentWork;if(!w)return;if(!await confirmAction('删除这段城市回忆？','这会从当前浏览器永久删除该作品。已下载的文件不会受影响。'))return;try{await gallery.remove(w.id);$('#work-dialog').close();state.currentWork=null;await refreshGallery();toast('作品已删除。');}catch(err){toast(errorText(err),true);}};
$('#load-sample-model').onclick=()=>void loadModelUrl('/assets/seedpod.glb','原创建模样例 · 非 Tripo').catch(err=>toast(errorText(err),true));
$('#import-model').onclick=()=>$('#model-file').click();$('#model-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>24*1024*1024)throw new Error('请导入不超过 24 MB 的 GLB。');await loadModelBuffer(await file.arrayBuffer(),file.name);}catch(err){toast(errorText(err),true);}};
$('#apply-model').onclick=()=>{if(!state.viewer?.ready)return;renderer.asset=state.viewer;$('#clear-model').hidden=false;goPage('studio');if(renderer.scene==='building'){state.effect='tree';$$('.effect-option').forEach(el=>el.classList.toggle('selected',el.dataset.effect==='tree'));applyScene('tree');}toast('3D 资产已用于画面区域合成。它不是固定在现实空间的 AR 锚点。');};
$('#clear-model').onclick=()=>{renderer.asset=null;$('#clear-model').hidden=true;toast('已恢复程序化泡泡。');};
$('#tripo-form').onsubmit=e=>{e.preventDefault();void createJob('tripo');};$('#world-form').onsubmit=e=>{e.preventDefault();void createJob('world');};
$('#refresh-services').onclick=async()=>{await refreshServices();await refreshJobs();toast(state.backend?'已刷新服务状态。':'当前为独立预览模式。');};$('#admin-token').addEventListener('change',()=>void refreshJobs());
$('#cloud-consent').onchange=()=>renderServiceStatus();$('#start-live').onclick=async()=>{
  if(!state.config?.providers?.decart||!$('#cloud-consent').checked)return;
  if(!await confirmAction('把当前画面交给云端生成？',`当前画面会通过 WebRTC 发送给 Decart，产生真实服务商费用。\n该会话最多 ${state.config.maxSessionSeconds} 秒，不自动重连。禁止把未获授权的私人画面发送给云服务。`))return;
  try{goPage('studio');lastPrompt=EFFECTS[renderer.scene].prompt;await live.connect({rawCanvas:renderer.raw,config:state.config,api,prompt:lastPrompt});}catch(err){toast(errorText(err),true);}
};$('#stop-live').onclick=()=>live.disconnect();$('#studio-stop-live').onclick=()=>live.disconnect();
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||$$('dialog').some(d=>d.open)||state.page!=='studio')return;if(e.code==='Space'){e.preventDefault();setHolding(true);}if(e.code==='KeyO'&&!state.capturing)renderer.compare=true;});
window.addEventListener('keyup',e=>{if(e.code==='Space')setHolding(false);if(e.code==='KeyO')renderer.compare=false;});window.addEventListener('blur',()=>{setHolding(false);renderer.compare=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){renderer.stop();setHolding(false);recorder.stop();live.disconnect();semantic.invalidate();if(media.kind==='camera')media.clear();}else{renderer.start();if(!media.element)void loadDemo();}});
window.addEventListener('pagehide',()=>{renderer.stop();media.clear();semantic.stop();live.disconnect();recorder.stop();});
window.addEventListener('beforeunload',e=>{if(state.capturing){e.preventDefault();e.returnValue='';}});
setInterval(()=>{
  if(document.hidden)return;
  const now=performance.now();
  if(media.kind!=='demo'&&media.ready()&&now-lastAnalysis>850){
    lastAnalysis=now;const image=renderer.sample();
    if(state.semantic&&semantic.ready)semantic.infer(image);
    else updateMask(classifyPixels(image.data,image.width,image.height),image.width,image.height,'heuristic');
  }
  $('#energy-fill').style.width=`${Math.round(renderer.energy*100)}%`;$('#frame-metric').textContent=`${renderer.fps} FPS`;
  const c=renderer.coverage||{};$('#telemetry').textContent=`区域覆盖（不是置信度）\n树 ${Math.round((c.tree||0)*100)}% · 楼 ${Math.round((c.building||0)*100)}% · 天 ${Math.round((c.sky||0)*100)}%\n渲染 ${renderer.renderMs.toFixed(1)} ms / 帧${state.semanticMs?` · 模型 ${state.semanticMs} ms`:''}\n${renderer.maskSource==='preset'?'预设演示：蒙版与插画对应':'2D 区域合成：无深度，无 SLAM'}${live.active?`\n云会话 ${Math.max(0,Math.floor((now-(live.started||now))/1000))} 秒`:''}`;
  if(recorder.active){const sec=Math.floor((now-recorder.started)/1000);$('#record-time').textContent=`00:${String(sec).padStart(2,'0')}`;}
  if(state.page==='connections'){state.viewer?.render(now/1000);if(now-lastJobRefresh>3500){lastJobRefresh=now;void refreshJobs();}}
},100);
async function init(){renderer.start();await loadDemo();await refreshServices();await refreshGallery();}
void init().catch(err=>toast(errorText(err),true));
