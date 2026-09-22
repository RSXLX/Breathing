/** Opt-in worker. Video pixels are processed on-device; weights/JS need first-load network access. */
export class SemanticClient {
  constructor(onStatus,onResult){this.onStatus=onStatus;this.onResult=onResult;this.worker=null;this.busy=false;this.ready=false;this.epoch=0;this.sentEpoch=0;}
  async start(){
    if(location.protocol==='file:')throw new Error('语义模型需通过 npm start 打开的本地服务加载；离线预览仍可使用预设和规则。');
    if(this.worker)return;
    this.worker=new Worker('/js/segmentation-worker.js',{type:'module'});
    this.onStatus('loading','正在下载语义模型；首次加载需要联网');
    this.worker.onmessage=({data})=>{
      if(data.type==='ready'){this.ready=true;this.onStatus('ready','语义模型已就绪 · 本机推理');}
      else if(data.type==='progress')this.onStatus('loading',data.message);
      else if(data.type==='result'){this.busy=false;if(this.sentEpoch===this.epoch)this.onResult(data);}
      else if(data.type==='error'){this.busy=false;this.onStatus('error',data.message);this.stop();}
    };
    this.worker.onerror=()=>{this.onStatus('error','模型加载失败，请检查网络或改用规则分析。');this.stop();};
    this.worker.postMessage({type:'init'});
  }
  invalidate(){this.epoch++;}
  infer(image){if(!this.worker||!this.ready||this.busy)return false;this.busy=true;this.sentEpoch=this.epoch;this.worker.postMessage({type:'infer',width:image.width,height:image.height,rgba:image.data.buffer},[image.data.buffer]);return true;}
  stop(){this.worker?.terminate();this.worker=null;this.ready=false;this.busy=false;this.epoch++;}
}
