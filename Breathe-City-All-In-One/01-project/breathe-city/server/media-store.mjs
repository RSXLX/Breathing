import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,writeFile,readFile,unlink,rename,stat,access,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList,isIP } from 'node:net';
import { constants } from 'node:fs';
import { apiError,hash } from './generation-store.mjs';
const run=promisify(execFile),blocked=new BlockList();
for(const [ip,mask]of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(ip,mask,'ipv4');
for(const [ip,mask]of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]])blocked.addSubnet(ip,mask,'ipv6');
export function publicAddress(address){const family=isIP(address);if(!family)return false;if(address.toLowerCase().startsWith('::ffff:'))return false;return !blocked.check(address,family===4?'ipv4':'ipv6');}
export async function downloadResult(raw,hosts,{resolve=lookup,maxBytes=80*1024*1024}={}){
  let url;try{url=new URL(raw);}catch{throw new Error('INVALID_RESULT_URL');}
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||isIP(url.hostname)||!hosts.includes(url.hostname.toLowerCase()))throw new Error('RESULT_HOST_NOT_ALLOWED');
  const addresses=await resolve(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('PRIVATE_RESULT_ADDRESS');
  const address=addresses[0];
  // Pin the validated address; a second DNS resolution cannot redirect this request internally.
  return new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0;let deadline;const req=request(url,{method:'GET',lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family),timeout:30000},res=>{
      if(res.statusCode!==200){res.resume();req.destroy(new Error('RESULT_HTTP_ERROR'));return;}
      if(Number(res.headers['content-length'])>maxBytes){req.destroy(new Error('RESULT_TOO_LARGE'));return;}
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes)req.destroy(new Error('RESULT_TOO_LARGE'));else chunks.push(chunk);});res.on('end',()=>{clearTimeout(deadline);resolve(Buffer.concat(chunks));});res.on('error',e=>{clearTimeout(deadline);reject(e);});
    });deadline=setTimeout(()=>req.destroy(new Error('RESULT_DEADLINE')),45000);req.on('error',e=>{clearTimeout(deadline);reject(e);});req.on('timeout',()=>req.destroy(new Error('RESULT_TIMEOUT')));req.end();
  });
}
export class MediaStore {
  constructor(directory,store){this.directory=join(directory,'private-media');this.store=store;}
  async init(){await mkdir(this.directory,{recursive:true,mode:0o700});}
  async image(owner,buffer){
    if(buffer.length>15*1024*1024)throw apiError(413,'MEDIA_TOO_LARGE','图片超过 15 MB');
    let normalized,metadata;
    try{const source=sharp(buffer,{limitInputPixels:20e6,failOn:'warning'});metadata=await source.metadata();if(!['jpeg','png','webp'].includes(metadata.format)||metadata.pages>1)throw new Error();normalized=await source.rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).jpeg({quality:94}).toBuffer({resolveWithObject:true});}
    catch{throw apiError(415,'IMAGE_INVALID','图片无法解码、超出像素限制或格式不支持');}
    const name=randomUUID()+'.jpg',path=join(this.directory,name);await writeFile(path,normalized.data,{mode:0o600,flag:'wx'});
    try{return this.store.addMedia({owner,sha256:hash(normalized.data),mime:'image/jpeg',width:normalized.info.width,height:normalized.info.height,size:normalized.data.length,path:name,expiresAt:Date.now()+86400000,provenance:'user-upload'});}catch(e){await unlink(path);throw e;}
  }
  async bytes(row){try{return await readFile(join(this.directory,row.path));}catch{this.store.db.prepare("UPDATE media SET state='missing' WHERE id=?").run(row.id);throw apiError(410,'MEDIA_MISSING','媒体文件已不可用');}}
  async video(owner,buffer,provenance='runway-api'){
    if(buffer.length>80*1024*1024)throw new Error('VIDEO_TOO_LARGE');const temp=randomUUID()+'.tmp.mp4',path=join(this.directory,temp);await writeFile(path,buffer,{mode:0o600,flag:'wx'});
    try{
      const {stdout}=await run(ffprobe.path,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',path],{timeout:15000,maxBuffer:1024*1024});const metadata=JSON.parse(stdout),v=metadata.streams.find(s=>s.codec_type==='video');const duration=Number(metadata.format.duration);
      if(!v||!Number.isFinite(duration)||duration<1||duration>30||v.width*v.height>3840*2160)throw new Error('INVALID_VIDEO_METADATA');
      await run(ffmpeg,['-nostdin','-v','error','-xerror','-protocol_whitelist','file,pipe','-i',path,'-map','0:v:0','-an','-f','null','-'],{timeout:30000,maxBuffer:128*1024});
      const name=randomUUID()+'.mp4';await rename(path,join(this.directory,name));
      try{return this.store.addMedia({owner,sha256:hash(buffer),mime:'video/mp4',width:v.width,height:v.height,duration,size:buffer.length,path:name,expiresAt:Date.now()+7*86400000,provenance});}catch(e){await unlink(join(this.directory,name));throw e;}
    }finally{await unlink(path).catch(()=>{});}
  }
  async remove(owner,id){const row=this.store.media(owner,id);const reference=this.store.db.prepare("SELECT id FROM generations WHERE owner=? AND (json_extract(snapshot,'$.mediaId')=? OR result_media_id=?) AND state NOT IN ('failed','cancelled')").get(owner,id,id);if(reference)throw apiError(409,'MEDIA_REFERENCED','媒体仍被任务引用，请删除会话数据或等待到期');await unlink(join(this.directory,row.path)).catch(e=>{if(e.code!=='ENOENT')throw e;});this.store.db.prepare("UPDATE media SET state='deleted' WHERE id=?").run(id);}
  async cleanup(now=Date.now()){
    let deleted=0;
    for(const row of this.store.db.prepare("SELECT * FROM media WHERE state='ready' AND expires_at<=?").all(now)){
      const job=this.store.db.prepare("SELECT id,created_at,state FROM generations WHERE (json_extract(snapshot,'$.mediaId')=? OR result_media_id=?) AND state IN ('queued','submitting','running','ingesting','needs_review','monitoring_stopped','ingest_failed') ORDER BY created_at DESC LIMIT 1").get(row.id,row.id);
      const revoked=this.store.db.prepare('SELECT revoked FROM sessions WHERE id=?').get(row.owner)?.revoked;
      if(job&&!revoked&&now-job.created_at<48*3600000)continue;
      if(job&&['submitting','ingesting'].includes(job.state))continue;
      if(job&&!revoked)this.store.patch(job.id,{state:'needs_review',error_code:'INPUT_RETENTION_EXPIRED'});
      await unlink(join(this.directory,row.path)).catch(e=>{if(e.code!=='ENOENT')throw e;});
      this.store.db.prepare("UPDATE media SET state='expired' WHERE id=?").run(row.id);
      this.store.db.prepare('UPDATE generations SET result_media_id=NULL WHERE result_media_id=?').run(row.id);deleted++;
    }
    // Remove abandoned temporary downloads only after a full day.
    for(const name of await readdir(this.directory))if(name.endsWith('.tmp.mp4')){const file=join(this.directory,name),info=await stat(file);if(now-info.mtimeMs>86400000)await unlink(file);}
    return {deleted};
  }
  async ready(){await access(this.directory,constants.W_OK);const check=this.store.db.prepare('PRAGMA quick_check').get();if(Object.values(check)[0]!=='ok')throw new Error('DATABASE_CHECK_FAILED');this.store.db.prepare('UPDATE schema_migrations SET applied_at=applied_at WHERE version=1').run();return true;}
}
