// ジン・ラミーのCPU対戦（ブラウザの中だけで進む）を1ラウンド最後まで通す。
//   LEVEL=normal node tests-e2e/gin-cpu.mjs     （easy / normal / hard）
// 開発サーバー（と、ログイン用のエミュレータ）を起動して実行する。本番URLでも動く: APP_URL=https://...
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const LEVEL = process.env.LEVEL ?? 'normal';
const LABEL = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' }[LEVEL];
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.click('.game-tile:has-text("大富豪")');
ok((await p.locator('.game-detail .cpu-row').count()) === 1, '大富豪にもCPU対戦の欄が出る');
await p.click('.game-tile:has-text("ジン・ラミー")');
await p.click(`.levels [data-level="${LEVEL}"]`);
await p.click('.game-tile:has-text("ジン・ラミー")');
await p.click('.game-detail button:has-text("CPUと対戦")');
await p.waitForSelector('.board.gin');
ok((await p.locator('.hand .card').count()) === 10, '手札10枚が配られた');
ok((await p.locator('.opp-name', { hasText: `CPU（${LABEL}）` }).count()) === 1, `相手は CPU（${LABEL}）`);
ok(new URL(p.url()).searchParams.get('room') === null, 'URLにルームIDは付かない（Firebaseを使わない）');

const enabled = (label) => p.locator('.actions button', { hasText: label }).isEnabled().catch(() => false);
async function tryMove() {
  const hint = await p.locator('.board .hint').innerText().catch(() => '');
  if (hint.includes('最初の公開カード')) { await p.click('.actions button:has-text("パス")'); return 'pass'; }
  if (hint.includes('山札か捨て札')) { await p.click('.pile .card.back'); return 'draw'; }
  const n = await p.locator('.hand .card').count();
  if (n !== 11 || !(await p.locator('.actions button:has-text("捨てる")').count())) return null;
  const info = await p.locator('.board .sub', { hasText: '最小' }).innerText().catch(() => '');
  const best = Number(/最小 (\d+)点/.exec(info)?.[1] ?? 99);
  let idx = -1;
  for (let i = 0; i < n; i++) {
    await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
    if (best <= 10) {
      if (await enabled('ジン')) { await p.click('.actions button:has-text("ジン")'); return 'gin'; }
      if (await enabled('ノック')) { await p.click('.actions button:has-text("ノック")'); return 'knock'; }
    }
    if (await enabled('捨てる')) { idx = i; if (best > 10) break; } else await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
    if (best <= 10) await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
  }
  if (idx < 0) return null;
  if (best <= 10) await p.locator('.hand .card').nth(idx).click({ position: { x: 7, y: 24 } });
  await p.click('.actions button:has-text("捨てる")');
  return 'discard';
}

const seen = {};
const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 240_000);
let thinking = 0;
while (Date.now() < deadline && !(await p.locator('.gin-result').count())) {
  const r = await tryMove().catch(() => null);
  if (r) seen[r] = (seen[r] ?? 0) + 1;
  else { thinking++; await p.waitForTimeout(250); }
}
console.log('あなたの手', JSON.stringify(seen), `／ CPUを待った回数 ${thinking}`);
await p.waitForSelector('.gin-result', { timeout: 5000 });
ok(true, 'ラウンド結果画面に到達した');
console.log((await p.locator('main').innerText()).replace(/\n+/g, ' / ').slice(0, 300));
ok((await p.locator('button:has-text("次のラウンド"), button:has-text("配り直す"), button:has-text("新しいマッチ")').count()) === 1, '次へ進むボタンが出る');
await p.click('button:has-text("次のラウンド"), button:has-text("配り直す"), button:has-text("新しいマッチ")');
await p.waitForSelector('.board.gin');
ok((await p.locator('.hand .card').count()) === 10, '次のラウンドが配られた');
await p.click('button:has-text("ゲームを終了")');
await p.waitForSelector('text=ゲームを選ぶ');
ok(true, '途中でやめるとトップに戻る');
await browser.close();
