import { resolve } from 'node:path';
export function videoConfig(env=process.env){
  const integer=(key,fallback,min=0,max=100000000)=>{const n=env[key]?Number(env[key]):fallback;if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`Invalid ${key}`);return n;};
  const c={enabled:env.VIDEO_GENERATION_ENABLED==='true',key:env.RUNWAY_API_KEY||'',model:env.VIDEO_MODEL||'gen4.5',inviteHash:env.INVITE_SECRET_HASH||'',cost:integer('VIDEO_MAX_COST_UNITS',0),dayBudget:integer('VIDEO_DAILY_BUDGET_UNITS',0),totalBudget:integer('VIDEO_TOTAL_BUDGET_UNITS',0),sessionBudget:integer('VIDEO_SESSION_BUDGET_UNITS',0),currency:env.VIDEO_COST_UNIT||'credits',priceVersion:env.VIDEO_PRICE_VERSION||'',resultHosts:(env.VIDEO_RESULT_HOSTS||'').split(',').map(x=>x.trim()).filter(Boolean),dataDir:resolve(env.DATA_DIR||'./data'),pollMs:integer('VIDEO_POLL_MS',5000,1000,60000)};
  if(c.inviteHash&&!/^[a-f0-9]{64}$/.test(c.inviteHash))throw new Error('INVITE_SECRET_HASH must be a SHA-256 hex digest');
  if(c.enabled&&(!c.key||!c.inviteHash||!c.cost||!c.dayBudget||!c.totalBudget||!c.sessionBudget||!c.priceVersion||!c.resultHosts.length))throw new Error('Video generation requires key, invitation, result hosts and explicit budgets/pricing');
  if(!['gen4.5','gen4_turbo'].includes(c.model))throw new Error('Invalid VIDEO_MODEL');
  return c;
}
