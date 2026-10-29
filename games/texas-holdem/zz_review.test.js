import { it, expect } from 'vitest';
import { applyAction, betInfo, canPlay, deal, getResult, buildPots } from './rules.js';
const players = (...u) => u.map((uid, seat) => ({ uid, seat }));
const prev = (chips, dealer, extra = {}) => ({ finished: true, matchOver: false, chips, out: [], dealer, handNo: 3, ...extra });
function mk(uids, chips, dealer) {
  const d = deal(players(...uids), {}, prev(chips, dealer), undefined, () => 0);
  return d;
}
it('short BB multiway', () => {
  const d = mk(['a','b','c','d'], { a:1500,b:1500,c:15,d:1500 }, 'd'); // dealer a? 
  console.log('dealer',d.game.dealer,'sb',d.game.sbUid,'bb',d.game.bbUid,'bets',d.game.bets,'cur',d.game.currentBet,'turn',d.game.turnUid, JSON.stringify(betInfo(d.game,d.game.turnUid)));
});
it('short BB 5 chips, 3p', () => {
  const d = mk(['a','b','c'], { a:1500,b:1500,c:5 }, 'c');
  console.log('dealer',d.game.dealer,'sb',d.game.sbUid,'bb',d.game.bbUid,'bets',d.game.bets,'cur',d.game.currentBet,'turn',d.game.turnUid, JSON.stringify(betInfo(d.game,d.game.turnUid)));
});
it('HU SB short', () => {
  const d = mk(['a','b'], { a:1500,b:1500 }, 'b');
  console.log(d.game.dealer, d.game.sbUid, d.game.turnUid, d.game.phase);
  const d2 = mk(['a','b'], { a:5,b:1500 }, 'b');
  console.log('HU a=5 dealer', d2.game.dealer, 'sb',d2.game.sbUid,'bets',d2.game.bets,'phase',d2.game.phase,'turn',d2.game.turnUid, 'cur', d2.game.currentBet);
});
