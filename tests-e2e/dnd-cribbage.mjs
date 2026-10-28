// クリベッジ：手札の2枚をクリブへ、1枚を場へドラッグして操作できることの確認（CPU対戦で1人で確認できる）。
//   node tests-e2e/dnd-cribbage.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };
const grab = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + 7, y: b.y + b.height * 0.4 }; };
const center = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function drag(from, to) {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  await p.mouse.move(from.x + 12, from.y - 12, { steps: 3 });
  await p.mouse.move(to.x, to.y, { steps: 12 });
  await p.mouse.up();
}
const toast = async () => (await p.locator('.notice').innerText().catch(() => '')).trim();

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.click('li:has-text("クリベッジ") button:has-text("CPUと対戦")');
await p.waitForSelector('.board.cribbage');
await p.waitForFunction(() => document.querySelector('.hint')?.textContent.includes('クリブに置く'));
ok((await p.locator('.hand .card').count()) === 6, '手札6枚');

// 1枚だけをクリブへドラッグ → 2枚そろっていないので置けない
const ids = await p.locator('.hand .card').evaluateAll((els) => els.map((e) => e.dataset.id));
await drag(await grab(`.hand .card[data-id="${ids[0]}"]`), await center('.crib-pile'));
ok((await toast()).includes('2枚選んでください') && (await p.locator('.hand .card').count()) === 6, `1枚だけでは置けず、理由が出る（${await toast()}）`);

// 2枚選んで、そのうちの1枚をクリブへドラッグ → 2枚まとめて置ける
await p.locator(`.hand .card[data-id="${ids[0]}"]`).click({ position: { x: 7, y: 24 } });
await p.locator(`.hand .card[data-id="${ids[1]}"]`).click({ position: { x: 7, y: 24 } });
ok((await p.locator('.card.selected').count()) === 2, '2枚選べる');
await drag(await grab(`.hand .card[data-id="${ids[0]}"]`), await center('.crib-pile'));
await p.waitForFunction(() => document.querySelectorAll('.hand .card').length === 4);
ok(true, '選んだ2枚を、クリブへドラッグしてまとめて置けた');

// ペギング：自分の番になったら、1枚を場へドラッグして出す
for (let i = 0; i < 150; i++) {
  const hint = await p.locator('.board .hint').innerText();
  if (hint.includes('出すカードを選んでください') || hint.includes('Goを宣言')) break;
  await p.waitForTimeout(300);
}
const hint = await p.locator('.board .hint').innerText();
if (hint.includes('出すカードを選んでください')) {
  const live = await p.locator('.hand .card:not(.dim)').evaluateAll((els) => els.map((e) => e.dataset.id));
  const n = await p.locator('.hand .card').count();
  await drag(await grab(`.hand .card[data-id="${live[0]}"]`), await center('.run'));
  await p.waitForFunction((c) => !document.querySelector(`.hand .card[data-id="${c}"]`), live[0]);
  ok((await p.locator('.hand .card').count()) === n - 1, '手札の1枚を場へドラッグして出せた');
} else {
  console.log('skip: 先にGoの番になったので、場へのドラッグは確認しない');
}
await browser.close();
