import { clamp, containRect, coverageOf, sampleAnchors, EFFECTS } from './domain.js';

export class CityRenderer {
  constructor(canvas,media){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.media=media;
    this.raw=document.createElement('canvas');this.rawCtx=this.raw.getContext('2d',{alpha:false,willReadFrequently:true});
    this.fx=document.createElement('canvas');this.fxCtx=this.fx.getContext('2d');
    this.small=document.createElement('canvas');this.smallCtx=this.small.getContext('2d',{willReadFrequently:true});
    this.maskCanvas=document.createElement('canvas');this.maskCtx=this.maskCanvas.getContext('2d');
    this.debugCanvas=document.createElement('canvas');this.debugCtx=this.debugCanvas.getContext('2d');
    this.scene='tree';this.anchors=[];this.map=null;this.maskW=160;this.maskH=90;
    this.enabled=true;this.compare=false;this.debug=false;this.held=false;this.strength=.7;this.cycle=6;this.energy=.25;this.phase=0;
    this.remote=null;this.asset=null;this.frameCount=0;this.lastCount=performance.now();this.fps=0;this.renderMs=0;this.maskAt=0;this.maskSource='none';
    this.resize('landscape');this.running=false;
  }
  resize(ratio){
    const w=ratio==='portrait'?720:1280,h=ratio==='portrait'?1280:720;
    for(const c of [this.canvas,this.raw,this.fx]){c.width=w;c.height=h;}
    this.small.width=ratio==='portrait'?90:160;this.small.height=ratio==='portrait'?160:90;
    this.map=null;this.anchors=[];
  }
  setScene(scene){if(this.scene!==scene){this.scene=scene;this.updateMaskGraphics();}}
  setMask(map,width,height,source){
    this.maskEpoch=(this.maskEpoch||0)+1;this.map=map;this.maskW=width;this.maskH=height;this.maskAt=performance.now();this.maskSource=source;
    this.coverage=coverageOf(map);this.updateMaskGraphics();
  }
  updateMaskGraphics(){
    if(!this.map)return;
    const w=this.maskW,h=this.maskH,id=EFFECTS[this.scene].id;
    this.maskCanvas.width=this.debugCanvas.width=w;this.maskCanvas.height=this.debugCanvas.height=h;
    const img=this.maskCtx.createImageData(w,h),debug=this.debugCtx.createImageData(w,h);
    const colors=[[0,0,0],[171,169,242],[234,177,109],[184,228,135],[255,103,132]];
    for(let i=0;i<this.map.length;i++){
      img.data[i*4]=255;img.data[i*4+1]=255;img.data[i*4+2]=255;img.data[i*4+3]=id && this.map[i]===id?255:0;
      const color=colors[this.map[i]]||colors[0];debug.data.set([...color,this.map[i]?145:0],i*4);
    }
    this.maskCtx.putImageData(img,0,0);this.debugCtx.putImageData(debug,0,0);
    this.anchors=sampleAnchors(this.map,w,h,id,this.scene==='sky'?9:14);
  }
  sample(){this.smallCtx.drawImage(this.raw,0,0,this.small.width,this.small.height);return this.smallCtx.getImageData(0,0,this.small.width,this.small.height);}
  async demoMask(url){
    const epoch=this.maskEpoch=(this.maskEpoch||0)+1;const image=new Image();image.src=url;await image.decode();if(epoch!==this.maskEpoch)return false;
    const c=this.smallCtx,w=this.small.width,h=this.small.height;c.clearRect(0,0,w,h);
    const rect=containRect(image.naturalWidth,image.naturalHeight,w,h);c.drawImage(image,rect.x,rect.y,rect.w,rect.h);
    const data=c.getImageData(0,0,w,h).data,map=new Uint8Array(w*h);for(let i=0;i<map.length;i++)map[i]=data[i*4];
    this.setMask(map,w,h,'preset');
  }
  drawSource(){
    const ctx=this.rawCtx,w=this.raw.width,h=this.raw.height;ctx.fillStyle='#0c1412';ctx.fillRect(0,0,w,h);
    if(this.media.ready()){const size=this.media.size(),r=containRect(size.w,size.h,w,h);ctx.drawImage(this.media.element,r.x,r.y,r.w,r.h);}
  }
  bubble(ctx,x,y,r,t,seed,color){
    const wobble=Math.sin(t*.55+seed)*.04;
    ctx.save();ctx.translate(x,y);ctx.scale(1+wobble,1-wobble);
    let glow=ctx.createRadialGradient(0,0,r*.08,0,0,r*1.65);glow.addColorStop(0,`${color}1c`);glow.addColorStop(.45,`${color}10`);glow.addColorStop(1,`${color}00`);
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*1.65,0,Math.PI*2);ctx.fill();
    const fill=ctx.createRadialGradient(-r*.32,-r*.42,r*.02,0,0,r);fill.addColorStop(0,'#f5ffe444');fill.addColorStop(.35,`${color}12`);fill.addColorStop(.8,`${color}06`);fill.addColorStop(1,`${color}30`);
    ctx.fillStyle=fill;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=Math.max(1,r*.015);ctx.strokeStyle=`${color}8c`;ctx.stroke();
    ctx.beginPath();ctx.arc(-r*.04,-r*.04,r*.86,Math.PI*1.04,Math.PI*1.58);ctx.strokeStyle='#f7ffeaba';ctx.lineWidth=r*.036;ctx.stroke();
    ctx.beginPath();ctx.ellipse(r*.25,r*.23,r*.57,r*.23,-.7,0,Math.PI*2);ctx.strokeStyle=`${color}30`;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='#efffe8b0';ctx.beginPath();ctx.arc(-r*.39,-r*.44,Math.max(1,r*.04),0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  paintEffects(t){
    const ctx=this.fxCtx,w=this.fx.width,h=this.fx.height;ctx.clearRect(0,0,w,h);
    if(this.scene==='unknown'||!this.map||!this.anchors.length)return;
    const stale=this.maskSource==='preset'?1:clamp(1-(performance.now()-this.maskAt-2600)/2000);
    if(!stale)return;
    const breath=.5+.5*Math.sin(this.phase),color=EFFECTS[this.scene].color;
    const amount=this.strength*(.5+this.energy*.7)*stale;
    ctx.globalAlpha=amount;
    if(this.scene==='building'){
      const g=ctx.createLinearGradient(0,h*.1,w,h);g.addColorStop(0,'#f5cd8030');g.addColorStop(.5,'#e2aa5320');g.addColorStop(1,'#fbe1a000');
      ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      for(let i=0;i<16;i++){
        ctx.beginPath();for(let x=0;x<=w;x+=10){const y=h*(.2+i*.041)+Math.sin(x/w*6.5+t*.65+i*.22)*h*(.012+this.energy*.012);if(!x)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
        ctx.strokeStyle=`rgba(255,216,145,${.08+breath*.13})`;ctx.lineWidth=1.3;ctx.stroke();
      }
      for(const a of this.anchors){const x=a.x*w,y=a.y*h,r=(18+a.seed%18)*(1+breath*.18);const g2=ctx.createRadialGradient(x,y,0,x,y,r*3);g2.addColorStop(0,'#ffe7a58a');g2.addColorStop(.18,'#ffe9b12a');g2.addColorStop(1,'#f6bb6000');ctx.fillStyle=g2;ctx.fillRect(x-r*3,y-r*3,r*6,r*6);}
    }else{
      if(this.asset?.ready)this.asset.render(t);
      for(const a of this.anchors){
        const seed=a.seed,x=a.x*w+Math.sin(t*.23+seed)*4,y=a.y*h+Math.sin(t*.37+seed)*5;
        const r=(this.scene==='tree'?26+seed%27:22+seed%31)*(1+breath*.1+this.energy*.12)*Math.min(w,h)/720;
        if(this.asset && this.asset.ready){const aspect=this.asset.canvas.width/this.asset.canvas.height;ctx.drawImage(this.asset.canvas,x-r*1.5*aspect,y-r*1.7,r*3*aspect,r*3);}
        else this.bubble(ctx,x,y,r,t,seed,color);
        if(this.scene==='sky'){
          for(let j=-1;j<=1;j++){ctx.beginPath();ctx.moveTo(x+j*r*.3,y+r*.7);ctx.bezierCurveTo(x+j*r*.5+Math.sin(t+seed)*r*.4,y+r*1.1,x+j*r*.5-Math.cos(t+seed)*r*.4,y+r*1.8,x+j*r*.32,y+r*2.4);ctx.strokeStyle=`${color}50`;ctx.lineWidth=1;ctx.stroke();}
        }
      }
    }
    // VFX is clipped to the detected target region. No real-world depth or persistent 3D anchor is implied.
    ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.maskCanvas,0,0,w,h);ctx.globalCompositeOperation='source-over';
  }
  render(now){
    const before=performance.now(),dt=Math.min(.1,(now-(this.last||now))/1000);this.last=now;
    const target=this.held?.96:.27;this.energy+=(target-this.energy)*(1-Math.exp(-dt*3));
    this.phase+=dt/this.cycle*Math.PI*2;
    this.drawSource();const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;
    ctx.drawImage(this.raw,0,0);
    if(this.remote && this.remote.readyState>=2 && !this.compare){const r=containRect(this.remote.videoWidth,this.remote.videoHeight,w,h);ctx.fillStyle='#0c1412';ctx.fillRect(0,0,w,h);ctx.drawImage(this.remote,r.x,r.y,r.w,r.h);}
    else if(this.enabled&&!this.compare){this.paintEffects(now/1000);ctx.drawImage(this.fx,0,0);}
    if(this.debug&&!this.remote&&!this.compare)ctx.drawImage(this.debugCanvas,0,0,w,h);
    if(!this.compare){ctx.save();ctx.fillStyle='#f6ffe899';ctx.font=`${Math.round(w/105)}px ui-monospace, monospace`;ctx.textAlign='left';ctx.fillText('B R E A T H E  C I T Y',w*.025,h*.954);ctx.font=`${Math.round(w/130)}px ui-monospace, monospace`;ctx.textAlign='right';ctx.fillText(this.remote?'AI VIDEO EDIT':'LOCAL VFX',w*.975,h*.954);ctx.restore();}
    this.frameCount++;if(now-this.lastCount>=1000){this.fps=Math.round(this.frameCount*1000/(now-this.lastCount));this.frameCount=0;this.lastCount=now;}
    this.renderMs=this.renderMs*.95+(performance.now()-before)*.05;
    if(this.running)this.raf=requestAnimationFrame(n=>this.render(n));
  }
  start(){if(this.running)return;this.running=true;this.raf=requestAnimationFrame(n=>this.render(n));}
  stop(){this.running=false;cancelAnimationFrame(this.raf);}
}
