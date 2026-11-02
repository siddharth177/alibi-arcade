import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi } from '../server/api.mjs';
function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../drizzle/0000_reflective_ben_grimm.sql', import.meta.url), 'utf8'));
  const db = { prepare(query) { let values = []; return { bind(...v) { values = v; return this; }, async first() { return sql.prepare(query).get(...values) || null; }, async run() { const r = sql.prepare(query).run(...values); return { meta: { changes: Number(r.changes) } }; } }; }, async batch(items) { return Promise.all(items.map(item => item.run())); } };
  const request = async (path, method = 'GET', body = undefined, session = null) => {
    const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '127.0.0.1' }; if (session) headers.Authorization = 'Bearer ' + session.token;
    const response = await handleApi(new Request('https://arcade.test/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), db);
    return { status: response.status, data: await response.json(), response };
  };
  const create = async () => (await request('/party', 'POST', {name:'Host'})).data;
  return { sql, db, request, create };
}
async function party(count = 5) {
  const f = fixture(), host = await f.create(), guests = [];
  for(let i=0;i<count;i++) guests.push((await f.request(`/party/${host.session.code}/join`, 'POST', {name:'Person '+i})).data);
  return { ...f, host, guests, path: '/party/' + host.session.code };
}
test('HTTPS creates a six-digit party; GET requires a session; CORS supports Pages', async () => {
  const f = fixture(), host = await f.create(); assert.match(host.session.code, /^\d{6}$/); assert.equal(host.view.isGod, true);
  const missing = await f.request('/party/' + host.session.code); assert.equal(missing.status, 401);
  const result = await f.request('/party/' + host.session.code, 'GET', undefined, host.session);
  assert.equal(result.status, 200); assert.equal(result.response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store'); f.sql.close();
});
test('a guest cannot forge God or steal a session by name', async () => {
  const f = await party(), guest = f.guests[0];
  const forged = await f.request(f.path + '/command', 'POST', {type:'settings',actor:'god',settings:{selfSave:false}}, guest.session); assert.equal(forged.status, 400);
  const duplicate = await f.request(f.path + '/join', 'POST', {name:'Person 0'}); assert.equal(duplicate.status, 400);
  const stolen = await f.request(f.path, 'GET', undefined, {token:'Person 0'.repeat(10)}); assert.equal(stolen.status, 401); f.sql.close();
});
test('simultaneous joins do not lose players and room capacity is enforced', async () => {
  const f = fixture(), host = await f.create(), path = '/party/' + host.session.code;
  const results = await Promise.all(Array.from({length:16}, (_,i) => f.request(path+'/join','POST',{name:'Friend '+i})));
  assert.ok(results.every(r=>r.status===201), JSON.stringify(results.map(r=>r.status)));
  const full = await f.request(path+'/join','POST',{name:'Friend 17'}); assert.equal(full.status,400);
  const room = await f.request(path,'GET',undefined,host.session); assert.equal(room.data.view.players.length,16); f.sql.close();
});
test('full HTTPS game cycle preserves role secrecy, investigation, voting, and rematch', async () => {
  const f = await party(7), hs = f.host.session;
  const send = async (session, data) => { const r=await f.request(f.path+'/command','POST',data,session); assert.equal(r.status,200,JSON.stringify(r.data)); return r.data.view; };
  await Promise.all(f.guests.map(g=>send(g.session,{type:'ready'})));
  const reveal = await send(hs,{type:'start'}); assert.equal(reveal.phase,'reveal');
  const killer = reveal.players.find(p=>p.role==='murderer'), doc = reveal.players.find(p=>p.role==='doctor'), det = reveal.players.find(p=>p.role==='detective'), victim = reveal.players.find(p=>p.role==='citizen');
  const session = id => f.guests.find(g=>g.view.me===id).session;
  for(const g of f.guests) {
    const v=(await f.request(f.path,'GET',undefined,g.session)).data.view;
    assert.equal(v.players.filter(p=>p.role).length,1);
    for(const other of [hs,...f.guests.map(g=>g.session)]) assert.ok(!JSON.stringify(v).includes(other.token));
    await send(g.session,{type:'ack'});
  }
  await send(hs,{type:'beginNight'});
  await Promise.all(f.guests.map(g=>send(g.session,{type:'nightAction',target:g.view.me===killer.id||g.view.me===doc.id?victim.id:killer.id})));
  const dawn = await send(hs,{type:'resolveNight'}); assert.equal(dawn.players.find(p=>p.id===victim.id).alive,true);
  const notes=(await f.request(f.path,'GET',undefined,session(det.id))).data.view.intel; assert.equal(notes[0].isMafia,true);
  await send(hs,{type:'openVote'});
  await Promise.all(f.guests.map(g=>send(g.session,{type:'vote',target:g.view.me===killer.id?null:killer.id})));
  const end=await send(hs,{type:'resolveVote'}); assert.equal(end.winner,'town'); assert.equal(end.phase,'finished');
  const reset=await send(hs,{type:'rematch'}); assert.equal(reset.phase,'lobby'); assert.ok(reset.players.every(p=>!p.role&&!p.ready)); f.sql.close();
});
test('rooms and player roles survive a new request context and host absence', async () => {
  const f=await party(); const s=f.guests[0].session;
  const before=await f.request(f.path,'GET',undefined,s);
  const fresh=await handleApi(new Request('https://arcade.test/api'+f.path,{headers:{Authorization:'Bearer '+s.token}}),f.db);
  assert.equal(fresh.status,200); assert.equal((await fresh.json()).view.me,before.data.view.me); f.sql.close();
});
test('expired rooms, oversized requests, and unexpected routes fail without state disclosure', async () => {
  const f=await party(); f.sql.prepare('UPDATE rooms SET expires_at=0').run();
  const expired=await f.request(f.path,'GET',undefined,f.host.session); assert.equal(expired.status,404); assert.ok(!('view' in expired.data));
  const large=await f.request('/party','POST',{name:'x'.repeat(9000)}); assert.equal(large.status,413);
  const invalid=await f.request('/party/not-a-code'); assert.equal(invalid.status,404); f.sql.close();
});
