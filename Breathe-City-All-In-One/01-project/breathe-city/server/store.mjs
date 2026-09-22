import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class JobStore {
  constructor(directory) {
    if (directory !== ':memory:') mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(directory === ':memory:' ? directory : join(directory, 'breathe.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, idem TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL, mode TEXT NOT NULL, prompt TEXT NOT NULL, state TEXT NOT NULL,
        provider_id TEXT, result TEXT, error TEXT, progress REAL, polls INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, next_poll_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state, next_poll_at);
      CREATE TABLE IF NOT EXISTS token_requests (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    `);
    // Additive migration: a resumed task gets a fresh polling window, not a new generation.
    if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(c => c.name === 'poll_started_at')) this.db.exec('ALTER TABLE jobs ADD COLUMN poll_started_at INTEGER');
    this.db.prepare("UPDATE jobs SET state='needs_review', error='Server restarted during submission. Check provider dashboard; no automatic resubmission.' WHERE state='submitting'").run();
  }
  row(r) {
    if (!r) return null;
    return { id: r.id, kind: r.kind, mode: r.mode, prompt: r.prompt, state: r.state, providerId: r.provider_id,
      result: r.result ? JSON.parse(r.result) : null, error: r.error, progress: r.progress, polls: r.polls,
      createdAt: r.created_at, updatedAt: r.updated_at, nextPollAt: r.next_poll_at, pollStartedAt: r.poll_started_at };
  }
  create({ kind, mode, prompt, idempotencyKey }, maxReal = Infinity) {
    const fingerprint = createHash('sha256').update(JSON.stringify({ kind, mode, prompt })).digest('hex');
    const existing = this.db.prepare('SELECT * FROM jobs WHERE idem=?').get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw Object.assign(new Error('幂等键已被另一请求使用'), { status: 409 });
      return { job: this.row(existing), reused: true };
    }
    if (mode === 'real' && this.realCount() >= maxReal) throw Object.assign(new Error('今日真实生成次数已达上限'), { status: 429 });
    const now = Date.now(), id = randomUUID();
    this.db.prepare('INSERT INTO jobs(id,idem,fingerprint,kind,mode,prompt,state,created_at,updated_at,next_poll_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, idempotencyKey, fingerprint, kind, mode, prompt, 'queued', now, now, now);
    return { job: this.get(id), reused: false };
  }
  get(id) { return this.row(this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id)); }
  list() { return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100').all().map(r => this.row(r)); }
  due() { return this.row(this.db.prepare("SELECT * FROM jobs WHERE state IN ('queued','polling') AND next_poll_at<=? ORDER BY next_poll_at LIMIT 1").get(Date.now())); }
  patch(id, changes) {
    const map = { state:'state', providerId:'provider_id', result:'result', error:'error', progress:'progress', nextPollAt:'next_poll_at', polls:'polls', pollStartedAt:'poll_started_at' };
    const keys = Object.keys(changes).filter(k => map[k]);
    if (!keys.length) return this.get(id);
    this.db.prepare(`UPDATE jobs SET ${keys.map(k => `${map[k]}=?`).join(',')}, updated_at=? WHERE id=?`)
      .run(...keys.map(k => k === 'result' ? JSON.stringify(changes[k]) : changes[k]), Date.now(), id);
    return this.get(id);
  }
  realCount() { return Number(this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE mode='real' AND created_at>=?").get(this.dayStart()).n); }
  dayStart() { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  reserveToken(max) {
    const count = Number(this.db.prepare('SELECT COUNT(*) AS n FROM token_requests WHERE created_at>=?').get(this.dayStart()).n);
    if (count >= max) throw Object.assign(new Error('今日实时会话额度已用完'), { status: 429 });
    // Reserve BEFORE requesting upstream. Ambiguous failures remain counted, avoiding free retries.
    this.db.prepare('INSERT INTO token_requests(id,created_at) VALUES(?,?)').run(randomUUID(), Date.now());
  }
  close() { this.db.close(); }
}
