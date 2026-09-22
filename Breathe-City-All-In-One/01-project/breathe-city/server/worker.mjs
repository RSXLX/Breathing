/** One persistent job runner, not four microservices. Submission is never blindly retried. */
export class JobWorker {
  constructor(store, providers, { pollMs = 5000, demoMs = 1400 } = {}) {
    this.store = store; this.providers = providers; this.pollMs = pollMs; this.demoMs = demoMs;
    this.busy = false; this.stopped = false;
  }
  start() { this.timer = setInterval(() => void this.tick(), 250); this.timer.unref(); }
  async stop() { this.stopped = true; clearInterval(this.timer); while (this.busy) await new Promise(r => setTimeout(r, 20)); }
  async tick() {
    if (this.busy || this.stopped) return;
    const job = this.store.due(); if (!job) return;
    this.busy = true;
    try {
      if (job.mode === 'demo') {
        if (job.state === 'queued') this.store.patch(job.id, { state:'polling', progress:25, nextPollAt:Date.now()+this.demoMs });
        else this.store.patch(job.id, { state:'succeeded', progress:100, result: job.kind === 'tripo'
          ? { modelUrl:'/assets/seedpod.glb', thumbnailUrl:null, provenance:'procedural-demo-not-tripo' }
          : { worldUrl:'/world.html', thumbnailUrl:null, provenance:'procedural-demo-not-worldlabs' } });
        return;
      }
      if (job.state === 'queued') {
        this.store.patch(job.id, { state:'submitting' });
        try {
          const id = await this.providers.submit(job);
          this.store.patch(job.id, { state:'polling', providerId:id, pollStartedAt:Date.now(), nextPollAt:Date.now()+this.pollMs });
        } catch (err) {
          this.store.patch(job.id, { state:err.ambiguous ? 'needs_review':'failed', error:err.message });
        }
        return;
      }
      if (Date.now() - (job.pollStartedAt || job.createdAt) > 45 * 60 * 1000) {
        this.store.patch(job.id, { state:'needs_review', error:'Polling window elapsed. Provider task ID is preserved; check dashboard.' }); return;
      }
      try {
        const update = await this.providers.poll(job);
        // Stop-monitoring may occur while the network request is in-flight. Do not overwrite it.
        if (this.store.get(job.id)?.state !== 'polling') return;
        this.store.patch(job.id, { ...update, polls:job.polls+1, nextPollAt:Date.now()+this.pollMs });
      } catch (err) {
        if (this.store.get(job.id)?.state !== 'polling') return;
        this.store.patch(job.id, { state:err.retryable ? 'polling':'needs_review', polls:job.polls+1,
          error:err.message, nextPollAt:Date.now()+Math.min(60000, this.pollMs * 2 ** Math.min(job.polls, 4)) });
      }
    } finally { this.busy = false; }
  }
}
