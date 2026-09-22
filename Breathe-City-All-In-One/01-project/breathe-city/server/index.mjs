import { acquireDataLock } from './data-lock.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { JobStore } from './store.mjs';
import { createProviders } from './providers.mjs';
import { JobWorker } from './worker.mjs';
import { createGenerationApp } from './generation-app.mjs';
import { createHttpApp } from './http.mjs';
if(existsSync('.env')) process.loadEnvFile('.env');
const config=loadConfig();
const releaseDataLock=acquireDataLock(config.dataDir);process.once('exit',releaseDataLock);
const store=new JobStore(config.dataDir), providers=createProviders(config);
const worker=new JobWorker(store,providers);
const generationApp=await createGenerationApp(config);
const app=createHttpApp({config,store,providers,generationApp,publicDir:fileURLToPath(new URL('../public/',import.meta.url))});
app.listen(config.port,config.host,()=>{
  worker.start();generationApp.start();
  console.log(`\n  BREATHE CITY / 城市呼吸相机\n  Open: ${config.origin}\n  Local rendering works without API keys.\n  Press Ctrl+C to stop.\n`);
});
app.on('error',err=>{console.error(`Server failed (${err.code || 'unknown'}). Check the port and HOST.`);process.exitCode=1;void Promise.all([worker.stop(),generationApp.close()]).then(()=>store.close());});
let closing=false;
async function close(){if(closing)return;closing=true;app.close();await worker.stop();await generationApp.close();store.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
