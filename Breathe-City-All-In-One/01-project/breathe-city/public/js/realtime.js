/** Opt-in remote pixels. An injected SDK loader supports offline contract tests. */
export class RealtimeSession {
  constructor(onState,onStream,loadSdk=url=>import(url)){
    this.onState=onState;this.onStream=onStream;this.loadSdk=loadSdk;
    this.client=null;this.stream=null;this.epoch=0;this.active=false;this.listeners=[];
  }
  async connect({rawCanvas,config,api,prompt}){
    if(this.active)throw new Error('实时会话已在运行');
    this.active=true;const epoch=++this.epoch;this.onState('connecting','正在建立实时生成会话…');
    try{
      // Import before requesting a token: a CDN failure must not consume token quota.
      const sdk=await this.loadSdk(config.decartSdkUrl);
      if(epoch!==this.epoch)return;
      const token=await api('/api/realtime/token',{method:'POST',body:{confirmed:true}});
      if(epoch!==this.epoch)return;
      const model=sdk.models.realtime(config.decartModel);
      this.stream=rawCanvas.captureStream(model.fps||25);
      // Start the local deadline BEFORE connect resolves. Stop capture even if signaling hangs.
      this.started=performance.now();
      this.timeout=setTimeout(()=>{this.disconnect();this.onState('idle','已达到本地会话时限，取景发送已停止。');},config.maxSessionSeconds*1000);
      const base=sdk.createDecartClient({apiKey:token.apiKey,telemetry:false});
      const connection=await base.realtime.connect(this.stream,{
        model,mirror:false,
        initialState:{prompt:{text:prompt,enhance:false}},
        onRemoteStream:stream=>{if(epoch===this.epoch)this.onStream(stream);else stream.getTracks().forEach(t=>t.stop());},
      });
      if(epoch!==this.epoch){connection.disconnect();return;}
      this.client=connection;
      if(typeof connection.on!=='function')throw new Error('Unsupported SDK event interface');
      const onError=()=>{if(epoch===this.epoch){this.disconnect();this.onState('error','实时连接异常，已停止发送；请手动核对后重新连接。');}};
      const onConnectionChange=status=>{
        if(epoch!==this.epoch)return;
        // The SDK has internal reconnect behavior. Terminate at its reconnect event;
        // do not mint another token or let this app silently launch another session.
        if(status==='reconnecting'||status==='disconnected'){
          this.disconnect();this.onState('idle','连接已中断，已停止发送。本应用不会自动新建会话。');
        }
      };
      this.listeners=[['error',onError],['connectionChange',onConnectionChange]];
      for(const [name,fn] of this.listeners)connection.on(name,fn);
      onConnectionChange(connection.getConnectionState?.());
      if(epoch===this.epoch)this.onState('connected','云端实时生成中 · 视频正在发送给 Decart');
    }catch(err){
      if(epoch===this.epoch){this.disconnect();this.onState('error','实时服务连接失败，请检查 SDK、令牌、网络或服务商控制台。');}
      throw new Error('实时服务未连接。请检查服务配置与网络；不要反复创建会话。');
    }
  }
  async setPrompt(prompt){if(!this.client)return;try{await this.client.setPrompt(prompt,{enhance:false});}catch{this.disconnect();this.onState('error','场景指令更新失败，已结束云会话。');}}
  disconnect(){
    this.epoch++;clearTimeout(this.timeout);const client=this.client;this.client=null;
    for(const [name,fn] of this.listeners)try{client?.off?.(name,fn);}catch{}
    this.listeners=[];
    // Release capture before asking the SDK to close; SDK failures cannot keep input alive.
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    try{client?.disconnect();}catch{}
    this.active=false;this.onStream(null);this.onState('idle','本地渲染 · 未发送视频');
  }
}
