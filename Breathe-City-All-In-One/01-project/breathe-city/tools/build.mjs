/** Bundle only this application's explicit native named-import modules. */
import { readFile,mkdir,writeFile,cp } from 'node:fs/promises';
import { resolve,dirname,extname } from 'node:path';
const root=resolve('public');
async function bundle(htmlName,outName){
  const modules=new Map();
  async function collect(path){path=resolve(path);if(modules.has(path))return;const source=await readFile(path,'utf8'),imports=[...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm)];for(const match of imports)await collect(resolve(dirname(path),match[2]));modules.set(path,{source,imports});}
  let html=await readFile(resolve(root,htmlName),'utf8');const entry=html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1],style=html.match(/<link rel="stylesheet" href="([^"]+)">/)?.[1];if(!entry||!style)throw new Error('Missing module or stylesheet entry');
  await collect(resolve(root,'.'+entry));const keys=new Map([...modules.keys()].map((path,i)=>[path,`m${i}`]));let script='const __modules={};\n';
  for(const [path,{source,imports}]of modules){const exports=[...source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m=>m[1]);let body=source;for(const match of imports)body=body.replace(match[0],`const {${match[1].replace(/\s+as\s+/g,':')}}=__modules['${keys.get(resolve(dirname(path),match[2]))}'];\n`);body=body.replace(/^export\s+/gm,'');script+=`\n__modules['${keys.get(path)}']=(()=>{\n${body}\nreturn {${exports.join(',')}};\n})();\n`;}
  let css=await readFile(resolve(root,'.'+style),'utf8');const assets=new Set([...script.matchAll(/['"](\/assets\/[^'"]+)['"]/g),...css.matchAll(/['"](\/assets\/[^'"]+)['"]/g)].map(m=>m[1]));
  for(const path of assets){const data=await readFile(resolve(root,'.'+path)),mime={'.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary'}[extname(path)],uri=`data:${mime};base64,${data.toString('base64')}`;script=script.split(`'${path}'`).join(`'${uri}'`).split(`"${path}"`).join(`"${uri}"`);css=css.split(path).join(uri);}
  html=html.replace(`<link rel="stylesheet" href="${style}">`,`<style>${css}</style>`).replace(`<script type="module" src="${entry}"></script>`,()=>`<script type="module">${script.replace(/<\/script/gi,'<\\/script')}</script>`);
  await writeFile(outName,html);console.log(`Build passed: ${outName} (${Math.round(Buffer.byteLength(html)/1024)} KB).`);
}
await mkdir('dist',{recursive:true});await cp('public','dist/web',{recursive:true});
await bundle('index.html','dist/breathe-city-preview.html');
await bundle('legacy.html','dist/breathe-city-legacy-preview.html');
