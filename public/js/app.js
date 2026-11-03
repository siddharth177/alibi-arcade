import { ROLES, GOD, MIN_PLAYERS, MAX_PLAYERS } from './engine.js';
import { PartyNetwork, savedHost, savedPlayer } from './network.js';
import { games } from './games.js';
import { renderExtraParty, extraRules } from './party-ui.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check: '<path d="m5 12 4 4L19 6"/>',
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  dagger: '<path d="m15 3 6 0 0 6-9 9-6-6zM4 14l6 6m-3-3-5 5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.4A11 11 0 0 1 12 5c6.4 0 10 7 10 7a21 21 0 0 1-3 3.9M6.3 6.3A21 21 0 0 0 2 12s3.6 7 10 7a11 11 0 0 0 4.2-.8"/>',
  crown: '<path d="m3 6 4 4 5-7 5 7 4-4-3 14H6Z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  chat: '<path d="M21 15a3 3 0 0 1-3 3H8l-6 4V5a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3Z"/>',
  vote: '<path d="m8 3 11 8-7 9L1 12zM6 14h14l2 7H7l-1-7Z"/>',
  book: '<path d="M12 5v16m0-16C8 2 4 2 2 3v16c3-1 7-1 10 2 3-3 7-3 10-2V3c-2-1-6-1-10 2Z"/>',
  exit: '<path d="M9 21H4V3h5m5 4 5 5-5 5M8 12h12"/>', wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
const mark = `<span class="brand-mark" aria-hidden="true">a<span>•</span></span>`;
let network = null, view = null, status = '', busy = false, actionInFlight = false;
const ui = { filter: 'all', showRole: false, godRoles: true, selected: null, editChoice: false, chatDraft: '', screen: 'home', extraKey: false, clueWord: '', clueCount: 1 };
const app = $('#app'), modal = $('#modal');
const phases = { lobby: 'The gathering', reveal: 'A secret identity', night: 'The town is asleep', discussion: 'Everyone has a story', voting: 'Who do you believe?', finished: 'The truth comes out' };
let toastTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
function header(inParty = false) {
  return `<header class="site-header"><a href="#" class="brand" data-action="home" aria-label="Alibi Arcade home">${mark}<span>alibi<span class="brand-sub">ARCADE</span></span></a>${inParty ? `<div class="header-room"><span class="live-dot"></span> Private party <span class="code-mini">${view.code}</span></div><button class="button button-plain" data-action="leave">${icon('exit')}<span>Leave</span></button>` : `<nav aria-label="Main navigation"><a class="nav-link active" href="#arcade">The arcade</a><button class="nav-link" data-action="rules">How to play ${icon('arrow')}</button></nav><button class="button button-outline header-join" data-action="join">Join a party ${icon('arrow')}</button>`}</header>`;
}
function footer() { return `<footer><a href="#" class="brand footer-brand" data-action="home">${mark}<span>alibi<span class="brand-sub">ARCADE</span></span></a><span>A good night starts with good company.</span><button class="text-button" data-action="rules">The house rules ${icon('arrow')}</button></footer>`; }
function renderHome() {
  const stored = savedHost(), guest = savedPlayer();
  app.innerHTML = `${header()}<main id="main"><section class="hero wrap"><div class="hero-copy"><div class="eyebrow"><span class="tiny-star">✳</span> LESS SCROLLING. MORE PLAYING.</div><h1>Good friends.<br>Great games.<br><span>Terrible alibis.</span></h1><p class="hero-lead">Your people. A little friendly chaos.<br>One place for the games that bring you together.</p><div class="hero-buttons"><button class="button button-dark button-lg" data-action="create">Start a party ${icon('arrow')}</button><button class="button button-outline button-lg" data-action="join">I have a code ${icon('plus')}</button></div><p class="hero-note">${icon('check')} No downloads <span>·</span> No accounts <span>·</span> Just play</p>${stored ? `<button class="resume-banner" data-action="resume-host">${icon('crown')} Resume your party <b>${stored.code}</b> ${icon('arrow')}</button>` : guest ? `<button class="resume-banner" data-action="resume-player">${icon('people')} Rejoin party <b>${guest.code}</b> ${icon('arrow')}</button>` : ''}</div><div class="hero-feature"><div class="feature-sticker">THREE WAYS<br>TO PLAY ${icon('spark')}</div><div class="featured-poster"><img src="./assets/mafia.svg" alt="A mysterious figure in a rain-soaked city under a full moon" width="900" height="760"><div class="poster-top"><span>AN ALIBI ORIGINAL</span><span>VOL. 01</span></div><div class="poster-stamp">TRUST<br>NO ONE.</div><div class="poster-bottom"><span class="poster-kicker">KEEP YOUR FRIENDS CLOSE.</span><h2>MAFIA<span>THE NIGHT HAS SECRETS.</span></h2><div class="poster-footer"><span>${icon('people')} 5–16 players + God</span><button class="poster-play" data-action="create" data-game="mafia" aria-label="Host a Mafia party">${icon('arrow')}</button></div></div></div><div class="poster-caption"><span><span class="live-dot"></span> NOW PLAYING</span><span>Social deduction / 20–45 min</span></div></div></section>
  <div class="ticker" aria-hidden="true"><span>BRING YOUR PEOPLE</span><b>✳</b><span>LEAVE YOUR POKER FACE AT HOME</span><b>✳</b><span>MAKE A NIGHT OF IT</span><b>✳</b><span>TRUST IS OPTIONAL</span><b>✳</b></div>
  <section class="wrap arcade" id="arcade"><div class="section-heading"><div><div class="eyebrow">THE GAME SHELF</div><h2>Pick your next plot twist<span>.</span></h2></div><div class="filters" role="group" aria-label="Filter games"><button data-filter="all" class="filter ${ui.filter === 'all' ? 'selected' : ''}">All games <small>03</small></button><button data-filter="social" class="filter ${ui.filter === 'social' ? 'selected' : ''}">Social deduction</button><button data-filter="next" class="filter ${ui.filter === 'next' ? 'selected' : ''}">Party & word games</button></div></div><div class="game-grid">${games.filter(g => ui.filter === 'all' || ui.filter === 'social' && g.id === 'mafia' || ui.filter === 'next' && g.id !== 'mafia').map(gameCard).join('')}</div></section>
  <section class="wrap how-section"><div><div class="eyebrow">LESS SETUP. MORE SHOWTIME.</div><h2>Your game night,<br>in three moves.</h2><button class="text-button" data-action="rules">New to Mafia? Start here ${icon('arrow')}</button></div><div class="steps"><article><span>01</span><div><h3>Someone takes the lead.</h3><p>Choose a game and create a party. The host keeps things moving.</p></div>${icon('crown')}</article><article><span>02</span><div><h3>Six digits. Everyone’s in.</h3><p>Share your party code. Friends join on their own phones or laptops.</p></div>${icon('people')}</article><article><span>03</span><div><h3>Let the stories unfold.</h3><p>Bluff, find the connection, or predict your friends. The room handles the details.</p></div>${icon('moon')}</article></div></section><section class="wrap closing"><span>BETTER TOGETHER. WORSE AT LYING.</span><p>Same friends.<br>New suspects.</p><button class="button button-lime" data-action="create">Make it a game night ${icon('arrow')}</button></section></main>${footer()}`;
}
function gameCard(g) {
  const art = g.id === 'mafia' ? '<img src="./assets/mafia.svg" alt="" loading="lazy"><strong>MAFIA</strong>' : g.id === 'codebreakers' ? '<div class="code-blocks" aria-hidden="true"><span>?</span><span>A</span><span>✳</span><span>?</span></div><strong class="shelf-game-title">CODE<br>BREAKERS</strong>' : '<div class="hotseat-chair" aria-hidden="true"><span>?</span></div><strong class="shelf-game-title">HOT SEAT</strong>';
  return `<article class="game-card"><button class="game-art ${g.id === 'mafia' ? 'mafia' : g.id}-art" data-action="create" data-game="${g.id}" aria-label="Play ${g.title}">${art}<span class="game-label">${icon('spark')} READY TO PLAY</span><span class="art-arrow">${icon('arrow')}</span></button><div class="game-meta"><span class="tag">${g.tag}</span><span>${icon('clock')} ${g.duration}</span></div><h3>${g.title}</h3><p>${g.description}</p><p class="game-players">${g.players}</p><button class="text-button" data-action="create" data-game="${g.id}">Play ${g.title} ${icon('arrow')}</button></article>`;
}
function modalFrame(title, content, wide = false) {
  modal.className = wide ? 'modal-wide' : '';
  modal.innerHTML = `<button class="modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button>${mark}<h2 id="modal-title">${title}</h2>${content}`;
  if (!modal.open) modal.showModal();
}
function createModal(game = null) {
  if (!game) {
    modalFrame('Pick your kind of chaos.', `<p class="modal-intro">Three games. One code. Bring your people.</p><div class="game-chooser">${games.map(g => `<button class="game-choice" data-action="create" data-game="${g.id}"><strong>${g.title}</strong><span>${g.players} · ${g.duration}</span><p>${g.description}</p>${icon('arrow')}</button>`).join('')}</div>`);
    return;
  }
  const g = games.find(g => g.id === game); if (!g) return;
  modalFrame(game === 'mafia' ? 'Every story needs a God.' : `Make it a ${g.title} night.`, `<p class="modal-intro">${game === 'mafia' ? 'You moderate. They bluff. Guide your friends through Mafia.' : g.description}</p><form id="create-form"><input type="hidden" name="game" value="${g.id}"><label for="host-name">Your name</label><input id="host-name" name="name" minlength="2" maxlength="20" placeholder="What should we call you?" autocomplete="nickname" required><div class="form-detail">${icon('people')} ${game === 'mafia' ? 'You’ll be God. Invite at least 5 players in addition to you.' : `You host and play. ${g.players}.`}</div><button class="button button-dark full" type="submit">Create ${g.title} party ${icon('arrow')}</button><p class="form-error" role="alert"></p><p class="form-help">Your party stays saved. Resume from this browser.</p></form><div class="modal-switch"><button class="text-button" data-action="create">Choose another game</button><button class="text-button" data-extra-rules="${g.id}">How to play</button></div>`);
}
function extraRulesModal(game) {
  if (game === 'mafia') { rulesModal(); return; }
  const g = games.find(g => g.id === game); if (!g) return;
  modalFrame(`${g.title}: the house rules.`, `<div class="rule-game-tabs"><button class="text-button" data-mafia-rules>Mafia</button>${games.filter(g => g.id !== 'mafia').map(g => `<button class="text-button" data-extra-rules="${g.id}">${g.title}</button>`).join('')}</div><div class="rule-content extra-rules">${extraRules(game)}</div><button class="button button-dark full" ${view ? 'data-action="close-modal"' : `data-action="create" data-game="${game}"`}>${view ? 'Got it' : 'Play ' + g.title} ${icon('arrow')}</button>`, true);
}
function joinModal() {
  const code = new URL(location.href).searchParams.get('party') || '';
  modalFrame('Your people are waiting.', `<p class="modal-intro">Get the 6-digit code from your host. The code takes you to the right game.</p><form id="join-form"><label for="party-code">Party code</label><input id="party-code" class="code-input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" value="${escape(/^\d{6}$/.test(code) ? code : '')}" autocomplete="off" required><label for="player-name">Your name</label><input id="player-name" name="name" minlength="2" maxlength="20" placeholder="The name everyone knows you by" autocomplete="nickname" required><button class="button button-dark full" type="submit">Join the party ${icon('arrow')}</button><p class="form-error" role="alert"></p><p class="form-help">Everyone needs their own screen. Join from the same room or a call.</p></form><div class="modal-switch">Leading tonight? <button class="text-button" data-action="create">Create a party</button></div>`);
}
function rulesModal(tab = 'play') {
  if (view?.game && view.game !== 'mafia') { extraRulesModal(view.game); return; }
  const tabs = [['play', 'The flow'], ['roles', 'The roles'], ['conduct', 'Play it well'], ['rules', 'House rules']];
  const content = {
    play: `<div class="rule-step"><b>01</b><div><h3>God sets the scene.</h3><p>One person hosts as God. At least 5 others join with the 6-digit code. God moderates, sees all roles, and never votes.</p></div></div><div class="rule-step"><b>02</b><div><h3>Keep your identity secret.</h3><p>One murderer, one detective, one doctor. Everyone else is a citizen. Each player checks their role privately.</p></div></div><div class="rule-step"><b>03</b><div><h3>Night falls.</h3><p>The murderer chooses a victim. The doctor protects someone. The detective checks a suspect. Citizens submit a harmless suspicion to keep screen activity alike. God resolves all choices together.</p></div></div><div class="rule-step"><b>04</b><div><h3>Discuss. Doubt. Decide.</h3><p>At dawn, God announces the outcome. Living players discuss, then cast a private vote for someone else or skip. God tallies it. Night begins again.</p></div></div><div class="rule-win"><strong>Town wins</strong> when the murderer is eliminated.<br><strong>Mafia wins</strong> when the murderer equals the number of living town players.</div>`,
    roles: Object.entries(ROLES).map(([key, role]) => `<article class="rule-role" style="--role-color:${role.color}"><span class="role-symbol">${icon(role.icon)}</span><div><h3>${role.name} <small>${role.side}</small></h3><p>${role.objective}</p><p class="role-tip">${role.tip}</p></div></article>`).join(''),
    conduct: `<div class="conduct"><h3>Bluff with words. Keep cards private.</h3><p>Role claims can be true or false. Don’t show your role screen, share screenshots, or use private messages to prove a claim.</p><h3>Read the game, not a stereotype.</h3><p>Compare explanations, vote choices, and contradictions. Being quiet, nervous, or confident does not establish a role.</p><h3>At night, everyone checks in.</h3><p>Keep silent and keep your screen to yourself. Citizens make a harmless choice too. Night completion and vote progress stay with God.</p><h3>Out means out.</h3><p>Eliminated players can watch but cannot vote, act, or send town messages. Don’t reveal extra information to friends still playing.</p><h3>God stays neutral.</h3><p>Announce outcomes without hints. Don’t reveal the doctor’s target or the detective’s result. Give everyone room to speak.</p><h3>Bring your voices.</h3><p>Talk in the same room or use your usual group call. In-game town chat is available in the lobby and during discussion. Voice and video are not built in.</p></div>`,
    rules: `<div class="conduct"><h3>A clear version, agreed before you play.</h3><p>Mafia has many house variants. Alibi uses exactly one murderer, one doctor, one detective, and the remaining players as citizens. God is separate. We recommend 5–9 players plus God for this lineup.</p><ul class="rule-list"><li>Start with a night after everyone acknowledges their secret role.</li><li>All night choices resolve together. A detective gets their chosen check even if eliminated that night.</li><li>A protected victim survives. The town hears only that nobody was eliminated; it never learns the protected target.</li><li>Default: doctor may protect themselves, but not the same person twice in a row. God can change both rules before starting.</li><li>Votes use plurality, including skip. Self-votes are prohibited. Ballots stay hidden until the tally.</li><li>Default: a tie between players opens one runoff. A second tie, a winning skip, or a tie with skip eliminates nobody. God can choose immediate no-elimination instead.</li><li>God can reveal eliminated roles or keep them hidden. Every role is revealed at game end.</li><li>God controls phase changes. If a player disconnects, God can explicitly skip their missing action or ballot; nobody is automatically eliminated.</li></ul><p class="sources">Research: <a href="https://www.eblong.com/zarf/werewolf.html" target="_blank" rel="noopener noreferrer">Andrew Plotkin’s original Werewolf rules</a>, <a href="https://mafiaround.com/rules" target="_blank" rel="noopener noreferrer">Mafia Round rules</a>, <a href="https://mafia.partyygames.com/rules" target="_blank" rel="noopener noreferrer">Partyy Games rules</a>. House choices are documented here rather than assumed to be universal.</p></div>`
  };
  modalFrame('A little trust. A lot of bluff.', `<p class="modal-intro">A quick field guide to a very suspicious game night.</p><div class="rule-game-tabs"><button class="text-button" data-extra-rules="hotseat">Hot Seat rules</button><button class="text-button" data-extra-rules="codebreakers">Codebreakers rules</button></div><div class="rule-tabs" role="tablist" aria-label="Mafia rulebook">${tabs.map(([key, name]) => `<button role="tab" id="tab-${key}" aria-controls="rule-panel" data-rule-tab="${key}" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" class="${tab === key ? 'selected' : ''}">${name}</button>`).join('')}</div><div id="rule-panel" class="rule-content" role="tabpanel" aria-labelledby="tab-${tab}">${content[tab]}</div><button class="button button-dark full" data-action="${view ? 'close-modal' : 'create'}" data-game="mafia">${view ? 'Got it' : 'Let’s play Mafia'} ${icon('arrow')}</button>`, true);
}
function avatar(p, i, small = false) { return `<span class="avatar ${small ? 'avatar-sm' : ''}" style="--avatar:${['#d8dcc1', '#ddc9b6', '#cdd4e2', '#ded1dd', '#e5d7a9', '#bbd5cb'][i % 6]}">${escape(p.name.slice(0, 2).toUpperCase())}</span>`; }
function renderParty() {
  const focused = document.activeElement?.id, selection = document.activeElement?.selectionStart;
  if (view.game && view.game !== 'mafia') {
    app.innerHTML = renderExtraParty(view, { header, icon, escape, status, ui });
    if (focused && document.getElementById(focused)) { const el = document.getElementById(focused); el.focus({ preventScroll: true }); if (typeof selection === 'number' && el.setSelectionRange && el.type !== 'number') el.setSelectionRange(selection, selection); }
    return;
  }
  const v = view, count = v.players.length, alive = v.players.filter(p => p.alive), role = ROLES[v.myRole];
  const chatOpen = ['lobby', 'discussion', 'finished'].includes(v.phase) && (v.isGod || v.alive || v.phase === 'finished');
  app.innerHTML = `${header(true)}<main id="main" class="wrap party"><div class="party-heading"><div><a class="breadcrumb" href="#" data-action="rules">THE ARCADE / MAFIA ${icon('book')}</a><h1>${phases[v.phase]}</h1><p>${v.phase === 'lobby' ? 'Gather your people. The night is just getting started.' : v.phase === 'finished' ? 'The secrets are out. Time to compare stories.' : `Mafia · ${v.phase === 'reveal' ? 'Roles dealt' : `Round ${v.round}`} · ${alive.length} of ${count} players alive`}</p></div><button class="party-code" data-action="copy-code" aria-label="Copy party code ${v.code}"><span>PARTY CODE</span><strong>${v.code}</strong>${icon('copy')}</button></div><div class="connection-line ${status !== 'Connected' ? 'interrupted' : ''}"><span class="live-dot"></span><span>${escape(status || 'Connected')}</span>${v.isGod ? '<span class="host-note">You’re God. Guide the night, discussion, and vote.</span>' : '<span class="host-note">Your role and actions stay private.</span>'}<button class="text-button" data-action="copy-link">Copy invite link ${icon('arrow')}</button></div>
  <div class="party-layout"><div class="party-main">${phasePanel(v)}<section class="roster-panel panel"><div class="panel-heading"><h2>${v.phase === 'lobby' ? 'The guest list' : 'Around the table'} <span>${count}/${MAX_PLAYERS}</span></h2>${v.isGod && v.phase !== 'lobby' ? `<button class="text-button" data-action="toggle-god-roles">${icon(ui.godRoles ? 'eyeoff' : 'eye')} ${ui.godRoles ? 'Hide roles' : 'Show roles'}</button>` : `<span class="small muted">${v.phase === 'lobby' ? '5 players minimum' : 'Keep your cards close'}</span>`}</div><div class="player-grid">${v.isGod && v.phase === 'lobby' ? `<div class="player-tile god-tile"><span class="avatar god-avatar">${icon('crown')}</span><div><strong>${escape(v.hostName)}</strong><span>God · Moderator</span></div><span class="badge lime">You</span></div>` : ''}${v.players.map((p, i) => `<div class="player-tile ${!p.alive ? 'eliminated' : ''}">${avatar(p, i)}<div><strong>${escape(p.name)}${p.id === v.me ? ' <small>(you)</small>' : ''}</strong><span>${!p.connected ? 'Reconnecting…' : !p.alive ? 'Eliminated' + (p.role && (!v.isGod || ui.godRoles) ? ' · ' + ROLES[p.role].name : '') : v.phase === 'lobby' ? p.ready ? 'Ready to play' : 'Getting ready' : v.isGod && ui.godRoles && p.role ? ROLES[p.role].name : p.id === v.me && p.role ? 'Your secret identity' : p.role && !v.isGod ? ROLES[p.role].name : 'Still in the story'}</span></div>${v.phase === 'lobby' ? v.isGod ? `<button class="icon-button kick" data-kick="${p.id}" aria-label="Remove ${escape(p.name)} from lobby">${icon('close')}</button>` : p.ready ? icon('check', 'ready-check') : '' : v.isGod && p.alive ? `<span class="player-progress">${v.phase === 'night' && p.acted || v.phase === 'voting' && p.voted || v.phase === 'reveal' && p.acknowledged ? icon('check') : ''}</span>` : !p.alive ? '<span class="out-label">OUT</span>' : ''}</div>`).join('')}${v.phase === 'lobby' ? Array.from({ length: Math.max(0, MIN_PLAYERS - count) }, (_, i) => `<button class="player-tile empty-seat" data-action="copy-code">${icon('plus')}<span>Waiting for player ${count + i + 1}</span></button>`).join('') : ''}</div>${v.isGod && v.phase === 'lobby' ? `<p class="roster-note">${icon('lock')} You moderate separately. All ${count} players receive a secret role. ${count > 9 ? 'With one murderer, a smaller group makes for a closer game.' : ''}</p>` : ''}</section>${v.phase !== 'lobby' ? logPanel(v) : `<div class="host-tip">${icon('chat')} <div><strong>Same room or group call. Same good night.</strong><p>Use your usual voice call to talk. This room handles the secrets, night actions, and votes.</p></div><button class="text-button" data-action="rules">Learn Mafia ${icon('arrow')}</button></div>`}</div>
  <aside class="party-sidebar">${v.phase === 'lobby' ? settingsPanel(v) : v.isGod ? godPanel(v) : rolePanel(v, role)}<section class="chat-panel panel"><div class="panel-heading"><h2>${icon('chat')} Town square</h2><span class="small muted">${chatOpen ? 'Chat open' : 'Quiet, please'}</span></div><div class="messages" id="messages" aria-live="polite">${v.chat.length ? v.chat.map(m => `<div class="message ${m.actor === v.me ? 'mine' : ''}"><strong>${escape(m.name)}</strong><p>${escape(m.text)}</p></div>`).join('') : `<div class="chat-empty">${icon('chat')}<p>${v.phase === 'lobby' ? 'Say hello before you start questioning everyone’s motives.' : 'The conversation starts here.'}</p></div>`}</div><form id="chat-form"><label class="sr-only" for="chat-input">Message the town</label><input id="chat-input" name="message" maxlength="400" placeholder="${chatOpen ? 'Make your case…' : !v.alive ? 'You’re watching this round' : 'Chat returns during discussion'}" value="${escape(ui.chatDraft)}" ${chatOpen ? '' : 'disabled'} autocomplete="off"><button class="icon-button" type="submit" aria-label="Send message" ${chatOpen ? '' : 'disabled'}>${icon('arrow')}</button></form></section></aside></div></main><div class="party-bottom"><span>${icon('lock')} A private room. A shared story.</span><button class="text-button" data-action="rules">Rules & roles ${icon('book')}</button></div>`;
  if (focused && document.getElementById(focused)) { const input = document.getElementById(focused); input.focus({ preventScroll: true }); if (typeof selection === 'number' && input.setSelectionRange) input.setSelectionRange(selection, selection); }
  const msgs = $('#messages'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  updateClock();
}
function phasePanel(v) {
  const alive = v.players.filter(p => p.alive), everyoneReady = v.players.length >= MIN_PLAYERS && v.players.every(p => p.ready && p.connected);
  let title, subtitle, body = '', action = '', phaseIcon = 'crown';
  if (v.phase === 'lobby') {
    title = v.isGod ? 'The best stories start with friends.' : `Welcome to ${escape(v.hostName)}’s party.`;
    subtitle = v.isGod ? 'Share the code. Let everyone join and ready up. You’ll deal the roles when the table is set.' : 'Make yourself comfortable. God will deal the secret roles once everyone is ready.';
    body = `<div class="lineup"><span style="--role-color:${ROLES.murderer.color}">${icon('dagger')} 1 Murderer</span><span style="--role-color:${ROLES.detective.color}">${icon('search')} 1 Detective</span><span style="--role-color:${ROLES.doctor.color}">${icon('heart')} 1 Doctor</span><span style="--role-color:${ROLES.citizen.color}">${icon('people')} ${Math.max(2, v.players.length - 3)} Citizens${v.players.length < 5 ? ' min.' : ''}</span></div>`;
    action = v.isGod ? `<button class="button button-lime" data-command="start" ${everyoneReady ? '' : 'disabled'}>Deal the secret roles ${icon('arrow')}</button><span class="phase-caption">${v.players.length < MIN_PLAYERS ? `${MIN_PLAYERS - v.players.length} more players needed` : `${v.players.filter(p => p.ready && p.connected).length}/${v.players.length} players ready`}</span>` : `<button class="button ${v.ready ? 'button-outline-light' : 'button-lime'}" data-command="ready">${icon(v.ready ? 'check' : 'spark')} ${v.ready ? 'Ready · Tap to undo' : 'I’m ready to play'}</button>`;
  } else if (v.phase === 'reveal') {
    phaseIcon = 'eye'; title = v.isGod ? 'Everyone has a secret now.' : 'Meet your other side.';
    subtitle = v.isGod ? 'Wait for every player to privately check their role. Then send the town to sleep.' : 'Check the role card below. Keep it to yourself, then let God know you’re ready.';
    if (!v.isGod) body = privateReveal(v);
    action = v.isGod ? `<button class="button button-lime" data-command="beginNight" ${v.players.every(p => p.acknowledged) ? '' : 'disabled'}>Begin the first night ${icon('moon')}</button><span class="phase-caption">${v.players.filter(p => p.acknowledged).length}/${v.players.length} roles acknowledged</span>` : `<button class="button button-lime" data-command="ack" ${v.acknowledged || !ui.showRole ? 'disabled' : ''}>${icon('check')} ${v.acknowledged ? 'God knows you’re ready' : 'I know my role'}</button>`;
  } else if (v.phase === 'night') {
    phaseIcon = 'moon'; title = v.isGod ? `Night ${v.round}. Let the town sleep.` : !v.alive ? 'Your story is on pause.' : 'Secrets don’t keep themselves.';
    subtitle = v.isGod ? 'Everyone checks in privately. Resolve the night once all choices are in.' : !v.alive ? 'Watch quietly. You can talk with everyone again when the game ends.' : 'Make your private choice. Stay quiet until God brings the town to morning.';
    body = v.isGod ? `<div class="night-progress"><strong>${v.submitted}<span> / ${alive.length}</span></strong><span>night check-ins received</span></div>` : !v.alive ? `<div class="quiet-label">${icon('eye')} Spectator · Night actions disabled</div>` : targetPicker(v, 'night');
    action = v.isGod ? `<button class="button button-lime" data-command="resolveNight" ${v.submitted === alive.length ? '' : 'disabled'}>Bring on the dawn ${icon('sun')}</button>${v.submitted < alive.length ? '<button class="text-button on-dark" data-action="force-night">Skip missing actions</button>' : ''}` : '';
  } else if (v.phase === 'discussion') {
    phaseIcon = 'sun'; title = v.isGod ? 'The floor belongs to the living.' : v.alive ? 'Someone knows more than they’re saying.' : 'The town is still talking.';
    subtitle = v.isGod ? 'Announce the night’s outcome. Give each living player time to make their case.' : v.alive ? 'Ask questions. Compare stories. A good accusation needs a reason.' : 'Listen in, but keep your information to yourself until the game ends.';
    body = `<div class="discussion-clock">${icon('clock')}<strong id="discussion-clock">03:00</strong><span>suggested discussion time</span></div><p class="dawn-summary">${escape(v.log.filter(e => ['dawn', 'elimination'].includes(e.kind)).at(-1)?.text || 'The town wakes up.')}</p>`;
    action = v.isGod ? `<button class="button button-lime" data-command="openVote">Open the day vote ${icon('vote')}</button>` : '';
  } else if (v.phase === 'voting') {
    phaseIcon = 'vote'; title = v.runoff ? 'A tie. One more chance to decide.' : 'A vote can change the whole story.';
    subtitle = v.isGod ? 'Ballots stay private until you tally. Only living players vote.' : v.alive ? 'Choose someone else, or skip. Your ballot stays private until God closes the vote.' : 'You’re a spectator. Only living players cast a ballot.';
    body = v.isGod ? `<div class="night-progress"><strong>${v.votesIn}<span> / ${alive.length}</span></strong><span>private ballots received${v.runoff ? ' · Runoff' : ''}</span></div>` : v.alive ? targetPicker(v, 'vote') : '<div class="quiet-label">Spectator · Voting disabled</div>';
    action = v.isGod ? `<button class="button button-lime" data-command="resolveVote" ${v.votesIn === alive.length ? '' : 'disabled'}>Tally the votes ${icon('arrow')}</button>${v.votesIn < alive.length ? '<button class="text-button on-dark" data-action="force-vote">Skip missing ballots</button>' : ''}` : '';
  } else {
    phaseIcon = 'spark'; title = v.winner === 'town' ? 'The town saw through the story.' : 'One very convincing alibi.';
    subtitle = v.winner === 'town' ? 'Town wins. The murderer has been found. Everyone’s identity is now revealed.' : 'Mafia wins. The murderer reached parity with the town. Every secret is now on the table.';
    body = `<div class="winner-badge">${icon(v.winner === 'town' ? 'people' : 'dagger')} ${v.winner === 'town' ? 'TOWN VICTORY' : 'MAFIA VICTORY'}</div>`;
    action = v.isGod ? `<button class="button button-lime" data-command="rematch">Same friends. New roles. ${icon('arrow')}</button>` : '<span class="phase-caption">God can start a rematch with the same party.</span>';
  }
  return `<section class="phase-panel ${v.phase === 'night' ? 'night-panel' : ''} ${v.phase === 'finished' ? 'victory-panel' : ''}"><div class="phase-eyebrow">${icon(phaseIcon)} ${v.phase === 'lobby' ? 'THE LOBBY' : v.phase === 'reveal' ? 'THE REVEAL' : v.phase === 'finished' ? 'THE FINALE' : `${v.phase === 'discussion' ? 'DAY' : v.phase.toUpperCase()} ${v.round}`}</div><h2>${title}</h2><p class="phase-subtitle">${subtitle}</p>${body}<div class="phase-actions">${action}</div></section>`;
}
function privateReveal(v) {
  const role = ROLES[v.myRole];
  return `<div class="private-reveal" style="--role-color:${role.color}">${ui.showRole ? `${icon(role.icon)}<div><span>YOU ARE THE</span><h3>${role.name}</h3><p>${role.objective}</p></div>` : `${icon('lock')}<div><h3>For your eyes only.</h3><p>Make sure nobody is looking at your screen.</p></div>`}<button class="button button-outline-light" data-action="toggle-role">${icon(ui.showRole ? 'eyeoff' : 'eye')} ${ui.showRole ? 'Hide' : 'Reveal my role'}</button></div>`;
}
function targetPicker(v, kind) {
  const isNight = kind === 'night', done = !ui.editChoice && (isNight ? !!v.myAction : v.hasVoted);
  const prompt = isNight ? ({ murderer: 'Choose tonight’s victim', doctor: 'Choose someone to protect', detective: 'Choose a suspect to investigate', citizen: 'Who seems suspicious? (Private, no game effect)' }[v.myRole]) : 'Your private ballot';
  const options = v.players.filter(p => p.alive && (!isNight ? p.id !== v.me && (!v.runoff || v.runoff.includes(p.id)) : !(['murderer', 'detective'].includes(v.myRole) && p.id === v.me) && !(v.myRole === 'doctor' && ((!v.settings.selfSave && p.id === v.me) || (!v.settings.repeatSave && p.id === v.lastProtected)))));
  return `<div class="target-picker"><h3>${prompt}</h3>${done ? `<div class="action-confirmation">${icon('check')}<div><strong>${isNight ? 'Your night choice is in.' : 'Your ballot is in.'}</strong><span>${escape(v.players.find(p => p.id === (isNight ? v.myAction : v.myBallot))?.name || 'Skip this vote')} · Waiting for God</span></div><button class="text-button on-dark" data-action="change-choice">Change</button></div>` : `<div class="target-grid">${options.map(p => `<button class="target-option ${ui.selected === p.id ? 'chosen' : ''}" data-target="${p.id}">${escape(p.name)}${p.id === v.me ? ' (you)' : ''}${ui.selected === p.id ? icon('check') : ''}</button>`).join('')}${!isNight ? `<button class="target-option ${ui.selected === 'skip' ? 'chosen' : ''}" data-target="skip">Skip this vote ${ui.selected === 'skip' ? icon('check') : ''}</button>` : ''}</div><button class="button button-lime" data-action="confirm-${kind}" ${ui.selected === null ? 'disabled' : ''}>Confirm ${isNight ? 'night choice' : 'ballot'} ${icon('check')}</button>`}</div>`;
}
function settingsPanel(v) {
  const disabled = v.isGod ? '' : 'disabled';
  return `<section class="settings-panel panel"><div class="panel-heading"><h2>${icon('book')} House rules</h2><span class="small muted">${v.isGod ? 'You decide' : 'Set by God'}</span></div><div class="settings-body"><label class="setting-row"><span>Doctor can save themselves</span><input type="checkbox" data-setting="selfSave" ${v.settings.selfSave ? 'checked' : ''} ${disabled}><span class="switch"></span></label><label class="setting-row"><span>Same save, two nights in a row</span><input type="checkbox" data-setting="repeatSave" ${v.settings.repeatSave ? 'checked' : ''} ${disabled}><span class="switch"></span></label><label class="setting-row"><span>Reveal eliminated roles</span><input type="checkbox" data-setting="revealEliminated" ${v.settings.revealEliminated ? 'checked' : ''} ${disabled}><span class="switch"></span></label><label class="select-setting">Tied player vote<select data-setting="voting" ${disabled}><option value="runoff" ${v.settings.voting === 'runoff' ? 'selected' : ''}>One runoff, then no elimination</option><option value="skip" ${v.settings.voting === 'skip' ? 'selected' : ''}>No elimination</option></select></label><label class="select-setting">Discussion timer<select data-setting="discussionSeconds" ${disabled}>${[60, 120, 180, 300, 600].map(n => `<option value="${n}" ${v.settings.discussionSeconds === n ? 'selected' : ''}>${n / 60} minute${n === 60 ? '' : 's'}</option>`).join('')}</select></label><p class="settings-note">One murderer, one detective, one doctor. Everyone else is a citizen. God never votes.</p></div></section>`;
}
function godPanel(v) {
  const pending = v.players.filter(p => p.alive && (v.phase === 'night' ? !p.acted : v.phase === 'voting' ? !p.voted : v.phase === 'reveal' ? !p.acknowledged : false));
  return `<section class="panel god-panel"><div class="panel-heading"><h2>${icon('crown')} God’s view</h2><span class="badge">PRIVATE</span></div><div class="god-body"><p>You know every role. Your job is to keep the story fair.</p>${pending.length ? `<strong>Waiting for</strong><div class="pending-list">${pending.map(p => `<span>${escape(p.name)} ${!p.connected ? '· offline' : ''}</span>`).join('')}</div>` : `<div class="all-clear">${icon('check')} ${['night', 'voting', 'reveal'].includes(v.phase) ? 'Everyone has checked in.' : 'You set the pace.'}</div>`}${v.phase === 'night' && ui.godRoles ? `<div class="god-actions">${Object.entries(v.hostActions).filter(([id]) => v.players.find(p => p.id === id)?.role !== 'citizen').map(([id, target]) => `<p><strong>${escape(v.players.find(p => p.id === id)?.name)}</strong> → ${escape(v.players.find(p => p.id === target)?.name)}</p>`).join('')}</div>` : ''}<p class="small muted">Never announce private targets or detective results.</p></div></section>`;
}
function rolePanel(v, role) {
  if (!role) return '';
  return `<section class="panel role-panel" style="--role-color:${role.color}"><div class="panel-heading"><h2>${icon('lock')} Your secret</h2><button class="icon-button" data-action="toggle-role" aria-label="${ui.showRole ? 'Hide' : 'Reveal'} your role">${icon(ui.showRole ? 'eyeoff' : 'eye')}</button></div><div class="role-body">${ui.showRole ? `<span class="role-emblem">${icon(role.icon)}</span><div class="eyebrow">TEAM ${role.side.toUpperCase()}</div><h3>${role.name}</h3><p>${role.objective}</p><div class="role-advice">${role.tip}</div>` : `<span class="role-emblem">${icon('lock')}</span><h3>Keep it close.</h3><p>Your identity is hidden on this screen.</p><button class="text-button" data-action="toggle-role">Reveal my role ${icon('eye')}</button>`}</div>${ui.showRole && v.intel.length ? `<div class="intel"><h4>${icon('search')} Private case notes</h4>${v.intel.map(i => `<p>Night ${i.round} · <strong>${escape(i.name)}</strong><span class="${i.isMafia ? 'suspicious' : ''}">${i.isMafia ? 'Murderer' : 'Not the murderer'}</span></p>`).join('')}</div>` : ''}</section>`;
}
function logPanel(v) {
  const voteHistory = (v.voteHistory || []).slice().reverse().map(h => `<details class="vote-history"><summary>Round ${h.round} ${h.runoff ? 'runoff' : 'vote'} · ${h.ballots.length} ballots</summary><table><thead><tr><th>Player</th><th>Ballot</th></tr></thead><tbody>${h.ballots.map(b => `<tr><td>${escape(v.players.find(p => p.id === b.voter)?.name || 'Former player')}</td><td>${escape(v.players.find(p => p.id === b.target)?.name || 'Skip')}</td></tr>`).join('')}</tbody></table></details>`).join('');
  return `<section class="panel log-panel"><div class="panel-heading"><h2>${icon('book')} The story so far</h2><span class="small muted">Public record</span></div><ol>${v.log.slice().reverse().map(e => `<li><span class="log-marker ${e.kind}">${icon(e.kind === 'night' ? 'moon' : e.kind === 'dawn' ? 'sun' : e.kind === 'vote' ? 'vote' : e.kind === 'victory' ? 'spark' : 'arrow')}</span><div><span class="small muted">${e.round ? `ROUND ${e.round}` : 'THE BEGINNING'}</span><p>${escape(e.text)}</p></div></li>`).join('')}</ol>${voteHistory ? `<div class="vote-record">${voteHistory}</div>` : ''}</section>`;
}
function render() { if (view) renderParty(); else renderHome(); }
function setupNetwork() {
  network?.close();
  network = new PartyNetwork({
    onView: next => {
      if (view?.phase !== next.phase || view?.round !== next.round || JSON.stringify(view?.runoff) !== JSON.stringify(next.runoff)) { ui.selected = null; ui.editChoice = false; if (next.phase === 'reveal' || next.phase === 'lobby') { ui.showRole = false; ui.extraKey = false; ui.clueWord = ''; ui.clueCount = 1; } }
      view = next; render();
    },
    onStatus: next => { status = next; if (view) render(); },
    onError: message => toast(message)
  });
  return network;
}
async function perform(input) { if (actionInFlight) return; actionInFlight = true; try { await network.send(input); } catch (e) { toast(e.message); } finally { actionInFlight = false; } }
async function connectForm(event, isCreate) {
  event.preventDefault(); if (busy) return;
  const form = event.target, data = new FormData(form), button = form.querySelector('button[type="submit"]'), error = form.querySelector('.form-error');
  busy = true; button.disabled = true; const old = button.innerHTML; button.textContent = isCreate ? 'Opening your party…' : 'Finding your party…'; error.textContent = '';
  try {
    const n = setupNetwork();
    if (isCreate) await n.create(data.get('name'), {}, data.get('game') || 'mafia');
    else await n.join(data.get('code'), data.get('name'), savedPlayer());
    modal.close(); window.scrollTo(0, 0);
  } catch (e) {
    network?.close(); error.textContent = e.message || 'Could not connect. Check your internet connection and try again.';
  } finally { busy = false; button.disabled = false; button.innerHTML = old; }
}
async function copy(text, success) { try { await navigator.clipboard.writeText(text); toast(success); } catch { modalFrame('Copy and share.', `<p class="modal-intro">Select the text below and copy it.</p><input class="copy-fallback" readonly value="${escape(text)}">`); modal.querySelector('input').select(); } }
document.addEventListener('click', async e => {
  const rule = e.target.closest('[data-extra-rules]'); if (rule) { extraRulesModal(rule.dataset.extraRules); return; }
  if (e.target.closest('[data-mafia-rules]')) { const prior = view; view = null; rulesModal(); view = prior; return; }
  const team = e.target.closest('[data-team]'); if (team) { await perform({ type: 'joinTeam', team: team.dataset.team, role: team.dataset.teamRole }); return; }
  const choice = e.target.closest('[data-hot-choice]'); if (choice) { await perform({ type: view.me === view.seat ? 'hotAnswer' : 'hotGuess', choice: Number(choice.dataset.hotChoice) }); return; }
  if (e.target.closest('[data-toggle-key]')) { ui.extraKey = !ui.extraKey; renderParty(); return; }
  const word = e.target.closest('[data-code-guess]'); if (word && !word.disabled) {
    const index = Number(word.dataset.codeGuess);
    modalFrame('Lock in your guess?', `<p class="modal-intro">Reveal <strong>${escape(view.board[index].word)}</strong>? This choice is shared by your team and cannot be undone.</p><button class="button button-dark full" data-action="confirm-code-guess" data-index="${index}">Reveal ${escape(view.board[index].word)}</button><button class="button button-outline full" data-action="close-modal">Keep discussing</button>`); return;
  }
  const extra = e.target.closest('[data-extra-confirm]'); if (extra) {
    const kind = extra.dataset.extraConfirm;
    const messages = { hotReveal: 'Reveal the answer now? Missing predictions earn no points.', hotSkip: 'Skip this question for everyone? No points will be awarded.', codePass: 'Skip this stalled turn and move to the other team? No additional words will be revealed.' };
    modalFrame('Keep the game moving?', `<p class="modal-intro">${messages[kind]}</p><button class="button button-dark full" data-action="confirm-extra" data-kind="${kind}">Continue</button><button class="button button-outline full" data-action="close-modal">Keep waiting</button>`); return;
  }

  const commandButton = e.target.closest('[data-command]'); if (commandButton) { e.preventDefault(); await perform({ type: commandButton.dataset.command }); return; }
  const filter = e.target.closest('[data-filter]'); if (filter) { ui.filter = filter.dataset.filter; renderHome(); return; }
  const tab = e.target.closest('[data-rule-tab]'); if (tab) { rulesModal(tab.dataset.ruleTab); $(`#tab-${tab.dataset.ruleTab}`).focus(); return; }
  const target = e.target.closest('[data-target]'); if (target) { ui.selected = target.dataset.target; renderParty(); return; }
  const kick = e.target.closest('[data-kick]'); if (kick) { await perform({ type: 'kick', id: kick.dataset.kick }); return; }
  const action = e.target.closest('[data-action]'); if (!action) return;
  e.preventDefault();
  switch (action.dataset.action) {
    case 'confirm-code-guess': await perform({ type: 'codeGuess', index: Number(action.dataset.index) }); modal.close(); break;
    case 'confirm-extra': await perform({ type: action.dataset.kind }); modal.close(); break;
    case 'home': if (!view) { window.scrollTo({ top: 0, behavior: 'smooth' }); } else toast('You’re in a party. Use Leave to return to the arcade.'); break;
    case 'create': createModal(action.dataset.game || null); break;
    case 'join': joinModal(); break;
    case 'rules': rulesModal(); break;
    case 'close-modal': modal.close(); break;
    case 'copy-code': copy(view.code, 'Party code copied. Send it to your people.'); break;
    case 'copy-link': { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('party', view.code); copy(url.href, 'Invite link copied.'); break; }
    case 'toggle-role': ui.showRole = !ui.showRole; renderParty(); break;
    case 'toggle-god-roles': ui.godRoles = !ui.godRoles; renderParty(); break;
    case 'confirm-night': ui.editChoice = false; await perform({ type: 'nightAction', target: ui.selected }); ui.selected = null; break;
    case 'confirm-vote': ui.editChoice = false; await perform({ type: 'vote', target: ui.selected === 'skip' ? null : ui.selected }); ui.selected = null; break;
    case 'change-choice': {
      // This is only a local edit view; the previous choice remains valid until reconfirmed.
      ui.selected = view.phase === 'night' ? view.myAction : view.myBallot || 'skip';
      ui.editChoice = true; renderParty(); break;
    }
    case 'force-night': case 'force-vote': {
      const night = action.dataset.action === 'force-night';
      modalFrame('Continue without everyone?', `<p class="modal-intro">Missing ${night ? 'night choices have no effect' : 'ballots will not count'}. Disconnected players stay in the game and can reconnect.</p><button class="button button-dark full" data-action="force-confirm" data-kind="${night ? 'resolveNight' : 'resolveVote'}">Skip missing ${night ? 'actions' : 'ballots'} ${icon('arrow')}</button><button class="button button-outline full" data-action="close-modal">Keep waiting</button>`); break;
    }
    case 'force-confirm': await perform({ type: action.dataset.kind, force: true }); modal.close(); break;
    case 'leave': modalFrame(view.game !== 'mafia' ? 'Step away from the table?' : view.isGod ? 'Pause your night?' : 'Step away from the table?', `<p class="modal-intro">${view.game !== 'mafia' ? 'Your party and progress stay saved. Resume from the same browser or tab. The host can skip missing choices or a stalled turn.' : view.isGod ? 'Your party and its secret roles stay saved. Resume from this browser when you return. Players can stay connected while you step away.' : 'You can rejoin from this tab. Your role stays yours. God can continue if you step away.'}</p><button class="button button-dark full" data-action="leave-confirm">Leave the party ${icon('exit')}</button><button class="button button-outline full" data-action="close-modal">Stay in the story</button>`); break;
    case 'leave-confirm': network?.close(); network = null; view = null; status = ''; modal.close(); renderHome(); break;
    case 'resume-host': case 'resume-player': {
      try { const n = setupNetwork(); if (action.dataset.action === 'resume-host') await n.restore(savedHost()); else { const s = savedPlayer(); await n.join(s.code, s.name, s); } }
      catch (e) { network?.close(); toast(e.message); } break;
    }
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'create-form') connectForm(e, true);
  else if (e.target.id === 'join-form') connectForm(e, false);
  else if (e.target.id === 'clue-form') { e.preventDefault(); const data = new FormData(e.target); perform({ type: 'codeClue', word: data.get('word'), count: Number(data.get('count')) }).then(() => { if (view.phase !== 'clue') ui.clueWord = ''; }); }
  else if (e.target.id === 'chat-form') { e.preventDefault(); const text = $('#chat-input').value; if (text.trim()) { ui.chatDraft = ''; perform({ type: 'chat', text }); $('#chat-input').value = ''; } }
});
document.addEventListener('input', e => { if (e.target.id === 'clue-word') ui.clueWord = e.target.value; if (e.target.id === 'clue-count') ui.clueCount = e.target.value; if (e.target.id === 'chat-input') ui.chatDraft = e.target.value; if (e.target.id === 'party-code') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
document.addEventListener('change', e => { if (e.target.dataset.setting) { const key = e.target.dataset.setting; perform({ type: 'settings', settings: { [key]: e.target.type === 'checkbox' ? e.target.checked : ['discussionSeconds', 'roundsPerPlayer'].includes(key) ? Number(e.target.value) : e.target.value } }); } });
modal.addEventListener('click', e => { if (e.target === modal) { const rect = modal.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) modal.close(); } });
modal.addEventListener('keydown', e => { if (e.target.matches('[role="tab"]') && ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const all = [...modal.querySelectorAll('[role="tab"]')]; const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (all.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length; rulesModal(all[next].dataset.ruleTab); modal.querySelectorAll('[role="tab"]')[next].focus(); } });
function updateClock() { const el = $('#discussion-clock'); if (!el || !view?.deadline) return; const seconds = Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000)); el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; if (!seconds) el.parentElement.classList.add('timer-done'); }
setInterval(updateClock, 1000);
window.addEventListener('beforeunload', () => network?.close());
renderHome();
if (/^\d{6}$/.test(new URL(location.href).searchParams.get('party') || '')) joinModal();
