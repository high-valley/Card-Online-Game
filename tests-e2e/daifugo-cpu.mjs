// 大富豪のCPU対戦（人間1人＋CPU3人。ブラウザの中だけで進む）を1ゲーム最後まで通す。
//   LEVEL=normal node tests-e2e/daifugo-cpu.mjs     （easy / normal / hard）
// 開発サーバー（と、ログイン用のエミュレータ）を起動して実行する。
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
await p.selectOption('li:has-text("大富豪") .cpu-row select', LEVEL);
await p.click('li:has-text("大富豪") button:has-text("CPU3人と対戦")');
await p.waitForSelector('.board');
ok((await p.locator('.opp-name', { hasText: `（${LABEL}）` }).count()) === 3, `相手は CPU3人（${LABEL}）`);
const total = (await p.locator('.opp-count').allInnerTexts()).filter((t) => t.endsWith('枚')).reduce((n, t) => n + parseInt(t, 10), 0);
ok(total === 53, `53枚が配られた（${total}）`);
ok(new URL(p.url()).searchParams.get('room') === null, 'URLにルームIDは付かない（Firebaseを使わない）');

async function tryMove() {
  const hint = await p.locator('.hint').innerText().catch(() => '');
  if (!hint || / の番です$/.test(hint)) return false;
  const n = await p.locator('.hand .card').count();
  for (let i = 0; i < n; i++) {
    await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
    const play = p.locator('.actions .primary');
    if (await play.isEnabled()) { await play.click(); return true; }
    await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
  }
  const pass = p.locator('.actions button', { hasText: 'パス' });
  if (await pass.isEnabled()) { await pass.click(); return true; }
  return false;
}

const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 240_000);
let moves = 0;
while (Date.now() < deadline && !(await p.locator('table.result').count())) {
  if (await tryMove().catch(() => false)) moves++;
  else await p.waitForTimeout(250);
}
console.log('あなたの手', moves);
await p.waitForSelector('table.result', { timeout: 5000 });
ok((await p.locator('table.result tbody tr').count()) === 4, '4人分の順位が出た');
console.log((await p.locator('table.result').innerText()).replace(/\n+/g, ' / '));
await p.click('button:has-text("もう一度")');
await p.waitForSelector('.board');
ok((await p.locator('.hand .card').count()) > 0, '次のゲームが配られた');
await p.click('button:has-text("ゲームを終了")');
await p.waitForSelector('text=ゲームを選んでルームを作る');
ok(true, '途中でやめるとトップに戻る');
await browser.close();
