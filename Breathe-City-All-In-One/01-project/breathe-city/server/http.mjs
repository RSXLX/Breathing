import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { publicConfig } from './config.mjs';

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary','.webm':'video/webm','.ico':'image/x-icon' };
const fail = (status, message) => Object.assign(new Error(message), { status });
const equal = (a,b) => { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
export async function readJson(req, max=16384) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415,'需要 application/json');
  if (Number(req.headers['content-length']) > max) { req.resume(); throw fail(413,'请求太大'); }
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size>max) throw fail(413,'请求太大'); chunks.push(chunk); }
  try { const value=JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value!=='object' || Array.isArray(value)) throw 0; return value; }
  catch { throw fail(400,'JSON 格式无效'); }
}
export function validateJob(body) {
  if (!['tripo','world'].includes(body.kind) || !['demo','real'].includes(body.mode)) throw fail(400,'未知任务类型或模式');
  if (typeof body.prompt!=='string' || body.prompt.trim().length<3 || body.prompt.length>1000) throw fail(400,'提示词长度应为 3–1000 字符');
  if(typeof body.idempotencyKey!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) throw fail(400,'幂等键无效');
  return { kind:body.kind, mode:body.mode, prompt:body.prompt.trim(), idempotencyKey:body.idempotencyKey };
}
export function createHttpApp({ config, store, providers, publicDir, generationApp }) {
  const staticRoot=resolve(publicDir);
  const limits = new Map();
  const allowedOrigins=new Set([config.origin]);
  if(['127.0.0.1','localhost','::1'].includes(config.host)) {
    allowedOrigins.add(`http://127.0.0.1:${config.port}`); allowedOrigins.add(`http://localhost:${config.port}`);
  }
  function authenticate(req, required=false) {
    if (!config.adminToken) { if(required) throw fail(403,'请在服务端配置 ADMIN_TOKEN'); return; }
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    if(!equal(token,config.adminToken)) throw fail(401,'请输入正确的本地管理令牌');
  }
  function checkMutation(req) {
    if(req.headers['x-breathe-request']!=='1') throw fail(403,'请求来源无效');
    const origin=req.headers.origin;
    if(origin && !allowedOrigins.has(origin)) throw fail(403,'来源不在 PUBLIC_ORIGIN 白名单');
    const ip=req.socket.remoteAddress||'unknown', now=Date.now();
    let hit=limits.get(ip); if(!hit || now-hit.start>60000) hit={start:now,n:0};
    if(++hit.n>40) throw fail(429,'操作过于频繁，请稍后重试');
    limits.set(ip,hit);
    if(limits.size>1000) for(const [k,v] of limits) if(now-v.start>60000) limits.delete(k);
  }
  const server=createServer(async (req,res)=>{
    const requestId=randomUUID();
    res.setHeader('X-Request-ID',requestId);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net https://esm.sh https://*.huggingface.co https://huggingface.co https://*.hf.co https://*.xethub.hf.co https://*.decart.ai wss://*.decart.ai https://*.tripo3d.ai; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    try {
      const path=new URL(req.url,'http://local').pathname;
      if(generationApp && await generationApp.handle(req,res,path))return;
      if(path.startsWith('/api/')) {
        if(req.method==='GET' && path==='/api/health') return json(200,{ok:true,version:'0.1.0'});
        if(req.method==='GET' && path==='/api/config') return json(200,publicConfig(config));
        if(req.method==='GET' && path==='/api/jobs') { authenticate(req); return json(200,{jobs:store.list()}); }
        if(req.method==='POST') {
          checkMutation(req); authenticate(req);
          const body=await readJson(req);
          if(path==='/api/jobs') {
            const input=validateJob(body);
            if(input.mode==='real') {
              authenticate(req,true);
              if(!config.allowPaid || !(input.kind==='tripo' ? config.tripoKey:config.worldKey)) throw fail(409,'真实服务未配置；不会自动伪造结果');
              if(body.confirmed!==true) throw fail(400,'请确认该操作会调用付费服务');
            }
            return json(202,store.create(input,config.maxJobs));
          }
          if(path==='/api/realtime/token') {
            authenticate(req,true);
            if(!config.allowPaid || !config.decartKey) throw fail(409,'实时生成服务尚未启用');
            if(body.confirmed!==true) throw fail(400,'需要主动确认视频传输和计费');
            store.reserveToken(config.maxTokens);
            return json(200,await providers.token());
          }
          const match=path.match(/^\/api\/jobs\/([a-f0-9-]{36})\/(stop|resume|attach)$/);
          if(match) {
            const job=store.get(match[1]); if(!job) throw fail(404,'任务不存在');
            if(match[2]==='stop') {
              if(job.state==='submitting') throw fail(409,'提交正在进行，请等到返回任务 ID 后停止跟踪');
              if(!['queued','polling','needs_review'].includes(job.state)) throw fail(409,'该任务无法停止');
              return json(200,{job:store.patch(job.id,{state:job.state==='queued'?'cancelled':'monitoring_stopped',error:'仅停止本地跟踪；已经提交的云端任务不会被取消或退款。'})});
            }
            if(!['needs_review','monitoring_stopped'].includes(job.state)) throw fail(409,'任务不需要恢复');
            let id=job.providerId;
            if(match[2]==='attach') {
              if(typeof body.providerId!=='string' || !/^[A-Za-z0-9_-]{1,150}$/.test(body.providerId)) throw fail(400,'服务商任务 ID 无效');
              id=body.providerId;
            }
            if(!id && job.mode==='real') throw fail(409,'请先在服务商控制台核对并关联任务 ID');
            return json(200,{job:store.patch(job.id,{state:'polling',providerId:id,error:null,pollStartedAt:Date.now(),nextPollAt:Date.now()})});
          }
        }
        throw fail(404,'接口不存在');
      }
      if(!['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed');
      let name;
      try { name=decodeURIComponent(path); } catch { throw fail(400,'Invalid path'); }
      if(name.includes('\0') || name.split('/').some(p=>p.startsWith('.'))) throw fail(404,'Not found');
      if(name==='/') name='/index.html';
      const candidate=resolve(staticRoot,'.'+name);
      if(!candidate.startsWith(staticRoot+sep)) throw fail(404,'Not found');
      let actual, info;
      try { actual=await realpath(candidate); info=await stat(actual); } catch { throw fail(404,'Not found'); }
      if(!actual.startsWith(staticRoot+sep) || !info.isFile()) throw fail(404,'Not found');
      res.writeHead(200,{'Content-Type':MIME[extname(actual)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache'});
      if(req.method==='HEAD') return res.end();
      createReadStream(actual).on('error',()=>res.destroy()).pipe(res);
    } catch(err) {
      const status=err.status || 502;
      // Provider errors are authored locally and contain neither secrets nor raw upstream payloads.
      json(status,{error:status<500 ? err.message : '服务请求失败，请检查网络、配置或服务商控制台。',requestId});
    }
  });
  server.requestTimeout=25000; server.headersTimeout=10000;
  return server;
}
