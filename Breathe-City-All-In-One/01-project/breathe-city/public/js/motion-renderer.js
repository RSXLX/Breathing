import { cropRect, meshFrame } from './motion-domain.js';

export class MotionRenderer {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.raw=document.createElement('canvas');this.rawCtx=this.raw.getContext('2d',{alpha:false});this.frameMs=0;this.resize('portrait');}
  resize(ratio){const portrait=ratio==='portrait';this.canvas.width=this.raw.width=portrait?720:1280;this.canvas.height=this.raw.height=portrait?1280:720;}
  sourceFrame(source,focus={x:.5,y:.5}){
    const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;
    if(!sw||!sh)return false;
    const r=cropRect(sw,sh,this.raw.width,this.raw.height,focus.x,focus.y);
    this.rawCtx.drawImage(source,r.x,r.y,r.w,r.h,0,0,this.raw.width,this.raw.height);return true;
  }
  renderAt(time,source,settings,{compare=false}={}){
    const started=performance.now();if(!this.sourceFrame(source,settings.focus))return;
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.raw,0,0);
    if(!compare&&settings.polygon&&settings.parameters.intensity>0){
      const {points,original,triangles}=meshFrame(20,24,time,settings.parameters,settings.polygon);
      // Only redraw inside the exact selection; outside pixels remain identical to source.
      ctx.save();ctx.beginPath();settings.polygon.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.closePath();ctx.clip();
      for(const ids of triangles){const from=ids.map(i=>[original[i][0]*w,original[i][1]*h]),to=ids.map(i=>[points[i][0]*w,points[i][1]*h]);this.triangle(ctx,from,to);}
      ctx.restore();
    }
    this.frameMs=this.frameMs*.9+(performance.now()-started)*.1;
  }
  triangle(ctx,s,d){
    if(s.every((p,i)=>Math.abs(p[0]-d[i][0])<.00001&&Math.abs(p[1]-d[i][1])<.00001))return;
    const [s0,s1,s2]=s,[d0,d1,d2]=d;
    const sx1=s1[0]-s0[0],sy1=s1[1]-s0[1],sx2=s2[0]-s0[0],sy2=s2[1]-s0[1],det=sx1*sy2-sx2*sy1;
    const dx1=d1[0]-d0[0],dy1=d1[1]-d0[1],dx2=d2[0]-d0[0],dy2=d2[1]-d0[1];
    const a=(dx1*sy2-dx2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det,b=(dy1*sy2-dy2*sy1)/det,e=(dy2*sx1-dy1*sx2)/det;
    ctx.save();ctx.beginPath();ctx.moveTo(...d0);ctx.lineTo(...d1);ctx.lineTo(...d2);ctx.closePath();ctx.clip();
    ctx.setTransform(a,b,c,e,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-e*s0[1]);ctx.drawImage(this.raw,0,0);ctx.restore();
  }
}
