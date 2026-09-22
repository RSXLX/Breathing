/** Single-host writer lock shared by the server and offline backup commands. */
import { mkdirSync,openSync,writeFileSync,closeSync,readFileSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export function acquireDataLock(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});const path=join(directory,'.breathe-writer.lock'),token=randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  let fd;
  try{fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,token}));closeSync(fd);return ()=>{try{if(JSON.parse(readFileSync(path,'utf8')).token===token)unlinkSync(path);}catch{}};}
  catch(error){
   if(fd!==undefined){try{closeSync(fd);}catch{}}
   if(error.code!=='EEXIST')throw error;
   let old;try{old=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('Data directory is locked. Stop its server and inspect .breathe-writer.lock before retrying.');}
   if(Number.isSafeInteger(old.pid)&&old.pid>0){try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH'&&JSON.parse(readFileSync(path,'utf8')).token===old.token){unlinkSync(path);continue;}}}
   throw new Error('Data directory is in use. Stop its server before backup, restore or another server start.');
  }
 }
 throw new Error('Could not acquire data directory lock');
}
