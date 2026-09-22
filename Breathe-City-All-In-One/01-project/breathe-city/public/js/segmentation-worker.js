// Optional network-loaded dependency. This worker is never needed by the local demo path.
let segmenter, RawImage;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const hf=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js');
      hf.env.allowLocalModels=false;
      hf.env.backends.onnx.wasm.numThreads=1;
      RawImage=hf.RawImage;
      segmenter=await hf.pipeline('image-segmentation','Xenova/segformer-b0-finetuned-ade-512-512',{
        device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress'&&p.total)self.postMessage({type:'progress',message:`下载模型 ${Math.round(p.loaded/p.total*100)}% · ${p.file||''}`});}
      });
      self.postMessage({type:'ready'});
    }else if(data.type==='infer'&&segmenter){
      const started=performance.now();
      const image=new RawImage(new Uint8ClampedArray(data.rgba),data.width,data.height,4);
      const output=await segmenter(image,{subtask:'semantic'});
      const w=output[0]?.mask.width||data.width,h=output[0]?.mask.height||data.height,map=new Uint8Array(w*h);
      const mapping={sky:1,building:2,house:2,skyscraper:2,wall:2,tree:3,plant:3,palm:3,person:4,car:4,bus:4,truck:4,bicycle:4,motorbike:4,signboard:4,'traffic light':4};
      // Protected semantic classes override target classes. This is not a guaranteed privacy filter.
      const layers=output.filter(o=>mapping[o.label]).sort((a,b)=>(mapping[a.label]===4?1:0)-(mapping[b.label]===4?1:0));
      for(const layer of layers){const values=layer.mask.data,channels=layer.mask.channels||1,id=mapping[layer.label];for(let i=0;i<map.length;i++)if(values[i*channels]>0)map[i]=id;}
      self.postMessage({type:'result',map:map.buffer,width:w,height:h,inferenceMs:Math.round(performance.now()-started)},[map.buffer]);
    }
  }catch(error){self.postMessage({type:'error',message:'语义模型下载或推理失败；可继续使用规则分析。模型不会被伪装成已运行。'});}
};
