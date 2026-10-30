// ジン・ラミーの画面操作の確認：手札のドラッグ並べ替え・自動整列・アニメーション・効果音の切り替え。
// 開発サーバー（とログイン用のエミュレータ）を起動して実行する。CPU対戦なので1人で確認できる。
//   node tests-e2e/gin-ui.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };
const ids = () => p.locator('.hand .card').evaluateAll((els) => els.map((e) => e.dataset.id));

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.click('.game-tile:has-text("ジン・ラミー")');
await p.click('.game-detail button:has-text("CPUと対戦")');
await p.waitForSelector('.board.gin');

const before = await ids();
ok(before.length === 10 && new Set(before).size === 10, '手札10枚');
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'スマホ幅で横にはみ出さない');
ok((await p.locator('.hand-group').count()) >= 1, '自動整列：役ごと・デッドウッドのまとまりに分かれて並ぶ');
ok((await p.locator('.hand-tools button:has-text("自動整列")').count()) === 0, '並べ替える前は「自動整列」ボタンは出ない');

// 先頭のカードを、いちばん後ろのカードの右へドラッグする（自分の番でなくてもできる）
const first = await p.locator('.hand .card').first().boundingBox();
const last = await p.locator('.hand .card').last().boundingBox();
await p.mouse.move(first.x + 7, first.y + first.height * 0.4);
await p.mouse.down();
await p.mouse.move(first.x + 40, first.y + 5, { steps: 4 });
ok((await p.locator('.dnd-ghost').count()) === 1 && (await p.locator('.drag-origin').count()) === 1, 'ドラッグ中はカードが指に付いてきて、元の場所は薄くなる');
await p.mouse.move(last.x + last.width - 4, last.y + last.height / 2, { steps: 10 });
await p.mouse.up();
const after = await ids();
ok(after.at(-1) === before[0] && after.length === 10 && new Set(after).size === 10, `先頭のカードが末尾に移った（${before[0]}）`);
ok((await p.locator('.card.selected').count()) === 0, 'ドラッグ直後のクリックでカードが選ばれない');
ok(await p.locator('.hand-tools button:has-text("自動整列")').isVisible(), '並べ替えると「自動整列」ボタンが出る');

// 少し動かしただけ（タップ）では並べ替わらない
const box = await p.locator('.hand .card').nth(2).boundingBox();
await p.mouse.move(box.x + 8, box.y + 10);
await p.mouse.down();
await p.mouse.move(box.x + 13, box.y + 11);
await p.mouse.up();
ok(JSON.stringify(await ids()) === JSON.stringify(after), 'ほんの少し動かしただけでは並べ替わらない');

await p.click('.hand-tools button:has-text("自動整列")');
ok(JSON.stringify(await ids()) === JSON.stringify(before), '「自動整列」で最初の並びに戻る');

// 効果音の切り替え（保存される）
ok((await p.locator('.hand-tools button:has-text("効果音 ON")').count()) === 1, '効果音は初期ON');
await p.click('.hand-tools button:has-text("効果音 ON")');
ok((await p.locator('.hand-tools button:has-text("効果音 OFF")').count()) === 1, 'OFFにできる');
ok((await p.evaluate(() => localStorage.getItem('cards.muted'))) === '1', '設定が保存される');
await p.click('.hand-tools button:has-text("効果音 OFF")');

// 引くとカードが現れるアニメーションが動く
const n0 = Number((await p.evaluate(() => document.getElementById('app').dataset.anims)) ?? 0);
const mine = async () => (await p.locator('.board .hint').innerText()).includes('山札か捨て札') || (await p.locator('.board .hint').innerText()).includes('最初の公開カード');
const deadline = Date.now() + 60_000;
while (Date.now() < deadline && !(await mine())) await p.waitForTimeout(300);
if ((await p.locator('.board .hint').innerText()).includes('最初の公開カード')) await p.click('.actions button:has-text("パス")');
while (Date.now() < deadline && !(await p.locator('.board .hint').innerText()).includes('山札か捨て札')) await p.waitForTimeout(300);
await p.click('.pile .card.back');
await p.waitForFunction(() => document.querySelectorAll('.hand .card').length === 11);
const n1 = Number(await p.evaluate(() => document.getElementById('app').dataset.anims ?? 0));
ok(n1 > n0, `引いたカードのアニメーションが動いた（${n0}→${n1}）`);

// 引いたカードが分かりやすい：手札の「NEW」と「いま引いたカード」欄
ok((await p.locator('.hand .card.fresh').count()) === 1, '手札の、引いたカードに「NEW」の印が付く');
const freshId = await p.locator('.hand .card.fresh').getAttribute('data-id');
ok((await p.locator('.drawn').count()) === 1 && (await p.locator('.drawn .card').getAttribute('data-id')) === freshId, '「いま引いたカード」欄に、同じカードが出る');
ok((await p.locator('.board .hint').innerText()).includes('山札から') && (await p.locator('.board .hint').innerText()).includes('を引きました'), 'ヒントにも引いたカードが出る');

// ルールブック：いつでも開け、Escや✕で閉じられ、ゲームが進んでも閉じない
await p.click('.hand-tools button:has-text("ルール")');
await p.waitForSelector('.modal[role="dialog"]');
const text = await p.locator('.modal').innerText();
ok(text.includes('ジン・ラミーのルール') && text.includes('ノックとジン') && text.includes('レイオフ') && text.includes('アンダーカット'), 'ルールブックが開き、ノック・レイオフ・アンダーカットの説明がある');
await p.keyboard.press('Escape');
ok((await p.locator('.modal').count()) === 0, 'Escで閉じる');
await p.click('.hand-tools button:has-text("ルール")');
await p.mouse.click(5, 5); // 外側
ok((await p.locator('.modal').count()) === 0, '外側をタップして閉じる');

// 自分が捨てる → CPUが動く間もルールブックを開いておく
await p.locator('.hand .card').first().click({ position: { x: 7, y: 24 } });
await p.click('.actions button:has-text("捨てる")');
await p.click('.hand-tools button:has-text("ルール")');
await p.waitForSelector('.modal');
await p.waitForSelector('.opp-move', { state: 'attached', timeout: 20000 });
ok((await p.locator('.modal').count()) === 1, 'CPUが動いて画面が更新されても、ルールブックは閉じない');
await p.click('.modal .close');
const move = await p.locator('.opp-move span').first().innerText();
ok(/引き|取り|パス/.test(move) && move.endsWith('ました') && (await p.locator('.opp-move strong').innerText()).includes('CPU'), `相手の直前の手が表示される（${move.replace(/\n+/g, ' ')}）`);

// トップ画面からも見られる
await p.click('.end-game');
await p.waitForSelector('text=ゲームを選ぶ');
await p.click('.game-tile:has-text("大富豪")');
await p.click('.game-detail button:has-text("ルール")');
const t2 = await p.locator('.modal').innerText();
ok(t2.includes('大富豪のルール') && t2.includes('【ON】革命') && t2.includes('【OFF】しばり'), 'トップから大富豪のルールが見られ、初期設定（革命ON・しばりOFF）が載る');
await browser.close();
