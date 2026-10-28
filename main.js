import { engineErrorText } from './common/messages.js';
import { submitAction, startRound } from './common/engine.js';
import { ensureSignedIn } from './common/firebase.js';
import {
  backToLobby, changeGame, cleanupOldRooms, createRoom, findRoomByCode, getMembership, heartbeat, joinRoom, leaveRoom, setOptions, subscribeRoom,
} from './common/rooms.js';
import { createLocalMatch } from './common/localMatch.js';
import { gameScreen } from './common/screens/game.js';
import { lobbyScreen } from './common/screens/lobby.js';
import { resultScreen } from './common/screens/result.js';
import { topScreen } from './common/screens/top.js';
import { play, setMuted, isMuted, soundForEntry, unlockAudio } from './common/ui/sound.js';
import { getGame } from './games/index.js';
import './style.css';

const NAME_KEY = 'cards.name';
const store = {
  get: () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } },
  set: (v) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* 保存できなくても動く */ } },
};

const app = {
  uid: null, name: store.get(), roomId: null, model: null, invite: null, notice: '', busy: false, copied: false, selected: new Set(),
  handOrder: null, // ドラッグで並べ替えた手札の順（null なら自動整列）
  dragging: false, // ドラッグ中は画面を作り直さない
};
let unsubscribe = null;
/** CPU対戦中のローカル対戦（なければ null） */
let local = null;
let timers = [];
const root = document.getElementById('app');
if (import.meta.env.DEV) window.__app = app; // 開発中のテスト・調査用

function render() {
  if (app.dragging) return; // ドラッグ中は作り直さない（終わったあとに dragEnd が描き直す）
  const m = app.model;
  let el;
  let screen;
  if (!app.roomId) [el, screen] = [topScreen({ app, actions, invite: app.invite }), 'top'];
  else if (!m || m.room === undefined) [el, screen] = [loading('読み込み中…'), 'loading'];
  else if (m.room === null) [el, screen] = [loading('ルームが見つかりません', true), 'loading'];
  else if (!m.playersLoaded) [el, screen] = [loading('読み込み中…'), 'loading'];
  else if (m.room.status === 'playing' && m.state?.game && !m.state.game.ended) [el, screen] = [gameScreen({ app, model: m, actions }), 'game'];
  else if (m.room.status === 'finished' && m.state?.result) [el, screen] = [resultScreen({ app, model: m, actions }), 'result'];
  else if (m.room.status === 'playing' || m.room.status === 'finished') [el, screen] = [loading('読み込み中…'), 'loading'];
  else [el, screen] = [lobbyScreen({ app, model: m, actions }), 'lobby'];
  // 表示が変わらないときは差し替えない（タップ中に画面が作り直されて操作が無効になるのを防ぐ）
  if (root.firstElementChild?.outerHTML === el.outerHTML) return;
  root.replaceChildren(el);
  animateNew(screen);
}

/** 新しく現れた（data-key が前回の描画になかった）カードを動かす。画面が切り替わった直後は動かさない */
let prevKeys = new Set();
let prevScreen = null;
let animCount = 0;
const KEYFRAMES = {
  pop: [{ transform: 'translateY(-48px) scale(.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], // 山札から手札へ
  drop: [{ transform: 'translateY(36px) scale(1.25) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], // 捨て札・場へ
};
function animateNew(screen) {
  const els = [...root.querySelectorAll('[data-anim]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (screen === prevScreen && !reduced) {
    for (const el of els) {
      if (prevKeys.has(el.dataset.key) || !el.animate) continue;
      el.animate(KEYFRAMES[el.dataset.anim] ?? KEYFRAMES.pop, { duration: 300, easing: 'ease-out' });
      root.dataset.anims = String(++animCount); // テスト用の目印
    }
  }
  prevKeys = new Set(els.map((e) => e.dataset.key));
  prevScreen = screen;
}

/** 状態が変わったときの共通処理（オンライン・CPU対戦のどちらでも使う） */
let prevStatus = null;
let soundMemo = null;
function applyModel(model) {
  const status = model.room?.status;
  // ゲーム中に待機へ戻ったら、ホストが途中で終了したということ
  if (prevStatus === 'playing' && status === 'waiting') {
    app.notice = model.room.hostUid === app.uid ? '' : 'ホストがゲームを終了しました';
    app.selected.clear();
  }
  // 新しく配られたら、手札の並べ替えをやり直す
  if (status === 'playing' && prevStatus !== 'playing') {
    app.handOrder = null;
    app.selected.clear();
  }
  playSounds(model);
  if (status) prevStatus = status;
  app.model = model;
  render();
  autoAct(model);
}

/** 前回から増えた操作ログに合わせて効果音を鳴らす。最初の1回（入室・再接続直後）は鳴らさない */
function playSounds(model) {
  const { state, room } = model;
  if (!state || !room || room.status === 'waiting') {
    soundMemo = null;
    return;
  }
  const mod = getGame(room.gameId);
  const key = `${room.gameId}:${state.round}`;
  if (soundMemo?.key === key && state.version > soundMemo.version) {
    const n = Math.min(state.version - soundMemo.version, state.log.length, 3);
    state.log.slice(-n).forEach((entry, i) => {
      const name = (mod.soundFor ?? soundForEntry)(entry, model.uid);
      if (name) setTimeout(() => play(name), i * 180);
    });
  }
  if (room.status === 'finished' && prevStatus !== 'finished' && state.result) {
    const r = state.result;
    const decided = Object.values(r.points ?? {}).some((p) => p > 0); // 引き分け（全員0点）は鳴らさない
    if (decided) setTimeout(() => play(r.ranking?.[0] === model.uid ? 'win' : 'lose'), 500);
  }
  soundMemo = { key, version: state.version };
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
  prevStatus = null;
  soundMemo = null;
  unsubscribe = subscribeRoom(roomId, app.uid, applyModel);
  heartbeat(roomId, app.uid);
  // 30秒ごとに生存を知らせ、5秒ごとに「応答なし」の表示を更新する
  timers = [setInterval(() => heartbeat(roomId, app.uid), 30_000), setInterval(render, 5_000)];
  render();
}

/** 画面操作を待たずに自動で出す操作（ジン・ラミーのノックされた側の手札公開など） */
let autoSent = null;
function autoAct(model) {
  const { room, state } = model;
  if (room?.status !== 'playing' || !state?.game || app.busy) return;
  const action = getGame(room.gameId)?.autoAction?.(state.game, app.uid);
  if (!action || autoSent === state.version) return;
  autoSent = state.version;
  actions.act(action);
}

function detach() {
  local?.stop();
  local = null;
  autoSent = null;
  prevStatus = null;
  soundMemo = null;
  app.handOrder = null;
  app.dragging = false;
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
    if (local) {
      app.selected.clear();
      local.start();
      return;
    }
    const { roomId, room, players, state } = app.model;
    return run(() => startRound({ roomId, room, players, state }));
  },
  changeGame: (gameId) => run(() => changeGame(app.roomId, gameId)),
  setOptions: (options) => setOptions(app.roomId, options),
  startCpu(gameId, levelId) {
    if (!needName()) return;
    detach();
    local = createLocalMatch({
      mod: getGame(gameId),
      level: levelId,
      humanUid: app.uid,
      humanName: app.name.trim(),
      onChange: applyModel,
    });
    app.roomId = 'local';
    app.selected.clear();
    local.start();
  },
  backToLobby() {
    if (local) return actions.leave(); // CPU対戦にロビーはない。トップに戻る
    return run(() => backToLobby(app.roomId));
  },
  endGame() {
    if (local) {
      if (confirm('CPU対戦を途中でやめて、トップに戻ります。よろしいですか？')) actions.leave();
      return;
    }
    if (!confirm('ゲームを途中で終了して、全員を待機画面に戻します。今回の結果は記録されません。よろしいですか？')) return;
    return run(() => backToLobby(app.roomId));
  },
  async leave() {
    if (local) {
      detach();
      render();
      return;
    }
    const status = app.model?.room?.status;
    // ゲーム中は参加者のまま画面だけ閉じる（招待URLを開き直せば戻れる）
    if (status !== 'playing' && status !== 'dealing') await leaveRoom(app.roomId, app.uid).catch(() => {});
    detach();
    render();
  },
  // 手札の並べ替え・効果音
  dragStart() { app.dragging = true; },
  dragEnd() { app.dragging = false; render(); },
  reorderHand(ids) { app.handOrder = ids; },
  autoSort() { app.handOrder = null; render(); },
  toggleSound() { setMuted(!isMuted()); render(); },
  toggleCard(id) {
    const mod = getGame(app.model.room.gameId);
    const wasSelected = app.selected.delete(id);
    if (mod.selection === 'single') app.selected.clear(); // 1枚だけ選ぶゲーム
    if (!wasSelected) app.selected.add(id);
    // 選べる枚数に上限があるゲームは、超えた分を古い選択から外す
    const limit = mod.selectLimit?.(app.model.state.game, app.uid);
    while (limit && app.selected.size > limit) app.selected.delete(app.selected.values().next().value);
    render();
  },
  act(action) {
    if (local) {
      try {
        local.act(action);
        app.selected.clear();
      } catch (e) {
        app.notice = engineErrorText(e);
        render();
      }
      return;
    }
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

unlockAudio();
boot();
