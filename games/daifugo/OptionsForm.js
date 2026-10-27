import { h } from '../../common/ui/h.js';

/** 待機画面に出す特殊ルール（仕様書 4章の表）。key は defaultOptions と同じ */
const RULES = [
  { key: 'revolution', label: '革命', note: '同じ数字4枚以上、または5枚以上の階段で強さが逆転（もう一度で戻る）' },
  { key: 'eightCut', label: '8切り', note: '8を含むカードで場を流し、出した人から再開' },
  { key: 'sequence', label: '階段', note: '同じスートで連続する3枚以上を出せる' },
  { key: 'spade3', label: 'スペ3返し', note: 'ジョーカー1枚出しに、スペードの3で勝てる' },
  { key: 'lock', label: 'しばり', note: '同じスートが続いたら、場が流れるまでそのスートだけ' },
  { key: 'miyakoochi', label: '都落ち', note: '前回の大富豪が1位で上がれなかったら、その時点で最下位' },
  { key: 'exchange', label: 'カード交換', note: '2回目以降の開始時に交換（※まだ動きません。今後対応）', disabled: true },
];

/**
 * 特殊ルールのON/OFFフォーム。ホストだけが変更でき、それ以外は readOnly で現在の設定を見るだけ。
 * @param {{options: object, onChange: (patch: object) => void, readOnly: boolean}} p
 */
export function OptionsForm({ options, onChange, readOnly }) {
  return h(
    'ul',
    { class: 'rules' },
    RULES.map((r) =>
      h(
        'li',
        null,
        h(
          'label',
          { class: `rule${r.disabled ? ' soon' : ''}` },
          h('input', {
            type: 'checkbox',
            name: r.key,
            checked: options[r.key],
            disabled: readOnly || r.disabled,
            onChange: (e) => onChange({ [r.key]: e.target.checked }),
          }),
          h('span', null, h('strong', null, r.label), h('span', { class: 'sub' }, ` ${r.note}`)),
        ),
      ),
    ),
  );
}
