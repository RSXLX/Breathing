/** IndexedDB for persistent media; explicit session-only fallback in restricted/private browsers. */
export class LocalGallery {
  constructor(){this.memory=new Map();this.persistent=true;}
  async open(){
    if(this.db)return this.db;
    this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('breathe-city',1);r.onupgradeneeded=()=>r.result.createObjectStore('works',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('本地作品库不可用，请直接下载。'));r.onblocked=()=>reject(new Error('请关闭旧版页面后重试存储。'));});
    return this.db;
  }
  async transaction(mode,work){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('works',mode);let result;const request=work(tx.objectStore('works'));if(request)request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('本地存储失败或空间不足，请先下载作品。'));tx.onabort=()=>reject(new Error('本地存储被中断。'));});}
  async list(){
    if(this.persistent){try{const rows=await this.transaction('readonly',s=>s.getAll());for(const row of rows)this.memory.set(row.id,row);}catch{this.persistent=false;}}
    return [...this.memory.values()].sort((a,b)=>b.createdAt-a.createdAt);
  }
  async put(row){
    if(this.persistent){try{await this.transaction('readwrite',s=>s.put({...row,saved:true}));this.memory.set(row.id,{...row,saved:true});return true;}catch{this.persistent=false;}}
    this.memory.set(row.id,{...row,saved:false});return false;
  }
  async remove(id){
    // Never claim to delete a durable record if its IndexedDB delete failed.
    const previous=this.memory.get(id);
    if(previous?.saved||this.persistent)await this.transaction('readwrite',s=>s.delete(id));
    this.memory.delete(id);
  }
}
