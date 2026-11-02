import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addPlayer, command, viewFor, GOD, validName } from '../web/js/engine.js';
function setup(count = 7) {
  const s = createRoom('012345', 'Godfather');
  for (let i = 0; i < count; i++) { const p = addPlayer(s, 'Player ' + (i + 1), crypto.randomUUID()); command(s, p.id, { type: 'ready' }); }
  command(s, GOD, { type: 'start' });
  for (const p of s.players) command(s, p.id, { type: 'ack' });
  command(s, GOD, { type: 'beginNight' }); return s;
}
const role = (s, name) => s.players.find(p => p.role === name);
const alive = s => s.players.filter(p => p.alive);
const action = (s, p, target) => command(s, p.id, { type: 'nightAction', target: target.id });
function checkIn(s, overrides = {}) {
  for (const p of alive(s)) {
    let target = overrides[p.role] || alive(s).find(t => t.id !== p.id && !(p.role === 'doctor' && !s.settings.repeatSave && s.lastProtected === t.id));
    action(s, p, target);
  }
}
function day(s) { command(s, GOD, { type: 'resolveNight' }); command(s, GOD, { type: 'openVote' }); }
function votes(s, targets) { alive(s).forEach((p, i) => command(s, p.id, { type: 'vote', target: targets[i] ?? null })); }
test('six-digit codes retain leading zeros; names are validated', () => {
  assert.equal(createRoom('000001', 'Siddharth').code, '000001');
  assert.throws(() => createRoom('12345', 'Siddharth'));
  assert.throws(() => validName(' ')); assert.throws(() => validName('x'.repeat(21)));
  assert.equal(validName(' Alice\u202e '), 'Alice');
});
test('minimum, unique names, and readiness are enforced', () => {
  const s = createRoom('123456', 'Host');
  addPlayer(s, 'Alice', crypto.randomUUID());
  assert.throws(() => addPlayer(s, 'alice', crypto.randomUUID()), /already/);
  assert.throws(() => addPlayer(s, 'Host', crypto.randomUUID()), /already/);
  assert.throws(() => command(s, GOD, { type: 'start' }), /5 players/);
  for (let i = 0; i < 4; i++) addPlayer(s, 'Extra ' + i, crypto.randomUUID());
  assert.throws(() => command(s, GOD, { type: 'start' }), /ready/);
});
test('exactly one murderer, doctor, detective; God stays separate', () => {
  for (let n = 5; n <= 16; n++) {
    const s = setup(n);
    for (const name of ['murderer', 'doctor', 'detective']) assert.equal(s.players.filter(p => p.role === name).length, 1);
    assert.equal(s.players.filter(p => p.role === 'citizen').length, n - 3);
    assert.ok(!s.players.some(p => p.id === GOD));
  }
});
test('only God can administer and phases cannot be skipped', () => {
  const s = setup();
  for (const type of ['resolveNight', 'openVote', 'rematch', 'settings', 'resolveVote']) assert.throws(() => command(s, s.players[0].id, { type }));
  assert.throws(() => command(s, GOD, { type: 'openVote' }), /phase/);
  assert.throws(() => addPlayer(s, 'Late player', crypto.randomUUID()), /phase/);
});
test('all roles acknowledge; all citizens also check in at night', () => {
  const s = createRoom('123456', 'Host'); for (let i = 0; i < 5; i++) { const p = addPlayer(s, 'Person ' + i, crypto.randomUUID()); p.ready = true; }
  command(s, GOD, { type: 'start' }); assert.throws(() => command(s, GOD, { type: 'beginNight' }), /checked/);
  s.players.forEach(p => command(s, p.id, { type: 'ack' })); command(s, GOD, { type: 'beginNight' });
  assert.throws(() => command(s, GOD, { type: 'resolveNight' }), /check-ins/);
  checkIn(s); assert.equal(Object.keys(s.actions).length, 5);
});
test('doctor save blocks murder without leaking the protected target', () => {
  const s = setup(); const victim = role(s, 'citizen');
  checkIn(s, { murderer: victim, doctor: victim, detective: role(s, 'murderer') });
  command(s, GOD, { type: 'resolveNight' }); assert.equal(victim.alive, true);
  const v = viewFor(s, victim.id); assert.ok(v.log.at(-1).text.includes('Nobody'));
  assert.equal(v.lastProtected, null); assert.equal(v.intel.length, 0); assert.deepEqual(v.myAction, null);
  assert.ok(!JSON.stringify(v.log).includes(victim.name));
});
test('detective results are private and survive a same-night death', () => {
  const s = setup(); const det = role(s, 'detective'), killer = role(s, 'murderer');
  checkIn(s, { murderer: det, doctor: role(s, 'citizen'), detective: killer });
  command(s, GOD, { type: 'resolveNight' }); assert.equal(det.alive, false);
  assert.equal(viewFor(s, det.id).intel[0].isMafia, true);
  assert.deepEqual(viewFor(s, killer.id).intel, []);
});
test('doctor self and consecutive protection follow room rules', () => {
  const s = setup(); const doc = role(s, 'doctor');
  action(s, doc, doc); assert.equal(s.actions[doc.id], doc.id);
  s.settings.selfSave = false; assert.throws(() => action(s, doc, doc), /Self-protection/);
  s.settings.selfSave = true; s.lastProtected = doc.id;
  assert.throws(() => action(s, doc, doc), /two nights/);
  s.settings.repeatSave = true; action(s, doc, doc);
});
test('views omit other roles, tokens, night actions, individual progress, live ballots', () => {
  const s = setup(); const det = role(s, 'detective'), c = role(s, 'citizen');
  checkIn(s, { murderer: c, doctor: c }); const v = viewFor(s, c.id);
  assert.equal(v.players.find(p => p.id === det.id).role, null);
  for (const p of v.players) { assert.ok(!('token' in p)); assert.ok(!('acted' in p)); assert.ok(!('acknowledged' in p)); assert.ok(!('voted' in p)); }
  assert.ok(!('hostActions' in v)); assert.ok(!('submitted' in v)); assert.ok(!('votesIn' in v));
  for (const p of s.players) assert.ok(!JSON.stringify(v).includes(p.token));
  day(s); command(s, c.id, { type: 'vote', target: det.alive ? det.id : null });
  const other = alive(s).find(p => p.id !== c.id);
  assert.equal(viewFor(s, other.id).tally, null);
  assert.deepEqual(viewFor(s, other.id).voteHistory, []);
});
test('invalid, dead, and self targets are rejected', () => {
  const s = setup(); const killer = role(s, 'murderer'), det = role(s, 'detective');
  assert.throws(() => action(s, killer, killer), /yourself/); assert.throws(() => action(s, det, det), /yourself/);
  assert.throws(() => command(s, killer.id, { type: 'nightAction', target: 'bogus' }), /living/);
  const dead = role(s, 'citizen'); dead.alive = false;
  assert.throws(() => action(s, killer, dead), /living/); assert.throws(() => action(s, dead, killer), /living/);
});
test('dead players cannot chat, act, or vote; God never votes', () => {
  const s = setup(); const victim = role(s, 'citizen');
  checkIn(s, { murderer: victim, doctor: role(s, 'doctor') });
  command(s, GOD, { type: 'resolveNight' }); assert.equal(victim.alive, false);
  assert.throws(() => command(s, victim.id, { type: 'chat', text: 'spoiler' }), /silent/);
  command(s, GOD, { type: 'openVote' });
  assert.throws(() => command(s, victim.id, { type: 'vote', target: null }), /living/);
  assert.throws(() => command(s, GOD, { type: 'vote', target: null }), /living/);
});
test('single runoff only; a second tie eliminates nobody', () => {
  const s = setup(6), c = s.players[0], d = s.players[1];
  checkIn(s, { murderer: role(s, 'citizen'), doctor: role(s, 'citizen') }); day(s);
  const people = alive(s); votes(s, people.map((p, i) => p.id === c.id ? d.id : p.id === d.id ? c.id : i % 2 ? c.id : d.id));
  command(s, GOD, { type: 'resolveVote' }); assert.equal(s.phase, 'voting'); assert.ok(s.runoff);
  const [a,b] = s.runoff; votes(s, people.map(p => p.id === a ? b : p.id === b ? a : people.indexOf(p) % 2 ? a : b));
  command(s, GOD, { type: 'resolveVote' }); assert.equal(s.phase, 'night'); assert.equal(alive(s).length, 6);
});
test('skip wins or ties skip prevent elimination; private ballot can change', () => {
  const s = setup(); checkIn(s, { murderer: role(s, 'citizen'), doctor: role(s, 'citizen') }); day(s);
  const p = alive(s)[0], target = alive(s)[1]; command(s, p.id, { type: 'vote', target: target.id });
  command(s, p.id, { type: 'vote', target: null }); assert.equal(s.ballots[p.id], null);
  votes(s, []); command(s, GOD, { type: 'resolveVote' }); assert.equal(s.phase, 'night'); assert.equal(alive(s).length, 7);
  assert.equal(s.voteHistory.length, 1); assert.equal(s.voteHistory[0].counts.skip, 7);
});
test('voting out the murderer immediately awards town victory and reveals roles', () => {
  const s = setup(); const killer = role(s, 'murderer'); checkIn(s, { murderer: role(s, 'citizen'), doctor: role(s, 'citizen') }); day(s);
  votes(s, alive(s).map(p => p.id === killer.id ? null : killer.id)); command(s, GOD, { type: 'resolveVote' });
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 'town'); assert.ok(viewFor(s, s.players[0].id).players.every(p => p.role));
});
test('mafia parity is checked after the night', () => {
  const s = setup(5), killer = role(s, 'murderer'), citizens = s.players.filter(p => p.role !== 'murderer');
  citizens[0].alive = false; citizens[1].alive = false;
  const victim = alive(s).find(p => p.id !== killer.id);
  s.actions = {}; action(s, killer, victim);
  command(s, GOD, { type: 'resolveNight', force: true }); assert.equal(s.winner, 'mafia'); assert.equal(s.phase, 'finished');
});
test('hidden elimination mode never leaks dead roles until game end', () => {
  const s = setup(); s.settings.revealEliminated = false; const victim = role(s, 'detective');
  checkIn(s, { murderer: victim, doctor: role(s, 'citizen') }); command(s, GOD, { type: 'resolveNight' });
  const v = viewFor(s, role(s, 'murderer').id); assert.equal(v.players.find(p => p.id === victim.id).role, null);
  assert.ok(!v.log.some(e => e.text.includes('Their role')));
});
test('rematch clears all secret data, history, choices, and readiness', () => {
  const s = setup(); s.phase = 'finished'; s.winner = 'town'; s.intel = { a: ['secret'] }; s.lastProtected = 'a';
  command(s, GOD, { type: 'rematch' }); assert.equal(s.phase, 'lobby');
  assert.deepEqual(s.intel, {}); assert.deepEqual(s.voteHistory, []); assert.equal(s.lastProtected, null);
  assert.ok(s.players.every(p => p.role === null && !p.ready && p.alive && !p.acknowledged));
});
test('settings reject arbitrary values and ignore unknown keys', () => {
  const s = createRoom('123456', 'Host');
  assert.throws(() => command(s, GOD, { type: 'settings', settings: { discussionSeconds: -1 } }));
  assert.throws(() => command(s, GOD, { type: 'settings', settings: { selfSave: 'true' } }));
  command(s, GOD, { type: 'settings', settings: { evil: true } }); assert.ok(!('evil' in s.settings));
});
test('snapshots cannot mutate the authoritative state', () => {
  const s = setup(), v = viewFor(s, GOD); v.players[0].name = 'changed'; v.settings.selfSave = false; v.log.push({text:'fake'});
  assert.notEqual(s.players[0].name, 'changed'); assert.equal(s.settings.selfSave, true); assert.ok(!s.log.some(e => e.text === 'fake'));
});
