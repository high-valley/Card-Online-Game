/** 画面で使う小さなアイコン（線のSVG）。文字と同じ色・大きさで表示する */
const P = {
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  crown: '<path d="M4 17.5h16l1-10-5 3.5-4-6-4 6-5-3.5z" fill="currentColor"/>',
  people: '<circle cx="9" cy="8.5" r="3.2" fill="currentColor"/><path d="M3 19c.6-3.6 3-5.5 6-5.5s5.4 1.9 6 5.5z" fill="currentColor"/><circle cx="16.5" cy="9.5" r="2.6" fill="currentColor" opacity=".8"/><path d="M16 14c2.6 0 4.6 1.6 5 5h-4.3" fill="currentColor" opacity=".8"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3.5"/><path d="M12 8V5"/><circle cx="12" cy="4.2" r="1.1" fill="currentColor"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor"/><path d="M3 12.5v3M21 12.5v3"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
  forward: '<path d="M4 6v12l8-6zM12 6v12l8-6z" fill="currentColor"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 20h8"/>',
  sort: '<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>',
  exit: '<path d="M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

/** アイコン1つ（span の中に SVG）。名前は上の表から */
export function icon(name, cls = '') {
  const el = document.createElement('span');
  el.className = `icon${cls ? ` ${cls}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? ''}</svg>`;
  return el;
}
