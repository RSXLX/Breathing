"""Original procedural illustrations and a tiny GLB. No downloaded photographs or fonts."""
from pathlib import Path
from PIL import Image, ImageDraw
import random, math, json, struct
ROOT=Path(__file__).resolve().parents[1]/'public/assets'
ROOT.mkdir(parents=True, exist_ok=True)
W,H=1280,720

def make_scene(name,skyline,trees):
 r=random.Random({'park':31,'blocks':13,'rooftop':93}[name]); mask=Image.new('RGB',(W,H)); m=ImageDraw.Draw(mask)
 out=[f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
 <defs>
 <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#101f28"/><stop offset=".62" stop-color="#597b76"/><stop offset="1" stop-color="#e3ba8b"/></linearGradient>
 <linearGradient id="ground" x2="0" y2="1"><stop stop-color="#263e36"/><stop offset="1" stop-color="#101b18"/></linearGradient>
 <linearGradient id="glass" x2="1" y2=".4"><stop stop-color="#172c2c"/><stop offset=".6" stop-color="#294544"/><stop offset="1" stop-color="#15292a"/></linearGradient>
 <radialGradient id="halo"><stop stop-color="#ffe0a0" stop-opacity=".36"/><stop offset="1" stop-color="#ffe0a0" stop-opacity="0"/></radialGradient>
 <linearGradient id="path" x2="0" y2="1"><stop stop-color="#718379"/><stop offset="1" stop-color="#313e35"/></linearGradient>
 </defs><path d="M0 0H1280V720H0Z" fill="url(#sky)"/>''']
 m.rectangle((0,0,W,H), fill=(1,0,0))
 # cloud bands
 for i in range(14):
  x=r.randrange(-180,1280); y=r.randrange(30,220); rw=r.randrange(90,250)
  out.append(f'<ellipse cx="{x}" cy="{y}" rx="{rw}" ry="{r.randrange(4,12)}" fill="#bad0c3" opacity=".055"/>')
 out.append('<circle cx="973" cy="108" r="18" fill="#d5ded0" opacity=".75"/>')
 for layer in range(2):
  x=-25
  while x<W:
   bw=r.randrange(35,100); bh=r.randrange(50,170); by=skyline+55+layer*20-bh
   out.append(f'<rect x="{x}" y="{by}" width="{bw}" height="{bh}" fill="{["#6d837b","#3f5d56"][layer]}" opacity=".7"/>')
   m.rectangle((x,by,x+bw,by+bh),fill=(2,0,0)); x+=bw+r.randrange(4,16)
 # near blocks
 blocks=[(25,180,205,480),(241,245,137,375),(836,205,168,420),(1014,123,224,515)] if name=='park' else ([(0,175,195,460),(215,105,255,555),(496,265,179,385),(700,155,220,505),(948,45,281,610)] if name=='blocks' else [(0,420,150,200),(169,454,200,175),(826,440,115,190),(982,360,298,300)])
 for bi,(x,y,bw,bh) in enumerate(blocks):
  out.append(f'<path d="M{x} {y}H{x+bw}V{y+bh}H{x}Z" fill="url(#glass)"/><path d="M{x+bw} {y}l14 12v{bh-12}h-14z" fill="#112222"/>')
  m.rectangle((x,y,x+bw+14,y+bh),fill=(2,0,0))
  for wx in range(x+10,x+bw-7,18):
   out.append(f'<path d="M{wx} {y+5}V{y+bh}" stroke="#47645c" stroke-opacity=".35"/>')
   for wy in range(y+17,y+bh-12,22):
    active=r.random()<.3
    out.append(f'<rect x="{wx+2}" y="{wy}" width="8" height="11" fill="{"#e3bb7b" if active else "#467066"}" opacity="{.52 if active else .17}"/>')
  out.append(f'<path d="M{x} {y}H{x+bw}" stroke="#74918a" stroke-opacity=".45"/>')
 ground=570 if name!='rooftop' else 605
 out.append(f'<path d="M0 {ground}H1280V720H0Z" fill="url(#ground)"/>');m.rectangle((0,ground,W,H),fill=(0,0,0))
 if name=='park':
  out.append('<path d="M560 573H699L867 720H324Z" fill="url(#path)"/><path d="M567 573L336 720M693 573L852 720" stroke="#c7d3ad" opacity=".25"/>')
 elif name=='blocks':
  out.append('<path d="M0 668H1280V720H0Z" fill="#151f20"/><path d="M0 691H1280" stroke="#bba879" stroke-dasharray="48 34" opacity=".4"/>')
 else:
  out.append('<path d="M0 628H1280V720H0Z" fill="#22302d"/><path d="M0 628H1280" stroke="#85988a" stroke-width="5"/>')
 # layered trees
 for ti,(tx,ty,scale) in enumerate(trees):
  trunk=ty+130*scale
  out.append(f'<path d="M{tx} {trunk}L{tx-5*scale} {ty-55*scale}M{tx} {ty+40*scale}L{tx-50*scale} {ty-45*scale}M{tx} {ty+5*scale}L{tx+52*scale} {ty-70*scale}" stroke="#263128" stroke-width="{10*scale}" fill="none"/>')
  for j in range(34):
   a=r.random()*math.tau; rad=math.sqrt(r.random())*104*scale
   cx=tx+math.cos(a)*rad;cy=ty-35*scale+math.sin(a)*rad*.61;rr=r.uniform(20,43)*scale
   col=r.choice(['#254b37','#345c42','#2e513c','#41634a','#385d41','#244934'])
   out.append(f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rr:.1f}" ry="{rr*.83:.1f}" fill="{col}"/>')
   m.ellipse((cx-rr,cy-rr*.83,cx+rr,cy+rr*.83),fill=(3,0,0))
  for j in range(75):
   x=tx+r.uniform(-90,90)*scale;y=ty+r.uniform(-85,10)*scale
   out.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r.uniform(2,5)*scale:.1f}" ry="2" fill="#789466" opacity=".22"/>')
 # lamps and protected silhouette
 for x,y in [(443,568),(755,565)]:
  if name=='rooftop':continue
  out.append(f'<path d="M{x} {y}v-86h20" stroke="#13221d" stroke-width="5"/><rect x="{x+6}" y="{y-88}" width="24" height="4" rx="2" fill="#ffdda1"/><circle cx="{x+18}" cy="{y-85}" r="60" fill="url(#halo)"/>')
 if name=='park':
  out.append('<ellipse cx="629" cy="623" rx="18" ry="4" fill="#101c17" opacity=".5"/><circle cx="629" cy="573" r="6" fill="#17241e"/><path d="M629 580l-3 25-5 17m8-17 7 17M626 584l-8 15m13-15 8 13" stroke="#17241e" stroke-width="5" fill="none"/>')
  m.rectangle((614,565,644,628),fill=(4,0,0))
 out.append('<path d="M0 0H1280V720H0Z" fill="#061a15" opacity=".08"/></svg>')
 (ROOT/f'{name}.svg').write_text(''.join(out))
 mask.resize((160,90),resample=Image.Resampling.NEAREST).save(ROOT/f'{name}-mask.png')

make_scene('park',465,[(145,354,1.95),(367,430,1.1),(1138,359,1.6),(846,439,.85)])
make_scene('blocks',530,[(99,566,.5),(778,571,.45)])
make_scene('rooftop',580,[(92,629,.36)])
# A noncompressed self-contained glTF binary; original procedural seedpod mesh.
positions=[]; normals=[]; indices=[]
rows,cols=32,48
for i in range(rows+1):
 theta=.001+(math.pi-.002)*i/rows
 for j in range(cols+1):
  phi=math.tau*j/cols
  radius=math.sin(theta)*(.64+.1*math.cos(phi*5+theta*3))
  x=radius*math.cos(phi);y=math.cos(theta)*1.08;z=radius*math.sin(phi)
  positions += [x,y,z];d=math.sqrt(x*x+y*y+z*z);normals += [x/d,y/d,z/d]
for i in range(rows):
 for j in range(cols):
  a=i*(cols+1)+j;b=a+cols+1
  indices += [a,b,a+1,a+1,b,b+1]
p=struct.pack('<'+'f'*len(positions),*positions);n=struct.pack('<'+'f'*len(normals),*normals);ix=struct.pack('<'+'H'*len(indices),*indices)
binary=p+n+ix;binary+=b'\0'*((-len(binary))%4)
gltf={'asset':{'version':'2.0','generator':'Breathe City original procedural demo'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'indices':2,'material':0}]}],'materials':[{'name':'Quiet jade','pbrMetallicRoughness':{'baseColorFactor':[.62,.84,.48,1],'metallicFactor':.1,'roughnessFactor':.25},'doubleSided':True}],'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(p)},{'buffer':0,'byteOffset':len(p),'byteLength':len(n)},{'buffer':0,'byteOffset':len(p)+len(n),'byteLength':len(ix)}],'accessors':[{'bufferView':0,'componentType':5126,'count':len(positions)//3,'type':'VEC3','min':[-.74,-1.08,-.74],'max':[.74,1.08,.74]},{'bufferView':1,'componentType':5126,'count':len(normals)//3,'type':'VEC3'},{'bufferView':2,'componentType':5123,'count':len(indices),'type':'SCALAR'}]}
j=json.dumps(gltf,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
(ROOT/'seedpod.glb').write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
print('Created original scene assets and seedpod.glb')
