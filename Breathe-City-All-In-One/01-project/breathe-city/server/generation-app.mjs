import { videoConfig } from './video-config.mjs';
import { GenerationStore,apiError,equal } from './generation-store.mjs';
import { MediaStore } from './media-store.mjs';
import { VideoProvider } from './video-provider.mjs';
import { GenerationWorker } from './generation-worker.mjs';
export async function readLimited(req,limit){
  if(Number(req.headers['content-length'])>limit){req.resume();throw apiError(413,'BODY_TOO_LARGE','请求过大');}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw apiError(413,'BODY_TOO_LARGE','请求过大');chunks.push(chunk);}return Buffer.concat(chunks);
}
async function jsonBody(req){if(!(req.headers['content-type']||'').startsWith('application/json'))throw apiError(415,'JSON_REQUIRED','需要 JSON 请求');try{const value=JSON.parse(await readLimited(req,16384));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch(e){if(e.status)throw e;throw apiError(400,'JSON_INVALID','JSON 无效');}}
const publicMedia=m=>({id:m.id,mime:m.mime,width:m.width,height:m.height,duration:m.duration,size:m.size,expiresAt:m.expires_at,provenance:m.provenance});
export const publicJob=j=>({id:j.id,state:j.state,stage:j.state,createdAt:j.created_at,updatedAt:j.updated_at,elapsedMs:(['succeeded','failed','cancelled'].includes(j.state)?j.updated_at:Date.now())-j.created_at,sourceMediaId:j.snapshot.mediaId,settings:{ratio:j.snapshot.ratio==='9:16'?'portrait':'landscape',focus:{x:.5,y:.5},polygon:j.snapshot.selection,parameters:j.snapshot.parameters},resultMediaId:j.result_media_id,error:j.error_code?{code:j.error_code,message:'请检查任务状态，必要时由管理员核对服务商记录。'}:null,presetId:j.snapshot.presetId,inputMode:j.snapshot.inputMode,actions:{stop:['queued','running','needs_review'].includes(j.state),resume:['monitoring_stopped','needs_review','ingest_failed'].includes(j.state)&&!!j.provider_id}});
export async function createGenerationApp(baseConfig,{config=videoConfig(),store,media,provider,worker}={}){
  store??=new GenerationStore(config.dataDir,config);media??=new MediaStore(config.dataDir,store);await media.init();provider??=new VideoProvider(config,media);worker??=new GenerationWorker(store,media,provider);
  const limits=new Map();let cleanupTimer=null,cleaning=null;const cleanup=()=>{if(!cleaning)cleaning=media.cleanup().catch(()=>{}).finally(()=>cleaning=null);return cleaning;};
  function mutation(req){
    if(req.headers['x-breathe-request']!=='1')throw apiError(403,'REQUEST_MARKER','请求来源无效');
    if(req.headers.origin&&req.headers.origin!==baseConfig.origin)throw apiError(403,'ORIGIN_DENIED','请求来源无效');
    const ip=req.socket.remoteAddress,now=Date.now(),hit=limits.get(ip);if(!hit||now-hit.since>60000)limits.set(ip,{since:now,n:1});else if(++hit.n>40)throw apiError(429,'RATE_LIMITED','操作过于频繁');
    if(limits.size>1000)for(const [key,value]of limits)if(now-value.since>60000)limits.delete(key);
  }
  function authenticate(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('breathe_session='))?.slice(16);return store.authenticate(token);}
  function csrf(req,session){if(!equal(req.headers['x-csrf-token'],session.csrf))throw apiError(403,'CSRF_INVALID','请刷新会话后重试');}
  async function handle(req,res,path){
    if(!path.startsWith('/api/v1/'))return false;
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      const method=req.method;if(method==='GET'&&path==='/api/v1/config'){send(200,{version:'0.2.0',videoGenerationEnabled:config.enabled,inviteConfigured:!!config.inviteHash,inputModes:['image','video-frame'],limits:{imageBytes:15*1024*1024,imagePixels:20e6},presets:['breathe','sway','ripple']});return true;}
      if(method==='GET'&&path==='/api/v1/ready'){await media.ready();send(200,{ok:true});return true;}
      if(!['GET','HEAD'].includes(method))mutation(req);
      if(method==='POST'&&path==='/api/v1/session'){const body=await jsonBody(req);let current;try{current=authenticate(req);}catch(error){if(error.status!==401)throw error;}if(current){send(200,{sessionId:current.id,csrf:current.csrf,expiresAt:current.expires_at});return true;}const session=store.session(body.invite);res.setHeader('Set-Cookie',`breathe_session=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=691200${baseConfig.origin.startsWith('https:')?'; Secure':''}`);send(201,{sessionId:session.id,csrf:session.csrf,expiresAt:session.expiresAt});return true;}
      const session=authenticate(req);if(!['GET','HEAD'].includes(method))csrf(req,session);
      if(method==='GET'&&path==='/api/v1/session'){send(200,{sessionId:session.id,csrf:session.csrf,expiresAt:session.expires_at});return true;}
      if(method==='POST'&&path==='/api/v1/media'){
        if(!(req.headers['content-type']||'').startsWith('multipart/form-data'))throw apiError(415,'MULTIPART_REQUIRED','请使用文件上传');
        const buffer=await readLimited(req,16*1024*1024);let form;try{form=await new Request('http://localhost',{method:'POST',headers:{'Content-Type':req.headers['content-type']},body:buffer}).formData();}catch{throw apiError(400,'MULTIPART_INVALID','文件上传格式无效');}
        const file=form.get('file');if(!file||typeof file.arrayBuffer!=='function')throw apiError(400,'FILE_REQUIRED','缺少文件');
        const count=store.db.prepare("SELECT COUNT(*) AS n FROM media WHERE owner=? AND state='ready'").get(session.id).n;if(count>=30)throw apiError(429,'MEDIA_QUOTA','当前会话素材过多，请清理');
        const row=await media.image(session.id,Buffer.from(await file.arrayBuffer()));send(201,{media:publicMedia(row)});return true;
      }
      const content=path.match(/^\/api\/v1\/media\/([a-f0-9-]+)\/content$/);
      if(content&&['GET','HEAD'].includes(method)){
        const row=store.media(session.id,content[1]),buffer=await media.bytes(row);let start=0,end=buffer.length-1,status=200;
        if(req.headers.range){const match=req.headers.range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))throw apiError(416,'RANGE_INVALID','范围无效');if(!match[1])start=Math.max(0,buffer.length-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}if(start>end||start>=buffer.length){res.setHeader('Content-Range',`bytes */${buffer.length}`);throw apiError(416,'RANGE_INVALID','范围无效');}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${buffer.length}`);}
        res.writeHead(status,{'Content-Type':row.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store'});res.end(method==='HEAD'?undefined:buffer.subarray(start,end+1));return true;
      }
      const mediaId=path.match(/^\/api\/v1\/media\/([a-f0-9-]+)$/);if(mediaId&&method==='DELETE'){await media.remove(session.id,mediaId[1]);res.writeHead(204);res.end();return true;}
      if(method==='POST'&&path==='/api/v1/quotes'){send(201,store.quote(session.id,await jsonBody(req)));return true;}
      if(method==='POST'&&path==='/api/v1/generations'){
        const body=await jsonBody(req),key=req.headers['idempotency-key'];
        try{const result=store.create(session.id,key,body);send(202,{job:publicJob(result.job),reused:result.reused});}
        catch(error){
          // Only a completed store lookup can prove absence. Middleware/network errors cannot.
          if(error.status&&error.status<500&&typeof key==='string'&&!store.db.prepare('SELECT id FROM generations WHERE owner=? AND idem=?').get(session.id,key))error.noJobCreated=true;
          throw error;
        }
        return true;
      }
      if(method==='GET'&&path==='/api/v1/generations'){const cursor=new URL(req.url,'http://local').searchParams.get('cursor');if(cursor&&!/^\d{1,16}$/.test(cursor))throw apiError(400,'CURSOR_INVALID','分页参数无效');const result=store.list(session.id,cursor);send(200,{...result,items:result.items.map(publicJob)});return true;}
      const job=path.match(/^\/api\/v1\/generations\/([a-f0-9-]+)(?:\/(stop|resume|reconcile))?$/);
      if(job){if(method==='GET'&&!job[2]){send(200,{job:publicJob(store.job(session.id,job[1]))});return true;}
        if(method==='POST'&&['stop','resume'].includes(job[2])){await jsonBody(req);send(200,{job:publicJob(store[job[2]](session.id,job[1]))});return true;}
        if(method==='POST'&&job[2]==='reconcile'){
          if(!baseConfig.adminToken||!equal(req.headers.authorization,`Bearer ${baseConfig.adminToken}`))throw apiError(403,'ADMIN_REQUIRED','需要管理员核对');
          const body=await jsonBody(req),current=store.job(session.id,job[1]);if(!['needs_review','monitoring_stopped','failed','succeeded'].includes(current.state))throw apiError(409,'STATE_CONFLICT','当前状态不需要核对');
          store.transaction(()=>{if(body.providerId&&body.confirmedNotCreated===true)throw apiError(400,'RECONCILE_CONFLICT','不能同时关联任务与确认未创建');if(body.providerId){if(!/^[a-zA-Z0-9_-]{1,150}$/.test(body.providerId)||current.provider_id&&current.provider_id!==body.providerId)throw apiError(409,'PROVIDER_ID_CONFLICT','任务 ID 不匹配');store.patch(current.id,{state:'running',provider_id:body.providerId,next_poll_at:Date.now(),poll_started_at:Date.now(),error_code:null});}
            if(body.confirmedNotCreated===true){if(current.provider_id)throw apiError(409,'PROVIDER_ID_EXISTS','已有服务商 ID，不能确认未创建');store.patch(current.id,{state:'failed',error_code:'CONFIRMED_NOT_CREATED'});store.db.prepare("UPDATE budget_entries SET state='released',actual=0 WHERE job_id=?").run(current.id);}
            if(body.actualCostUnits!==undefined){if(!Number.isSafeInteger(body.actualCostUnits)||body.actualCostUnits<0)throw apiError(400,'COST_INVALID','费用无效');store.db.prepare("UPDATE budget_entries SET actual=?,state='reconciled' WHERE job_id=?").run(body.actualCostUnits,current.id);store.audit(current.id,'cost_reconciled');}});send(200,{job:publicJob(store.job(session.id,job[1]))});return true;
        }
      }
      if(method==='DELETE'&&path==='/api/v1/session/data'){
        // Revoke synchronously before filesystem awaits; late uploads cannot reintroduce data.
        store.revokeData(session.id);
        let pending=false;try{await media.cleanup();}catch{pending=true;}
        pending ||= !!store.db.prepare("SELECT id FROM media WHERE owner=? AND state='ready'").get(session.id);
        res.setHeader('Set-Cookie','breathe_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
        send(pending?202:200,{deleted:!pending,pending,accessRevoked:true,upstreamRetention:'第三方保留策略需另行核对'});return true;
      }
      throw apiError(404,'NOT_FOUND','接口不存在');
    }catch(error){const status=error.status||((/选区|动作/.test(error.message))?400:500);send(status,{error:{code:error.code||'REQUEST_FAILED',message:status<500?error.message:'服务暂时不可用，请稍后重试',retryable:status>=500,...(error.noJobCreated?{noJobCreated:true}:{})},requestId:res.getHeader('X-Request-ID')});return true;}
  }
  return {handle,store,media,worker,start:()=>{worker.start();cleanupTimer=setInterval(()=>void cleanup(),60000);cleanupTimer.unref();void cleanup();},close:async()=>{clearInterval(cleanupTimer);await worker.stop();if(cleaning)await cleaning;store.close();}};
}
