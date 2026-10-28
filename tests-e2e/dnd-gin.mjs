// ドラッグ＆ドロップで「引く・捨てる・宣言する」ができることの確認（ジン・ラミーのCPU対戦で1人で確認できる）。
//   node tests-e2e/dnd-gin.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };
const center = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
/** 手札は重なっているので、掴むときは「見えている左端」を狙う（中央は隣のカードの下になることがある） */
const grab = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + 7, y: b.y + b.height * 0.4 }; };
/** from から to へ、途中を通ってドラッグする。to がセレクタなら、ドラッグを始めてから位置を調べる（置き場はドラッグ中だけ現れるため） */
async function drag(from, to, { release = true } = {}) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(from.x + 12, from.y - 12, { steps: 3 });
  if (typeof to === 'string') to = await center(to);
  await p.mouse.move(to.x, to.y, { steps: 12 });
  if (release) await p.mouse.up();
}
const toast = async () => (await p.locator('.notice').innerText().catch(() => '')).trim();

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.click('li:has-text("ジン・ラミー") button:has-text("CPUと対戦")');
await p.waitForSelector('.board.gin');

// 自分の番まで待つ（最初の公開カードは、取るかパスで先へ進める）
const hint = () => p.locator('.board .hint').innerText();
for (let i = 0; i < 100 && !(await hint()).match(/最初の公開カード|山札か捨て札/); i++) await p.waitForTimeout(300);
if ((await hint()).includes('最初の公開カード')) await p.click('.actions button:has-text("パス")');
for (let i = 0; i < 100 && !(await hint()).includes('山札か捨て札'); i++) await p.waitForTimeout(300);
ok((await hint()).includes('山札か捨て札'), '自分の山札・捨て札を引く番になった');

// 1) 引く前に、手札を捨て札へ落とす → 理由が出て、何も起きない
const before = await p.locator('.hand .card').count();
await drag(await grab('.hand .card >> nth=0'), await center('.discard-pile'));
ok(before === (await p.locator('.hand .card').count()), '引く前に捨てようとしても、手札は減らない');
ok((await toast()).includes('先に山札か捨て札から1枚引いて'), `理由が出る（${await toast()}）`);

// 2) 山札を手札へドラッグして引く
ok((await p.locator('.drop-ready').count()) === 0, 'ドラッグしていないときは、落とし場所の強調は出ない');
await drag(await center('.pile .card.back'), await center('.hand'), { release: false });
ok((await p.locator('.drop-ready').count()) >= 1 && (await p.locator('.dnd-ghost').count()) === 1, 'ドラッグ中は、落とせる場所が強調され、カードが指に付いてくる');
await p.mouse.up();
await p.waitForFunction(() => document.querySelectorAll('.hand .card').length === 11);
ok((await p.locator('.hand .card.fresh').count()) === 1, '山札を手札へドラッグして引けた（NEW の印が付く）');

// 3) 引いたあとにもう一度山札をドラッグ → 理由
await drag(await center('.pile .card.back'), await center('.hand'));
ok((await toast()).includes('もう引いています'), `2枚目は引けない（${await toast()}）`);
await p.waitForFunction(() => !document.querySelector('.notice'), null, { timeout: 6000 });
ok(true, '理由のメッセージは数秒で消える');

// 4) 宣言の置き場：ノック・ジンはドラッグ中だけ出る。条件を満たさないので拒否される
ok((await p.locator('.zone').evaluateAll((els) => els.map((e) => getComputedStyle(e.parentElement).display)))[0] === 'none', 'ノック・ジンの置き場は、ふだんは隠れている');
const target = await p.locator('.hand .card.fresh').getAttribute('data-id');
await drag(await grab(`.hand .card[data-id="${target}"]`), '.drop-zones .zone >> nth=0', { release: false });
ok(await p.locator('.drop-zones .zone').first().isVisible(), 'ドラッグ中だけ「ノック」「ジン」の置き場が出る');
await p.mouse.up();
ok((await p.locator('.hand .card').count()) === 11 && (await toast()).includes('デッドウッド'), `デッドウッドが多いときは、ノックを拒否して理由を出す（${await toast()}）`);

// 5) 手札のカードを捨て札へドラッグして捨てる
await drag(await grab(`.hand .card[data-id="${target}"]`), await center('.discard-pile'));
await p.waitForFunction(() => document.querySelectorAll('.hand .card').length === 10);
// CPUがすぐ取ることもあるので、捨て札の一番上ではなく「捨てた」という記録で確かめる
ok(await p.evaluate((id) => window.__app.model.state.log.some((l) => l.type === 'discard' && l.cards[0] === id), target), 'カードを捨て札へドラッグして捨てられた');

// 6) 並べ替えは今までどおり動く
const ids = () => p.locator('.hand .card').evaluateAll((els) => els.map((e) => e.dataset.id));
const first = await ids();
const last = await p.locator('.hand .card').last().boundingBox();
await drag(await grab('.hand .card >> nth=0'), { x: last.x + last.width - 4, y: last.y + last.height / 2 });
const after = await ids();
ok(after.at(-1) === first[0], '手札の並べ替えも、ドラッグでできる');

// 7) タップ操作もそのまま使える（CPUの番が終わるのを待って、選んで捨てる）
for (let i = 0; i < 100 && !(await hint()).includes('山札か捨て札'); i++) await p.waitForTimeout(300);
await p.click('.pile .card.back');
await p.waitForFunction(() => document.querySelectorAll('.hand .card').length === 11);
await p.locator('.hand .card').first().click({ position: { x: 7, y: 24 } });
ok((await p.locator('.card.selected').count()) === 1, 'タップで選べる');
await p.click('.actions button:has-text("捨てる")');
await p.waitForFunction(() => document.querySelectorAll('.hand .card').length === 10);
ok(true, 'ボタンで捨てられる');
await browser.close();
