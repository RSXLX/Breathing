import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validatePolygon, validParameters } from '../public/js/motion-domain.js';
export const apiError=(status,code,message)=>Object.assign(new Error(message),{status,code});
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
const active="('queued','submitting','running','ingesting','needs_review','monitoring_stopped','ingest_failed')";
export class GenerationStore {
  constructor(directory,config){
    this.config=config;if(directory!==':memory:')mkdirSync(directory,{recursive:true});
    this.db=new DatabaseSync(directory===':memory:'?directory:join(directory,'generation.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,credential_hash TEXT UNIQUE NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id),sha256 TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,duration REAL NOT NULL,size INTEGER NOT NULL,path TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'ready',expires_at INTEGER NOT NULL,provenance TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id),fingerprint TEXT NOT NULL,snapshot TEXT NOT NULL,cost INTEGER NOT NULL,currency TEXT NOT NULL,expires_at INTEGER NOT NULL,job_id TEXT);
      CREATE TABLE IF NOT EXISTS generations(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES sessions(id),idem TEXT NOT NULL,fingerprint TEXT NOT NULL,snapshot TEXT NOT NULL,state TEXT NOT NULL,provider_id TEXT,result_media_id TEXT,error_code TEXT,next_poll_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,poll_started_at INTEGER,UNIQUE(owner,idem));
      CREATE INDEX IF NOT EXISTS generation_due ON generations(state,next_poll_at);
      CREATE TABLE IF NOT EXISTS budget_entries(job_id TEXT PRIMARY KEY REFERENCES generations(id),owner TEXT NOT NULL,reserved INTEGER NOT NULL,actual INTEGER,state TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,job_id TEXT,event TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO schema_migrations VALUES(1,${Date.now()});
      UPDATE generations SET state='needs_review',error_code='RESTART_DURING_SUBMISSION' WHERE state='submitting';
      UPDATE generations SET state='ingest_failed',error_code='RESTART_DURING_INGEST' WHERE state='ingesting';
    `);
  }
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  session(invite){if(!this.config.inviteHash||!equal(hash(invite||''),this.config.inviteHash))throw apiError(401,'INVITE_INVALID','邀请凭据无效');const token=randomBytes(32).toString('hex'),row={id:randomUUID(),csrf:randomBytes(24).toString('hex'),expiresAt:Date.now()+8*86400000};this.db.prepare('INSERT INTO sessions(id,credential_hash,csrf,expires_at) VALUES(?,?,?,?)').run(row.id,hash(token),row.csrf,row.expiresAt);return {...row,token};}
  authenticate(token){if(!token)throw apiError(401,'SESSION_REQUIRED','请先连接邀请会话');const row=this.db.prepare('SELECT * FROM sessions WHERE credential_hash=? AND revoked=0 AND expires_at>?').get(hash(token),Date.now());if(!row)throw apiError(401,'SESSION_EXPIRED','会话已失效，请重新连接');return row;}
  media(owner,id){const row=this.db.prepare("SELECT * FROM media WHERE id=? AND owner=? AND state='ready' AND expires_at>?").get(id,owner,Date.now());if(!row)throw apiError(404,'MEDIA_UNAVAILABLE','素材不存在、已过期或不可访问');return row;}
  assertOwner(owner){if(!this.db.prepare('SELECT id FROM sessions WHERE id=? AND revoked=0 AND expires_at>?').get(owner,Date.now()))throw apiError(401,'SESSION_EXPIRED','会话已失效，请重新连接');}
  revokeData(owner){return this.transaction(()=>{
    this.assertOwner(owner);
    if(this.db.prepare("SELECT id FROM generations WHERE owner=? AND state IN ('submitting','ingesting')").get(owner))throw apiError(409,'DELETE_RETRY','任务正在提交或入库，稍后重试清理');
    for(const row of this.db.prepare("SELECT id,state FROM generations WHERE owner=? AND state IN ('queued','running','needs_review','ingest_failed')").all(owner)){
      this.patch(row.id,{state:row.state==='queued'?'cancelled':'monitoring_stopped'});
      if(row.state==='queued')this.db.prepare("UPDATE budget_entries SET state='released',actual=0 WHERE job_id=?").run(row.id);
    }
    this.db.prepare('UPDATE sessions SET revoked=1 WHERE id=?').run(owner);
    this.db.prepare("UPDATE media SET expires_at=0 WHERE owner=? AND state='ready'").run(owner);
  });}
  addMedia(row){this.assertOwner(row.owner);const id=randomUUID();this.db.prepare('INSERT INTO media(id,owner,sha256,mime,width,height,duration,size,path,expires_at,provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,row.owner,row.sha256,row.mime,row.width,row.height,row.duration||0,row.size,row.path,row.expiresAt,row.provenance);return this.media(row.owner,id);}
  snapshot(owner,body){
    const m=this.media(owner,body.mediaId);if(!['image','video-frame'].includes(body.inputMode)||!m.mime.startsWith('image/'))throw apiError(400,'INPUT_UNSUPPORTED','当前云适配器仅支持照片或明确选择的视频帧');
    const parameters=validParameters(body.parameters);const polygon=validatePolygon(body.selection?.points);
    if(!['9:16','16:9'].includes(body.ratio))throw apiError(400,'RATIO_INVALID','画幅无效');
    if(body.presetVersion!==1||body.presetId!==parameters.motion)throw apiError(400,'PRESET_INVALID','动作版本无效');
    return {mediaId:m.id,mediaHash:m.sha256,inputMode:body.inputMode,presetId:body.presetId,presetVersion:1,selection:polygon,parameters,ratio:body.ratio,duration:5,provider:'runway',model:this.config.model,priceVersion:this.config.priceVersion};
  }
  quote(owner,body){
    this.assertOwner(owner);
    if(!this.config.enabled)throw apiError(409,'VIDEO_DISABLED','云生成未启用');const snapshot=this.snapshot(owner,body),fingerprint=hash(JSON.stringify(snapshot)),id=randomUUID(),expiresAt=Date.now()+300000;
    this.db.prepare('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,NULL)').run(id,owner,fingerprint,JSON.stringify(snapshot),this.config.cost,this.config.currency,expiresAt);
    return {quoteId:id,maxCostUnits:this.config.cost,currency:this.config.currency,expiresAt,snapshot};
  }
  job(owner,id){const row=this.db.prepare('SELECT * FROM generations WHERE id=? AND owner=?').get(id,owner);if(!row)throw apiError(404,'JOB_NOT_FOUND','任务不存在');return this.decode(row);}
  decode(row){return row?{...row,snapshot:JSON.parse(row.snapshot)}:null;}
  create(owner,key,body){
    if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key||''))throw apiError(400,'IDEMPOTENCY_INVALID','幂等键无效');
    return this.transaction(()=>{
      this.assertOwner(owner);
      const existing=this.db.prepare('SELECT * FROM generations WHERE owner=? AND idem=?').get(owner,key);
      // Existing snapshots remain recoverable after input expiration; compare requested semantic fields.
      if(existing){const s=JSON.parse(existing.snapshot);const fields={mediaId:s.mediaId,inputMode:s.inputMode,presetId:s.presetId,presetVersion:s.presetVersion,selection:s.selection,parameters:s.parameters,ratio:s.ratio};const incoming={mediaId:body.mediaId,inputMode:body.inputMode,presetId:body.presetId,presetVersion:body.presetVersion,selection:body.selection?.points,parameters:validParameters(body.parameters),ratio:body.ratio};if(JSON.stringify(fields)!==JSON.stringify(incoming))throw apiError(409,'IDEMPOTENCY_CONFLICT','同一个幂等键对应不同输入');return {job:this.decode(existing),reused:true};}
      if(!this.config.enabled||body.confirmed!==true)throw apiError(409,'CONSENT_REQUIRED','请确认素材上传与生成费用');
      const snapshot=this.snapshot(owner,body),fingerprint=hash(JSON.stringify(snapshot)),q=this.db.prepare('SELECT * FROM quotes WHERE id=? AND owner=?').get(body.quoteId,owner);
      if(!q||q.job_id||q.expires_at<Date.now()||q.fingerprint!==fingerprint)throw apiError(409,'QUOTE_EXPIRED','报价无效或输入改变，请重新获取');
      if(this.db.prepare(`SELECT id FROM generations WHERE owner=? AND state IN ${active}`).get(owner))throw apiError(409,'JOB_ACTIVE','已有任务未结束，请先处理');
      const now=Date.now(),day=new Date().setUTCHours(0,0,0,0),sum=(where,...args)=>Number(this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN state='released' THEN 0 ELSE COALESCE(actual,reserved) END),0) AS n FROM budget_entries ${where}`).get(...args).n);
      if(sum('')+q.cost>this.config.totalBudget||sum('WHERE created_at>=?',day)+q.cost>this.config.dayBudget||sum('WHERE owner=?',owner)+q.cost>this.config.sessionBudget)throw apiError(429,'BUDGET_EXCEEDED','生成额度已达上限');
      const id=randomUUID();this.db.prepare('INSERT INTO generations(id,owner,idem,fingerprint,snapshot,state,next_poll_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,key,fingerprint,q.snapshot,'queued',now,now,now);
      this.db.prepare("INSERT INTO budget_entries VALUES(?,?,?,NULL,'reserved',?)").run(id,owner,q.cost,now);this.db.prepare('UPDATE quotes SET job_id=? WHERE id=?').run(id,q.id);this.db.prepare('UPDATE media SET expires_at=MAX(expires_at,?) WHERE id=?').run(now+48*3600000,snapshot.mediaId);this.audit(id,'queued');return {job:this.job(owner,id),reused:false};
    });
  }
  audit(id,event){this.db.prepare('INSERT INTO audit(job_id,event,created_at) VALUES(?,?,?)').run(id,event,Date.now());}
  patch(id,changes){const allowed=['state','provider_id','result_media_id','error_code','next_poll_at','poll_started_at'];const keys=Object.keys(changes).filter(k=>allowed.includes(k));if(!keys.length)return;this.db.prepare(`UPDATE generations SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=? WHERE id=?`).run(...keys.map(k=>changes[k]),Date.now(),id);if(changes.state)this.audit(id,changes.state);}
  due(){return this.decode(this.db.prepare("SELECT * FROM generations WHERE state IN ('queued','running') AND next_poll_at<=? ORDER BY next_poll_at LIMIT 1").get(Date.now()));}
  list(owner,cursor){const rows=this.db.prepare('SELECT * FROM generations WHERE owner=? AND rowid<? ORDER BY rowid DESC LIMIT 21').all(owner,cursor?Number(cursor):Number.MAX_SAFE_INTEGER);return {items:rows.slice(0,20).map(r=>this.decode(r)),nextCursor:rows.length>20?this.db.prepare('SELECT rowid FROM generations WHERE id=?').get(rows[19].id).rowid:null};}
  stop(owner,id){return this.transaction(()=>{const job=this.job(owner,id);if(job.state==='queued'){this.patch(id,{state:'cancelled'});this.db.prepare("UPDATE budget_entries SET state='released',actual=0 WHERE job_id=?").run(id);}else if(['running','needs_review'].includes(job.state))this.patch(id,{state:'monitoring_stopped'});else throw apiError(409,'JOB_BUSY','当前阶段无法停止');return this.job(owner,id);});}
  resume(owner,id){const job=this.job(owner,id);if(!['monitoring_stopped','needs_review','ingest_failed'].includes(job.state)||!job.provider_id)throw apiError(409,'RECONCILIATION_REQUIRED','需要先核对服务商任务 ID');this.patch(id,{state:'running',next_poll_at:Date.now(),poll_started_at:Date.now(),error_code:null});return this.job(owner,id);}
  close(){this.db.close();}
}
