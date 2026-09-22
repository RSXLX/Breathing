/** Original-image motion. Coordinates always refer to the cropped output frame. */
export const MOTION_VERSION = 1;
export const MOTIONS = [
  { id:'breathe', version:1, title:'呼吸', description:'让立面轻轻舒展', objectType:'building' },
  { id:'sway', version:1, title:'摇摆', description:'让枝叶随节奏轻摆', objectType:'tree' },
  { id:'ripple', version:1, title:'涟漪', description:'给表面一阵柔和波动', objectType:'surface' },
];
export function bounded(value,min,max){return Math.max(min,Math.min(max,value));}
export function validParameters(raw={}){
  const motion=MOTIONS.find(m=>m.id===raw.motion);
  if(!motion)throw new Error('未知动作');
  const intensity=Number(raw.intensity),cycle=Number(raw.cycle);
  if(!Number.isFinite(intensity)||intensity<0||intensity>1||!Number.isFinite(cycle)||cycle<2||cycle>10)throw new Error('动作参数超出范围');
  return {motion:motion.id,intensity,cycle,version:MOTION_VERSION};
}
export function polygonArea(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p[0]*q[1]-q[0]*p[1];}return Math.abs(a)/2;}
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<1e-9&&p[0]>=Math.min(a[0],b[0])-1e-9&&p[0]<=Math.max(a[0],b[0])+1e-9&&p[1]>=Math.min(a[1],b[1])-1e-9&&p[1]<=Math.max(a[1],b[1])+1e-9;}
function intersects(a,b,c,d){const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return (x*y<0&&z*w<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function validatePolygon(points){
  if(!Array.isArray(points)||points.length<3||points.length>32)throw new Error('选区需 3–32 个点');
  if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))throw new Error('选区坐标无效');
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(a[0]-b[0],a[1]-b[1])<.001)throw new Error('选区有重复顶点');
    for(let j=i+1;j<points.length;j++){if(j===i+1||(i===0&&j===points.length-1))continue;if(intersects(a,b,points[j],points[(j+1)%points.length]))throw new Error('选区边缘不能交叉');}
  }
  if(polygonArea(points)<.012)throw new Error('选区太小，请圈出完整物体');
  return points.map(p=>[...p]);
}
export function insidePolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function boundaryDistance(x,y,points){let d=Infinity;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],t=bounded(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);d=Math.min(d,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));}return d;}
export function cropRect(sw,sh,dw,dh,focusX=.5,focusY=.5){const ratio=dw/dh;let w=sw,h=sh;if(sw/sh>ratio)w=sh*ratio;else h=sw/ratio;return {x:(sw-w)*bounded(focusX,0,1),y:(sh-h)*bounded(focusY,0,1),w,h};}
export function normalizedPointer(clientX,clientY,rect){return [bounded((clientX-rect.left)/rect.width,0,1),bounded((clientY-rect.top)/rect.height,0,1)];}
export function motionVertex(x,y,time,params,polygon){
  if(!insidePolygon(x,y,polygon))return [x,y];
  const d=boundaryDistance(x,y,polygon),q=bounded(d/.09,0,1),weight=q*q*(3-2*q);
  const phase=time/params.cycle*Math.PI*2,amp=params.intensity*.022*weight;
  let dx=0,dy=0;
  if(params.motion==='breathe'){dx=Math.sin(phase)*(x-.5)*amp*2;dy=-Math.sin(phase)*(y-.5)*amp*1.4;}
  if(params.motion==='sway'){dx=Math.sin(phase+y*2)*amp;dy=Math.sin(phase*.5+x*3)*amp*.18;}
  if(params.motion==='ripple'){dx=Math.sin(phase+y*12)*amp*.65;dy=Math.cos(phase+x*9)*amp*.32;}
  return [x+dx,y+dy];
}
export function meshFrame(cols,rows,time,params,polygon){
  const points=[];for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)points.push(motionVertex(x/cols,y/rows,time,params,polygon));
  const triangles=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;triangles.push([a,b,c],[b,d,c]);}
  // Preserve orientation: if a high gradient could fold, reduce all displacement together.
  const original=points.map((_,i)=>[(i%(cols+1))/cols,Math.floor(i/(cols+1))/rows]);
  for(let tries=0;tries<8;tries++){
    if(triangles.every(([a,b,c])=>cross(points[a],points[b],points[c])>1e-8))return {points,original,triangles};
    points.forEach((p,i)=>{p[0]=(p[0]+original[i][0])/2;p[1]=(p[1]+original[i][1])/2;});
  }
  return {points:original,original,triangles};
}
