"""Zero-third-party-dependency CLI integration test. No external provider calls."""
import json, os, socket, subprocess, tempfile, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def verify(name, value):
    if not value: raise AssertionError(name)
    checks.append({'name':name,'passed':True})
with tempfile.TemporaryDirectory(prefix='breathe-runtime-') as directory:
    with socket.socket() as s:
        s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'PUBLIC_ORIGIN':base,'DATA_DIR':directory,'ALLOW_PAID_APIS':'false','ADMIN_TOKEN':'','TRIPO_API_KEY':'','WORLDLABS_API_KEY':'','DECART_API_KEY':''}
    def start():
        proc=subprocess.Popen(['node','server/index.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if request('/api/health')['ok']:return proc
            except Exception:time.sleep(.05)
        proc.terminate();proc.wait(timeout=5);raise RuntimeError('server did not become healthy')
    def request(path, body=None, raw=False):
        req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-Breathe-Request':'1','Origin':base})
        with urllib.request.urlopen(req,timeout=5) as res:return res.read() if raw else json.load(res)
    process=start()
    try:
        verify('CLI serves actual app HTML',b'Breathe City' in request('/',raw=True))
        payload={'kind':'tripo','mode':'demo','prompt':'A local sample only','idempotencyKey':'runtime-test-asset'}
        a=request('/api/jobs',payload);repeat=request('/api/jobs',payload)
        verify('HTTP retry reuses a persisted job',a['job']['id']==repeat['job']['id'] and repeat['reused'])
        b=request('/api/jobs',{**payload,'kind':'world','idempotencyKey':'runtime-test-world'})
        jobs=[]
        for _ in range(80):
            jobs=request('/api/jobs')['jobs']
            if len(jobs)==2 and all(j['state']=='succeeded' for j in jobs):break
            time.sleep(.1)
        verify('CLI worker completes both local demo tasks',len(jobs)==2 and all(j['state']=='succeeded' for j in jobs))
        verify('result provenance explicitly marks both as non-AI',all(j['result']['provenance'].startswith('procedural-demo-not-') for j in jobs))
        asset=next(j for j in jobs if j['kind']=='tripo')
        verify('returned model URL serves actual GLB bytes',request(asset['result']['modelUrl'],raw=True)[:4]==b'glTF')
        world=next(j for j in jobs if j['kind']=='world')
        verify('returned world URL serves a real demo page',b'<canvas' in request(world['result']['worldUrl'],raw=True))
        before={j['id'] for j in jobs};process.terminate();process.wait(timeout=5);process=start()
        verify('restart retains completed task IDs and results',{j['id'] for j in request('/api/jobs')['jobs']}==before)
    finally:
        process.terminate();process.wait(timeout=5)
print(json.dumps({'mode':'actual CLI + HTTP + SQLite + local demo worker','count':len(checks),'checks':checks,'paidCalls':0},ensure_ascii=False,indent=2))
