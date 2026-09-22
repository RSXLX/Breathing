import { filenameFor } from './domain.js';

export class MediaInput {
  constructor(){this.element=null;this.stream=null;this.url=null;this.kind='none';this.label='';this.generation=0;}
  clear(){this.generation++;if(this.stream)this.stream.getTracks().forEach(t=>t.stop());if(this.element instanceof HTMLVideoElement){this.element.pause();this.element.srcObject=null;this.element.removeAttribute('src');this.element.load();}if(this.url)URL.revokeObjectURL(this.url);this.stream=null;this.url=null;this.element=null;}
  async demo(src,label){this.clear();const generation=this.generation;const img=new Image();img.src=src;await img.decode();if(generation!==this.generation)return;this.element=img;this.kind='demo';this.label=label;}
  async camera(){
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)throw new Error('相机需要 HTTPS 或本机 localhost。也可以先导入视频。');
    this.clear();const generation=this.generation;
    let stream;
    try {stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});}
    catch(err){throw new Error(err.name==='NotAllowedError'?'未获得相机权限，请在浏览器设置中允许，或导入视频。':err.name==='NotFoundError'?'未找到摄像头，请导入视频或使用演示场景。':'相机无法打开，可能被其他应用占用。');}
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.stream=stream;const video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play();
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.element=video;this.kind='camera';this.label='实时相机 · 仅本机处理';
  }
  async file(file){
    if(!file || file.size>200*1024*1024)throw new Error('请选择不超过 200 MB 的视频或图片。');
    if(!/^image\/(jpeg|png|webp)$/.test(file.type) && !/^video\//.test(file.type))throw new Error('支持常见视频及 JPG / PNG / WebP 图片。');
    this.clear();const generation=this.generation;this.url=URL.createObjectURL(file);
    if(file.type.startsWith('image/')){const img=new Image();img.src=this.url;try{await img.decode();}catch{this.clear();throw new Error('图片无法解码。');}if(generation!==this.generation)return;this.element=img;this.kind='image';}
    else{const video=document.createElement('video');video.muted=true;video.playsInline=true;video.loop=true;video.src=this.url;
      try{await video.play();}catch{this.clear();throw new Error('浏览器无法播放此视频，请换用 H.264 MP4 或 WebM。');}
      if(generation!==this.generation){video.pause();return;}this.element=video;this.kind='video';}
    this.label=file.name;
  }
  ready(){return this.element && (this.element instanceof HTMLImageElement ? this.element.complete && this.element.naturalWidth>0 : this.element.readyState>=2);}
  size(){return {w:this.element?.videoWidth||this.element?.naturalWidth||1280,h:this.element?.videoHeight||this.element?.naturalHeight||720};}
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function canvasBlob(canvas,type='image/png',quality=.92){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('导出失败，请重试。')),type,quality));}
export class CanvasRecorder {
  constructor(){this.recorder=null;this.stream=null;this.promise=null;}
  start(canvas,maxSeconds=10){
    if(this.recorder)throw new Error('正在录制');
    if(!canvas.captureStream || !window.MediaRecorder)throw new Error('浏览器不支持画布录制。请使用桌面 Chrome，或先保存图片。');
    const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
    const mime=types.find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw new Error('没有可用的视频编码器。');
    this.stream=canvas.captureStream(30);const chunks=[];
    try {this.recorder=new MediaRecorder(this.stream,{mimeType:mime,videoBitsPerSecond:6000000});}
    catch{this.stream.getTracks().forEach(t=>t.stop());this.stream=null;throw new Error('无法启动视频编码器。');}
    this.started=performance.now();
    this.promise=new Promise((resolve,reject)=>{
      this.recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      this.recorder.onerror=()=>{clearTimeout(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.recorder=null;reject(new Error('录制中断。'));};
      this.recorder.onstop=()=>{clearTimeout(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.recorder=null;
        const blob=new Blob(chunks,{type:mime});if(!blob.size)return reject(new Error('没有捕获到视频帧。'));
        resolve({blob,duration:(performance.now()-this.started)/1000,mime,filename:filenameFor('video',mime.includes('mp4')?'mp4':'webm')});};
    });
    this.recorder.start(250);this.timer=setTimeout(()=>this.stop(),maxSeconds*1000);return this.promise;
  }
  stop(){if(this.recorder?.state==='recording')this.recorder.stop();return this.promise;}
  get active(){return !!this.recorder;}
}
