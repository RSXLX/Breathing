const canvas=document.querySelector('#world-canvas'),ctx=canvas.getContext('2d');
let yaw=.2,pitch=0,distance=8,drag=false,lastX=0,lastY=0;
canvas.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-lastX)*.005;pitch=Math.max(-.3,Math.min(.3,pitch+(e.clientY-lastY)*.003));lastX=e.clientX;lastY=e.clientY;});
canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(4,Math.min(15,distance+e.deltaY*.005));},{passive:false});
const objects=Array.from({length:55},(_,i)=>({x:Math.sin(i*137.5)*(.4+i*.1),z:Math.cos(i*137.5)*(.4+i*.1),y:i%3===0?1.4+i%5*.15:.3,seed:i}));
function project(x,y,z){const rx=x*Math.cos(yaw)-z*Math.sin(yaw),rz=x*Math.sin(yaw)+z*Math.cos(yaw)+distance,s=750/(rz+5);return {x:640+rx*s,y:420-y*s+pitch*200,s,depth:rz};}
function frame(t){const sky=ctx.createLinearGradient(0,0,0,720);sky.addColorStop(0,'#10211d');sky.addColorStop(.6,'#40543a');sky.addColorStop(1,'#152217');ctx.fillStyle=sky;ctx.fillRect(0,0,1280,720);
  ctx.strokeStyle='#9bbb6722';ctx.lineWidth=1;for(let i=-16;i<=16;i++){let a=project(i,0,-12),b=project(i,0,16);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();a=project(-16,0,i);b=project(16,0,i);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  for(const o of [...objects].sort((a,b)=>project(b.x,b.y,b.z).depth-project(a.x,a.y,a.z).depth)){const p=project(o.x,o.y+Math.sin(t*.0005+o.seed)*.12,o.z),r=p.s*(.1+o.seed%3*.04),g=ctx.createRadialGradient(p.x-r*.2,p.y-r*.3,0,p.x,p.y,r*2.8);g.addColorStop(0,'#e7f8aeaa');g.addColorStop(.16,'#c9e68955');g.addColorStop(1,'#b7d37600');ctx.fillStyle=g;ctx.fillRect(p.x-r*3,p.y-r*3,r*6,r*6);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.strokeStyle='#e4f6b088';ctx.stroke();}
  ctx.fillStyle='#d7e8b677';ctx.font='11px monospace';ctx.fillText('BREATHE CITY / PROCEDURAL DEMO',30,686);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
