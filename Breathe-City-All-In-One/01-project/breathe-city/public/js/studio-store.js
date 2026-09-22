/** Version 2 preserves the original works store and adds recoverable drafts. */
export class StudioStore {
  constructor(){this.db=null;this.opening=null;this.temporary=false;this.memory={works:new Map(),drafts:new Map()};}
  async open(){
    if(this.db)return this.db;if(this.temporary)return null;if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{
      const req=indexedDB.open('breathe-city',2);
      req.onupgradeneeded=()=>{for(const name of ['works','drafts'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});};
      req.onsuccess=()=>{this.db=req.result;this.db.onversionchange=()=>{this.db.close();this.db=null;};resolve(this.db);};
      req.onerror=()=>reject(new Error('本机作品库不可用'));
      req.onblocked=()=>reject(new Error('请关闭旧版页面后重试'));
    }).catch(()=>{this.temporary=true;return null;}).finally(()=>{this.opening=null;});return this.opening;
  }
  async operation(store,mode,action){
    const db=await this.open();if(!db)throw new Error('仅当前页面临时保存');
    return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const req=action(tx.objectStore(store));let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error('存储空间不足或写入中断'));});
  }
  async list(store){
    try{const rows=await this.operation(store,'readonly',s=>s.getAll());for(const row of rows)this.memory[store].set(row.id,row);}catch{}
    return [...this.memory[store].values()].sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));
  }
  async put(store,row){
    const record={...row,updatedAt:Date.now(),saved:true};
    try{await this.operation(store,'readwrite',s=>s.put(record));this.memory[store].set(row.id,record);return record;}
    catch{const temporary={...record,saved:false};this.memory[store].set(row.id,temporary);return temporary;}
  }
  async remove(store,id){
    const prior=this.memory[store].get(id);
    // Failed durable deletion stays visible and is reported to the caller.
    if(!this.temporary||prior?.saved)await this.operation(store,'readwrite',s=>s.delete(id));
    this.memory[store].delete(id);
  }
}
