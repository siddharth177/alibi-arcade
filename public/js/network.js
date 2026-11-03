const HOST_KEY = 'alibi:host:v2';
const SESSION_KEY = 'alibi:player:v2';
const read = (store, key) => { try { const value = JSON.parse(store.getItem(key)); return value?.version === 2 && value.token && /^\d{6}$/.test(value.code) ? value : null; } catch { return null; } };
const write = (store, key, value) => { try { if (value === null) store.removeItem(key); else store.setItem(key, JSON.stringify(value)); } catch {} };
export function savedHost() { return read(localStorage, HOST_KEY); }
export function savedPlayer() { return read(sessionStorage, SESSION_KEY); }
const hosted = 'https://alibi-arcade.siddharthreads17.chatgpt.site';
const apiOrigin = () => globalThis.ALIBI_API_ORIGIN || (['terminal.local', 'localhost', '127.0.0.1'].includes(location.hostname) || location.hostname.endsWith('.chatgpt.site') ? '' : hosted);
// A shared HTTPS room service works from Sites, GitHub Pages, and GitLab Pages.
export class PartyNetwork {
  constructor({ onView = () => {}, onStatus = () => {}, onError = () => {} } = {}) {
    this.onView = onView; this.onStatus = onStatus; this.onError = onError;
    this.session = null; this.closed = false; this.timer = null; this.lastHeartbeat = 0;
    this.lastView = ''; this.failures = 0; this.lastRevision = -1;
  }
  async request(path, method = 'GET', data = undefined, authenticated = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated && this.session) headers.Authorization = 'Bearer ' + this.session.token;
    let response;
    try { response = await fetch(apiOrigin() + '/api' + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), cache: 'no-store', signal: AbortSignal.timeout(12000) }); }
    catch { throw new Error('Could not reach the room service. Check your connection and try again.'); }
    let result; try { result = await response.json(); } catch { throw new Error('The room service is not available yet. Try again shortly.'); }
    if (!response.ok) { const e = new Error(result.error || 'Could not complete that action.'); e.status = response.status; throw e; }
    return result;
  }
  deliver(result) {
    if (this.closed) return;
    if (result.view.revision < this.lastRevision) return;
    this.lastRevision = result.view.revision;
    const json = JSON.stringify(result.view);
    if (this.lastView !== json) { this.lastView = json; this.onView(result.view); }
  }
  async create(name, settings = {}, game = 'mafia') {
    this.onStatus('Opening your party…');
    const result = await this.request('/party', 'POST', { name, settings, game }, false);
    this.start(result.session, result); return this.session.code;
  }
  async join(code, name, session = null) {
    code = String(code).replace(/\s/g, ''); if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit party code.');
    this.onStatus('Finding your party…');
    if (session?.code === code && session.name.toLowerCase() === String(name).trim().toLowerCase()) return this.restore(session);
    const result = await this.request(`/party/${code}/join`, 'POST', { name }, false);
    this.start(result.session, result);
  }
  async restore(session) {
    if (!session?.token) throw new Error('This party session could not be restored.');
    this.onStatus('Rejoining your party…'); this.session = session;
    const result = await this.request(`/party/${session.code}/command`, 'POST', { type: 'heartbeat' });
    this.start(session, result);
  }
  start(session, result) {
    this.session = session; this.isHost = session.isHost;
    write(session.isHost ? localStorage : sessionStorage, session.isHost ? HOST_KEY : SESSION_KEY, session);
    this.onStatus('Connected'); this.deliver(result); this.lastHeartbeat = Date.now(); this.poll();
  }
  poll(delay = 1200) {
    clearTimeout(this.timer); if (this.closed) return;
    this.timer = setTimeout(async () => {
      try {
        const heartbeat = Date.now() - this.lastHeartbeat > 18000;
        const result = await this.request(`/party/${this.session.code}${heartbeat ? '/command' : ''}`, heartbeat ? 'POST' : 'GET', heartbeat ? { type: 'heartbeat' } : undefined);
        if (heartbeat) this.lastHeartbeat = Date.now();
        if (this.failures) this.onStatus('Connected'); this.failures = 0; this.deliver(result);
      } catch (e) {
        this.failures++;
        if ([401, 404].includes(e.status)) { this.closed = true; write(this.isHost ? localStorage : sessionStorage, this.isHost ? HOST_KEY : SESSION_KEY, null); this.onStatus(e.message); this.onError(e.message); return; }
        this.onStatus('Connection interrupted. Rejoining automatically…');
      }
      this.poll(Math.min(12000, 1200 * 2 ** Math.min(this.failures, 3)));
    }, delay);
  }
  async send(input) {
    if (this.closed || !this.session) throw new Error('Rejoin the party to continue.');
    const result = await this.request(`/party/${this.session.code}/command`, 'POST', input); this.lastHeartbeat = Date.now(); this.deliver(result);
  }
  close({ forget = false } = {}) {
    this.closed = true; clearTimeout(this.timer);
    if (forget && this.session) write(this.isHost ? localStorage : sessionStorage, this.isHost ? HOST_KEY : SESSION_KEY, null);
  }
}
