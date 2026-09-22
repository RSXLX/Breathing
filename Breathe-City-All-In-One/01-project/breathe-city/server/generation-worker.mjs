import { downloadResult } from './media-store.mjs';
export class GenerationWorker {
  constructor(store,media,provider,{download=downloadResult}={}){this.store=store;this.media=media;this.provider=provider;this.download=download;this.busy=false;this.stopped=false;}
  start(){this.timer=setInterval(()=>void this.tick().catch(()=>{}),500);this.timer.unref();}
  async stop(){this.stopped=true;clearInterval(this.timer);while(this.busy)await new Promise(r=>setTimeout(r,50));}
  async tick(){
    if(this.stopped||this.busy)return;const job=this.store.due();if(!job)return;this.busy=true;
    try{
      if(job.state==='queued'){
        this.store.patch(job.id,{state:'submitting'});
        try{const id=await this.provider.submit(job);this.store.patch(job.id,{state:'running',provider_id:id,poll_started_at:Date.now(),next_poll_at:Date.now()+this.store.config.pollMs});}
        catch(e){this.store.patch(job.id,{state:e.ambiguous?'needs_review':'failed',error_code:e.message});if(e.ambiguous)this.store.db.prepare("UPDATE budget_entries SET state='unknown' WHERE job_id=?").run(job.id);/* Unknown actual charging retains the reservation even on definite failure. */}
        return;
      }
      if(Date.now()-(job.poll_started_at||job.created_at)>45*60000){this.store.patch(job.id,{state:'needs_review',error_code:'POLL_WINDOW_ELAPSED'});return;}
      let status;
      try{status=await this.provider.poll(job.provider_id);}catch(e){if(this.store.job(job.owner,job.id).state!=='running')return;this.store.patch(job.id,{state:e.retryable?'running':'needs_review',next_poll_at:Date.now()+60000,error_code:e.message});return;}
      if(this.store.job(job.owner,job.id).state!=='running')return;
      if(status.state==='running'){this.store.patch(job.id,{next_poll_at:Date.now()+this.store.config.pollMs});return;}
      if(status.state==='failed'){this.store.patch(job.id,{state:'failed',error_code:'PROVIDER_FAILED'});return;}
      this.store.patch(job.id,{state:'ingesting'});
      try{const buffer=await this.download(status.url,this.store.config.resultHosts);const row=await this.media.video(job.owner,buffer);this.store.patch(job.id,{state:'succeeded',result_media_id:row.id,error_code:null});this.store.db.prepare("UPDATE budget_entries SET state='awaiting_reconciliation' WHERE job_id=?").run(job.id);}
      catch{this.store.patch(job.id,{state:'ingest_failed',error_code:'RESULT_INGEST_FAILED'});}
    }finally{this.busy=false;}
  }
}
