import { games } from '../../games/index.js';
import { h } from '../ui/h.js';
import { isMuted } from '../ui/sound.js';

/** CPU対戦（そのゲームがCPUに対応しているときだけ）：難易度を選んで、1人で始める */
function cpuRow(g, actions) {
  const level = h('select', { 'aria-label': 'CPUの強さ' }, g.cpu.levels.map((l) => h('option', { value: l.id, selected: l.id === 'normal' }, l.label)));
  return h('div', { class: 'cpu-row' }, h('span', { class: 'sub' }, 'CPU対戦'), level, h('button', { onClick: () => actions.startCpu(g.id, level.value) }, 'CPUと対戦'));
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
    { class: 'screen' },
    h('h1', null, 'オンライントランプ'),
    nameField,
    notice,
    h('h2', null, 'ゲームを選んでルームを作る'),
    h(
      'ul',
      { class: 'game-list' },
      games.map((g) =>
        h(
          'li',
          null,
          h('div', null, h('strong', null, g.name), h('span', { class: 'sub' }, ` ${g.minPlayers}〜${g.maxPlayers}人`), h('p', { class: 'sub' }, g.description)),
          h('button', { class: 'primary', disabled: app.busy, onClick: () => actions.createRoom(g.id) }, 'ルームを作る'),
          g.cpu && cpuRow(g, actions),
        ),
      ),
    ),
    h('h2', null, 'ルームに入る'),
    h('div', { class: 'join-row' }, codeInput, h('button', { disabled: app.busy, onClick: () => actions.joinByCode(codeInput.value.trim()) }, '参加')),
    h('button', { class: 'link', onClick: () => actions.toggleSound() }, isMuted() ? '効果音 OFF' : '効果音 ON'),
  );
}
