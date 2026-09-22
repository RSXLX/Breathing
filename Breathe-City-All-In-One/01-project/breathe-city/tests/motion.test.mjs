import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolygon, cropRect, meshFrame, motionVertex, validParameters } from '../public/js/motion-domain.js';
const polygon=[[.2,.2],[.8,.2],[.8,.8],[.2,.8]];
test('selection rejects intersecting, duplicate, out-of-frame and tiny regions',()=>{
  for(const p of [[[0,0],[1,1],[0,1],[1,0]],[[0,0],[0,0],[1,1]],[[0,0],[2,0],[1,1]],[[.1,.1],[.11,.1],[.1,.11]]])assert.throws(()=>validatePolygon(p));
  assert.deepEqual(validatePolygon(polygon),polygon);
});
test('center crop preserves aspect and supports explicit edge focus',()=>{
  assert.deepEqual(cropRect(1920,1080,720,1280,0,0),{x:0,y:0,w:607.5,h:1080});
  assert.deepEqual(cropRect(1920,1080,720,1280,1,0),{x:1312.5,y:0,w:607.5,h:1080});
});
test('motion preserves exterior and boundary while moving original interior coordinates',()=>{
  const p={motion:'sway',cycle:4,intensity:1};assert.deepEqual(motionVertex(.1,.5,1,p,polygon),[.1,.5]);assert.deepEqual(motionVertex(.2,.5,1,p,polygon),[.2,.5]);assert.notDeepEqual(motionVertex(.5,.5,1,p,polygon),[.5,.5]);
  assert.deepEqual(motionVertex(.5,.5,1,{...p,intensity:0},polygon),[.5,.5]);
});
test('all motion presets remain deterministic and preserve mesh winding at maximum strength',()=>{
  for(const motion of ['breathe','sway','ripple'])for(let t=0;t<10;t+=.25){
    const params={motion,cycle:2,intensity:1},a=meshFrame(20,24,t,params,polygon),b=meshFrame(20,24,t,params,polygon);assert.deepEqual(a,b);
    for(const [i,j,k]of a.triangles){const [p,q,r]=[a.points[i],a.points[j],a.points[k]];assert.ok((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])>0);}
  }
});
test('invalid intensity and period cannot enter renderer snapshots',()=>{for(const p of [{motion:'breathe',intensity:2,cycle:4},{motion:'bad',intensity:.5,cycle:4},{motion:'sway',intensity:.5,cycle:NaN}])assert.throws(()=>validParameters(p));});
