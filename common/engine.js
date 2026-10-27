import { runTransaction, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { getGame } from '../games/index.js';
import { db } from './firebase.js';
import { deckRef, handRef, playerRef, roomRef, stateRef } from './rooms.js';

const fail = (code) => Object.assign(new Error(code), { code });
const LOG_LIMIT = 20;

/**
 * 配布（ホストのブラウザで実行）。ゲームの deal の結果どおりに hands・handCount・state を1回のバッチで保存する。
 * @param {{roomId: string, room: object, players: object[], state: object|null}} p
 */
export async function startRound({ roomId, room, players, state }) {
  const game = getGame(room.gameId);
  if (players.length < game.minPlayers || players.length > game.maxPlayers) throw fail('bad-player-count');

  await updateDoc(roomRef(roomId), { status: 'dealing', updatedAt: serverTimestamp() });

  const prevResult = state?.gameId === room.gameId ? state.result : null;
  const dealt = game.deal(players.map((p) => ({ uid: p.uid, seat: p.seat })), room.options, prevResult);
  const batch = writeBatch(db);
  for (const p of players) {
    batch.set(handRef(roomId, p.uid), { cards: dealt.hands[p.uid] });
    batch.update(playerRef(roomId, p.uid), { handCount: dealt.hands[p.uid].length });
  }
  if (dealt.deck) batch.set(deckRef(roomId), { cards: dealt.deck });
  batch.set(stateRef(roomId), {
    gameId: room.gameId,
    round: state?.gameId === room.gameId ? state.round + 1 : 1,
    turnUid: dealt.turnUid,
    version: (state?.version ?? 0) + 1,
    log: [],
    result: null,
    game: dealt.game,
  });
  batch.update(roomRef(roomId), { status: 'playing', updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * 手番の操作。トランザクションで version と turnUid を確認し、canPlay → applyAction の結果を
 * hands/{自分}・players/{自分}・state に同時に書く。
 * action.uid は手番の人。スキップはホストが代わりに送るので、送信者と action.uid が違ってよい。
 */
export async function submitAction({ roomId, uid, gameId, action, expectedVersion }) {
  const mod = getGame(gameId);
  await runTransaction(db, async (tx) => {
    const stateSnap = await tx.get(stateRef(roomId));
    const st = stateSnap.data();
    if (st.version !== expectedVersion) throw fail('stale');
    if (st.turnUid !== action.uid) throw fail('not-your-turn');

    const own = action.type !== 'skip';
    const hand = own ? (await tx.get(handRef(roomId, uid))).data().cards : [];
    // 山札を使うゲームだけ、山札（非公開）も読む
    const deck = mod.usesDeck ? ((await tx.get(deckRef(roomId))).data()?.cards ?? null) : null;
    const checked = mod.canPlay(st.game, hand, action);
    if (!checked.ok) throw fail(checked.reason);

    const applied = mod.applyAction(st.game, action, { hand: own ? hand : null, deck });
    const result = mod.getResult(applied.game);
    const players = {};
    if (result.finished) {
      for (const u of st.game.order) players[u] = (await tx.get(playerRef(roomId, u))).data();
    }

    // 手札の更新：ゲームが新しい手札を返したらそれを、返さない場合は「出したカードを引く」（大富豪）
    const nextHand = applied.hand ?? (action.type === 'play' ? hand.filter((c) => !action.cards.includes(c)) : null);
    if (nextHand) {
      tx.set(handRef(roomId, uid), { cards: nextHand });
      tx.update(playerRef(roomId, uid), { handCount: nextHand.length });
    }
    if (applied.deck) tx.set(deckRef(roomId), { cards: applied.deck });
    tx.update(stateRef(roomId), {
      game: applied.game,
      turnUid: applied.turnUid,
      version: st.version + 1,
      log: [...st.log, applied.log].slice(-LOG_LIMIT),
      result: result.finished ? result : null,
    });
    if (result.finished) {
      for (const u of st.game.order) {
        const total = { ...players[u].totalPoints };
        total[gameId] = (total[gameId] ?? 0) + result.points[u];
        tx.update(playerRef(roomId, u), { totalPoints: total });
      }
      tx.update(roomRef(roomId), { status: 'finished', updatedAt: serverTimestamp() });
    } else {
      tx.update(roomRef(roomId), { updatedAt: serverTimestamp() });
    }
  });
}
