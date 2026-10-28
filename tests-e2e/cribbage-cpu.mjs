// クリベッジのCPU対戦（ブラウザの中だけで進む）を1ラウンド最後まで通す。
//   LEVEL=normal node tests-e2e/cribbage-cpu.mjs     （easy / normal / hard）
//   SHOTS=/tmp/dir で途中の画面を保存する
// 開発サーバー（と、ログイン用のエミュレータ）を起動して実行する。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const LEVEL = process.env.LEVEL ?? 'normal';
const LABEL = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' }[LEVEL];
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };
const shot = (name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.selectOption('li:has-text("クリベッジ") .cpu-row select', LEVEL);
await p.click('li:has-text("クリベッジ") button:has-text("CPUと対戦")');
await p.waitForSelector('.board.cribbage');
ok((await p.locator('.hand .card').count()) === 6, '手札6枚が配られた');
ok((await p.locator('.opp-name', { hasText: `CPU（${LABEL}）` }).count()) === 1, `相手は CPU（${LABEL}）`);

const btn = (label) => p.locator('.actions button', { hasText: label });
const enabled = (label) => btn(label).isEnabled().catch(() => false);
const seen = {};
const count = (k) => (seen[k] = (seen[k] ?? 0) + 1);
let shotDone = {};

const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 120_000);
while (Date.now() < deadline && !(await p.locator('.crib-result').count())) {
  const n = await p.locator('.hand .card').count();
  if (await btn('クリブに置く').count()) {
    const cards = p.locator('.hand .card');
    await cards.nth(0).click();
    await cards.nth(1).click();
    await cards.nth(2).click(); // 3枚目を選ぶと、古い選択が外れて常に2枚になる
    ok((await p.locator('.hand .card.selected').count()) === 2, '選べるのは2枚まで');
    ok(await enabled('クリブに置く'), '2枚選ぶと「クリブに置く」が押せる');
    shotDone.discard || (await shot('1-discard'), (shotDone.discard = 1));
    await btn('クリブに置く').click();
    count('discard');
  } else if (await btn('出す').count()) {
    const live = p.locator('.hand .card:not(.dim)');
    if ((await p.locator('.hand .card.dim').count()) > 0 && !shotDone.dim) { await shot('2-pegging-dim'); shotDone.dim = 1; }
    if (await btn('Go').count()) {
      ok((await live.count()) === 0, 'Goのときは出せるカードがない（全部暗い）');
      await btn('Go').click();
      count('go');
    } else {
      await live.first().click();
      await btn('出す').click();
      count('play');
      shotDone.peg || n < 4 || (await shot('3-pegging'), (shotDone.peg = 1));
    }
  } else if (await p.locator('.actions button.primary', { hasText: '採点' }).count()) {
    shotDone.show || (await shot('4-show'), (shotDone.show = 1));
    await p.locator('.actions button.primary').click();
    count('show');
  } else {
    await p.waitForTimeout(250);
  }
}
ok(await p.locator('.crib-result').count(), 'ラウンドが終わり、結果画面に採点の内訳が出た');
await shot('5-result');
ok((await p.locator('.crib-breakdown').count()) >= 2, '手札とクリブの採点内訳が表示される');
console.log('あなたの手', JSON.stringify(seen));
await browser.close();
