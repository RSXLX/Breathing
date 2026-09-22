/** Shared, framework-independent scene domain. Testable without a browser. */
export const EFFECTS = {
  tree: { title:'树冠呼吸', en:'CANOPY', subtitle:'让每一片绿意，都有自己的呼吸。', color:'#d3f897', id:3, prompt:'Add delicate translucent bioluminescent seed pods nestled within the tree canopy. Soft pale green light, very slow breathing, subtle cinematic realism. Keep the original camera movement, trees, people, signs and architecture unchanged.' },
  building: { title:'建筑微光', en:'AFTERGLOW', subtitle:'忙碌了一天的建筑，也需要松一口气。', color:'#f2bc87', id:2, prompt:'Add a thin warm luminous membrane and gentle flowing light on the building facades only, like a city quietly breathing. Preserve exact architecture, text, traffic lights, people, vehicles and original camera motion.' },
  sky: { title:'云间漂浮', en:'DRIFT', subtitle:'把今天的疲惫，交给云间的小小生命。', color:'#c4c6ff', id:1, prompt:'Add a few ethereal translucent jellyfish-like clouds floating slowly in the sky only, soft lavender highlights and delicate luminous trails. Preserve the real city, people, signs, trees and camera movement. Restrained cinematic VFX.' },
  unknown: { title:'等待一处风景', en:'LOOK AROUND', subtitle:'对准树木、建筑或天空，停留片刻。', color:'#d3f897', id:0, prompt:'Preserve the input video without changes.' },
};
export const DEMOS = [
  { id:'park', label:'下班后的街角', scene:'tree', image:'/assets/park.svg', mask:'/assets/park-mask.png' },
  { id:'blocks', label:'亮着灯的楼宇', scene:'building', image:'/assets/blocks.svg', mask:'/assets/blocks-mask.png' },
  { id:'rooftop', label:'屋顶上的天空', scene:'sky', image:'/assets/rooftop.svg', mask:'/assets/rooftop-mask.png' },
];
export function clamp(v,min=0,max=1){return Math.min(max,Math.max(min,v));}
export function coverageOf(mask){const n=Math.max(1,mask.length), counts=[0,0,0,0,0]; for(const v of mask) if(v>=0 && v<5) counts[v]++; return {tree:counts[3]/n,building:counts[2]/n,sky:counts[1]/n,protected:counts[4]/n};}
export function chooseScene(c){ if(c.tree>=.07 && c.tree>c.building*.45)return 'tree'; if(c.building>=.17)return 'building'; if(c.sky>=.18)return 'sky'; return 'unknown'; }
export function classifyPixels(rgba,width,height){
  const map=new Uint8Array(width*height);
  for(let i=0;i<map.length;i++){
    const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2],y=Math.floor(i/width)/height;
    const hi=Math.max(r,g,b),lo=Math.min(r,g,b),lum=(r+g+b)/3;
    if(g>r*1.07 && g>b*1.03 && g>30 && y<.9)map[i]=3;
    else if(y<.62 && ((b>r*1.12 && b>g*.98)||(lum>175 && hi-lo<28)))map[i]=1;
    else if(y>.08 && y<.84 && lum>32 && hi-lo<48)map[i]=2;
  }
  return map;
}
export class SceneRouter {
  constructor(required=2){this.current='unknown';this.candidate='unknown';this.hits=0;this.required=required;}
  update(next){if(next===this.current){this.hits=0;return this.current;}if(next!==this.candidate){this.candidate=next;this.hits=1;}else this.hits++;if(this.hits>=this.required){this.current=next;this.hits=0;}return this.current;}
  reset(){this.current='unknown';this.candidate='unknown';this.hits=0;}
}
export function containRect(sw,sh,dw,dh){if(!sw||!sh)return {x:0,y:0,w:dw,h:dh};const s=Math.min(dw/sw,dh/sh);return {x:(dw-sw*s)/2,y:(dh-sh*s)/2,w:sw*s,h:sh*s};}
export function sampleAnchors(map,w,h,id,count=12){
  if(!id)return [];
  const candidates=[];
  // Deterministic density-grid placement, NOT SLAM or object tracking.
  const cols=10, rows=7;
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    let n=0,sx=0,sy=0;
    for(let y=Math.floor(gy*h/rows);y<Math.floor((gy+1)*h/rows);y++)for(let x=Math.floor(gx*w/cols);x<Math.floor((gx+1)*w/cols);x++)if(map[y*w+x]===id){n++;sx+=x;sy+=y;}
    if(n>w*h/(cols*rows)*.15)candidates.push({x:sx/n/w,y:sy/n/h,weight:n,seed:gx*7+gy*13});
  }
  candidates.sort((a,b)=>b.weight-a.weight);
  return candidates.slice(0,count);
}
export function filenameFor(type='video',ext='webm'){return `breathe-city-${type}-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;}
export function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export function makeId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
