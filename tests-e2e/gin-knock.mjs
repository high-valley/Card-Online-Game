// ジン・ラミーのノック → 相手の手札公開（自動）→ 得点 を、決まった手札で画面から通す。
// Emulator と vite dev サーバーを起動して実行する。手札の仕込みには Emulator の管理者権限を使う。
//   node tests-e2e/gin-knock.mjs
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { buildDeck } from '../common/deck.js';
import { deal } from '../games/gin-rummy/rules.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

const browser = await chromium.launch();
const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message)); return p; };
const [host, guest] = [await mk(), await mk()];

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', 'ホスト');
await host.click('li:has-text("ジン・ラミー") button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/2）');
const invite = await host.inputValue('.invite input');
await guest.goto(invite);
await guest.fill('input[placeholder="ニックネーム"]', 'ゲスト');
await guest.click('button:has-text("ルームに参加する")');
await host.waitForSelector('text=参加者（2/2）');
await host.click('button:has-text("ゲーム開始")');
await Promise.all([host, guest].map((p) => p.waitForSelector('.board.gin')));

// 手札を仕込む：host（席0）がディーラー、guest（席1）が先手。guest は4点でノックできる手、host は17点の手
const roomId = new URL(invite).searchParams.get('room');
const uids = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__app.uid)));
const KNOCKER = ['S5', 'H5', 'D5', 'C8', 'C9', 'C10', 'S7', 'S8', 'S9', 'H4'];
const OPP17 = ['H2', 'D2', 'C2', 'D6', 'D7', 'D8', 'HJ', 'HA', 'S3', 'C3'];
const used = new Set([...KNOCKER, ...OPP17, 'SQ', 'DK']);
const deck = [];
KNOCKER.forEach((c, i) => deck.push(c, OPP17[i]));
deck.push('SQ', ...buildDeck().filter((c) => !used.has(c)), 'DK');
const dealt = deal(uids.map((uid, seat) => ({ uid, seat })), {}, null, deck, () => 0);

const env = await initializeTestEnvironment({ projectId: 'demo-card-online-game', firestore: { host: '127.0.0.1', port: 8080 } });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const room = (...p) => doc(db, 'cards_rooms', roomId, ...p);
  for (const uid of uids) {
    await setDoc(room('hands', uid), { cards: dealt.hands[uid] });
    await setDoc(room('players', uid), { handCount: 10 }, { merge: true });
  }
  await setDoc(room('deck', 'current'), { cards: dealt.deck });
  await setDoc(room('state', 'current'), { gameId: 'ginrummy', round: 1, turnUid: dealt.turnUid, version: 100, log: [], result: null, game: dealt.game });
});
await env.cleanup();

const [first, second] = dealt.turnUid === uids[0] ? [host, guest] : [guest, host];
ok(dealt.turnUid === uids[1], '先手は非ディーラー（guest）');
await first.waitForSelector('text=最初の公開カードを取りますか');
await first.click('.actions button:has-text("パス")');
await second.waitForSelector('text=最初の公開カードを取りますか');
await second.click('.actions button:has-text("パス")');
await first.waitForSelector('text=山札か捨て札');
await first.click('.pile .card.back');
await first.waitForFunction(() => document.querySelectorAll('.hand .card').length === 11);
ok((await first.locator('.hand .card.fresh').getAttribute('data-id')) === 'DK', '山札から引いた K♦ に「NEW」の印が付く');
await first.waitForSelector('.drawn .card[data-id="DK"]');
ok(true, '「いま引いたカード」欄に K♦ が出る');
ok((await first.locator('.board .hint').innerText()).includes('山札から♦Kを引きました'), 'ヒントに「山札から♦Kを引きました」と出る');
await second.waitForSelector('.opp-move');
ok((await second.locator('.opp-move span').innerText()) === '山札から1枚引きました', '相手の画面には、引いたカードは出さず「山札から1枚引きました」だけが出る');
await first.locator('.hand .card[data-id="DK"]').click({ position: { x: 7, y: 24 } });
ok(await first.locator('.actions button:has-text("ノック")').isEnabled(), 'デッドウッド4点なのでノックできる');
ok(!(await first.locator('.actions button:has-text("ジン")').isEnabled()), '4点なのでジンはできない');
await first.click('.actions button:has-text("ノック")');

// 相手は何も押さなくても手札が自動で公開され、結果が出る
await Promise.all([host, guest].map((p) => p.waitForSelector('.gin-result', { timeout: 20000 })));
const text = (await host.locator('main').innerText()).replace(/\n+/g, ' / ');
console.log(text.slice(0, 400));
ok(text.includes('ノック') && text.includes('デッドウッド4点') && text.includes('デッドウッド17点'), '両者のデッドウッドが公開されている');
const row = (await first.locator('table.result tr.me').innerText()).replace(/\s+/g, ' ');
ok(/ゲスト|ホスト/.test(row) && row.includes('+13'), `ノックした側に 17−4＝13 点（${row}）`);
await browser.close();
