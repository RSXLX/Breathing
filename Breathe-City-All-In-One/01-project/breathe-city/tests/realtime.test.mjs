import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeSession } from '../public/js/realtime.js';
const config={decartSdkUrl:'not-used-by-test-loader',decartModel:'lucy-2.5',maxSessionSeconds:1};
function fixture(extra={}){
  let stopped=0,closed=0,minted=0,opts;const events=new Map(),states=[];
  const track={stop(){stopped++;}},stream={getTracks:()=>[track]};
  const connection={on:(n,f)=>events.set(n,f),off:n=>events.delete(n),disconnect:()=>closed++,getConnectionState:()=> 'connected',setPrompt:async()=>{}};
  const sdk={models:{realtime:()=>({fps:25})},createDecartClient:options=>{opts=options;return {realtime:{connect:extra.connect|| (async()=>connection)}};}};
  const session=new RealtimeSession((s,m)=>states.push([s,m]),()=>{},extra.loader||(async()=>sdk));
  return {session,events,connection,states,counts:()=>({stopped,closed,minted}),opts:()=>opts,args:{rawCanvas:{captureStream:()=>stream},config,api:async()=>{minted++;return {apiKey:'ephemeral-only'};},prompt:'Quiet city'}};
}
test('realtime uses temporary key and real SDK event subscriptions',async()=>{const f=fixture();await f.session.connect(f.args);assert.equal(f.opts().apiKey,'ephemeral-only');assert.equal(f.opts().telemetry,false);assert.ok(f.events.has('error'));assert.ok(f.events.has('connectionChange'));f.session.disconnect();assert.equal(f.counts().stopped,1);assert.equal(f.counts().closed,1);assert.equal(f.events.size,0);});
test('SDK reconnect event stops capture without minting a second token',async()=>{const f=fixture();await f.session.connect(f.args);f.events.get('connectionChange')('reconnecting');assert.equal(f.session.active,false);assert.deepEqual(f.counts(),{stopped:1,closed:1,minted:1});});
test('SDK loading failure does not mint a token',async()=>{const f=fixture({loader:async()=>{throw new Error('network');}});await assert.rejects(()=>f.session.connect(f.args));assert.equal(f.counts().minted,0);assert.equal(f.session.active,false);});
test('local deadline stops an unresolved connect and closes its late result',async()=>{let release;const gate=new Promise(r=>release=r);const f=fixture({connect:()=>gate});const pending=f.session.connect({...f.args,config:{...config,maxSessionSeconds:.02}});await new Promise(r=>setTimeout(r,45));assert.equal(f.session.active,false);assert.equal(f.counts().stopped,1);release(f.connection);await pending;assert.equal(f.counts().closed,1);});
test('cancel during module load prevents later token request',async()=>{let release;const gate=new Promise(r=>release=r);const f=fixture({loader:()=>gate});const pending=f.session.connect(f.args);f.session.disconnect();release({});await pending;assert.equal(f.counts().minted,0);});
