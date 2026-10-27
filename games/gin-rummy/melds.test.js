import { describe, expect, it } from 'vitest';
import { bestArrangement, bestWithLayoff, candidateMelds, deadwoodOf, isRun, isSet, layoffOnto, point } from './melds.js';

describe('カードの点数', () => {
  it('A=1、2〜9=数字、10・J・Q・K=10', () => {
    expect(['SA', 'S2', 'S9', 'S10', 'SJ', 'SQ', 'SK'].map(point)).toEqual([1, 2, 9, 10, 10, 10, 10]);
  });
});

describe('セット', () => {
  it('同じ数字3枚・4枚で成立', () => {
    expect(isSet(['S7', 'H7', 'D7'])).toBe(true);
    expect(isSet(['SK', 'HK', 'DK', 'CK'])).toBe(true);
  });
  it('2枚、数字違い、スート重複は不成立', () => {
    expect(isSet(['S7', 'H7'])).toBe(false);
    expect(isSet(['S7', 'H7', 'D8'])).toBe(false);
    expect(isSet(['S7', 'S7', 'D7'])).toBe(false);
  });
});

describe('ラン', () => {
  it('同スート連続3枚以上で成立、A・2・3も成立', () => {
    expect(isRun(['H3', 'H4', 'H5'])).toBe(true);
    expect(isRun(['S8', 'S9', 'S10', 'SJ'])).toBe(true);
    expect(isRun(['DA', 'D2', 'D3'])).toBe(true);
  });
  it('Q・K・A、スート違い、飛びは不成立', () => {
    expect(isRun(['CQ', 'CK', 'CA'])).toBe(false);
    expect(isRun(['H3', 'S4', 'H5'])).toBe(false);
    expect(isRun(['S5', 'S7', 'S8'])).toBe(false);
    expect(isRun(['S5', 'S6'])).toBe(false);
  });
  it('順不同でも成立', () => {
    expect(isRun(['H5', 'H3', 'H4'])).toBe(true);
  });
});

describe('役の候補', () => {
  it('4枚セットは「3枚の組み合わせ4通り＋4枚」、4枚ランは「3枚2通り＋4枚」', () => {
    expect(candidateMelds(['S7', 'H7', 'D7', 'C7'])).toHaveLength(5);
    expect(candidateMelds(['S3', 'S4', 'S5', 'S6'])).toHaveLength(3);
  });
});

describe('最小デッドウッド', () => {
  it('仕様書の例：5♠5♥5♦／8♣9♣10♣ ＋ A♥2♠4♦J♥ = 17点', () => {
    const hand = ['S5', 'H5', 'D5', 'C8', 'C9', 'C10', 'HA', 'S2', 'D4', 'HJ'];
    const r = bestArrangement(hand);
    expect(r.dw).toBe(17);
    expect(r.deadwood.sort()).toEqual(['D4', 'HA', 'HJ', 'S2']);
  });
  it('1枚を複数の役に使わない：同じカードを取り合う場合は点の高い方を選ぶ', () => {
    // 7♠は 7♠7♥7♦ のセットか 5♠6♠7♠ のランのどちらか一方にしか使えない
    const hand = ['S7', 'H7', 'D7', 'S5', 'S6', 'C2', 'C3', 'H9', 'D10', 'SK'];
    const r = bestArrangement(hand);
    expect(r.melds).toHaveLength(1);
    expect(r.dw).toBe(2 + 3 + 9 + 10 + 10 + 5 + 6); // セットを採用
  });
  it('ジン：10枚すべてが役ならデッドウッド0', () => {
    const hand = ['S3', 'S4', 'S5', 'H9', 'D9', 'C9', 'H10', 'HJ', 'HQ', 'HK'];
    expect(deadwoodOf(hand)).toBe(0);
  });
  it('役がなければ全カードの合計', () => {
    expect(deadwoodOf(['SA', 'H3', 'D5'])).toBe(9);
  });
  it('結果は決定的', () => {
    const hand = ['S3', 'S4', 'S5', 'H3', 'D3', 'S6', 'C9', 'CJ', 'HA', 'D8'];
    expect(bestArrangement(hand)).toEqual(bestArrangement([...hand].reverse()));
  });
});

describe('レイオフ', () => {
  it('ノック側のランの端に付け足せる（仕様書の例：5♠6♠7♠ に 8♠）', () => {
    const r = layoffOnto(['S8', 'H2'], [['S5', 'S6', 'S7']]);
    expect(r.placed).toEqual([{ card: 'S8', meld: 0 }]);
    expect(r.rest).toEqual(['H2']);
  });
  it('続けて付け足せる（8♠のあとに9♠）', () => {
    expect(layoffOnto(['S9', 'S8'], [['S5', 'S6', 'S7']]).rest).toEqual([]);
  });
  it('3枚のセットには4枚目だけ。4枚セットには付けられない', () => {
    expect(layoffOnto(['C7'], [['S7', 'H7', 'D7']]).rest).toEqual([]);
    expect(layoffOnto(['C7'], [['S7', 'H7', 'D7', 'C7']]).rest).toEqual(['C7']);
  });
  it('K の次の A は付けられない', () => {
    expect(layoffOnto(['SA'], [['SJ', 'SQ', 'SK']]).rest).toEqual(['SA']);
  });
  it('自分の役は崩さない：役にしたカードは付け足し対象にならない', () => {
    const r = bestWithLayoff(['H8', 'H9', 'H10', 'S8', 'C2', 'C4', 'D6', 'DK', 'HA', 'C9'], [['S5', 'S6', 'S7']]);
    expect(r.melds.flat().sort()).toEqual(['H10', 'H8', 'H9']);
    expect(r.layoffs).toEqual([{ card: 'S8', meld: 0 }]);
    expect(r.dw).toBe(2 + 4 + 6 + 10 + 1 + 9);
  });
  it('レイオフ後のデッドウッドが最小になる組み合わせを選ぶ', () => {
    // 役にするか付け足しに回すかは、最終デッドウッドが小さくなる方を採る
    const knock = [['S4', 'S5', 'S6']];
    const r = bestWithLayoff(['S7', 'S8', 'S9', 'H2', 'H3', 'D10', 'DJ', 'CK', 'C2', 'D5'], knock);
    expect(r.dw).toBeLessThanOrEqual(deadwoodOf(['S7', 'S8', 'S9', 'H2', 'H3', 'D10', 'DJ', 'CK', 'C2', 'D5']));
  });
});
