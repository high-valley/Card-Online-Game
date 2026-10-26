import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { getGame } from '../games/index.js';
import { db } from './firebase.js';

export const roomRef = (roomId) => doc(db, 'cards_rooms', roomId);
export const playerRef = (roomId, uid) => doc(db, 'cards_rooms', roomId, 'players', uid);
export const stateRef = (roomId) => doc(db, 'cards_rooms', roomId, 'state', 'current');
export const handRef = (roomId, uid) => doc(db, 'cards_rooms', roomId, 'hands', uid);

const fail = (code) => Object.assign(new Error(code), { code });
const randomCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
const newPlayer = (name, seat) => ({ name, seat, handCount: 0, lastSeen: serverTimestamp(), totalPoints: {} });

/** ルームを作り、作った人をホストとして参加させる */
export async function createRoom({ uid, name, gameId }) {
  const game = getGame(gameId);
  const ref = doc(collection(db, 'cards_rooms'));
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const codeRef = doc(db, 'cards_codes', code);
    const ok = await runTransaction(db, async (tx) => {
      if ((await tx.get(codeRef)).exists()) return false;
      tx.set(codeRef, { roomId: ref.id, hostUid: uid });
      tx.set(ref, {
        code, gameId, hostUid: uid, status: 'waiting', options: game.defaultOptions,
        members: [uid], nextSeat: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      tx.set(playerRef(ref.id, uid), newPlayer(name, 0));
      return true;
    });
    if (ok) return ref.id;
  }
  throw fail('code-collision');
}

/** 6桁コードからルームIDを引く */
export async function findRoomByCode(code) {
  const snap = await getDoc(doc(db, 'cards_codes', code));
  if (!snap.exists()) throw fail('not-found');
  return snap.data().roomId;
}

/** 参加済みか（リロード復帰用）。ルームが無ければ null */
export async function getMembership(roomId, uid) {
  const snap = await getDoc(roomRef(roomId));
  if (!snap.exists()) return null;
  return { room: snap.data(), isMember: snap.data().members.includes(uid) };
}

/** 参加する。参加済みなら何もしない */
export function joinRoom(roomId, { uid, name }) {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(roomId));
    if (!snap.exists()) throw fail('not-found');
    const room = snap.data();
    if (room.members.includes(uid)) return;
    if (room.status !== 'waiting') throw fail('already-started');
    if (room.members.length >= getGame(room.gameId).maxPlayers) throw fail('full');
    tx.update(roomRef(roomId), { members: [...room.members, uid], nextSeat: room.nextSeat + 1, updatedAt: serverTimestamp() });
    tx.set(playerRef(roomId, uid), newPlayer(name, room.nextSeat));
  });
}

/** 退出する。ホストが抜けたら、次に参加した人が引き継ぐ。最後の1人なら部屋を片付ける */
export async function leaveRoom(roomId, uid) {
  const snap = await getDoc(roomRef(roomId));
  if (!snap.exists()) return;
  const room = snap.data();
  const members = room.members.filter((m) => m !== uid);
  if (members.length === 0) return deleteRoom(roomId, room);
  const batch = writeBatch(db);
  batch.update(roomRef(roomId), { members, hostUid: room.hostUid === uid ? members[0] : room.hostUid, updatedAt: serverTimestamp() });
  batch.delete(playerRef(roomId, uid));
  await batch.commit();
}

/** ホストが、同じメンバーのまま別のゲームに切り替える（待機画面に戻る） */
export function changeGame(roomId, gameId) {
  return updateDoc(roomRef(roomId), {
    gameId, options: getGame(gameId).defaultOptions, status: 'waiting', updatedAt: serverTimestamp(),
  });
}

export function setOptions(roomId, options) {
  return updateDoc(roomRef(roomId), { options, updatedAt: serverTimestamp() });
}

export function backToLobby(roomId) {
  return updateDoc(roomRef(roomId), { status: 'waiting', updatedAt: serverTimestamp() });
}

export function heartbeat(roomId, uid) {
  return updateDoc(playerRef(roomId, uid), { lastSeen: serverTimestamp() }).catch(() => {});
}

/** ルーム・参加者・ゲーム状態・自分の手札を購読し、変わるたびに model を渡す */
export function subscribeRoom(roomId, uid, onChange) {
  const model = { roomId, uid, room: undefined, players: [], state: null, hand: [] };
  const emit = () => onChange({ ...model });
  const errors = (e) => console.warn('subscribe error', e.code);
  const offs = [
    onSnapshot(roomRef(roomId), (s) => { model.room = s.exists() ? s.data() : null; emit(); }, errors),
    onSnapshot(collection(db, 'cards_rooms', roomId, 'players'), (s) => {
      model.players = s.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => a.seat - b.seat);
      emit();
    }, errors),
    onSnapshot(stateRef(roomId), (s) => { model.state = s.exists() ? s.data() : null; emit(); }, errors),
    onSnapshot(handRef(roomId, uid), (s) => { model.hand = s.exists() ? s.data().cards : []; emit(); }, errors),
  ];
  return () => offs.forEach((off) => off());
}

async function deleteRoom(roomId, room) {
  const players = await getDocs(collection(db, 'cards_rooms', roomId, 'players')).catch(() => ({ docs: [] }));
  const batch = writeBatch(db);
  for (const d of players.docs) {
    batch.delete(d.ref);
    batch.delete(handRef(roomId, d.id));
  }
  batch.delete(stateRef(roomId));
  batch.delete(doc(db, 'cards_codes', room.code));
  batch.delete(roomRef(roomId));
  await batch.commit();
}

/** 24時間以上更新のない自分のルームを削除する（Functionsなしの簡易掃除） */
export async function cleanupOldRooms(uid) {
  const snap = await getDocs(query(collection(db, 'cards_rooms'), where('hostUid', '==', uid)));
  const limit = Date.now() - 24 * 60 * 60 * 1000;
  for (const d of snap.docs) {
    const updated = d.data().updatedAt?.toMillis?.() ?? 0;
    if (updated < limit) await deleteRoom(d.id, d.data()).catch((e) => console.warn('cleanup failed', e.code));
  }
}
