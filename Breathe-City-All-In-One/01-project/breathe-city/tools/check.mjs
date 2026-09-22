import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function files(dir){const out=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())out.push(...await files(path));else if(/\.(mjs|js)$/.test(path))out.push(path);}return out;}
const paths=[...await files('server'),...await files('public/js'),...await files('native'),...await files('tools'),...await files('tests')];
for(const path of paths){const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log(`Syntax check passed: ${paths.length} JavaScript modules.`);
