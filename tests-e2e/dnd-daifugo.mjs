// 大富豪：手札のカードを場へドラッグして出せることの確認（3人対戦）。
//   node tests-e2e/dnd-daifugo.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const names = ['ホスト', 'ゲストA', 'ゲストB'];
const pages = [];
for (const name of names) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  pages.push(page);
}
const [host, ...guests] = pages;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', names[0]);
await host.click('.game-tile:has-text("大富豪")');
await host.click('.game-detail button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/5）');
const invite = await host.inputValue('.invite input');
for (const [i, g] of guests.entries()) {
  await g.goto(invite);
  await g.fill('input[placeholder="ニックネーム"]', names[i + 1]);
  await g.click('button:has-text("ルームに参加する")');
  await g.waitForSelector('text=ホストが開始するのを待っています');
}
await host.waitForSelector('text=参加者（3/5）');
await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board')));

const hintOf = (p) => p.locator('.board .hint').innerText();
const grab = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + 7, y: b.y + b.height * 0.4 }; }; // 重なった手札の、見えている左端
const boxCenter = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function drag(p, from, to) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x + 12, from.y - 12, { steps: 3 });
  await p.mouse.move(to.x, to.y, { steps: 12 });
  await p.mouse.up();
}
/** 「あなたの番です」になっている人（のページ）を、最大10秒待って返す */
const turnPage = async (except = null) => {
  for (let i = 0; i < 200; i++) {
    for (const p of pages) if (p !== except && /^あなたの番|パスしてください/.test(await hintOf(p))) return p;
    await host.waitForTimeout(50);
  }
  throw new Error('手番の人が見つからない');
};

// 1) 最初の人：手札の1枚を場へドラッグして出す
const first = await turnPage();
const n0 = await first.locator('.hand .card').count();
// 8切りで場が流れたり革命が起きたりしない、ふつうのカードを選ぶ
const all = await first.locator('.hand .card').evaluateAll((els) => els.map((e) => e.dataset.id));
const card = all.filter((c) => !/^(JK|.8|.2)$/.test(c))[3];
await drag(first, await grab(first, `.hand .card[data-id="${card}"]`), await boxCenter(first, '.field'));
await first.waitForFunction((n) => document.querySelectorAll('.hand .card').length === n - 1, n0);
ok(true, 'カードを場へドラッグして出せた（手札が1枚減る）');
await Promise.all(pages.map((p) => p.waitForSelector(`.field-cards .card[data-id="${card}"]`)));
ok(true, '全員の画面の場に、そのカードが出る');

// 2) 次の人：2枚選んで場へドラッグ → 場は1枚なので出せない。理由が出て、選択はそのまま
const second = await turnPage(first);
ok(second !== first, '次の人に手番が移った');
const ids = await second.locator('.hand .card').evaluateAll((els) => els.slice(0, 2).map((e) => e.dataset.id));
for (const id of ids) await second.locator(`.hand .card[data-id="${id}"]`).click({ position: { x: 7, y: 24 } }); // 重なった手札の、見えている左端
ok((await second.locator('.card.selected').count()) === 2, 'タップで2枚選べる');
const n1 = await second.locator('.hand .card').count();
await drag(second, await grab(second, `.hand .card[data-id="${ids[0]}"]`), await boxCenter(second, '.field'));
const msg = (await second.locator('.notice').innerText().catch(() => '')).trim();
ok(/出せません|同じ形/.test(msg), `選んだ2枚をまとめてドラッグすると、場と形が合わないので、理由が出る（${msg}）`);
ok((await second.locator('.hand .card').count()) === n1 && (await second.locator('.card.selected').count()) === 2, '出せなかったときは、手札も選択もそのまま');

// 3) 出せない場所（手札の外の関係ない場所）に落とすと、何も起きない
await drag(second, await grab(second, `.hand .card[data-id="${ids[0]}"]`), { x: 200, y: 20 });
ok((await second.locator('.hand .card').count()) === n1, '関係ない場所に落としても、何も起きない');
await browser.close();
