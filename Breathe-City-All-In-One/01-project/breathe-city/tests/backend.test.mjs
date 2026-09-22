import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../server/store.mjs';
import { JobWorker } from '../server/worker.mjs';
import { loadConfig, publicConfig } from '../server/config.mjs';
import { createProviders, ProviderError, safeRemoteUrl } from '../server/providers.mjs';

const input=(extra={})=>({kind:'tripo',mode:'demo',prompt:'An original quiet seed pod',idempotencyKey:'test-key-0001',...extra});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const cfg=()=>loadConfig({ADMIN_TOKEN:'a'.repeat(24),TRIPO_API_KEY:'secret-tripo',WORLDLABS_API_KEY:'secret-world',DECART_API_KEY:'secret-decart',ALLOW_PAID_APIS:'true'});

test('config defaults do not expose keys or allow spending',()=>{const c=loadConfig({});assert.equal(c.host,'127.0.0.1');assert.equal(c.allowPaid,false);const p=publicConfig(cfg());assert.ok(!JSON.stringify(p).includes('secret-'));assert.equal(p.providers.tripo,true);});
test('non-loopback binding and short admin tokens are rejected',()=>{assert.throws(()=>loadConfig({HOST:'0.0.0.0'}),/ADMIN_TOKEN/);assert.throws(()=>loadConfig({ADMIN_TOKEN:'short'}),/24/);assert.throws(()=>loadConfig({MAX_SESSION_SECONDS:'5000'}),/Invalid/);});
test('same idempotency key returns same job, mismatched input conflicts',()=>{const s=new JobStore(':memory:');try{const a=s.create(input()),b=s.create(input());assert.equal(a.job.id,b.job.id);assert.equal(b.reused,true);assert.equal(s.list().length,1);assert.throws(()=>s.create(input({prompt:'Different shape'})),/幂等/);}finally{s.close();}});
test('real daily cap is enforced independently of demo tasks',()=>{const s=new JobStore(':memory:');try{s.create(input({mode:'real'}),1);assert.throws(()=>s.create(input({mode:'real',idempotencyKey:'another-0001'}),1),/上限/);s.create(input({idempotencyKey:'demo-0000001'}),1);assert.equal(s.list().length,2);}finally{s.close();}});
test('restart preserves provider IDs and marks uncertain submissions for review',()=>{
  const dir=mkdtempSync(join(tmpdir(),'breathe-test-'));let s=new JobStore(dir);
  try{const a=s.create(input({mode:'real'})).job;const b=s.create(input({mode:'real',idempotencyKey:'test-key-0002'})).job;s.patch(a.id,{state:'submitting'});s.patch(b.id,{state:'polling',providerId:'task_abc'});s.close();s=new JobStore(dir);assert.equal(s.get(a.id).state,'needs_review');assert.equal(s.get(b.id).providerId,'task_abc');assert.equal(s.get(b.id).state,'polling');}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('token reservations count failed/uncertain attempts conservatively',()=>{const s=new JobStore(':memory:');try{s.reserveToken(1);assert.throws(()=>s.reserveToken(1),/额度/);}finally{s.close();}});
test('demo worker returns explicitly non-AI provenance without calling providers',async()=>{
  const s=new JobStore(':memory:');let called=0;const w=new JobWorker(s,{submit:async()=>{called++;}},{demoMs:0});
  try{const j=s.create(input()).job;await w.tick();await w.tick();const result=s.get(j.id);assert.equal(result.state,'succeeded');assert.equal(result.result.provenance,'procedural-demo-not-tripo');assert.equal(called,0);}finally{await w.stop();s.close();}
});
test('ambiguous paid submission is never automatically resubmitted',async()=>{
  const s=new JobStore(':memory:');let called=0;const w=new JobWorker(s,{submit:async()=>{called++;throw new ProviderError('network uncertain',{ambiguous:true});}});
  try{const j=s.create(input({mode:'real'})).job;await w.tick();await w.tick();assert.equal(called,1);assert.equal(s.get(j.id).state,'needs_review');}finally{await w.stop();s.close();}
});
test('poll retry retains provider ID instead of creating a new paid task',async()=>{
  const s=new JobStore(':memory:');let polls=0;const w=new JobWorker(s,{submit:async()=>assert.fail('must not resubmit'),poll:async()=>{polls++;throw new ProviderError('429',{retryable:true});}},{pollMs:0});
  try{const j=s.create(input({mode:'real'})).job;s.patch(j.id,{state:'polling',providerId:'task_paid',nextPollAt:0});await w.tick();assert.equal(s.get(j.id).providerId,'task_paid');assert.equal(s.get(j.id).state,'polling');assert.equal(polls,1);}finally{await w.stop();s.close();}
});
test('stop-monitoring wins over an in-flight poll result',async()=>{
  const s=new JobStore(':memory:');let release;const gate=new Promise(r=>release=r);const w=new JobWorker(s,{poll:async()=>{await gate;return {state:'succeeded',result:{modelUrl:'https://cdn.example/a.glb'}};}});
  try{const j=s.create(input({mode:'real'})).job;s.patch(j.id,{state:'polling',providerId:'task_a',nextPollAt:0});const tick=w.tick();s.patch(j.id,{state:'monitoring_stopped'});release();await tick;assert.equal(s.get(j.id).state,'monitoring_stopped');}finally{await w.stop();s.close();}
});
test('Tripo v3 submission contract uses server auth and an explicit model',async()=>{
  let request;const p=createProviders(cfg(),async(url,options)=>{request={url,...options};return response({code:0,data:{task_id:'task_real'}});});
  assert.equal(await p.submit(input({mode:'real'})),'task_real');assert.equal(request.url,'https://openapi.tripo3d.ai/v3/generation/text-to-model');assert.equal(request.headers.Authorization,'Bearer secret-tripo');const body=JSON.parse(request.body);assert.equal(body.model,'v3.1-20260211');assert.equal(body.face_limit,12000);
});
test('Tripo polling parses model URL and keeps real provenance',async()=>{const p=createProviders(cfg(),async()=>response({code:0,data:{status:'success',output:{model_url:'https://cdn.tripo3d.ai/a.glb'}}}));const r=await p.poll({kind:'tripo',providerId:'task_123'});assert.equal(r.state,'succeeded');assert.equal(r.result.provenance,'tripo-api');});
test('World Labs submission is a text world, not an implicit image upload',async()=>{
  let req;const p=createProviders(cfg(),async(url,opts)=>{req={url,...opts};return response({operation_id:'op_123'});});assert.equal(await p.submit({kind:'world',prompt:'Quiet garden'}),'op_123');assert.equal(req.url,'https://api.worldlabs.ai/marble/v1/worlds:generate');assert.deepEqual(JSON.parse(req.body).world_prompt,{type:'text',text_prompt:'Quiet garden'});assert.equal(req.headers['WLT-Api-Key'],'secret-world');
});
test('World Labs completed result uses actual returned viewer URL',async()=>{const p=createProviders(cfg(),async()=>response({done:true,response:{world_marble_url:'https://marble.worldlabs.ai/world/123'}}));const r=await p.poll({kind:'world',providerId:'op_123'});assert.equal(r.result.worldUrl,'https://marble.worldlabs.ai/world/123');});
test('Decart token has model, origin and duration limits; no permanent key in result',async()=>{
  let req;const p=createProviders(cfg(),async(url,opts)=>{req={url,...opts};return response({apiKey:'ephemeral',expiresAt:'future'});});const r=await p.token();const body=JSON.parse(req.body);assert.equal(req.url,'https://api.decart.ai/v1/client/tokens');assert.deepEqual(body.allowedModels,['lucy-2.5']);assert.deepEqual(body.allowedOrigins,['http://localhost:3000']);assert.equal(body.constraints.realtime.maxSessionDuration,30);assert.equal(body.expiresIn,60);assert.equal(r.apiKey,'ephemeral');assert.ok(!JSON.stringify(r).includes('secret'));
});
test('provider network and invalid response errors remain credential-free and conservative',async()=>{
  const p=createProviders(cfg(),async()=>{throw new Error('secret-tripo should not be shown');});await assert.rejects(()=>p.submit(input()),e=>e.ambiguous&&!e.message.includes('secret-tripo'));
  const bad=createProviders(cfg(),async()=>response({},500));await assert.rejects(()=>bad.submit(input()),e=>e.ambiguous);
});
test('non-HTTPS and credential-bearing result URLs are rejected',()=>{assert.equal(safeRemoteUrl('javascript:alert(1)'),null);assert.equal(safeRemoteUrl('https://secret:password@example.com/x'),null);assert.equal(safeRemoteUrl('http://localhost/x'),null);assert.equal(safeRemoteUrl('https://example.com/x'),'https://example.com/x');});
test('manual resume gets a new poll window without a new submission',async()=>{
  const s=new JobStore(':memory:');let queried=0;const w=new JobWorker(s,{submit:async()=>assert.fail('never resubmit'),poll:async()=>{queried++;return {state:'succeeded',result:{provenance:'fixture-only'}};}});
  try{const j=s.create(input({mode:'real'})).job;s.db.prepare('UPDATE jobs SET created_at=? WHERE id=?').run(Date.now()-3600000,j.id);s.patch(j.id,{state:'polling',providerId:'existing_task',nextPollAt:0});await w.tick();assert.equal(s.get(j.id).state,'needs_review');s.patch(j.id,{state:'polling',pollStartedAt:Date.now(),nextPollAt:0});await w.tick();assert.equal(queried,1);assert.equal(s.get(j.id).state,'succeeded');assert.equal(s.get(j.id).providerId,'existing_task');}finally{await w.stop();s.close();}
});
