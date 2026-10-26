// Firestore セキュリティルールのテスト。Emulator を起動して実行する（npm run test:rules）。
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-card-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());

const R = 'cards_rooms/r1';
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, R), { code: '123456', gameId: 'daifugo', hostUid: 'host', status: 'playing', options: {}, members: ['host', 'a', 'b'], nextSeat: 3 });
    for (const u of ['host', 'a', 'b']) {
      await setDoc(doc(db, `${R}/players/${u}`), { name: u, seat: 0, handCount: 5, totalPoints: {} });
      await setDoc(doc(db, `${R}/hands/${u}`), { cards: ['S3'] });
    }
    await setDoc(doc(db, `${R}/state/current`), { turnUid: 'a', version: 1, log: [], game: {} });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();

describe('手札', () => {
  it('本人だけが読める（ホストや他の参加者も読めない）', async () => {
    await assertSucceeds(getDoc(doc(as('a'), `${R}/hands/a`)));
    await assertFails(getDoc(doc(as('b'), `${R}/hands/a`)));
    await assertFails(getDoc(doc(as('host'), `${R}/hands/a`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${R}/hands/a`)));
  });
  it('他人の手札は書けない。ホストは配布中だけ書ける', async () => {
    await assertFails(setDoc(doc(as('b'), `${R}/hands/a`), { cards: [] }));
    await assertFails(setDoc(doc(as('host'), `${R}/hands/a`), { cards: [] }));
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), R), { status: 'dealing' }));
    await assertSucceeds(setDoc(doc(as('host'), `${R}/hands/a`), { cards: [] }));
    await assertFails(setDoc(doc(as('b'), `${R}/hands/a`), { cards: [] }));
  });
});

describe('ゲーム状態', () => {
  it('参加者だけが読める', async () => {
    await assertSucceeds(getDoc(doc(as('b'), `${R}/state/current`)));
    await assertFails(getDoc(doc(as('outsider'), `${R}/state/current`)));
    await assertFails(getDoc(doc(as('outsider'), `${R}/players/a`)));
  });
  it('手番の人とホストだけが更新できる', async () => {
    await assertSucceeds(updateDoc(doc(as('a'), `${R}/state/current`), { version: 2 }));
    await assertFails(updateDoc(doc(as('b'), `${R}/state/current`), { version: 2 }));
    await assertSucceeds(updateDoc(doc(as('host'), `${R}/state/current`), { version: 2 }));
    await assertFails(updateDoc(doc(as('outsider'), `${R}/state/current`), { version: 2 }));
  });
});

describe('ルーム', () => {
  it('gameId・options・status はホストだけが変更できる', async () => {
    await assertFails(updateDoc(doc(as('a'), R), { gameId: 'x' }));
    await assertFails(updateDoc(doc(as('a'), R), { options: { revolution: false } }));
    await assertFails(updateDoc(doc(as('a'), R), { status: 'waiting' }));
    await assertSucceeds(updateDoc(doc(as('a'), R), { status: 'finished' }));
    await assertSucceeds(updateDoc(doc(as('host'), R), { gameId: 'x' }));
  });
  it('招待URL（ルームID）を知っていれば get でき、他人のルーム一覧は取れない', async () => {
    await assertSucceeds(getDoc(doc(as('outsider'), R)));
  });
  it('ゲーム開始後は新規参加できない。待機中は参加できる', async () => {
    const join = (uid) => updateDoc(doc(as(uid), R), { members: ['host', 'a', 'b', uid], nextSeat: 4 });
    await assertFails(join('c'));
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), R), { status: 'waiting' }));
    await assertSucceeds(join('c'));
  });
  it('ホストが抜けたら次の人に引き継げるが、勝手にホストにはなれない', async () => {
    await assertFails(updateDoc(doc(as('a'), R), { hostUid: 'a' }));
    await assertSucceeds(updateDoc(doc(as('host'), R), { hostUid: 'host' }));
    await assertSucceeds(updateDoc(doc(as('host'), R), { members: ['a', 'b'], hostUid: 'a' }));
  });
});

describe('players', () => {
  it('本人は更新でき、他人は handCount と totalPoints だけ更新できる', async () => {
    await assertSucceeds(updateDoc(doc(as('a'), `${R}/players/a`), { name: 'new' }));
    await assertFails(updateDoc(doc(as('b'), `${R}/players/a`), { name: 'hack' }));
    await assertSucceeds(updateDoc(doc(as('b'), `${R}/players/a`), { handCount: 4 }));
    await assertFails(updateDoc(doc(as('outsider'), `${R}/players/a`), { handCount: 4 }));
  });
});

describe('transfers', () => {
  it('from だけが作成でき、from と to の2人だけが読める', async () => {
    const t = (u) => doc(as(u), `${R}/transfers/t1`);
    await assertFails(setDoc(t('b'), { from: 'a', to: 'host', cards: ['S3'] }));
    await assertSucceeds(setDoc(t('a'), { from: 'a', to: 'host', cards: ['S3'] }));
    await assertSucceeds(getDoc(t('host')));
    await assertFails(getDoc(t('b')));
  });
});
