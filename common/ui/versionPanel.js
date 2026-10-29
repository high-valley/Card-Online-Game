import { CURRENT, formatBuiltAt } from '../version.js';
import { h } from './h.js';

const hhmm = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 「バージョンと最新版の確認」欄。トップ画面・待機画面の下に出す */
export function versionPanel({ app, actions }) {
  const u = app.update;
  const built = formatBuiltAt(CURRENT.builtAt);
  const status = {
    checking: '確認しています…',
    latest: `最新版です（${u.checkedAt ? `${hhmm(u.checkedAt)} 確認` : ''}）`,
    available: `新しいバージョンがあります（${CURRENT.id} → ${u.latest?.id}）`,
    error: '確認できませんでした。通信を確認してください',
    dev: '開発中のため、確認しません',
    idle: '',
  }[u.status];
  return h(
    'section',
    { class: `version${u.status === 'available' ? ' has-update' : ''}`, 'aria-live': 'polite' },
    h('div', { class: 'version-line' }, h('span', { class: 'sub' }, 'バージョン '), h('strong', { class: 'version-id' }, CURRENT.id), built && h('span', { class: 'sub' }, `（${built} ビルド）`)),
    status && h('div', { class: 'version-status' }, status),
    h(
      'button',
      u.status === 'available'
        ? { class: 'primary', onClick: () => actions.doUpdate() }
        : { disabled: u.status === 'checking' || u.status === 'dev', onClick: () => actions.checkUpdate(true) },
      u.status === 'available' ? '更新する' : '最新版を確認',
    ),
  );
}
