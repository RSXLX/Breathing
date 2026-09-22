import { resolve } from 'node:path';

export function loadConfig(env = process.env) {
  const num = (name, fallback, min, max) => {
    const n = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}`);
    return n;
  };
  const host = env.HOST || '127.0.0.1';
  const adminToken = env.ADMIN_TOKEN || '';
  if (adminToken && adminToken.length < 24) throw new Error('ADMIN_TOKEN must have at least 24 characters');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !adminToken) {
    throw new Error('A non-loopback HOST requires ADMIN_TOKEN (24+ characters)');
  }
  const port = num('PORT', 3000, 0, 65535);
  const origin = env.PUBLIC_ORIGIN || `http://localhost:${port}`;
  const originUrl = new URL(origin);
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.origin !== origin) throw new Error('Invalid PUBLIC_ORIGIN');
  const sdk = env.DECART_SDK_URL || 'https://esm.sh/@decartai/sdk';
  if (!/^https:\/\/esm\.sh\/@decartai\/sdk(?:@[^/?]+)?(?:\?.*)?$/.test(sdk)) throw new Error('Invalid DECART_SDK_URL');
  return {
    host, port, origin, adminToken, allowPaid: env.ALLOW_PAID_APIS === 'true',
    dataDir: resolve(env.DATA_DIR || './data'),
    tripoKey: env.TRIPO_API_KEY || '', tripoModel: env.TRIPO_MODEL || 'v3.1-20260211',
    worldKey: env.WORLDLABS_API_KEY || '', worldModel: env.WORLDLABS_MODEL || 'marble-1.1',
    decartKey: env.DECART_API_KEY || '', decartModel: env.DECART_MODEL || 'lucy-2.5', decartSdkUrl: sdk,
    maxJobs: num('MAX_REAL_JOBS_PER_DAY', 10, 1, 1000),
    maxTokens: num('MAX_REALTIME_TOKENS_PER_DAY', 20, 1, 1000),
    sessionSeconds: num('MAX_SESSION_SECONDS', 30, 10, 120),
  };
}
export function publicConfig(c) {
  const gated = c.allowPaid && !!c.adminToken;
  return { version: '0.1.0', mode: 'local-first',
    providers: { tripo: gated && !!c.tripoKey, world: gated && !!c.worldKey, decart: gated && !!c.decartKey },
    paidEnabled: gated, adminRequired: !!c.adminToken, maxSessionSeconds: c.sessionSeconds,
    decartModel: c.decartModel, decartSdkUrl: c.decartSdkUrl,
    limits: { jobsPerDay: c.maxJobs, tokensPerDay: c.maxTokens },
  };
}
