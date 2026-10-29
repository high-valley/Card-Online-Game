import { describe, expect, it } from 'vitest';
import { bestHand } from './hands.js';

const best = (s) => bestHand(s.split(' '));

describe('役判定', () => {
  const cases = [
    ['SA SK SQ SJ S10 H2 D3', 'ロイヤルフラッシュ'],
    ['S9 S8 S7 S6 S5 HA D3', 'ストレートフラッシュ'],
    ['S9 H9 D9 C9 S5 HA D3', 'フォーカード'],
    ['S9 H9 D9 C5 S5 HA D3', 'フルハウス'],
    ['S9 S8 S2 S6 S5 HA D3', 'フラッシュ'],
    ['S9 H8 D7 C6 S5 HA D2', 'ストレート'],
    ['S9 H9 D9 C6 S5 HA D2', 'スリーカード'],
    ['S9 H9 D5 C5 S2 HA D3', 'ツーペア'],
    ['S9 H9 D5 C6 S2 HA D3', 'ワンペア'],
    ['S9 H8 D5 C6 S2 HK D3', 'ハイカード'],
  ];
  for (const [cards, name] of cases) it(`${name}`, () => expect(best(cards).name).toBe(name));

  it('ホイール（A-2-3-4-5）は最弱のストレート', () => {
    const wheel = best('SA H2 D3 C4 S5 HK D9');
    expect(wheel.name).toBe('ストレート');
    expect(wheel.score).toBeLessThan(best('H2 D3 C4 S5 H6 DK D9').score);
  });

  it('A-K-Q-J-10 は最強のストレート。K-A-2 の循環はストレートにならない', () => {
    expect(best('SA HK DQ CJ S10 H2 D3').name).toBe('ストレート');
    expect(best('SK HA D2 C3 S4 H9 D7').name).toBe('ハイカード');
  });

  it('フルハウスは3枚の数字を先に比べる。7枚中に3組のペアがあってもツーペアは上位2組', () => {
    expect(best('S9 H9 D9 C2 S2 H5 D5').name).toBe('フルハウス');
    expect(best('S9 H9 D9 C2 S2 H5 D5').score).toBeGreaterThan(best('S8 H8 D8 CA SA H5 D5').score);
    expect(best('SK HK D5 C5 S2 H2 D9').cards.sort()).toEqual(['C5', 'D5', 'HK', 'SK', 'D9'].sort());
  });

  it('キッカーで勝敗が決まる', () => {
    expect(best('SA HA D9 C5 S3 H2 D7').score).toBeGreaterThan(best('SA HA D8 C5 S3 H2 D7').score);
    expect(best('SA HA D9 C5 S3 H2 D7').score).toBe(best('SA HA D9 C5 S3 H4 D7').score); // 5番目のキッカーまで同じなら引き分け
  });

  it('フラッシュは5枚の数字を高い順に比べる', () => {
    expect(best('SA S9 S5 S3 S2 H8 D7').score).toBeGreaterThan(best('SK S9 S5 S3 S2 H8 D7').score);
    expect(best('SA S9 S5 S3 S2 H8 D7').name).toBe('フラッシュ');
  });

  it('5枚未満はエラー', () => expect(() => bestHand(['SA', 'HA'])).toThrow());
});
