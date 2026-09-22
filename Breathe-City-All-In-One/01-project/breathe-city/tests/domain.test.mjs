import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneRouter, chooseScene, coverageOf, classifyPixels, containRect, sampleAnchors, makeId, escapeHtml, EFFECTS } from '../public/js/domain.js';
import { parseGlb } from '../public/js/glb.js';
import { readFileSync } from 'node:fs';

test('routing: tree, building, sky and unknown are distinct',()=>{
  assert.equal(chooseScene({tree:.3,building:.2,sky:.5}),'tree');
  assert.equal(chooseScene({tree:.02,building:.6,sky:.3}),'building');
  assert.equal(chooseScene({tree:0,building:0,sky:.7}),'sky');
  assert.equal(chooseScene({tree:.01,building:.1,sky:.1}),'unknown');
});
test('hysteresis does not switch on one unstable observation',()=>{
  const router=new SceneRouter(2);assert.equal(router.update('tree'),'unknown');assert.equal(router.update('tree'),'tree');
  assert.equal(router.update('sky'),'tree');assert.equal(router.update('tree'),'tree');assert.equal(router.update('sky'),'tree');assert.equal(router.update('sky'),'sky');
  router.reset();assert.equal(router.current,'unknown');
});
test('mask coverage is area, not a probability',()=>{assert.deepEqual(coverageOf(new Uint8Array([3,3,2,1,4])),{tree:.4,building:.2,sky:.2,protected:.2});assert.deepEqual(coverageOf(new Uint8Array()),{tree:0,building:0,sky:0,protected:0});});
test('pixel heuristic detects green and sky without pretending to be semantic AI',()=>{
  const pixels=new Uint8ClampedArray([40,110,50,255,80,150,220,255,95,95,95,255,0,0,0,255]);
  assert.deepEqual([...classifyPixels(pixels,2,2)],[3,1,2,0]);
});
test('contain transform preserves source aspect and centers portrait input',()=>{
  assert.deepEqual(containRect(720,1280,1280,720),{x:437.5,y:0,w:405,h:720});
  assert.deepEqual(containRect(1280,720,720,1280),{x:0,y:437.5,w:720,h:405});
});
test('anchors are deterministic and never come from a different semantic class',()=>{
  const map=new Uint8Array(160*90);map.fill(3);
  assert.deepEqual(sampleAnchors(map,160,90,3),sampleAnchors(map,160,90,3));
  assert.equal(sampleAnchors(map,160,90,4).length,0);assert.equal(sampleAnchors(map,160,90,0).length,0);
  assert.ok(sampleAnchors(map,160,90,3).every(a=>a.x>=0&&a.x<=1&&a.y>=0&&a.y<=1));
});
test('generated UUID and escaping are safe for client state',()=>{assert.match(makeId(),/^[a-f0-9-]{36}$/);assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');});
test('each effect has an explicit unknown fallback',()=>{assert.ok(EFFECTS.unknown.prompt.includes('without changes'));assert.equal(EFFECTS.unknown.id,0);});
test('original GLB contains real geometry and parses successfully',()=>{
  const file=readFileSync(new URL('../public/assets/seedpod.glb',import.meta.url));const buffer=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
  const model=parseGlb(buffer);assert.equal(model.triangles,3072);assert.equal(model.meshes.length,1);assert.ok(model.meshes[0].positions.every(Number.isFinite));
});
test('invalid and truncated GLB fail explicitly',()=>{assert.throws(()=>parseGlb(new ArrayBuffer(30)),/GLB/);assert.throws(()=>parseGlb(new ArrayBuffer(2)),/大小/);});
