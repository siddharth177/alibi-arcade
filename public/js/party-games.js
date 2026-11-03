// Authoritative rules for the arcade's two host-as-player games.
// Persist the state on the server; send only partyView() to a browser.
import { GOD, validName } from './engine.js';

export const HOT_PROMPTS = [
  ['My ideal weekend starts with…', 'A long lie-in', 'An outdoor adventure', 'Meeting friends', 'A personal project'],
  ['If I could have one superpower, I would choose…', 'Teleportation', 'Invisibility', 'Flying', 'Reading minds'],
  ['My perfect holiday is…', 'The mountains', 'A beach', 'A buzzing city', 'A quiet countryside stay'],
  ['I would rather be known for my…', 'Creativity', 'Kindness', 'Courage', 'Sense of humour'],
  ['My first choice for a group outing is…', 'A food trail', 'A game night', 'A hike', 'A live show'],
  ['If plans get cancelled, I usually feel…', 'Relieved', 'Disappointed', 'Ready to make new plans', 'Happy to improvise'],
  ['The fictional world I would visit is…', 'A magical kingdom', 'A space station', 'A detective mystery', 'A peaceful village'],
  ['I would most enjoy learning…', 'An instrument', 'A new language', 'A sport', 'A creative craft'],
  ['In a group project, I naturally become…', 'The planner', 'The idea person', 'The finisher', 'The peacemaker'],
  ['My travel style is…', 'A detailed itinerary', 'A few loose plans', 'Complete spontaneity', 'Let a friend decide'],
  ['I would pick this unusual job for a day…', 'Film director', 'Astronaut', 'Wildlife photographer', 'Food critic'],
  ['If I had a free evening, I would pick…', 'A book', 'A film or series', 'A long conversation', 'A game'],
  ['My ideal birthday celebration is…', 'A big party', 'A small dinner', 'A trip', 'A quiet day to myself'],
  ['I am most tempted by…', 'Something sweet', 'Something spicy', 'Something crunchy', 'Something comforting'],
  ['I would rather explore…', 'The deep ocean', 'Outer space', 'An ancient city', 'A rainforest'],
  ['The skill I wish came naturally to me is…', 'Public speaking', 'Singing', 'Dancing', 'Drawing'],
  ['My favourite kind of competition is…', 'A strategy game', 'A team sport', 'A quiz', 'A creative challenge'],
  ['On a road trip, I want to be…', 'The driver', 'The DJ', 'The navigator', 'The snack manager'],
  ['I would spend a surprise day off…', 'Catching up on sleep', 'Exploring somewhere new', 'Seeing friends', 'Finishing something I started'],
  ['I would rather master…', 'Cooking', 'Photography', 'Storytelling', 'Chess'],
  ['My dream home would have…', 'A library', 'A garden', 'A games room', 'A big kitchen'],
  ['I enjoy conversations about…', 'Big ideas', 'Personal stories', 'Current happenings', 'Completely silly things'],
  ['When choosing a film, I lean towards…', 'Comedy', 'Mystery', 'Adventure', 'Drama'],
  ['I would choose a pet companion that is…', 'Playful', 'Independent', 'Calm', 'Adventurous'],
  ['My favourite way to celebrate a win is…', 'Tell everyone', 'Treat myself', 'Celebrate with close friends', 'Start the next challenge'],
  ['I would prefer to time-travel to…', 'The distant past', 'My childhood', 'The near future', 'The distant future'],
  ['I notice this first in a new place…', 'The people', 'The food', 'The architecture', 'The atmosphere'],
  ['I would rather receive…', 'A thoughtful letter', 'A useful gadget', 'A shared experience', 'A surprise gift'],
  ['The board-game role that suits me is…', 'The strategist', 'The negotiator', 'The risk taker', 'The unpredictable one'],
  ['My preferred way to unwind is…', 'Exercise', 'Music', 'A walk', 'Doing absolutely nothing'],
  ['If I opened a place of my own, it would be…', 'A cafe', 'A bookshop', 'A games lounge', 'A creative studio'],
  ['I would rather win…', 'A sports tournament', 'A writing competition', 'A business challenge', 'A trivia championship'],
  ['My friends would trust me most to choose…', 'The restaurant', 'The playlist', 'The travel plan', 'The next game'],
  ['My ideal morning is…', 'Slow and peaceful', 'Early and productive', 'Full of exercise', 'As late as possible'],
  ['I would choose this lifelong perk…', 'Free travel', 'Free food', 'Unlimited books', 'Tickets to any event'],
  ['The mystery I most want solved is…', 'Life beyond Earth', 'How ancient cities lived', 'The depths of the ocean', 'What animals are thinking'],
  ['I feel most accomplished after…', 'Helping someone', 'Learning something difficult', 'Making something', 'Finishing a challenge'],
  ['In a new city, my first stop is…', 'A local market', 'A landmark', 'A food spot', 'A quiet neighbourhood'],
  ['I am most likely to start a conversation with…', 'A question', 'A funny story', 'An observation', 'A shared interest'],
  ['My game-night weakness is…', 'Overthinking', 'Taking risks', 'Trusting everyone', 'Getting distracted']
];
export const CODE_WORDS = (`ANCHOR APPLE ATLAS AURORA BADGE BAMBOO BANK BELL BERRY BRIDGE BRUSH CABIN CAMERA CANDLE CAPTAIN CASTLE CHAIR CHARGE CHEST CLOUD COAST COMET COMPASS CONCERT CORAL CROWN CRANE CRICKET CROSS CRYSTAL DANCE DESERT DIAMOND DRAGON DREAM DRUM EAGLE ENGINE FAIR FEATHER FIELD FILM FIRE FLUTE FOREST FROST GARDEN GHOST GLASS GLOVE GOLD GRASS HAMMER HARBOR HAWK HEART HONEY HORN HORSE HOTEL ICE ISLAND JACKET JAZZ JET KEY KITE KNIGHT LAB LANTERN LASER LEAF LEMON LETTER LIGHT LION LOCK LOTUS LUCK MAP MARBLE MASK MERCURY MINT MIRROR MOON MOUSE MOUNTAIN NEEDLE NIGHT NOTE OASIS OLIVE OPERA ORANGE ORBIT PALACE PALM PANDA PAPER PARK PEARL PEN PILOT PIPE PITCH PLANE PLANT PLATE PORT POST PYRAMID QUEEN RABBIT RAIN RING RIVER ROBIN ROBOT ROCK ROCKET ROSE ROUND SAIL SATELLITE SCALE SCHOOL SEAL SHADOW SHARK SHIP SILK SILVER SNOW SOUND SPACE SPARK SPIDER SPRING SQUARE STAR STEAM STONE STORM STREAM STRING STUDIO SUN TABLE TEMPLE THEATER THUNDER TICKET TIGER TIME TOWER TRAIN TREE TRIANGLE TUNNEL TURTLE VALLEY VANILLA VELVET VIOLIN VOLCANO WATCH WATER WAVE WEB WHALE WHEEL WIND WING WINTER WIRE WOLF WOOD WORLD`).split(' ');
const fail = message => { throw new Error(message); };
const getPlayer = (s, id) => s.players.find(p => p.id === id);
const hostOnly = actor => { if (actor !== GOD) fail('Only the host can do that.'); };
const requirePhase = (s, ...allowed) => { if (!allowed.includes(s.phase)) fail('That action is not available in this phase.'); };
const log = (s, text) => { s.log.push({ id: crypto.randomUUID(), text, round: s.round }); s.log = s.log.slice(-100); };
function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const bound = Math.floor(4294967296 / (i + 1)) * (i + 1); let n;
    do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= bound);
    const j = n % (i + 1); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function createParty(code, name, game) {
  if (!['hotseat', 'codebreakers'].includes(game)) fail('Unknown game.');
  if (!/^\d{6}$/.test(code)) fail('Invalid party code.');
  const hostName = validName(name);
  return { game, code, hostName, created: Date.now(), revision: 0, phase: 'lobby', round: 0,
    players: [{ id: GOD, name: hostName, connected: true, ready: false, score: 0, team: null, role: 'guesser' }],
    settings: { roundsPerPlayer: 1 }, log: [], chat: [], history: [], winner: null,
    answers: {}, guesses: {}, order: [], promptOrder: [], board: [], clueHistory: [] };
}
export function addPartyPlayer(s, name, token) {
  requirePhase(s, 'lobby'); name = validName(name);
  if (s.players.length >= 16) fail('This party is full (16 players including the host).');
  if (s.players.some(p => p.name.toLowerCase() === name.toLowerCase())) fail('That name is already in this party. Choose another.');
  if (typeof token !== 'string' || token.length < 24) fail('Invalid player session.');
  const p = { id: crypto.randomUUID(), token, name, connected: true, ready: false, score: 0, team: null, role: 'guesser' };
  s.players.push(p); s.revision++; return p;
}
function hotRound(s) {
  s.round++; s.phase = 'answering'; s.seat = s.order[(s.round - 1) % s.order.length];
  s.promptIndex = s.promptOrder[s.round - 1]; s.answers = {}; s.guesses = {}; s.result = null;
  log(s, `Round ${s.round}: ${getPlayer(s, s.seat).name} is in the hot seat.`);
}
function revealHot(s, skipped = false) {
  if (!skipped && !(s.seat in s.answers)) fail('Wait for the hot-seat player to answer, or skip this round.');
  const correct = skipped ? null : s.answers[s.seat];
  const predictions = s.players.filter(p => p.id !== s.seat).map(p => {
    const choice = !skipped && p.id in s.guesses ? s.guesses[p.id] : null;
    const matched = !skipped && choice !== null && choice === correct;
    if (matched) p.score++;
    return { id: p.id, choice, matched };
  });
  s.result = { round: s.round, seat: s.seat, promptIndex: s.promptIndex, correct, predictions, skipped };
  s.history.push(structuredClone(s.result)); s.phase = 'result';
  const matches = predictions.filter(p => p.matched).length;
  log(s, skipped ? 'This round was skipped. No points awarded.' : `${matches} ${matches === 1 ? 'friend' : 'friends'} guessed correctly.`);
}
const remaining = (s, team) => s.board.filter(c => c.color === team && !c.revealed).length;
function codeWin(s, team, why) { s.phase = 'finished'; s.winner = team; log(s, `${team === 'red' ? 'Red' : 'Blue'} team wins. ${why}`); }
function endTurn(s) {
  s.turn = s.turn === 'red' ? 'blue' : 'red'; s.phase = 'clue'; s.clue = null; s.guessesLeft = 0; s.round++;
  log(s, `${s.turn === 'red' ? 'Red' : 'Blue'} team's turn. Waiting for a clue.`);
}
export function partyCommand(s, actor, input) {
  if (!input || typeof input.type !== 'string') fail('Invalid action.');
  const p = getPlayer(s, actor); if (!p) fail('You are not in this party.');
  switch (input.type) {
    case 'settings': {
      hostOnly(actor); requirePhase(s, 'lobby');
      if (!input.settings || Array.isArray(input.settings) || typeof input.settings !== 'object') fail('Invalid settings.');
      if ('roundsPerPlayer' in input.settings) {
        if (![1, 2].includes(input.settings.roundsPerPlayer)) fail('Invalid round count.');
        s.settings.roundsPerPlayer = input.settings.roundsPerPlayer;
      }
      break;
    }
    case 'ready': requirePhase(s, 'lobby'); p.ready = !p.ready; break;
    case 'kick': {
      hostOnly(actor); requirePhase(s, 'lobby');
      if (input.id === GOD || !getPlayer(s, input.id)) fail('Choose another player.');
      s.players = s.players.filter(p => p.id !== input.id); break;
    }
    case 'joinTeam': {
      requirePhase(s, 'lobby'); if (s.game !== 'codebreakers') fail('That game does not use teams.');
      if (!['red', 'blue'].includes(input.team) || !['spymaster', 'guesser'].includes(input.role)) fail('Invalid team or role.');
      if (input.role === 'spymaster' && s.players.some(q => q.id !== actor && q.team === input.team && q.role === 'spymaster')) fail('That team already has a clue-giver. Choose guesser or the other team.');
      p.team = input.team; p.role = input.role; p.ready = false; break;
    }
    case 'start': {
      hostOnly(actor); requirePhase(s, 'lobby');
      if (s.players.length < (s.game === 'hotseat' ? 3 : 4)) fail(`Invite at least ${s.game === 'hotseat' ? 3 : 4} players including the host.`);
      if (s.players.some(p => !p.ready || !p.connected)) fail('Every player must be connected and ready.');
      s.players.forEach(p => { p.score = 0; }); s.history = []; s.log = []; s.winner = null; s.round = 0;
      if (s.game === 'hotseat') {
        s.order = shuffle(s.players.map(p => p.id)); s.totalRounds = s.players.length * s.settings.roundsPerPlayer;
        s.promptOrder = shuffle(HOT_PROMPTS.map((_, i) => i)); hotRound(s);
      } else {
        if (s.players.some(p => !p.team) || ['red', 'blue'].some(t => !s.players.some(p => p.team === t && p.role === 'spymaster') || !s.players.some(p => p.team === t && p.role === 'guesser'))) fail('Every player must join a team. Each team needs one clue-giver and at least one guesser.');
        s.turn = shuffle(['red', 'blue'])[0];
        const colors = shuffle([...Array(9).fill(s.turn), ...Array(8).fill(s.turn === 'red' ? 'blue' : 'red'), ...Array(7).fill('neutral'), 'assassin']);
        s.board = shuffle(CODE_WORDS).slice(0, 25).map((word, i) => ({ word, color: colors[i], revealed: false }));
        s.phase = 'clue'; s.round = 1; s.clue = null; s.clueHistory = []; s.guessesLeft = 0;
        log(s, `${s.turn === 'red' ? 'Red' : 'Blue'} team starts with nine words. Clue-givers, keep your key private.`);
      }
      break;
    }
    case 'hotAnswer': case 'hotGuess': {
      if (s.game !== 'hotseat') fail('That action belongs to Hot Seat.'); requirePhase(s, 'answering');
      if (!Number.isInteger(input.choice) || input.choice < 0 || input.choice > 3) fail('Choose one of the four answers.');
      if (input.type === 'hotAnswer' && actor !== s.seat) fail('Only the hot-seat player can answer.');
      if (input.type === 'hotGuess' && actor === s.seat) fail('You answer this question; your friends guess.');
      if (actor === s.seat) s.answers[actor] = input.choice; else s.guesses[actor] = input.choice;
      if (s.seat in s.answers && s.players.every(p => p.id === s.seat || p.id in s.guesses)) revealHot(s);
      break;
    }
    case 'hotReveal':
      hostOnly(actor); if (s.game !== 'hotseat') fail('That action belongs to Hot Seat.'); requirePhase(s, 'answering'); revealHot(s); break;
    case 'hotSkip':
      if (s.game !== 'hotseat') fail('That action belongs to Hot Seat.'); requirePhase(s, 'answering');
      if (actor !== GOD && actor !== s.seat) fail('Only the host or hot-seat player can skip a round.'); revealHot(s, true); break;
    case 'hotNext': {
      hostOnly(actor); if (s.game !== 'hotseat') fail('That action belongs to Hot Seat.'); requirePhase(s, 'result');
      if (s.round >= s.totalRounds) {
        s.phase = 'finished'; const best = Math.max(...s.players.map(p => p.score));
        s.winner = s.players.filter(p => p.score === best).map(p => p.id); log(s, 'Every player has taken the hot seat. Final scores are in.');
      } else hotRound(s);
      break;
    }
    case 'codeClue': {
      if (s.game !== 'codebreakers') fail('That action belongs to Codebreakers.'); requirePhase(s, 'clue');
      if (p.team !== s.turn || p.role !== 'spymaster') fail('Only the active team’s clue-giver can submit a clue.');
      const word = typeof input.word === 'string' ? input.word.normalize('NFKC').trim() : '';
      if (!/^[\p{L}]{2,24}$/u.test(word) || !Number.isInteger(input.count) || input.count < 1 || input.count > remaining(s, s.turn)) fail('Use a single word (2–24 letters) and a valid number of remaining team words.');
      if (s.board.some(c => !c.revealed && c.word.toLowerCase() === word.toLowerCase())) fail('Choose a clue that is not an unrevealed word on the board.');
      s.clue = { word, count: input.count, team: s.turn }; s.clueHistory.push({ ...s.clue, round: s.round });
      s.guessesLeft = input.count + 1; s.phase = 'guess'; log(s, `${s.turn === 'red' ? 'Red' : 'Blue'} clue: ${word}, ${input.count}.`); break;
    }
    case 'codeGuess': {
      if (s.game !== 'codebreakers') fail('That action belongs to Codebreakers.'); requirePhase(s, 'guess');
      if (p.team !== s.turn || p.role !== 'guesser') fail('Only the active team’s guessers can choose words.');
      if (!Number.isInteger(input.index) || !s.board[input.index] || s.board[input.index].revealed) fail('Choose an unrevealed word.');
      const card = s.board[input.index]; card.revealed = true; s.guessesLeft--;
      log(s, `${p.name} chose ${card.word}: ${card.color === 'assassin' ? 'the trap' : card.color}.`);
      if (card.color === 'assassin') codeWin(s, s.turn === 'red' ? 'blue' : 'red', 'The other team found the trap.');
      else if (['red', 'blue'].some(t => remaining(s, t) === 0)) codeWin(s, ['red', 'blue'].find(t => remaining(s, t) === 0), 'All of their words were found.');
      else if (card.color !== s.turn || s.guessesLeft <= 0) endTurn(s);
      break;
    }
    case 'codeEndTurn': {
      if (s.game !== 'codebreakers') fail('That action belongs to Codebreakers.'); requirePhase(s, 'guess');
      if (p.team !== s.turn || p.role !== 'guesser') fail('Only the active team’s guessers can end the turn.'); endTurn(s); break;
    }
    case 'codePass': {
      if (s.game !== 'codebreakers') fail('That action belongs to Codebreakers.'); requirePhase(s, 'clue', 'guess');
      hostOnly(actor); log(s, 'The host skipped this turn.'); endTurn(s); break;
    }
    case 'rematch': {
      hostOnly(actor); requirePhase(s, 'finished');
      const fresh = createParty(s.code, s.hostName, s.game);
      const players = s.players.map(p => ({ ...p, ready: false, score: 0 }));
      const keep = { hostToken: s.hostToken, hostSeen: s.hostSeen, created: s.created, revision: s.revision, players, settings: { ...s.settings } };
      Object.assign(s, fresh, keep); for (const key of ['seat', 'promptIndex', 'result', 'totalRounds', 'turn', 'clue', 'guessesLeft']) delete s[key]; break;
    }
    default: fail('Unknown action.');
  }
  s.revision++; return s;
}
export function partyView(s, viewer) {
  const p = getPlayer(s, viewer); if (!p) fail('Player not found.');
  const v = { game: s.game, code: s.code, hostName: s.hostName, phase: s.phase, revision: s.revision,
    isGod: viewer === GOD, isHost: viewer === GOD, me: viewer, ready: p.ready, round: s.round,
    settings: { ...s.settings }, players: s.players.map(({ id, name, ready, score, connected, team, role }) => ({ id, name, ready, score, connected, team, role })),
    winner: structuredClone(s.winner), log: structuredClone(s.log), history: structuredClone(s.history) };
  if (s.game === 'hotseat') Object.assign(v, {
    totalRounds: s.totalRounds || s.players.length * s.settings.roundsPerPlayer,
    seat: s.seat || null, prompt: s.promptIndex === undefined ? null : { text: HOT_PROMPTS[s.promptIndex][0], options: HOT_PROMPTS[s.promptIndex].slice(1) },
    ownChoice: viewer === s.seat ? (s.answers[viewer] ?? null) : (s.guesses[viewer] ?? null),
    submittedCount: Object.keys(s.answers).length + Object.keys(s.guesses).length,
    result: s.phase === 'result' || s.phase === 'finished' ? structuredClone(s.result) : null,
    ...(viewer === GOD ? { seatAnswered: s.seat in s.answers } : {})
  });
  else Object.assign(v, { team: p.team, role: p.role, turn: s.turn || null, clue: structuredClone(s.clue || null),
    guessesLeft: s.guessesLeft || 0, remaining: { red: remaining(s, 'red'), blue: remaining(s, 'blue') },
    clueHistory: structuredClone(s.clueHistory),
    board: s.board.map(c => ({ word: c.word, revealed: c.revealed, color: c.revealed || s.phase === 'finished' || p.role === 'spymaster' ? c.color : null })) });
  return v;
}
