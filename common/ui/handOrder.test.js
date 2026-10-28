import { describe, expect, it } from 'vitest';
import { applyOrder, moveCard } from './handOrder.js';

describe('applyOrder', () => {
  const auto = ['S3', 'S4', 'H9', 'D2'];
  it('並べ替えていなければ自動整列', () => {
    expect(applyOrder(null, ['H9', 'S3', 'S4', 'D2'], auto)).toEqual(auto);
  });
  it('並べ替えた順を保つ', () => {
    expect(applyOrder(['D2', 'H9', 'S3', 'S4'], ['S3', 'S4', 'H9', 'D2'], auto)).toEqual(['D2', 'H9', 'S3', 'S4']);
  });
  it('手札から消えたカードは外し、増えたカードは自動整列の順で末尾に足す', () => {
    expect(applyOrder(['D2', 'H9', 'S3', 'S4'], ['S3', 'H9', 'D2', 'C5', 'C6'], ['S3', 'H9', 'D2', 'C5', 'C6'])).toEqual(['D2', 'H9', 'S3', 'C5', 'C6']);
  });
});

describe('moveCard', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('前へ・後ろへ動かす', () => {
    expect(moveCard(ids, 'd', 'a', false)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveCard(ids, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveCard(ids, 'a', 'd', true)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('自分自身や知らないカードの前後は、並びを変えない', () => {
    expect(moveCard(ids, 'b', 'b', true)).toEqual(ids);
    expect(moveCard(ids, 'b', 'zzz', true)).toEqual(ids);
  });
  it('元の配列は変更しない', () => {
    const copy = [...ids];
    moveCard(ids, 'a', 'd', true);
    expect(ids).toEqual(copy);
  });
});
