import { apiError } from './generation-store.mjs';
export class VideoProvider {
  constructor(config,media,fetcher=fetch){this.config=config;this.media=media;this.fetcher=fetcher;}
  async json(path,body){
    let res;try{res=await this.fetcher(`https://api.dev.runwayml.com/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.config.key}`,'X-Runway-Version':'2024-11-06','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Object.assign(new Error('PROVIDER_UNCERTAIN'),{ambiguous:!!body,retryable:true});}
    if(!res.ok)throw Object.assign(new Error(`PROVIDER_HTTP_${res.status}`),{ambiguous:!!body&&res.status>=500,retryable:res.status===429||res.status>=500});
    try{return await res.json();}catch{throw Object.assign(new Error('PROVIDER_INVALID_RESPONSE'),{ambiguous:!!body,retryable:true});}
  }
  async submit(job){
    const s=job.snapshot,row=this.media.store.media(job.owner,s.mediaId),buffer=await this.media.bytes(row);
    const promptImage=`data:${row.mime};base64,${buffer.toString('base64')}`;
    if(Buffer.byteLength(promptImage)>5*1024*1024)throw apiError(413,'PROVIDER_IMAGE_TOO_LARGE','画面超过云模型输入限制，请缩小后重试');
    const names={breathe:'gently expand and contract the original surface as if breathing',sway:'gently sway the original object while keeping its attachment stable',ripple:'create a subtle ripple deformation in the original surface'};
    const points=s.selection;const bounds={left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))};
    const prompt=`Locked camera. In the normalized region ${JSON.stringify(bounds)}, ${names[s.parameters.motion]}. Subtle intensity ${s.parameters.intensity}, cycle ${s.parameters.cycle} seconds. Preserve the identity, material and architecture of the original object. Preserve people, signage, text and background. Do not add new objects or move the camera. No captions.`;
    const r=await this.json('/image_to_video',{model:s.model,promptImage,promptText:prompt,ratio:s.ratio==='9:16'?'720:1280':'1280:720',duration:s.duration});
    if(typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(r.id))throw Object.assign(new Error('PROVIDER_ID_MISSING'),{ambiguous:true});return r.id;
  }
  async poll(id){
    if(!/^[a-zA-Z0-9_-]{1,150}$/.test(id||''))throw apiError(400,'PROVIDER_ID_INVALID','任务 ID 无效');const r=await this.json(`/tasks/${id}`);
    if(r.status==='SUCCEEDED'){if(typeof r.output?.[0]!=='string')throw new Error('PROVIDER_OUTPUT_MISSING');return {state:'succeeded',url:r.output[0]};}
    if(['FAILED','CANCELED','CANCELLED'].includes(r.status))return {state:'failed'};
    if(['PENDING','RUNNING','THROTTLED'].includes(r.status))return {state:'running'};
    throw new Error('PROVIDER_STATUS_UNKNOWN');
  }
}
