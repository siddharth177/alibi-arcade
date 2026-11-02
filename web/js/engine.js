// Pure, host-authoritative rules. Never transmit this state; transmit viewFor().
export const GOD = 'god';
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 16;
export const ROLES = {
  murderer: { name: 'Murderer', side: 'Mafia', color: '#f17a75', icon: 'dagger', objective: 'Blend in by day. Choose one victim each night. Win when only you and one townsperson remain.', tip: 'Keep your story consistent. Ask questions and explain your votes, just as a citizen would.' },
  detective: { name: 'Detective', side: 'Town', color: '#9cabff', icon: 'search', objective: 'Investigate one other living player each night. Only you learn whether they are the murderer.', tip: 'A check is evidence; a hunch is not. Sharing your role can help the town, but makes you a target.' },
  doctor: { name: 'Doctor', side: 'Town', color: '#81cdb5', icon: 'heart', objective: 'Protect one living player each night. If the murderer chooses them, the attack is prevented.', tip: 'Predict who is at risk. A quiet morning does not tell the town who was protected.' },
  citizen: { name: 'Citizen', side: 'Town', color: '#eacb82', icon: 'people', objective: 'Listen, compare stories, and use your day vote to help eliminate the murderer.', tip: 'Ask for reasons. Compare accusations with votes. Quietness or confidence alone is not proof.' }
};
const fail = message => { throw new Error(message); };
const living = s => s.players.filter(p => p.alive);
const player = (s, id) => s.players.find(p => p.id === id);
const hostOnly = id => { if (id !== GOD) fail('Only God can do that.'); };
const phase = (s, allowed) => { if (!allowed.includes(s.phase)) fail('That action is not available in this phase.'); };
const event = (s, text, kind = 'info') => s.log.push({ id: crypto.randomUUID(), round: s.round, text, kind });
export function validName(raw) {
  if (typeof raw !== 'string') fail('Enter a name.');
  const name = raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();
  if (name.length < 2 || name.length > 20) fail('Use a name between 2 and 20 characters.');
  return name;
}
export function createRoom(code, hostName) {
  if (!/^\d{6}$/.test(code)) fail('A party code must have exactly 6 digits.');
  return { version: 1, code, hostName: validName(hostName), created: Date.now(), phase: 'lobby', round: 0,
    players: [], settings: { selfSave: true, repeatSave: false, revealEliminated: true, voting: 'runoff', discussionSeconds: 180 },
    actions: {}, ballots: {}, intel: {}, lastProtected: null, runoff: null, tally: null,
    log: [], chat: [], voteHistory: [], winner: null, deadline: null, revision: 0 };
}
export function addPlayer(s, rawName, token) {
  phase(s, ['lobby']);
  const name = validName(rawName);
  if (s.players.length >= MAX_PLAYERS) fail('This party is full (16 players plus God).');
  if (s.players.some(p => p.name.toLowerCase() === name.toLowerCase()) || name.toLowerCase() === s.hostName.toLowerCase()) fail('That name is already in this party. Choose another.');
  if (typeof token !== 'string' || token.length < 24) fail('Invalid player session.');
  const p = { id: crypto.randomUUID(), token, name, alive: true, ready: false, acknowledged: false, connected: true, role: null };
  s.players.push(p); s.revision++; return p;
}
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const bound = Math.floor(0x100000000 / (i + 1)) * (i + 1);
    let n; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= bound);
    const j = n % (i + 1); [array[i], array[j]] = [array[j], array[i]];
  } return array;
}
function checkWin(s) {
  const mafia = living(s).filter(p => p.role === 'murderer').length;
  if (!mafia) s.winner = 'town';
  else if (mafia >= living(s).length - mafia) s.winner = 'mafia';
  if (s.winner) { s.phase = 'finished'; s.deadline = null; event(s, s.winner === 'town' ? 'The town wins. The murderer has been caught.' : 'Mafia wins. The murderer controls the town.', 'victory'); }
}
function eliminate(s, p, why) {
  p.alive = false;
  event(s, `${p.name} ${why}.${s.settings.revealEliminated ? ` Their role was ${ROLES[p.role].name}.` : ''}`, 'elimination');
}
function beginNight(s) {
  s.phase = 'night'; s.round++; s.actions = {}; s.ballots = {}; s.runoff = null; s.tally = null; s.deadline = null;
  event(s, `Night ${s.round}. The town goes to sleep.`, 'night');
}
function resolveNight(s) {
  // All choices refer to the same pre-resolution roster. A dying detective keeps their check.
  const alive = living(s);
  const killer = alive.find(p => p.role === 'murderer');
  const doc = alive.find(p => p.role === 'doctor');
  const det = alive.find(p => p.role === 'detective');
  const victim = killer && player(s, s.actions[killer.id]);
  const saved = doc && s.actions[doc.id];
  if (det && s.actions[det.id]) {
    const target = player(s, s.actions[det.id]);
    (s.intel[det.id] ||= []).push({ round: s.round, name: target.name, id: target.id, isMafia: target.role === 'murderer' });
  }
  s.lastProtected = saved || null;
  if (victim && victim.id !== saved) eliminate(s, victim, 'was eliminated during the night');
  else event(s, 'Dawn breaks. Nobody was eliminated during the night.', 'dawn');
  s.actions = {};
  s.phase = 'discussion'; s.deadline = Date.now() + s.settings.discussionSeconds * 1000;
  checkWin(s);
}
function resolveVote(s) {
  const counts = {};
  for (const target of Object.values(s.ballots)) { const key = target || 'skip'; counts[key] = (counts[key] || 0) + 1; }
  s.tally = { counts, ballots: Object.entries(s.ballots).map(([voter, target]) => ({ voter, target })) };
  s.voteHistory.push({ round: s.round, runoff: !!s.runoff, ...structuredClone(s.tally) });
  const highest = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter(id => counts[id] === highest);
  // Skip is a real ballot. A tie with skip means nobody is eliminated.
  if (!highest || top.includes('skip')) { event(s, 'The town chose to skip. Nobody is eliminated.', 'vote'); beginNight(s); return; }
  if (top.length > 1) {
    if (s.settings.voting === 'runoff' && !s.runoff) {
      s.runoff = top; s.ballots = {}; event(s, 'The vote is tied. A single runoff is open between the tied players.', 'vote'); return;
    }
    event(s, 'The vote is tied. Nobody is eliminated.', 'vote'); beginNight(s); return;
  }
  eliminate(s, player(s, top[0]), 'was voted out by the town');
  checkWin(s); if (!s.winner) beginNight(s);
}
export function command(s, actor, input) {
  if (!input || typeof input.type !== 'string') fail('Invalid action.');
  const p = actor === GOD ? null : player(s, actor);
  if (actor !== GOD && !p) fail('You are not in this party.');
  switch (input.type) {
    case 'settings': {
      hostOnly(actor); phase(s, ['lobby']);
      const settings = input.settings;
      if (!settings || typeof settings !== 'object') fail('Invalid settings.');
      for (const key of ['selfSave', 'repeatSave', 'revealEliminated']) if (key in settings && typeof settings[key] !== 'boolean') fail('Invalid rule setting.');
      if ('voting' in settings && !['runoff', 'skip'].includes(settings.voting)) fail('Invalid voting rule.');
      if ('discussionSeconds' in settings && ![60, 120, 180, 300, 600].includes(settings.discussionSeconds)) fail('Invalid discussion time.');
      for (const key of Object.keys(s.settings)) if (key in settings) s.settings[key] = settings[key];
      break;
    }
    case 'ready': phase(s, ['lobby']); if (!p) fail('God does not need to ready up.'); p.ready = !p.ready; break;
    case 'kick': hostOnly(actor); phase(s, ['lobby']); if (!player(s, input.id)) fail('Player not found.'); s.players = s.players.filter(p => p.id !== input.id); break;
    case 'start': {
      hostOnly(actor); phase(s, ['lobby']);
      if (s.players.length < MIN_PLAYERS) fail('Invite at least 5 players, in addition to God.');
      if (s.players.some(p => !p.connected || !p.ready)) fail('Every player must be connected and ready.');
      const roles = shuffle(['murderer', 'detective', 'doctor', ...Array(s.players.length - 3).fill('citizen')]);
      s.players.forEach((p, i) => { p.role = roles[i]; p.alive = true; p.acknowledged = false; });
      s.phase = 'reveal'; event(s, 'Secret roles have been dealt. Check your own card.', 'info'); break;
    }
    case 'ack': phase(s, ['reveal']); if (!p) fail('God already knows all the roles.'); p.acknowledged = true; break;
    case 'beginNight': hostOnly(actor); phase(s, ['reveal']); if (s.players.some(p => !p.acknowledged)) fail('Wait until everyone has checked their role.'); beginNight(s); break;
    case 'nightAction': {
      phase(s, ['night']); if (!p || !p.alive) fail('Only living players can act.');
      const target = player(s, input.target);
      if (!target || !target.alive) fail('Choose a living player.');
      if (['murderer', 'detective'].includes(p.role) && p.id === target.id) fail('Choose someone other than yourself.');
      if (p.role === 'doctor' && !s.settings.selfSave && p.id === target.id) fail('Self-protection is off for this party.');
      if (p.role === 'doctor' && !s.settings.repeatSave && s.lastProtected === target.id) fail('You cannot protect the same person two nights in a row.');
      s.actions[p.id] = target.id; break;
    }
    case 'resolveNight': hostOnly(actor); phase(s, ['night']); if (!input.force && living(s).some(p => !(p.id in s.actions))) fail('Wait for all night check-ins, or choose to skip missing actions.'); resolveNight(s); break;
    case 'openVote': hostOnly(actor); phase(s, ['discussion']); s.phase = 'voting'; s.deadline = null; s.ballots = {}; s.runoff = null; event(s, 'Voting is open. Ballots remain private until the tally.', 'vote'); break;
    case 'vote': {
      phase(s, ['voting']); if (!p || !p.alive) fail('Only living players can vote.');
      if (input.target !== null) {
        const target = player(s, input.target);
        if (!target || !target.alive || target.id === p.id) fail('Choose another living player, or skip.');
        if (s.runoff && !s.runoff.includes(target.id)) fail('Choose one of the runoff candidates, or skip.');
      }
      s.ballots[p.id] = input.target; break;
    }
    case 'resolveVote': hostOnly(actor); phase(s, ['voting']); if (!input.force && living(s).some(p => !(p.id in s.ballots))) fail('Wait for every ballot, or skip missing ballots.'); resolveVote(s); break;
    case 'chat': {
      phase(s, ['lobby', 'discussion', 'finished']);
      if (p && !p.alive && s.phase !== 'finished') fail('Eliminated players must stay silent until the game ends.');
      if (typeof input.text !== 'string') fail('Write a message first.');
      const text = input.text.trim().slice(0, 400); if (!text) fail('Write a message first.');
      s.chat.push({ id: crypto.randomUUID(), actor, name: p?.name || `${s.hostName} · God`, text, at: Date.now() });
      s.chat = s.chat.slice(-100); break;
    }
    case 'rematch': {
      hostOnly(actor); phase(s, ['finished']);
      Object.assign(s, { phase: 'lobby', round: 0, actions: {}, ballots: {}, intel: {}, lastProtected: null, runoff: null, tally: null, log: [], chat: [], voteHistory: [], winner: null, deadline: null });
      s.players.forEach(p => Object.assign(p, { role: null, alive: true, ready: false, acknowledged: false })); break;
    }
    default: fail('Unknown action.');
  }
  s.revision++; return s;
}
export function viewFor(s, viewer) {
  if (viewer !== GOD && !player(s, viewer)) fail('Player not found.');
  const isGod = viewer === GOD;
  const me = player(s, viewer);
  const ended = s.phase === 'finished';
  return {
    code: s.code, hostName: s.hostName, phase: s.phase, round: s.round, settings: { ...s.settings }, revision: s.revision,
    isGod, me: viewer, myRole: me?.role || null, alive: me?.alive ?? true, ready: me?.ready ?? false, acknowledged: me?.acknowledged ?? false,
    players: s.players.map(p => ({ id: p.id, name: p.name, alive: p.alive, connected: p.connected, ready: p.ready,
      // Night check-in / per-person ballot progress is visible only to the moderator.
      ...(isGod ? { acted: p.id in s.actions, voted: p.id in s.ballots, acknowledged: p.acknowledged } : {}),
      role: isGod || ended || (!p.alive && s.settings.revealEliminated) || viewer === p.id ? p.role : null })),
    myAction: me ? s.actions[me.id] || null : null,
    myBallot: me && me.id in s.ballots ? s.ballots[me.id] : undefined,
    hasVoted: !!me && me.id in s.ballots,
    intel: structuredClone(me ? s.intel[me.id] || [] : []),
    lastProtected: me?.role === 'doctor' ? s.lastProtected : null,
    ...(isGod ? { hostActions: { ...s.actions }, submitted: Object.keys(s.actions).length, votesIn: Object.keys(s.ballots).length } : {}),
    runoff: s.runoff ? [...s.runoff] : null,
    tally: s.phase === 'voting' && !s.runoff ? null : structuredClone(s.tally),
    log: structuredClone(s.log.slice(-80)), chat: structuredClone(s.chat), voteHistory: structuredClone(s.voteHistory || []), winner: s.winner, deadline: s.deadline
  };
}
