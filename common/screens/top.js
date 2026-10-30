import { games } from '../../games/index.js';
import { h } from '../ui/h.js';
import { isMuted } from '../ui/sound.js';
import { versionPanel } from '../ui/versionPanel.js';

const PICK_KEY = 'cards.game';
const LEVEL_KEY = 'cards.cpuLevel';
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } };

/** 選んでいるゲームと CPU の強さ（画面を作り直しても戻らないよう画面の外に持ち、次に開いたときも覚えておく） */
const pick = { id: load(PICK_KEY), level: load(LEVEL_KEY) ?? 'normal' };

const players = (g) => (g.minPlayers === g.maxPlayers ? `${g.minPlayers}人` : `${g.minPlayers}〜${g.maxPlayers}人`);
const emblem = (g) => h('span', { class: `emblem${g.emblem?.red ? ' red' : ''}`, 'aria-hidden': 'true' }, g.emblem?.mark ?? '🂠');

/** 選んだゲームの操作：説明、友達とルームを作る、CPUの強さを選んで1人で始める */
function detail(g, app, actions) {
  const levels = g.cpu?.levels ?? [];
  if (!levels.some((l) => l.id === pick.level)) pick.level = levels.find((l) => l.id === 'normal')?.id ?? levels[0]?.id;
  const chips = levels.map((l) =>
    h('button', {
      type: 'button', class: 'level', 'data-level': l.id, 'aria-pressed': String(l.id === pick.level),
      onClick: (e) => {
        pick.level = l.id;
        save(LEVEL_KEY, l.id);
        for (const c of chips) c.setAttribute('aria-pressed', String(c === e.currentTarget));
      },
    }, l.label),
  );
  return h(
    'section',
    { class: 'game-detail', 'aria-label': `${g.name}で遊ぶ` },
    h('div', { class: 'detail-head' }, h('strong', null, g.name), g.rulebook && h('button', { class: 'link', onClick: () => actions.showRules(g.id, g.defaultOptions) }, 'ルール')),
    h('p', { class: 'sub' }, g.description),
    h('button', { class: 'primary', disabled: app.busy, onClick: () => actions.createRoom(g.id) }, '友達とルームを作る'),
    g.cpu &&
      h(
        'div',
        { class: 'cpu-row' },
        h('div', { class: 'levels', role: 'group', 'aria-label': 'CPUの強さ' }, chips),
        h('button', { disabled: app.busy, onClick: () => actions.startCpu(g.id, pick.level) }, g.cpu.opponents > 1 ? `CPU${g.cpu.opponents}人と対戦` : 'CPUと対戦'),
      ),
  );
}

/** ゲームのタイル一覧と、選んだゲームの操作。タイルを押したら、この部分だけ描き直す */
function picker(app, actions) {
  if (!games.some((g) => g.id === pick.id)) pick.id = games[0].id;
  const wrap = h('div', { class: 'picker' });
  const draw = () => {
    const g = games.find((x) => x.id === pick.id);
    wrap.replaceChildren(
      h(
        'ul',
        { class: 'game-grid' },
        games.map((x) =>
          h('li', null, h('button', {
            type: 'button', class: 'game-tile', 'aria-pressed': String(x.id === pick.id),
            onClick: () => { pick.id = x.id; save(PICK_KEY, x.id); draw(); },
          }, emblem(x), h('span', { class: 'tile-name' }, x.name), h('span', { class: 'tile-sub' }, players(x)))),
        ),
      ),
      detail(g, app, actions),
    );
  };
  draw();
  return wrap;
}

/** トップ画面：ニックネーム、ゲーム一覧、コードで参加。invite があれば招待URLからの参加画面になる */
export function topScreen({ app, actions, invite }) {
  const nameInput = h('input', { type: 'text', maxLength: 12, placeholder: 'ニックネーム', value: app.name, autocomplete: 'off', onInput: (e) => actions.setName(e.target.value) });
  const codeInput = h('input', { type: 'text', inputMode: 'numeric', maxLength: 6, placeholder: '6桁のルームコード', autocomplete: 'off' });

  const nameField = h('label', { class: 'field-row' }, h('span', null, 'ニックネーム'), nameInput);
  const notice = app.notice && h('p', { class: 'notice' }, app.notice);

  if (invite) {
    return h(
      'main',
      { class: 'screen' },
      h('h1', null, 'オンライントランプ'),
      h('p', null, `${invite.name} のルームに招待されています`),
      nameField,
      notice,
      h('button', { class: 'primary', disabled: app.busy, onClick: () => actions.joinInvite() }, 'ルームに参加する'),
      h('button', { class: 'link', onClick: () => actions.goHome() }, 'トップへ'),
    );
  }

  return h(
    'main',
    { class: 'screen top' },
    h('header', { class: 'top-head' }, h('div', { class: 'brand-logo', 'aria-hidden': 'true' }, h('span', null, '♠'), h('span', { class: 'red' }, '♥'), h('span', { class: 'red' }, '♦'), h('span', null, '♣')), h('h1', null, 'オンライントランプ')),
    nameField,
    notice,
    h('h2', null, 'ゲームを選ぶ'),
    picker(app, actions),
    h('h2', null, 'ルームに入る'),
    h('div', { class: 'join-row' }, codeInput, h('button', { disabled: app.busy, onClick: () => actions.joinByCode(codeInput.value.trim()) }, '参加')),
    h('div', { class: 'top-foot' }, h('button', { class: 'link', onClick: () => actions.toggleSound() }, isMuted() ? '効果音 OFF' : '効果音 ON')),
    versionPanel({ app, actions }),
  );
}
