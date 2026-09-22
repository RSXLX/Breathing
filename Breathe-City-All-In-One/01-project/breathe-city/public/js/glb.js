/** Minimal self-contained GLB 2 viewer: triangle meshes, node transforms, base-color textures.
 * No skinning, animation, Draco or meshopt. Export an uncompressed GLB for this MVP.
 */
export function parseGlb(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20||buffer.byteLength>24*1024*1024)throw new Error('GLB 文件大小无效（上限 24 MB）。');
  const dv=new DataView(buffer);
  if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==buffer.byteLength)throw new Error('需要有效的 glTF 2.0 二进制 GLB。');
  let offset=12,json,bin;
  while(offset+8<=buffer.byteLength){const length=dv.getUint32(offset,true),type=dv.getUint32(offset+4,true);offset+=8;if(offset+length>buffer.byteLength)throw new Error('GLB 数据不完整。');
    if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset,length)).trim());
    if(type===0x004e4942)bin=buffer.slice(offset,offset+length);offset+=length;
  }
  if(!json||!bin)throw new Error('GLB 缺少 JSON 或二进制数据。');
  if((json.extensionsRequired||[]).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))throw new Error('请导出未使用 Draco / meshopt / KTX2 压缩的 GLB。');
  if((json.buffers||[]).some(b=>b.uri))throw new Error('请使用不依赖外部文件的 GLB。');
  const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},components={5120:['getInt8',1],5121:['getUint8',1],5122:['getInt16',2],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]};
  function accessor(index){
    const a=json.accessors?.[index],v=json.bufferViews?.[a?.bufferView],ct=components[a?.componentType],n=size[a?.type];
    if(!a||!v||!ct||!n||a.sparse||a.count>1000000||v.extensions?.EXT_meshopt_compression)throw new Error('GLB 包含不支持的 accessor。');
    const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||ct[1]*n;
    if(start<0||start+(a.count-1)*stride+ct[1]*n>bin.byteLength)throw new Error('GLB accessor 越界。');
    const view=new DataView(bin),result=new Float32Array(a.count*n);
    for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){let val=view[ct[0]](start+i*stride+k*ct[1],true);if(a.normalized&&a.componentType!==5126){const denom=a.componentType===5120?127:a.componentType===5121?255:a.componentType===5122?32767:65535;val=Math.max(-1,val/denom);}result[i*n+k]=val;}
    return result;
  }
  const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const multiply=(a,b)=>{const c=Array(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];return c;};
  function transform(n){if(n.matrix)return n.matrix;const [x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],[tx,ty,tz]=n.translation||[0,0,0];return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,(2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,(2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,tx,ty,tz,1];}
  const meshes=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  function visit(index,parent,chain=new Set()){
    if(chain.has(index)||chain.size>100)throw new Error('GLB 节点层级无效。');const next=new Set(chain);next.add(index);
    const node=json.nodes?.[index];if(!node)return;const matrix=multiply(parent,transform(node));
    if(node.skin!==undefined)throw new Error('MVP 预览暂不支持蒙皮，请导出静态模型。');
    if(node.mesh!==undefined)for(const p of json.meshes?.[node.mesh]?.primitives||[]){
      if((p.mode??4)!==4||p.targets)throw new Error('只支持静态三角形网格。');
      const pos=accessor(p.attributes.POSITION),uv=p.attributes.TEXCOORD_0!==undefined?accessor(p.attributes.TEXCOORD_0):new Float32Array(pos.length/3*2);
      const indices=p.indices!==undefined?new Uint32Array(accessor(p.indices)):Uint32Array.from({length:pos.length/3},(_,i)=>i);
      if(indices.length%3)throw new Error('三角形索引无效。');
      for(let i=0;i<pos.length;i+=3){const x=pos[i],y=pos[i+1],z=pos[i+2];for(let k=0;k<3;k++){pos[i+k]=matrix[k]*x+matrix[4+k]*y+matrix[8+k]*z+matrix[12+k];min[k]=Math.min(min[k],pos[i+k]);max[k]=Math.max(max[k],pos[i+k]);}}
      // Recompute normals in transformed space (also handles nonuniform node scales).
      const normals=new Float32Array(pos.length);
      for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;if(Math.max(a,b,c)+2>=pos.length)throw new Error('索引越界。');const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const j of [a,b,c]){normals[j]+=nx;normals[j+1]+=ny;normals[j+2]+=nz;}}
      const mat=json.materials?.[p.material]||{},pbr=mat.pbrMetallicRoughness||{};
      let texture=null;const textureIndex=pbr.baseColorTexture?.index;
      if(textureIndex!==undefined){const img=json.images?.[json.textures?.[textureIndex]?.source];if(img?.bufferView!==undefined){const view=json.bufferViews[img.bufferView];texture={bytes:bin.slice(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),mime:img.mimeType||'image/png'};}}
      meshes.push({positions:pos,normals,uv,indices,color:pbr.baseColorFactor||[.7,.85,.55,1],texture});
    }
    for(const child of node.children||[])visit(child,matrix,next);
  }
  for(const node of json.scenes?.[json.scene||0]?.nodes||[])visit(node,identity());
  if(!meshes.length||!min.every(Number.isFinite)||!max.every(Number.isFinite))throw new Error('没有可显示的网格。');
  const center=min.map((v,k)=>(v+max[k])/2),scale=2/Math.max(...max.map((v,k)=>v-min[k]),.001);
  for(const mesh of meshes)for(let i=0;i<mesh.positions.length;i++)mesh.positions[i]=(mesh.positions[i]-center[i%3])*scale;
  return {meshes,triangles:meshes.reduce((n,m)=>n+m.indices.length/3,0)};
}
export class GlbViewer {
  constructor(canvas){
    this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:true,preserveDrawingBuffer:true,antialias:true,premultipliedAlpha:false});
    this.meshes=[];this.ready=false;this.manualAngle=0;this.software=!this.gl;
    if(this.software){this.ctx=canvas.getContext('2d');if(!this.ctx)throw new Error('设备无法创建模型预览');this.bindDrag();return;}
    const gl=this.gl;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('GLB 着色器编译失败');return s;};
    const vs=shader(gl.VERTEX_SHADER,`#version 300 es
    precision highp float;in vec3 position;in vec3 normal;in vec2 uv;uniform float angle;uniform float aspect;out vec3 vNormal;out vec2 vUv;
    void main(){float c=cos(angle),s=sin(angle);mat3 rot=mat3(c,0.,-s,0.,1.,0.,s,0.,c);vec3 p=rot*position;mat3 tilt=mat3(1.,0.,0.,0.,.985,.174,0.,-.174,.985);p=tilt*p;p.z-=3.5;gl_Position=vec4(p.x*2.6/aspect,p.y*2.6,-1.02*p.z-.202,-p.z);vNormal=tilt*rot*normal;vUv=uv;}`);
    const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;in vec3 vNormal;in vec2 vUv;uniform vec4 color;uniform sampler2D tex;out vec4 result;
    void main(){vec3 n=normalize(vNormal);float light=.38+max(0.,dot(n,normalize(vec3(-.5,.8,1.))))*.6;float rim=pow(1.-abs(n.z),3.);vec4 base=texture(tex,vUv)*color;result=vec4(base.rgb*light+vec3(.64,.87,.58)*rim*.45,base.a);}`);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('GLB 渲染器初始化失败');
    this.bindDrag();
  }
  bindDrag(){const canvas=this.canvas;
    let dragging=false,lastX=0;canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(dragging){this.manualAngle+=(e.clientX-lastX)*.012;lastX=e.clientX;}});canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  }
  async load(buffer){
    const parsed=parseGlb(buffer),gl=this.gl;this.clear();
    if(this.software){if(parsed.triangles>20000)throw new Error('当前软件预览支持 2 万面以内模型，请简化或换用支持 WebGL2 的浏览器。');this.meshes=parsed.meshes;this.ready=true;this.triangles=parsed.triangles;this.lastSoftware=-1;this.render(0);return parsed;}
    try{for(const mesh of parsed.meshes){
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffers=[];
      for(const [name,data,size] of [['position',mesh.positions,3],['normal',mesh.normals,3],['uv',mesh.uv,2]]){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}
      const ib=gl.createBuffer();buffers.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
      if(mesh.texture){const bitmap=await createImageBitmap(new Blob([mesh.texture.bytes],{type:mesh.texture.mime}));gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);bitmap.close();}
      for(const pname of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,pname,gl.CLAMP_TO_EDGE);for(const pname of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,pname,gl.LINEAR);
      this.meshes.push({vao,buffers,texture,color:mesh.color,count:mesh.indices.length});
    }}catch(err){this.clear();throw err;}
    this.ready=true;this.triangles=parsed.triangles;this.render(0);return parsed;
  }
  renderSoftware(t){
    if(this.lastSoftware!==undefined && t-this.lastSoftware>=0 && t-this.lastSoftware<1/20)return;
    this.lastSoftware=t;const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;ctx.clearRect(0,0,w,h);
    const a=this.manualAngle+t*.24,c=Math.cos(a),s=Math.sin(a),faces=[];
    for(const mesh of this.meshes){
      const points=[];for(let i=0;i<mesh.positions.length;i+=3){const x=c*mesh.positions[i]+s*mesh.positions[i+2],yy=mesh.positions[i+1],zz=-s*mesh.positions[i]+c*mesh.positions[i+2],y=yy*.985-zz*.174,z=yy*.174+zz*.985;const k=h*1.3/(3.5-z);points.push([w/2+x*k,h/2-y*k,z,x,y]);}
      for(let i=0;i<mesh.indices.length;i+=3){const a=points[mesh.indices[i]],b=points[mesh.indices[i+1]],d=points[mesh.indices[i+2]],ux=b[3]-a[3],uy=b[4]-a[4],uz=b[2]-a[2],vx=d[3]-a[3],vy=d[4]-a[4],vz=d[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const n=Math.hypot(nx,ny,nz)||1;nx/=n;ny/=n;nz/=n;const light=.35+Math.abs(-nx*.35+ny*.56+nz*.7)*.6,rim=Math.pow(1-Math.abs(nz),3)*.2;const rgb=mesh.color.slice(0,3).map(v=>Math.round(Math.min(1,v*light+rim)*255));faces.push({p:[a,b,d],z:(a[2]+b[2]+d[2])/3,color:`rgba(${rgb.join(',')},${mesh.color[3]??1})`});}
    }
    faces.sort((a,b)=>a.z-b.z);for(const f of faces){ctx.beginPath();ctx.moveTo(f.p[0][0],f.p[0][1]);ctx.lineTo(f.p[1][0],f.p[1][1]);ctx.lineTo(f.p[2][0],f.p[2][1]);ctx.closePath();ctx.fillStyle=f.color;ctx.fill();}
  }
  render(t=0){if(!this.ready)return;if(this.software){this.renderSoftware(t);return;}const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.program);gl.uniform1f(gl.getUniformLocation(this.program,'angle'),this.manualAngle+t*.24);gl.uniform1f(gl.getUniformLocation(this.program,'aspect'),this.canvas.width/this.canvas.height);gl.uniform1i(gl.getUniformLocation(this.program,'tex'),0);for(const mesh of this.meshes){gl.bindVertexArray(mesh.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,mesh.texture);gl.uniform4fv(gl.getUniformLocation(this.program,'color'),mesh.color);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}}
  clear(){if(this.software){this.meshes=[];this.ready=false;return;}for(const m of this.meshes){this.gl.deleteVertexArray(m.vao);m.buffers.forEach(b=>this.gl.deleteBuffer(b));this.gl.deleteTexture(m.texture);}this.meshes=[];this.ready=false;}
  destroy(){this.clear();if(this.gl)this.gl.deleteProgram(this.program);}
}
