import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import { GenerationStore,hash } from '../server/generation-store.mjs';
import { MediaStore,publicAddress,downloadResult } from '../server/media-store.mjs';
import { VideoProvider } from '../server/video-provider.mjs';
import { GenerationWorker } from '../server/generation-worker.mjs';
import { createGenerationApp } from '../server/generation-app.mjs';
import { createHttpApp } from '../server/http.mjs';
import { JobStore } from '../server/store.mjs';
import { loadConfig } from '../server/config.mjs';
const config={enabled:true,key:'test-not-real',inviteHash:hash('invite-test'),cost:10,dayBudget:100,totalBudget:200,sessionBudget:30,priceVersion:'test-only',currency:'test-units',model:'gen4.5',pollMs:0,resultHosts:['media.example.test']};
const request=mediaId=>({mediaId,inputMode:'image',presetId:'breathe',presetVersion:1,selection:{points:[[.2,.2],[.8,.2],[.8,.8],[.2,.8]]},parameters:{motion:'breathe',intensity:.6,cycle:4,version:1},ratio:'9:16',confirmed:true});
function fixture(extra={}){const store=new GenerationStore(':memory:',{...config,...extra}),session=store.session('invite-test');const m=store.addMedia({owner:session.id,sha256:'test',mime:'image/jpeg',width:720,height:1280,size:100,path:'test.jpg',expiresAt:Date.now()+100000,provenance:'test'});return {store,session,body:request(m.id)};}
test('quote and generation are atomic, idempotent, and reserve budget once',()=>{const {store,session,body}=fixture();try{const q=store.quote(session.id,body),a=store.create(session.id,'test-key-0001',{...body,quoteId:q.quoteId});store.db.prepare('UPDATE quotes SET expires_at=0').run();const b=store.create(session.id,'test-key-0001',{...body,quoteId:q.quoteId});assert.equal(a.job.id,b.job.id);assert.equal(b.reused,true);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM budget_entries').get().n,1);assert.throws(()=>store.create(session.id,'test-key-0001',{...body,ratio:'16:9'}),{code:'IDEMPOTENCY_CONFLICT'});}finally{store.close();}});
test('cross-session media and job access fails',()=>{const {store,session,body}=fixture();try{const other=store.session('invite-test');assert.throws(()=>store.media(other.id,body.mediaId),{status:404});const q=store.quote(session.id,body),j=store.create(session.id,'test-key-0002',{...body,quoteId:q.quoteId}).job;assert.throws(()=>store.job(other.id,j.id),{status:404});}finally{store.close();}});
test('budget caps and active jobs block without side effects; queued cancel releases',()=>{const {store,session,body}=fixture({totalBudget:10});try{const q=store.quote(session.id,body),j=store.create(session.id,'test-key-0003',{...body,quoteId:q.quoteId}).job;const other=store.session('invite-test'),m=store.addMedia({owner:other.id,sha256:'b',mime:'image/jpeg',width:10,height:10,size:1,path:'b.jpg',expiresAt:Date.now()+10000,provenance:'test'}),b=request(m.id),q2=store.quote(other.id,b);assert.throws(()=>store.create(other.id,'test-key-0004',{...b,quoteId:q2.quoteId}),{code:'BUDGET_EXCEEDED'});assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM generations').get().n,1);store.stop(session.id,j.id);assert.equal(store.create(other.id,'test-key-0004',{...b,quoteId:q2.quoteId}).job.state,'queued');}finally{store.close();}});
test('ambiguous POST stays needs_review and is never blindly retried',async()=>{const {store,session,body}=fixture();try{const q=store.quote(session.id,body);store.create(session.id,'test-key-0005',{...body,quoteId:q.quoteId});let calls=0;const worker=new GenerationWorker(store,{}, {submit:async()=>{calls++;throw Object.assign(new Error('UNCERTAIN'),{ambiguous:true});}});await worker.tick();await worker.tick();assert.equal(calls,1);assert.equal(store.list(session.id).items[0].state,'needs_review');}finally{store.close();}});
test('private and unapproved result hosts cannot be fetched',async()=>{for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(publicAddress(ip),false);assert.equal(publicAddress('8.8.8.8'),true);await assert.rejects(downloadResult('https://evil.test/a.mp4',['media.example.test']),/RESULT_HOST/);await assert.rejects(downloadResult('https://media.example.test/a.mp4',['media.example.test'],{resolve:async()=>[{address:'127.0.0.1',family:4}]}),/PRIVATE_RESULT/);});
test('real decode and ingest precede generation success',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'breathe-ingest-')),store=new GenerationStore(directory,config),media=new MediaStore(directory,store);await media.init();
  try{const session=store.session('invite-test'),png=await sharp({create:{width:128,height:128,channels:3,background:'#abccdd'}}).png().toBuffer(),m=await media.image(session.id,png),b=request(m.id),q=store.quote(session.id,b),j=store.create(session.id,'test-key-0006',{...b,quoteId:q.quoteId}).job;
    assert.equal(m.mime,'image/jpeg');const worker=new GenerationWorker(store,media,{submit:async()=> 'provider-test-1',poll:async()=>({state:'succeeded',url:'https://media.example.test/test.mp4'})},{download:async()=>readFile('docs/qa/demo.mp4')});await worker.tick();await worker.tick();const result=store.job(session.id,j.id);assert.equal(result.state,'succeeded');const output=store.media(session.id,result.result_media_id);assert.equal(output.mime,'video/mp4');assert.ok(output.duration>1);assert.ok((await media.bytes(output)).length>100);
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('HTTP sessions, CSRF, multipart decoding and private media range work',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'breathe-api-')),base=loadConfig({PORT:'0'}),store=new GenerationStore(directory,config),old=new JobStore(':memory:'),media=new MediaStore(directory,store);const v1=await createGenerationApp(base,{config,store,media,provider:{}}),app=createHttpApp({config:base,store:old,providers:{},generationApp:v1,publicDir:resolve('public')});app.listen(0,'127.0.0.1');await once(app,'listening');const url=`http://127.0.0.1:${app.address().port}`;
 try{const sign=await fetch(url+'/api/v1/session',{method:'POST',headers:{'Content-Type':'application/json','X-Breathe-Request':'1'},body:JSON.stringify({invite:'invite-test'})});assert.equal(sign.status,201);const cookie=sign.headers.get('set-cookie').split(';')[0],{csrf}=await sign.json();
 const png=await sharp({create:{width:100,height:120,channels:3,background:'#abbaaa'}}).png().toBuffer(),form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'test.png');
 assert.equal((await fetch(url+'/api/v1/media',{method:'POST',headers:{Cookie:cookie,'X-Breathe-Request':'1'},body:form})).status,403);
 const upload=await fetch(url+'/api/v1/media',{method:'POST',headers:{Cookie:cookie,'X-Breathe-Request':'1','X-CSRF-Token':csrf},body:form});assert.equal(upload.status,201);const {media:m}=await upload.json();assert.equal((await fetch(url+`/api/v1/media/${m.id}/content`)).status,401);const content=await fetch(url+`/api/v1/media/${m.id}/content`,{headers:{Cookie:cookie,Range:'bytes=0-9'}});assert.equal(content.status,206);assert.equal((await content.arrayBuffer()).byteLength,10);
 const invalid=new FormData();invalid.set('file',new Blob(['fake'],{type:'image/png'}),'fake.png');assert.equal((await fetch(url+'/api/v1/media',{method:'POST',headers:{Cookie:cookie,'X-Breathe-Request':'1','X-CSRF-Token':csrf},body:invalid})).status,415);
 }finally{app.closeAllConnections();await new Promise(r=>app.close(r));await v1.close();old.close();await rm(directory,{recursive:true,force:true});}
});
test('expired media cleanup protects active references then expires after retention ceiling',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'breathe-cleanup-')),store=new GenerationStore(directory,config),media=new MediaStore(directory,store);await media.init();
 try{const session=store.session('invite-test'),png=await sharp({create:{width:20,height:20,channels:3,background:'#aabbcc'}}).png().toBuffer(),m=await media.image(session.id,png),b=request(m.id),q=store.quote(session.id,b),j=store.create(session.id,'test-key-cleanup',{...b,quoteId:q.quoteId}).job;store.db.prepare('UPDATE media SET expires_at=0').run();assert.equal((await media.cleanup()).deleted,0);assert.equal((await media.cleanup(Date.now()+49*3600000)).deleted,1);assert.equal(store.job(session.id,j.id).state,'needs_review');assert.throws(()=>store.media(session.id,m.id),{status:404});}finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('restart preserves IDs and turns submitting into review without requeue',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'breathe-restart-'));let store=new GenerationStore(directory,config);
 try{const session=store.session('invite-test'),m=store.addMedia({owner:session.id,sha256:'x',mime:'image/jpeg',width:10,height:10,size:10,path:'test.jpg',expiresAt:Date.now()+10000,provenance:'test'}),b=request(m.id),q=store.quote(session.id,b),j=store.create(session.id,'test-key-restart',{...b,quoteId:q.quoteId}).job;store.patch(j.id,{state:'submitting'});store.close();store=new GenerationStore(directory,config);assert.equal(store.job(session.id,j.id).state,'needs_review');assert.equal(store.due(),null);}finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test('revocation blocks late upload and creation, cancels queued work, and removes protected media',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'breathe-revoke-')),store=new GenerationStore(directory,config),media=new MediaStore(directory,store);await media.init();
 try{
  const session=store.session('invite-test'),png=await sharp({create:{width:100,height:100,channels:3,background:'#abc'}}).png().toBuffer(),m=await media.image(session.id,png),body=request(m.id),q=store.quote(session.id,body),j=store.create(session.id,'revoked-job-001',{...body,quoteId:q.quoteId}).job;
  const lateUpload=media.image(session.id,png);store.revokeData(session.id);
  await assert.rejects(lateUpload,{code:'SESSION_EXPIRED'});
  assert.throws(()=>store.authenticate(session.token),{code:'SESSION_EXPIRED'});
  assert.throws(()=>store.create(session.id,'revoked-job-002',{...body,quoteId:q.quoteId}),{code:'SESSION_EXPIRED'});
  assert.equal(store.job(session.id,j.id).state,'cancelled');assert.equal(store.db.prepare('SELECT state FROM budget_entries WHERE job_id=?').get(j.id).state,'released');
  assert.equal((await media.cleanup()).deleted,1);assert.throws(()=>store.media(session.id,m.id),{code:'MEDIA_UNAVAILABLE'});
  assert.equal((await readdir(media.directory)).length,0);
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('revocation does not race a provider submission or ingestion',()=>{
 const {store,session,body}=fixture();try{const q=store.quote(session.id,body),j=store.create(session.id,'busy-delete-001',{...body,quoteId:q.quoteId}).job;
 for(const state of ['submitting','ingesting']){store.patch(j.id,{state});assert.throws(()=>store.revokeData(session.id),{code:'DELETE_RETRY'});assert.equal(store.authenticate(session.token).id,session.id);}
 }finally{store.close();}
});
test('oversize cloud input is rejected before contacting paid provider',async()=>{
 let calls=0;const provider=new VideoProvider(config,{store:{media:()=>({mime:'image/jpeg'})},bytes:async()=>Buffer.alloc(4*1024*1024)},async()=>{calls++;});
 await assert.rejects(provider.submit({owner:'test',snapshot:{mediaId:'test'}}),{code:'PROVIDER_IMAGE_TOO_LARGE'});assert.equal(calls,0);
});
