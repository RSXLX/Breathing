import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupData,restoreData } from '../tools/data-backup.mjs';
import { acquireDataLock } from '../server/data-lock.mjs';
test('private-data backup round-trips SQLite and media without overwriting a destination',async()=>{
 const root=await mkdtemp(join(tmpdir(),'breathe-backup-')),data=join(root,'data'),snapshot=join(root,'snapshot'),restored=join(root,'restored');await mkdir(data);const db=new DatabaseSync(join(data,'generation.sqlite'));db.exec('PRAGMA journal_mode=WAL;CREATE TABLE proof(value TEXT);INSERT INTO proof VALUES(\'preserved\')');db.close();await mkdir(join(data,'private-media'));await writeFile(join(data,'private-media','example.jpg'),'private-fixture');
 try{
  await backupData(data,snapshot);await restoreData(snapshot,restored);assert.equal(await readFile(join(restored,'private-media','example.jpg'),'utf8'),'private-fixture');const copy=new DatabaseSync(join(restored,'generation.sqlite'));try{assert.equal(copy.prepare('SELECT value FROM proof').get().value,'preserved');}finally{copy.close();}
  await assert.rejects(restoreData(snapshot,restored),/already exists/);assert.equal(await readFile(join(restored,'private-media','example.jpg'),'utf8'),'private-fixture');
  await writeFile(join(snapshot,'files','private-media','example.jpg'),'tampered');await assert.rejects(restoreData(snapshot,join(root,'bad')),/checksum mismatch/);await assert.rejects(access(join(root,'bad')),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});}
});
test('live writer lock excludes offline backup and a second server',async()=>{
 const root=await mkdtemp(join(tmpdir(),'breathe-lock-')),data=join(root,'data');const release=acquireDataLock(data);
 try{assert.throws(()=>acquireDataLock(data),/in use/);await assert.rejects(backupData(data,join(root,'snapshot')),/in use/);release();const second=acquireDataLock(data);second();}finally{release();await rm(root,{recursive:true,force:true});}
});
