/** All paid mutations use same-origin sessions and persistent client idempotency. */
export class GenerationClient {
  constructor(){this.csrf=null;this.sessionId=null;}
  async request(path,{method='GET',body,key}={}){
    const form=body instanceof FormData,headers={'X-Breathe-Request':'1'};if(body&&!form)headers['Content-Type']='application/json';if(this.csrf)headers['X-CSRF-Token']=this.csrf;if(key)headers['Idempotency-Key']=key;
    const r=await fetch(`/api/v1${path}`,{method,credentials:'same-origin',headers,body:body?(form?body:JSON.stringify(body)):undefined});
    let data;try{data=await r.json();}catch{throw new Error('服务响应未确认，请保留当前任务后重试');}
    if(!r.ok){const error=new Error(data.error?.message||'服务请求失败');error.code=data.error?.code;error.noJobCreated=data.error?.noJobCreated===true;throw error;}return data;
  }
  config(){return this.request('/config');}
  async connect(invite){const r=await this.request('/session',{method:'POST',body:{invite}});this.csrf=r.csrf;this.sessionId=r.sessionId;return r;}
  async restore(){const r=await this.request('/session');this.csrf=r.csrf;this.sessionId=r.sessionId;return r;}
  async upload(blob){const body=new FormData();body.set('file',blob,'frame.jpg');return (await this.request('/media',{method:'POST',body})).media;}
  quote(body){return this.request('/quotes',{method:'POST',body});}
  submit(body,key){return this.request('/generations',{method:'POST',body,key});}
  jobs(cursor){return this.request('/generations'+(cursor?'?cursor='+encodeURIComponent(cursor):''));}
  async deleteData(){const result=await this.request('/session/data',{method:'DELETE'});this.csrf=null;this.sessionId=null;return result;}
  control(id,action){return this.request(`/generations/${id}/${action}`,{method:'POST',body:{}});}
  async result(id){const r=await fetch(`/api/v1/media/${id}/content`,{credentials:'same-origin'});if(!r.ok)throw new Error('素材已失效或下载失败');return r.blob();}
}
