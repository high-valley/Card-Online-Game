import { describe, expect, it } from 'vitest';
import { calculateCribScore, calculateHandScore, calculatePeggingScore, getLegalPlays, rankOf, valueOf } from './scoring.js';

const hand = (cards, starter, crib = false) => calculateHandScore(cards, starter, crib);

describe('カードの値', () => {
  it('合計値は A=1、2〜10=数字、J・Q・K=10。連番の順位は A=1 … K=13', () => {
    expect(['SA', 'S2', 'S10', 'SJ', 'SQ', 'SK'].map(valueOf)).toEqual([1, 2, 10, 10, 10, 10]);
    expect(['SA', 'S10', 'SJ', 'SQ', 'SK'].map(rankOf)).toEqual([1, 10, 11, 12, 13]);
  });
});

describe('手札採点', () => {
  it('最高得点29点：5♠5♥5♦J♣＋スターター5♣', () => {
    const r = hand(['S5', 'H5', 'D5', 'CJ'], 'C5');
    expect(r.fifteens).toBe(16);
    expect(r.pairs).toBe(12);
    expect(r.nobs).toBe(1);
    expect(r.total).toBe(29);
  });
  it('15の全組み合わせを検出（2枚・3枚）', () => {
    const r = hand(['S7', 'H8', 'D4', 'C5'], 'SK');
    expect(r.combinations.fifteens.map((c) => [...c.cards].sort())).toEqual(expect.arrayContaining([['H8', 'S7'], ['C5', 'SK']]));
    expect(r.fifteens).toBe(4);
  });
  it('4・5・6 で 15（3枚の組み合わせ）', () => {
    expect(hand(['S4', 'H5', 'D6', 'CK'], 'S2').fifteens).toBe(4); // 4+5+6 と 5+K
  });
  it('ペア：2枚で2点、3枚で6点、4枚で12点（重複なし）', () => {
    expect(hand(['S9', 'H9', 'D2', 'CK'], 'S4').pairs).toBe(2);
    expect(hand(['S9', 'H9', 'D9', 'CK'], 'S4').pairs).toBe(6);
    expect(hand(['S9', 'H9', 'D9', 'C9'], 'S4').pairs).toBe(12);
  });
  it('複数のラン：3・3・4・5・K はランが2通りで6点', () => {
    const r = hand(['S3', 'H3', 'D4', 'C5'], 'SK');
    expect(r.runs).toBe(6);
    expect(r.combinations.runs).toHaveLength(2);
  });
  it('長いランに含まれる短いランは別に数えない：3-4-5-6 は4点', () => {
    expect(hand(['S3', 'H4', 'D5', 'C6'], 'SK').runs).toBe(4);
    expect(hand(['S3', 'H4', 'D5', 'C6'], 'S7').runs).toBe(5);
  });
  it('二重ランの4枚：3-4-5-5 は 3+3 の2通り＋ペア', () => {
    const r = hand(['S3', 'H4', 'D5', 'C5'], 'SK');
    expect(r.runs).toBe(6);
    expect(r.pairs).toBe(2);
  });
  it('J・Q・K はラン成立、Q・K・A は不成立', () => {
    expect(hand(['S10', 'HJ', 'DQ', 'C2'], 'S4').runs).toBe(3);
    expect(hand(['SJ', 'HQ', 'DK', 'C2'], 'S4').runs).toBe(3);
    expect(hand(['SQ', 'HK', 'DA', 'C5'], 'S8').runs).toBe(0);
  });
  it('フラッシュ：手札4枚が同スートで4点、スターターも同スートで5点', () => {
    expect(hand(['S2', 'S6', 'S9', 'SK'], 'H4').flush).toBe(4);
    expect(hand(['S2', 'S6', 'S9', 'SK'], 'S4').flush).toBe(5);
    expect(hand(['S2', 'S6', 'S9', 'HK'], 'S4').flush).toBe(0);
  });
  it('クリブのフラッシュは5枚そろったときだけ（4枚のみは0点）', () => {
    expect(calculateCribScore(['S2', 'S6', 'S9', 'SK'], 'H4').flush).toBe(0);
    expect(calculateCribScore(['S2', 'S6', 'S9', 'SK'], 'S4').flush).toBe(5);
  });
  it('Nobs：スターターと同じスートのJを持っていれば1点。スターター自身のJは対象外', () => {
    expect(hand(['SJ', 'H2', 'D8', 'CK'], 'S4').nobs).toBe(1);
    expect(hand(['HJ', 'H2', 'D8', 'CK'], 'S4').nobs).toBe(0);
    expect(hand(['H3', 'H2', 'D8', 'CK'], 'SJ').nobs).toBe(0);
  });
  it('得点なしの手札は0点', () => {
    expect(hand(['S2', 'H4', 'D8', 'CQ'], 'S6').total).toBe(0);
  });
});

describe('ペギング採点', () => {
  const score = (seq, card, count) => calculatePeggingScore(seq, card, count);

  it('合計15で2点、31で2点', () => {
    expect(score(['S7'], 'H8', 7).fifteenScore).toBe(2);
    expect(score(['SK', 'HK', 'D5'], 'C6', 25)).toMatchObject({ newCount: 31, thirtyOneScore: 2, totalScore: 2 });
  });
  it('ペア2点・3枚で6点・4枚で12点', () => {
    expect(score(['S7'], 'H7', 7).pairScore).toBe(2);
    expect(score(['S7', 'H7'], 'D7', 14).pairScore).toBe(6);
    expect(score(['S7', 'H7', 'D7'], 'C7', 21).pairScore).toBe(12);
  });
  it('途中に別のカードをはさむとペアにならない', () => {
    expect(score(['S7', 'H9'], 'D7', 16).pairScore).toBe(0);
  });
  it('ラン：7→9→8 で3点、9→6→8→7 で4点（順不同）', () => {
    expect(score(['S7', 'H9'], 'D8', 16).runScore).toBe(3);
    expect(score(['S9', 'H6', 'D8'], 'C7', 23).runScore).toBe(4);
  });
  it('直近から遡って最長のランを採点：先頭に無関係な札があってもよい', () => {
    expect(score(['SK', 'S4', 'H5'], 'D6', 19).runScore).toBe(3);
    expect(score(['S4', 'H4', 'D5'], 'C6', 13).runScore).toBe(3); // 4-5-6（直近3枚）
  });
  it('重複ランクをはさむ区間はランにならない', () => {
    expect(score(['S4', 'H5', 'D5'], 'C6', 14).runScore).toBe(0);
  });
  it('15とペアが同時に成立すると合算：5→5→5 で 15＋ペア6 の8点', () => {
    expect(score(['S5', 'H5'], 'D5', 10)).toMatchObject({ fifteenScore: 2, pairScore: 6, totalScore: 8 });
  });
  it('出せる札は合計31以下', () => {
    expect(getLegalPlays(['SK', 'H5', 'D2'], 28)).toEqual(['D2']);
    expect(getLegalPlays(['SK', 'H5'], 28)).toEqual([]);
  });
});
