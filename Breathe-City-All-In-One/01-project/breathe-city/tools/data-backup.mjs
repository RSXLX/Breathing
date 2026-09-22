/** Offline private-data backup; restore always creates a new directory. No cloud calls. */
import { readdir,readFile,writeFile,mkdir,stat,rm,access,realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,join,relative,dirname,isAbsolute,basename } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { acquireDataLock } from '../server/data-lock.mjs';
const digest=data=>createHash('sha256').update(data).digest('hex');
async function files(directory,base=directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(entry.name==='.breathe-writer.lock')continue;const path=join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Symbolic links are not allowed in private-data snapshots');if(entry.isDirectory())result.push(...await files(path,base));else if(entry.isFile())result.push(relative(base,path));else throw new Error('Unsupported private-data entry');}return result.sort();}
async function absent(path){try{await access(path);throw new Error('Destination already exists; restore must use a new directory');}catch(e){if(e.code!=='ENOENT')throw e;}}
async function checkDatabases(directory){for(const name of ['breathe.sqlite','generation.sqlite']){try{await access(join(directory,name));}catch{continue;}const db=new DatabaseSync(join(directory,name),{readOnly:true});try{if(Object.values(db.prepare('PRAGMA quick_check').get())[0]!=='ok')throw new Error('Snapshot database integrity check failed');}finally{db.close();}}}
export async function backupData(source,destination){
 source=await realpath(source);destination=join(await realpath(dirname(resolve(destination))),basename(destination));if(destination===source||destination.startsWith(source+'/'))throw new Error('Backup destination must be outside the data directory');
 if(!(await stat(source)).isDirectory())throw new Error('Source is not a directory');await absent(destination);const release=acquireDataLock(source);let created=false;
 try{await mkdir(destination,{mode:0o700});created=true;await mkdir(join(destination,'files'),{mode:0o700});const entries=[];for(const name of await files(source)){const buffer=await readFile(join(source,name));await mkdir(dirname(join(destination,'files',name)),{recursive:true,mode:0o700});await writeFile(join(destination,'files',name),buffer,{mode:0o600,flag:'wx'});entries.push({name,bytes:buffer.length,sha256:digest(buffer)});}await checkDatabases(join(destination,'files'));entries.length=0;for(const name of await files(join(destination,'files'))){const data=await readFile(join(destination,'files',name));entries.push({name,bytes:data.length,sha256:digest(data)});}await writeFile(join(destination,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),files:entries},null,2),{mode:0o600});return {files:entries.length};}
 catch(e){if(created)await rm(destination,{recursive:true,force:true});throw e;}finally{release();}
}
export async function restoreData(snapshot,destination){
 snapshot=await realpath(snapshot);destination=join(await realpath(dirname(resolve(destination))),basename(destination));if(destination===snapshot||destination.startsWith(snapshot+'/'))throw new Error('Restore destination must be outside the snapshot');await absent(destination);const manifest=JSON.parse(await readFile(join(snapshot,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files))throw new Error('Unsupported backup manifest');const names=new Set();
 for(const entry of manifest.files){if(typeof entry.name!=='string'||!entry.name||isAbsolute(entry.name)||entry.name.split(/[\\/]/).some(p=>p==='..'||p==='.'||!p)||names.has(entry.name)||entry.name==='.breathe-writer.lock')throw new Error('Invalid snapshot path');names.add(entry.name);const data=await readFile(join(snapshot,'files',entry.name));if(data.length!==entry.bytes||digest(data)!==entry.sha256)throw new Error('Snapshot checksum mismatch');}
 const actual=await files(join(snapshot,'files'));if(actual.length!==names.size||actual.some(n=>!names.has(n)))throw new Error('Snapshot files differ from manifest');
 await mkdir(destination,{mode:0o700});try{for(const entry of manifest.files){const target=join(destination,entry.name);await mkdir(dirname(target),{recursive:true,mode:0o700});const data=await readFile(join(snapshot,'files',entry.name));if(data.length!==entry.bytes||digest(data)!==entry.sha256)throw new Error('Snapshot changed during restore');await writeFile(target,data,{mode:0o600,flag:'wx'});}await checkDatabases(destination);return {files:manifest.files.length};}catch(e){await rm(destination,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,source,destination]=process.argv.slice(2);
 if(!['backup','restore'].includes(mode)||!source||!destination){console.error('Usage: node tools/data-backup.mjs backup|restore SOURCE NEW_DESTINATION');process.exitCode=1;}
 else try{console.log(JSON.stringify(await (mode==='backup'?backupData:restoreData)(source,destination)));}catch(e){console.error(e.message);process.exitCode=1;}
}
