import { h } from '../../common/ui/h.js';

const CHIPS = [1000, 1500, 3000, 5000];
const LEVEL_HANDS = [3, 5, 8, 10];

const fmt = (n) => n.toLocaleString('ja-JP');

/**
 * 待機画面のルール設定：最初のチップと、ブラインドが上がる間隔（ハンド数）。ホストだけが変更できる。
 * @param {{options: object, onChange: (patch: object) => void, readOnly: boolean}} p
 */
export function OptionsForm({ options, onChange, readOnly }) {
  const field = (key, label, values, unit) =>
    h(
      'label',
      { class: 'field-row' },
      h('span', null, label),
      h(
        'select',
        { name: key, disabled: readOnly, onChange: (e) => onChange({ [key]: Number(e.target.value) }) },
        values.map((v) => h('option', { value: v, selected: v === options[key] }, `${fmt(v)}${unit}`)),
      ),
    );
  return h(
    'div',
    { class: 'holdem-options' },
    field('startingChips', '最初のチップ', CHIPS, '枚'),
    field('levelHands', 'ブラインドが上がる間隔', LEVEL_HANDS, 'ハンドごと'),
    h('p', { class: 'sub' }, '10/20 から始まり、間隔ごとに上がっていきます。チップを失った人から脱落し、最後の1人が優勝です。'),
  );
}
