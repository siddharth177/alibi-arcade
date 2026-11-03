import * as mafia from './engine.js';
import { createParty, addPartyPlayer, partyCommand, partyView } from './party-games.js';
export const GOD = mafia.GOD;
const extra = s => ['hotseat', 'codebreakers'].includes(s.game);
export function createRoom(code, name, game = 'mafia') {
  if (game === 'mafia') return { ...mafia.createRoom(code, name), game: 'mafia' };
  return createParty(code, name, game);
}
export const addPlayer = (s, ...args) => extra(s) ? addPartyPlayer(s, ...args) : mafia.addPlayer(s, ...args);
export const command = (s, ...args) => extra(s) ? partyCommand(s, ...args) : mafia.command(s, ...args);
export const viewFor = (s, viewer) => extra(s) ? partyView(s, viewer) : { ...mafia.viewFor(s, viewer), game: 'mafia' };
