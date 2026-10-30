/**
 * ボタンを押した手応え（触覚）。Android などは振動 API、振動 API のない iPhone（iOS 18 以降）は、
 * 画面の外に置いたスイッチ部品を切り替えたときの触覚を借りる。どちらもない環境では何もしない。
 */
let toggle = null;

function iosSwitch() {
  if (toggle || typeof document === 'undefined') return toggle;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.append(input);
  document.body.append(label);
  toggle = label;
  return toggle;
}

export function haptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
      return;
    }
    iosSwitch()?.click();
  } catch { /* 触覚が使えなくても動く */ }
}
