import { createRoom, addPlayer, command, viewFor, GOD } from '../web/js/engine.js';
const TTL = 24 * 60 * 60 * 1000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const answer = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const problem = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');
const token = () => crypto.randomUUID() + crypto.randomUUID();
const code = () => { let n; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= 4294000000); return String(n % 1000000).padStart(6, '0'); };
async function body(request) {
  if (!request.body) return {};
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); problem('Request is too large.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const parsed = JSON.parse(new TextDecoder().decode(bytes)); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') problem('Invalid request.'); return parsed; } catch { problem('Invalid JSON request.'); }
}
async function limit(db, raw, maximum, window = 60000) {
  const key = await hash(raw); const now = Date.now();
  const row = await db.prepare('INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END, expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(key, now + window, now, now).first();
  if (row.count > maximum) problem('Too many requests. Wait a minute and try again.', 429);
}
function connected(state) { const now = Date.now(); for (const p of state.players) p.connected = now - (p.lastSeen || state.created) < 45000; }
async function identity(state, request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || header.length < 40 || header.length > 180) problem('Rejoin this party to continue.', 401);
  const digest = await hash(header.slice(7));
  if (digest === state.hostToken) return GOD;
  const p = state.players.find(p => p.token === digest);
  if (!p) problem('This player session is no longer in the party.', 401);
  return p.id;
}
async function load(db, partyCode) {
  const row = await db.prepare('SELECT state, version, expires_at FROM rooms WHERE code = ?').bind(partyCode).first();
  if (!row || row.expires_at <= Date.now()) problem('Party not found or expired. Check your 6-digit code.', 404);
  const state = JSON.parse(row.state); connected(state); return { state, version: row.version };
}
async function mutate(db, partyCode, fn) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const { state, version } = await load(db, partyCode);
    const result = await fn(state);
    const update = await db.prepare('UPDATE rooms SET state = ?, version = version + 1, expires_at = ? WHERE code = ? AND version = ?').bind(JSON.stringify(state), Date.now() + TTL, partyCode, version).run();
    if (update.meta.changes) return result;
  }
  problem('The party is busy. Try that action again.', 409);
}
export async function handleApi(request, db) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (!db) problem('The room service is unavailable. Try again shortly.', 503);
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if (path === '/api/health' && request.method === 'GET') return answer({ ok: true, game: 'alibi-arcade', transport: 'https' });
    if (path === '/api/party' && request.method === 'POST') {
      const input = await body(request); await limit(db, 'create:' + ip, 30, 3600000);
      for (let i = 0; i < 12; i++) {
        const partyCode = code(), secret = token(); const state = createRoom(partyCode, input.name);
        state.hostToken = await hash(secret); state.hostSeen = Date.now();
        command(state, GOD, { type: 'settings', settings: input.settings || {} });
        await db.prepare('DELETE FROM rooms WHERE code = ? AND expires_at <= ?').bind(partyCode, Date.now()).run();
        const inserted = await db.prepare('INSERT OR IGNORE INTO rooms (code, state, version, expires_at) VALUES (?, ?, 0, ?)').bind(partyCode, JSON.stringify(state), Date.now() + TTL).run();
        if (inserted.meta.changes) {
          await db.batch([db.prepare('DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at <= ? LIMIT 100)').bind(Date.now()), db.prepare('DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at <= ? LIMIT 100)').bind(Date.now())]);
          return answer({ session: { version: 2, code: partyCode, token: secret, name: state.hostName, isHost: true }, view: viewFor(state, GOD) }, 201);
        }
      }
      problem('Could not reserve a party code. Try again.', 503);
    }
    const match = /^\/api\/party\/(\d{6})(?:\/(join|command))?$/.exec(path);
    if (!match) problem('Endpoint not found.', 404);
    const [, partyCode, action] = match;
    if (action === 'join' && request.method === 'POST') {
      const input = await body(request); await limit(db, 'join:' + ip, 40);
      const secret = token(), digest = await hash(secret);
      return answer(await mutate(db, partyCode, async state => {
        const p = addPlayer(state, input.name, digest); p.lastSeen = Date.now();
        return { session: { version: 2, code: partyCode, token: secret, name: p.name, isHost: false }, view: viewFor(state, p.id) };
      }), 201);
    }
    if (!action && request.method === 'GET') {
      const { state } = await load(db, partyCode); const actor = await identity(state, request);
      return answer({ view: viewFor(state, actor) });
    }
    if (action === 'command' && request.method === 'POST') {
      const input = await body(request);
      const { state } = await load(db, partyCode); await identity(state, request);
      await limit(db, 'action:' + (request.headers.get('Authorization') || ''), 120);
      return answer(await mutate(db, partyCode, async current => {
        const actor = await identity(current, request);
        if (actor === GOD) current.hostSeen = Date.now();
        else { const p = current.players.find(p => p.id === actor); p.lastSeen = Date.now(); p.connected = true; }
        if (input.type !== 'heartbeat') command(current, actor, input);
        return { view: viewFor(current, actor) };
      }));
    }
    problem('Method not allowed.', 405);
  } catch (error) {
    if (error.status) return answer({ error: error.message }, error.status);
    if (/^(Only |You |Choose |That |Every |Wait |Invite |Use |Enter |Self-|Invalid |A party|Unknown |Player |This party|God |Eliminated |Write |Too many)/.test(error.message || '')) return answer({ error: error.message }, 400);
    console.error('Alibi API request failed:', error.message); return answer({ error: 'The room service had a problem. Try again shortly.' }, 500);
  }
}
