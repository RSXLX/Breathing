/** Provider adapters. Network functions are injectable for contract tests. Never log keys or raw responses. */
export class ProviderError extends Error {
  constructor(message, { ambiguous = false, retryable = false } = {}) {
    super(message); this.ambiguous = ambiguous; this.retryable = retryable;
  }
}
async function providerJson(fetcher, url, options = {}) {
  let r;
  try { r = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(18000) }); }
  catch { throw new ProviderError('Provider request did not complete. Check the provider dashboard before resubmitting.', { ambiguous: options.method === 'POST', retryable: true }); }
  if (!r.ok) throw new ProviderError(`Provider HTTP ${r.status}`, { ambiguous: options.method === 'POST' && r.status >= 500, retryable: r.status === 429 || r.status >= 500 });
  try { return await r.json(); }
  catch { throw new ProviderError('Invalid provider response', { ambiguous: options.method === 'POST', retryable: true }); }
}
export function safeRemoteUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
const providerId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(v);

export function createProviders(config, fetcher = fetch) {
  const tripoHeaders = { Authorization: `Bearer ${config.tripoKey}`, 'Content-Type': 'application/json' };
  const worldHeaders = { 'WLT-Api-Key': config.worldKey, 'Content-Type': 'application/json' };
  return {
    async submit(job) {
      if (job.kind === 'tripo') {
        const r = await providerJson(fetcher, 'https://openapi.tripo3d.ai/v3/generation/text-to-model', {
          method: 'POST', headers: tripoHeaders,
          body: JSON.stringify({ prompt: job.prompt, model: config.tripoModel, face_limit: 12000, texture: true, pbr: true }),
        });
        if (r.code !== 0) throw new ProviderError(`Tripo rejected submission (${Number(r.code) || 'unknown'})`);
        if (!providerId(r.data?.task_id)) throw new ProviderError('Missing Tripo task ID; check dashboard.', { ambiguous: true });
        return r.data.task_id;
      }
      const r = await providerJson(fetcher, 'https://api.worldlabs.ai/marble/v1/worlds:generate', {
        method: 'POST', headers: worldHeaders,
        body: JSON.stringify({ display_name: 'Breathe City / A quiet corner', model: config.worldModel, world_prompt: { type: 'text', text_prompt: job.prompt } }),
      });
      if (!providerId(r.operation_id)) throw new ProviderError('Missing World Labs operation ID; check dashboard.', { ambiguous: true });
      return r.operation_id;
    },
    async poll(job) {
      if (!providerId(job.providerId)) throw new ProviderError('Invalid provider ID');
      if (job.kind === 'tripo') {
        const r = await providerJson(fetcher, `https://openapi.tripo3d.ai/v3/tasks/${job.providerId}`, { headers: tripoHeaders });
        if (r.code !== 0 || !r.data) throw new ProviderError('Tripo task query rejected');
        const d = r.data;
        if (['failed', 'cancelled'].includes(d.status)) return { state: 'failed', error: 'Tripo task failed or was cancelled. Check the provider dashboard.' };
        if (d.status === 'success') {
          const modelUrl = safeRemoteUrl(d.output?.model_url);
          if (!modelUrl) throw new ProviderError('Tripo result has no HTTPS model URL');
          return { state: 'succeeded', result: { modelUrl, thumbnailUrl: safeRemoteUrl(d.output?.rendered_image_url), provenance: 'tripo-api' } };
        }
        return { state: 'polling', progress: Math.max(0, Math.min(99, Number(d.progress) || 0)) };
      }
      const r = await providerJson(fetcher, `https://api.worldlabs.ai/marble/v1/operations/${job.providerId}`, { headers: worldHeaders });
      if (r.error) return { state: 'failed', error: 'World Labs operation failed. Check the provider dashboard.' };
      if (!r.done) return { state: 'polling', progress: null };
      let world = r.response;
      if (!world) throw new ProviderError('World Labs completed without a result');
      if (world.world_id && !world.world_marble_url && !world.assets) {
        if (!providerId(world.world_id)) throw new ProviderError('Invalid world ID');
        world = await providerJson(fetcher, `https://api.worldlabs.ai/marble/v1/worlds/${world.world_id}`, { headers: worldHeaders });
      }
      const worldUrl = safeRemoteUrl(world.world_marble_url);
      if (!worldUrl) throw new ProviderError('World result has no viewer URL; inspect provider dashboard.');
      return { state: 'succeeded', result: { worldUrl, thumbnailUrl: safeRemoteUrl(world.assets?.thumbnail_url), provenance: 'worldlabs-api' } };
    },
    async token() {
      const r = await providerJson(fetcher, 'https://api.decart.ai/v1/client/tokens', {
        method: 'POST', headers: { 'x-api-key': config.decartKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60, allowedModels: [config.decartModel], allowedOrigins: [config.origin], constraints: { realtime: { maxSessionDuration: config.sessionSeconds } } }),
      });
      if (typeof r.apiKey !== 'string' || typeof r.expiresAt !== 'string') throw new ProviderError('Invalid client token response');
      return { apiKey: r.apiKey, expiresAt: r.expiresAt, maxSessionSeconds: config.sessionSeconds };
    },
  };
}
