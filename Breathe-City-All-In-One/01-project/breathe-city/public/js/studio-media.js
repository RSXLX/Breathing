export function waitEvent(target,type,timeout=15000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>end(new Error('媒体加载超时，请重试')),timeout);const good=()=>end();const bad=()=>end(new Error('浏览器无法解码这个文件'));function end(error){clearTimeout(timer);target.removeEventListener(type,good);target.removeEventListener('error',bad);error?reject(error):resolve();}target.addEventListener(type,good,{once:true});target.addEventListener('error',bad,{once:true});});}
export function blobFromCanvas(canvas,type='image/jpeg'){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('画面导出失败')),type,.94));}
export class StudioInput {
  constructor(){this.source=null;this.originalBlob=null;this.url=null;this.stream=null;this.kind='none';this.epoch=0;}
  clear(){this.epoch++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.source instanceof HTMLVideoElement){this.source.pause();this.source.srcObject=null;this.source.removeAttribute('src');this.source.load();}this.source=null;if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.originalBlob=null;this.kind='none';}
  async load(blob){
    // Decode a replacement before discarding a usable input or its camera track.
    const candidate=new StudioInput(),epoch=this.epoch;
    try{
      await candidate.loadDirect(blob);
      if(epoch!==this.epoch){candidate.clear();return false;}
      this.clear();this.source=candidate.source;this.originalBlob=candidate.originalBlob;this.url=candidate.url;this.kind=candidate.kind;
      return true;
    }catch(error){candidate.clear();throw error;}
  }
  async loadDirect(blob){
    if(!blob)throw new Error('请选择文件');const video=blob.type.startsWith('video/');
    if(!video&&!/^image\/(jpeg|png|webp|svg\+xml)$/.test(blob.type))throw new Error('支持 JPG、PNG、WebP 和可解码的视频');
    if(blob.size>(video?50:15)*1024*1024)throw new Error(video?'视频需小于 50 MB':'图片需小于 15 MB');
    this.clear();const epoch=this.epoch;this.originalBlob=blob;this.url=URL.createObjectURL(blob);
    try{
      if(video){const element=document.createElement('video');this.source=element;element.muted=true;element.playsInline=true;element.preload='auto';const ready=waitEvent(element,'loadeddata');element.src=this.url;await ready;
        if(epoch!==this.epoch)return false;
        if(!Number.isFinite(element.duration)||element.duration>30)throw new Error('请选择 30 秒以内的视频');this.kind='video';
      }else{const element=new Image();this.source=element;element.src=this.url;await element.decode();if(epoch!==this.epoch)return false;this.kind='image';}
      if(epoch!==this.epoch)return false;const {w,h}=this.size();if(w*h>20e6||!w||!h)throw new Error('素材分辨率超过 2000 万像素或无法读取');return true;
    }catch(error){if(epoch===this.epoch)this.clear();throw error;}
  }
  async camera(){
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('相机需要 HTTPS 或本机 localhost，也可导入素材');
    this.clear();const epoch=this.epoch;let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});}
    catch{throw new Error('相机未打开，请检查权限或导入素材');}
    if(epoch!==this.epoch||document.hidden){stream.getTracks().forEach(t=>t.stop());return false;}
    this.stream=stream;const element=document.createElement('video');this.source=element;element.muted=true;element.playsInline=true;element.srcObject=stream;
    try{await element.play();}catch{this.clear();throw new Error('相机无法播放，请重试');}
    if(epoch!==this.epoch||document.hidden){stream.getTracks().forEach(t=>t.stop());if(epoch===this.epoch)this.clear();return false;}
    this.kind='camera';return true;
  }
  size(){const s=this.source;return {w:s?.videoWidth||s?.naturalWidth||s?.width||0,h:s?.videoHeight||s?.naturalHeight||s?.height||0};}
  async seek(seconds){if(this.kind!=='video')return;const v=this.source,t=Math.max(0,Math.min(v.duration-.001,seconds));v.pause();if(Math.abs(v.currentTime-t)<.001&&v.readyState>=2)return;const wait=waitEvent(v,'seeked');v.currentTime=t;await wait;}
  async frame(){const {w,h}=this.size();const c=document.createElement('canvas'),scale=Math.min(1,1920/Math.max(w,h));c.width=Math.round(w*scale);c.height=Math.round(h*scale);c.getContext('2d').drawImage(this.source,0,0,c.width,c.height);return blobFromCanvas(c);}
}
export function saveDownload(blob,name){if(window.BreatheNative?.isNative())return window.BreatheNative.share(blob,name);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function recordMotion(canvas,render,{duration,signal,onProgress}){
  if(!canvas.captureStream||!globalThis.MediaRecorder)throw new Error('浏览器不支持视频录制，请尝试其他浏览器');
  const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime)throw new Error('当前没有可用的视频编码器');
  const stream=canvas.captureStream(30);let recorder;try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000});}catch{stream.getTracks().forEach(t=>t.stop());throw new Error('无法启动视频编码器');}
  return new Promise((resolve,reject)=>{
    let chunks=[],raf=0,started,aborted=false,finished=false;
    const cleanup=()=>{cancelAnimationFrame(raf);stream.getTracks().forEach(t=>t.stop());signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',hidden);};
    const fail=message=>{if(finished)return;aborted=true;finished=true;cleanup();if(recorder.state!=='inactive')recorder.stop();reject(new Error(message));};
    const abort=()=>fail('录制已取消，未保存不完整片段');const hidden=()=>{if(document.hidden)fail('切到后台使录制中断，请回到页面重试');};
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>fail('编码器错误，未保存不完整片段');
    recorder.onstop=()=>{if(aborted)return;finished=true;cleanup();const blob=new Blob(chunks,{type:recorder.mimeType||mime});if(!blob.size)return reject(new Error('录制没有有效画面'));resolve({blob,mime:blob.type,duration,filename:`breathe-city-${Date.now()}.${blob.type.includes('mp4')?'mp4':'webm'}`});};
    signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);
    if(signal?.aborted)return abort();
    const tick=now=>{if(finished)return;started??=now;const elapsed=(now-started)/1000;try{render(Math.min(elapsed,duration));onProgress?.(Math.min(elapsed/duration,1));}catch{fail('画面渲染失败');return;}if(elapsed>=duration){recorder.stop();return;}raf=requestAnimationFrame(tick);};
    if(document.hidden)return hidden();
    try{render(0);recorder.start(200);raf=requestAnimationFrame(tick);}catch{fail('录制无法启动');}
  });
}
