import { engineErrorText } from './common/messages.js';
import { submitAction, startRound } from './common/engine.js';
import { ensureSignedIn } from './common/firebase.js';
import {
  backToLobby, changeGame, cleanupOldRooms, createRoom, findRoomByCode, getMembership, heartbeat, joinRoom, leaveRoom, setOptions, subscribeRoom,
} from './common/rooms.js';
import { gameScreen } from './common/screens/game.js';
import { lobbyScreen } from './common/screens/lobby.js';
import { resultScreen } from './common/screens/result.js';
import { topScreen } from './common/screens/top.js';
import { getGame } from './games/index.js';
import './style.css';

const NAME_KEY = 'cards.name';
const store = {
  get: () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } },
  set: (v) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* 保存できなくても動く */ } },
};

const app = { uid: null, name: store.get(), roomId: null, model: null, invite: null, notice: '', busy: false, copied: false, selected: new Set() };
let unsubscribe = null;
let timers = [];
const root = document.getElementById('app');

function render() {
  const m = app.model;
  let el;
  if (!app.roomId) el = topScreen({ app, actions, invite: app.invite });
  else if (!m || m.room === undefined) el = loading('読み込み中…');
  else if (m.room === null) el = loading('ルームが見つかりません', true);
  else if (!m.playersLoaded) el = loading('読み込み中…');
  else if (m.room.status === 'playing' && m.state?.game && !m.state.game.ended) el = gameScreen({ app, model: m, actions });
  else if (m.room.status === 'finished' && m.state?.result) el = resultScreen({ app, model: m, actions });
  else if (m.room.status === 'playing' || m.room.status === 'finished') el = loading('読み込み中…');
  else el = lobbyScreen({ app, model: m, actions });
  // 表示が変わらないときは差し替えない（タップ中に画面が作り直されて操作が無効になるのを防ぐ）
  if (root.firstElementChild?.outerHTML === el.outerHTML) return;
  root.replaceChildren(el);
}

function loading(text, withHome) {
  const p = document.createElement('main');
  p.className = 'screen';
  p.textContent = text;
  if (withHome) {
    const b = document.createElement('button');
    b.textContent = 'トップへ';
    b.onclick = () => actions.goHome();
    p.append(document.createElement('br'), b);
  }
  return p;
}

function enter(roomId) {
  unsubscribe?.();
  timers.forEach(clearInterval);
  app.roomId = roomId;
  app.invite = null;
  app.notice = '';
  app.selected.clear();
  history.replaceState(null, '', `?room=${roomId}`);
  let prevStatus = null;
  unsubscribe = subscribeRoom(roomId, app.uid, (model) => {
    const status = model.room?.status;
    // ゲーム中に待機へ戻ったら、ホストが途中で終了したということ
    if (prevStatus === 'playing' && status === 'waiting') {
      app.notice = model.room.hostUid === app.uid ? '' : 'ホストがゲームを終了しました';
      app.selected.clear();
    }
    if (status) prevStatus = status;
    app.model = model;
    render();
  });
  heartbeat(roomId, app.uid);
  // 30秒ごとに生存を知らせ、5秒ごとに「応答なし」の表示を更新する
  timers = [setInterval(() => heartbeat(roomId, app.uid), 30_000), setInterval(render, 5_000)];
  render();
}

function detach() {
  unsubscribe?.();
  unsubscribe = null;
  timers.forEach(clearInterval);
  timers = [];
  app.roomId = null;
  app.model = null;
  app.invite = null;
  app.notice = '';
  history.replaceState(null, '', location.pathname);
}

async function run(fn) {
  app.busy = true;
  app.notice = '';
  render();
  try {
    await fn();
  } catch (e) {
    if (e.code !== 'stale') app.notice = engineErrorText(e);
  } finally {
    app.busy = false;
    render();
  }
}

const needName = () => {
  if (app.name.trim()) return true;
  app.notice = 'ニックネームを入力してください';
  render();
  return false;
};

const actions = {
  setName(v) { app.name = v; store.set(v); },
  copy(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
    app.copied = true;
    render();
    setTimeout(() => { app.copied = false; render(); }, 2000);
  },
  goHome: detach,
  createRoom(gameId) {
    if (!needName()) return;
    return run(async () => enter(await createRoom({ uid: app.uid, name: app.name.trim(), gameId })));
  },
  joinByCode(code) {
    if (!needName()) return;
    if (!/^\d{6}$/.test(code)) { app.notice = '6桁の数字を入力してください'; render(); return; }
    return run(async () => {
      const roomId = await findRoomByCode(code);
      await joinRoom(roomId, { uid: app.uid, name: app.name.trim() });
      enter(roomId);
    });
  },
  joinInvite() {
    if (!needName()) return;
    return run(async () => {
      const { id } = app.invite;
      await joinRoom(id, { uid: app.uid, name: app.name.trim() });
      enter(id);
    });
  },
  start() {
    const { roomId, room, players, state } = app.model;
    return run(() => startRound({ roomId, room, players, state }));
  },
  changeGame: (gameId) => run(() => changeGame(app.roomId, gameId)),
  setOptions: (options) => setOptions(app.roomId, options),
  backToLobby: () => run(() => backToLobby(app.roomId)),
  endGame() {
    if (!confirm('ゲームを途中で終了して、全員を待機画面に戻します。今回の結果は記録されません。よろしいですか？')) return;
    return run(() => backToLobby(app.roomId));
  },
  async leave() {
    const status = app.model?.room?.status;
    // ゲーム中は参加者のまま画面だけ閉じる（招待URLを開き直せば戻れる）
    if (status !== 'playing' && status !== 'dealing') await leaveRoom(app.roomId, app.uid).catch(() => {});
    detach();
    render();
  },
  toggleCard(id) {
    if (!app.selected.delete(id)) app.selected.add(id);
    render();
  },
  act(action) {
    const { roomId, room, state } = app.model;
    return run(async () => {
      await submitAction({ roomId, uid: app.uid, gameId: room.gameId, action, expectedVersion: state.version });
      app.selected.clear();
    });
  },
  skip() {
    const { roomId, room, state } = app.model;
    return run(() => submitAction({ roomId, uid: app.uid, gameId: room.gameId, action: { type: 'skip', uid: state.turnUid }, expectedVersion: state.version }));
  },
};

async function boot() {
  root.replaceChildren(loading('接続中…'));
  try {
    app.uid = await ensureSignedIn();
  } catch {
    root.replaceChildren(loading('ログインできませんでした。再読み込みしてください'));
    return;
  }
  cleanupOldRooms(app.uid).catch(() => {});
  const roomId = new URLSearchParams(location.search).get('room');
  if (roomId) {
    const found = await getMembership(roomId, app.uid).catch(() => null);
    if (found?.isMember) return enter(roomId);
    if (found) {
      app.invite = { id: roomId, name: `${getGame(found.room.gameId)?.name ?? ''}のルーム` };
      app.roomId = null;
    } else {
      app.notice = 'ルームが見つかりません';
    }
  }
  render();
}

boot();
