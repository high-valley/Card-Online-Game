import { describe, expect, it } from 'vitest';
import { summarizeOpponentTurn } from './turnSummary.js';

const names = { me: 'あなた', cpu: 'CPU' };
const e = (uid, type, extra = {}) => ({ uid, type, cards: [], effects: [], ...extra });

describe('相手の直前のターンの要約', () => {
  it('山札から引いて捨てた', () => {
    const log = [e('cpu', 'draw', { source: 'deck' }), e('cpu', 'discard', { cards: ['D3'] })];
    expect(summarizeOpponentTurn(log, 'me', names)).toEqual({ who: 'CPU', text: '山札から1枚引き、♦3を捨てました', taken: null, thrown: 'D3' });
  });
  it('捨て札を取って捨てた：取ったカードが分かる', () => {
    const log = [e('cpu', 'draw', { source: 'discard', cards: ['S7'] }), e('cpu', 'discard', { cards: ['HK'] })];
    expect(summarizeOpponentTurn(log, 'me', names)).toMatchObject({ text: '捨て札の♠7を取り、♥Kを捨てました', taken: 'S7', thrown: 'HK' });
  });
  it('引いたところ（まだ捨てていない）', () => {
    expect(summarizeOpponentTurn([e('cpu', 'draw', { source: 'deck' })], 'me', names).text).toBe('山札から1枚引きました');
  });
  it('パス・ノック・ジン・手札公開', () => {
    expect(summarizeOpponentTurn([e('cpu', 'pass')], 'me', names).text).toBe('パスしました');
    expect(summarizeOpponentTurn([e('cpu', 'draw', { source: 'deck' }), e('cpu', 'knock', { cards: ['C10'] })], 'me', names).text).toBe('山札から1枚引き、♣10を捨ててノックしました');
    expect(summarizeOpponentTurn([e('cpu', 'draw', { source: 'deck' }), e('cpu', 'gin', { cards: ['DA'] })], 'me', names).text).toBe('山札から1枚引き、♦Aを捨ててジンしました');
    expect(summarizeOpponentTurn([e('cpu', 'showdown')], 'me', names).text).toBe('手札を公開しました');
  });
  it('自分が最後に動いたときは、相手の手は出さない。ログが空でも安全', () => {
    expect(summarizeOpponentTurn([e('cpu', 'discard', { cards: ['D3'] }), e('me', 'draw', { source: 'deck' })], 'me', names)).toBeNull();
    expect(summarizeOpponentTurn([], 'me', names)).toBeNull();
  });
  it('相手の直前のターンだけを対象にする（その前の自分のターンは含めない）', () => {
    const log = [e('me', 'discard', { cards: ['C2'] }), e('cpu', 'draw', { source: 'deck' }), e('cpu', 'discard', { cards: ['D3'] })];
    expect(summarizeOpponentTurn(log, 'me', names).text).toBe('山札から1枚引き、♦3を捨てました');
  });
});
