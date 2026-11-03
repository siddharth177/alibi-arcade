import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createParty, addPartyPlayer, partyCommand as act, partyView as view, HOT_PROMPTS, CODE_WORDS } from '../web/js/party-games.js';
import { GOD } from '../web/js/engine.js';

function room(game = 'hotseat', count = game === 'hotseat' ? 3 : 4) {
  const s = createParty('000123', 'Host', game);
  for (let i = 1; i < count; i++) addPartyPlayer(s, `Friend ${i}`, `private-session-${i}-never-share-this`);
  if (game === 'codebreakers') s.players.forEach((p, i) => act(s, p.id, { type: 'joinTeam', team: i < 2 ? 'red' : 'blue', role: i % 2 ? 'guesser' : 'spymaster' }));
  s.players.forEach(p => act(s, p.id, { type: 'ready' }));
  return s;
}
const start = s => { act(s, GOD, { type: 'start' }); return s; };
const captain = s => s.players.find(p => p.team === s.turn && p.role === 'spymaster').id;
const guesser = s => s.players.find(p => p.team === s.turn && p.role === 'guesser').id;
const clue = (s, count = 1) => act(s, captain(s), { type: 'codeClue', word: 'Connections', count });
const hotSubmit = (s, choice = 1) => {
  act(s, s.seat, { type: 'hotAnswer', choice });
  for (const p of s.players.filter(p => p.id !== s.seat)) act(s, p.id, { type: 'hotGuess', choice });
};

test('party creation validates game, code, names, unique roster and capacity including host', () => {
  assert.throws(() => createParty('000123', 'Host', 'unknown'));
  assert.throws(() => createParty('123', 'Host', 'hotseat'));
  const s = room(); assert.equal(s.players[0].id, GOD);
  assert.throws(() => addPartyPlayer(s, 'host', 'a'.repeat(30)));
  while (s.players.length < 16) addPartyPlayer(s, 'Extra ' + s.players.length, 'a'.repeat(30));
  assert.throws(() => addPartyPlayer(s, 'Overflow', 'a'.repeat(30)));
});
test('all new games enforce host administration, readiness, minimum counts and membership', () => {
  for (const game of ['hotseat', 'codebreakers']) {
    const s = room(game, 2); assert.throws(() => act(s, GOD, { type: 'start' }), /Invite/);
    assert.throws(() => act(s, s.players[1].id, { type: 'start' }), /Only/);
    assert.throws(() => act(s, 'forged-id', { type: 'ready' }), /not in/);
    assert.throws(() => view(s, 'forged-id'));
  }
  const s = room(); act(s, s.players[1].id, { type: 'ready' }); assert.throws(() => act(s, GOD, { type: 'start' }), /Every/);
  assert.throws(() => act(s, GOD, { type: 'kick', id: GOD }));
});
test('Hot Seat hides the real answer, other predictions and all session credentials before reveal', () => {
  const s = start(room()); const others = s.players.filter(p => p.id !== s.seat);
  act(s, s.seat, { type: 'hotAnswer', choice: 3 });
  act(s, others[0].id, { type: 'hotGuess', choice: 2 });
  const v = view(s, others[1].id);
  assert.equal(v.ownChoice, null); assert.equal(v.result, null); assert.deepEqual(v.history, []);
  for (const key of ['answers', 'guesses', 'promptOrder', 'order', 'hostToken']) assert.ok(!(key in v));
  for (const p of s.players) if (p.token) assert.ok(!JSON.stringify(v).includes(p.token));
  assert.equal(view(s, others[0].id).ownChoice, 2);
});
test('Hot Seat validates choices and prevents impersonating the seat or revealing twice', () => {
  const s = start(room()); const other = s.players.find(p => p.id !== s.seat);
  assert.throws(() => act(s, other.id, { type: 'hotAnswer', choice: 1 }));
  assert.throws(() => act(s, s.seat, { type: 'hotGuess', choice: 1 }));
  for (const choice of [-1, 4, 1.5, '1', null]) assert.throws(() => act(s, s.seat, { type: 'hotAnswer', choice }));
  hotSubmit(s); const scores = s.players.map(p => p.score);
  assert.throws(() => act(s, GOD, { type: 'hotReveal' })); assert.deepEqual(s.players.map(p => p.score), scores);
});
test('Hot Seat automatically reveals, rotates fairly, scores once and supports tied winners', () => {
  const s = start(room('hotseat', 4)); const seats = [];
  while (s.phase !== 'finished') {
    seats.push(s.seat); hotSubmit(s, 1); assert.equal(s.phase, 'result');
    assert.equal(s.result.predictions.filter(p => p.matched).length, 3);
    act(s, GOD, { type: 'hotNext' });
  }
  assert.equal(new Set(seats).size, 4); assert.ok(s.players.every(p => p.score === 3)); assert.equal(s.winner.length, 4);
});
test('Hot Seat two-turn settings have enough distinct questions and equal seat counts', () => {
  const s = room('hotseat', 16); act(s, GOD, { type: 'settings', settings: { roundsPerPlayer: 2 } }); start(s);
  const seats = {}, prompts = new Set();
  while (s.phase !== 'finished') {
    seats[s.seat] = (seats[s.seat] || 0) + 1; prompts.add(s.promptIndex); hotSubmit(s); act(s, GOD, { type: 'hotNext' });
  }
  assert.equal(s.round, 32); assert.equal(prompts.size, 32); assert.ok(Object.values(seats).every(n => n === 2));
  assert.ok(HOT_PROMPTS.length >= 32); assert.ok(HOT_PROMPTS.every(p => p.length === 5));
});
test('Hot Seat permits edits until reveal, missing guesses earn zero and skipped rounds earn no points', () => {
  const s = start(room()); const other = s.players.find(p => p.id !== s.seat);
  assert.throws(() => act(s, GOD, { type: 'hotReveal' }), /Wait/);
  act(s, other.id, { type: 'hotGuess', choice: 0 }); act(s, other.id, { type: 'hotGuess', choice: 2 });
  act(s, s.seat, { type: 'hotAnswer', choice: 2 }); act(s, GOD, { type: 'hotReveal' });
  assert.equal(other.score, 1); assert.equal(s.result.predictions.find(p => p.id !== other.id).matched, false);
  act(s, GOD, { type: 'hotNext' }); act(s, s.seat, { type: 'hotSkip' }); assert.equal(s.result.skipped, true);
  assert.equal(s.players.reduce((n,p) => n+p.score,0),1);
});
test('Hot Seat rematch clears private choices, score, rounds and history while preserving sessions', () => {
  const s = start(room()); const ids = s.players.map(p => p.id);
  while (s.phase !== 'finished') { hotSubmit(s); act(s, GOD, { type: 'hotNext' }); }
  act(s, GOD, { type: 'rematch' }); assert.equal(s.phase, 'lobby'); assert.deepEqual(s.players.map(p => p.id), ids);
  assert.ok(s.players.every(p => !p.ready && p.score === 0)); assert.deepEqual(s.history, []); assert.deepEqual(s.answers, {}); assert.equal(view(s, GOD).prompt, null);
});
test('Codebreakers requires two valid teams and exactly one clue-giver per team', () => {
  const s = room('codebreakers');
  assert.throws(() => act(s, s.players[1].id, { type: 'joinTeam', team: 'red', role: 'spymaster' }));
  act(s, s.players[1].id, { type: 'joinTeam', team: 'blue', role: 'guesser' }); act(s, s.players[1].id, { type: 'ready' });
  assert.throws(() => start(s), /Each team/);
});
test('Codebreakers board has unique words and a 9/8/7/1 key, visible only to clue-givers', () => {
  const s = start(room('codebreakers'));
  assert.equal(s.board.length, 25); assert.equal(new Set(s.board.map(c => c.word)).size, 25); assert.equal(new Set(CODE_WORDS).size, CODE_WORDS.length);
  assert.equal(s.board.filter(c => c.color === s.turn).length,9); assert.equal(s.board.filter(c => c.color === 'neutral').length,7); assert.equal(s.board.filter(c => c.color === 'assassin').length,1);
  for (const p of s.players) {
    const v = view(s,p.id); assert.ok(v.board.every(c => p.role === 'spymaster' ? !!c.color : c.color === null));
    assert.ok(!JSON.stringify(v).includes('private-session'));
  }
});
test('being the host does not expose the Codebreakers key when the host is a guesser', () => {
  const s = room('codebreakers'); const partner = s.players[1];
  act(s,GOD,{type:'joinTeam',team:'red',role:'guesser'}); act(s,partner.id,{type:'joinTeam',team:'red',role:'spymaster'});
  act(s,GOD,{type:'ready'}); act(s,partner.id,{type:'ready'}); start(s);
  assert.equal(view(s,GOD).isHost,true); assert.ok(view(s,GOD).board.every(c=>c.color===null));
});
test('Codebreakers validates turn permissions, single-word clues and counts', () => {
  const s = start(room('codebreakers')); const other = s.players.find(p => p.team !== s.turn);
  assert.throws(()=>act(s,other.id,{type:'codeClue',word:'Test',count:1}));
  assert.throws(()=>act(s,guesser(s),{type:'codeClue',word:'Test',count:1}));
  for (const [word,count] of [['two words',1],['x',1],['<script>',1],['Test',0],['Test',10],['Test',1.5],[s.board[0].word,1]]) assert.throws(()=>act(s,captain(s),{type:'codeClue',word,count}));
  clue(s); assert.throws(()=>act(s,captain(s),{type:'codeGuess',index:0})); assert.throws(()=>act(s,other.id,{type:'codeGuess',index:0}));
  for (const index of [-1,25,'1',null]) assert.throws(()=>act(s,guesser(s),{type:'codeGuess',index}));
});
test('Codebreakers correct guesses continue for clue count plus one, then change teams', () => {
  const s=start(room('codebreakers')), team=s.turn; clue(s,1); const g=guesser(s);
  const own=s.board.map((c,i)=>c.color===team?i:-1).filter(i=>i>=0);
  act(s,g,{type:'codeGuess',index:own[0]}); assert.equal(s.phase,'guess'); assert.equal(s.guessesLeft,1);
  assert.equal(view(s,g).board[own[0]].color,team); assert.throws(()=>act(s,g,{type:'codeGuess',index:own[0]}));
  act(s,g,{type:'codeGuess',index:own[1]}); assert.equal(s.phase,'clue'); assert.notEqual(s.turn,team);
});
test('Codebreakers neutral and opponent words end the turn and voluntary pass changes turns', () => {
  for(const color of ['neutral','opponent']) {
    const s=start(room('codebreakers')), old=s.turn; clue(s);
    const i=s.board.findIndex(c=>c.color===(color==='opponent'?(old==='red'?'blue':'red'):color));
    act(s,guesser(s),{type:'codeGuess',index:i}); assert.equal(s.phase,'clue'); assert.notEqual(s.turn,old);
  }
  const s=start(room('codebreakers')), old=s.turn; clue(s); act(s,guesser(s),{type:'codeEndTurn'}); assert.notEqual(s.turn,old);
});
test('Codebreakers trap ends the game immediately and reveals the key to everyone', () => {
  const s=start(room('codebreakers')), old=s.turn; clue(s);
  act(s,guesser(s),{type:'codeGuess',index:s.board.findIndex(c=>c.color==='assassin')});
  assert.equal(s.phase,'finished'); assert.notEqual(s.winner,old); assert.ok(view(s,s.players[1].id).board.every(c=>c.color));
});
test('Codebreakers finding all own words wins and completing an opponent set awards the opponent', () => {
  const s=start(room('codebreakers')), team=s.turn;
  clue(s,s.board.filter(c=>c.color===team).length); const g=guesser(s);
  for(const i of s.board.map((c,i)=>c.color===team?i:-1).filter(i=>i>=0)) act(s,g,{type:'codeGuess',index:i});
  assert.equal(s.phase,'finished'); assert.equal(s.winner,team);
  const t=start(room('codebreakers')); const opponent=t.turn==='red'?'blue':'red';
  const last=t.board.findIndex(c=>c.color===opponent); t.board.forEach((c,i)=>{if(c.color===opponent&&i!==last)c.revealed=true;});
  clue(t); act(t,guesser(t),{type:'codeGuess',index:last}); assert.equal(t.winner,opponent);
});
test('Codebreakers stalled turns and rematches require the host and discard old keys', () => {
  const s=start(room('codebreakers')), old=s.turn;
  assert.throws(()=>act(s,s.players[1].id,{type:'codePass'})); act(s,GOD,{type:'codePass'}); assert.notEqual(s.turn,old);
  clue(s); act(s,guesser(s),{type:'codeGuess',index:s.board.findIndex(c=>c.color==='assassin')});
  act(s,GOD,{type:'rematch'}); assert.equal(s.phase,'lobby'); assert.deepEqual(s.board,[]); assert.deepEqual(s.clueHistory,[]); assert.equal(s.clue,undefined); assert.ok(s.players.every(p=>!p.ready));
});
test('new-game snapshots cannot mutate private authoritative state', () => {
  for(const game of ['hotseat','codebreakers']) {
    const s=start(room(game)), v=view(s,GOD); v.players[0].name='Tampered'; v.settings.roundsPerPlayer=99; v.log[0].text='Tampered';
    if(v.board)v.board[0].color='assassin'; assert.equal(s.players[0].name,'Host'); assert.equal(s.settings.roundsPerPlayer,1); assert.notEqual(s.log[0].text,'Tampered');
  }
});
