import { describe, expect, it } from 'vitest';
import { games } from './index.js';

describe('ルールブック', () => {
  for (const g of games) {
    it(`${g.name}：内容があり、各項目に見出しと本文がある`, () => {
      const sections = g.rulebook(g.defaultOptions);
      expect(sections.length).toBeGreaterThanOrEqual(5);
      for (const s of sections) {
        expect(s.title).toBeTruthy();
        expect((s.paras?.length ?? 0) + (s.list?.length ?? 0)).toBeGreaterThan(0);
      }
    });
    it(`${g.name}：設定を渡さなくても、引数がなくても動く`, () => {
      expect(() => g.rulebook()).not.toThrow();
      expect(() => g.rulebook(undefined)).not.toThrow();
    });
  }

  it('大富豪：このルームの設定のON/OFFが載る', () => {
    const daifugo = games.find((g) => g.id === 'daifugo');
    const text = (o) => daifugo.rulebook(o).flatMap((s) => s.list ?? []).join('\n');
    expect(text({ revolution: true })).toContain('【ON】革命');
    expect(text({ revolution: false })).toContain('【OFF】革命');
    expect(text({ lock: true })).toContain('【ON】しばり');
    expect(text({})).toContain('【OFF】しばり'); // 初期値
  });

  it('ジン・ラミー：ボーナス点・目標点・ノックできる点数が設定を反映する', () => {
    const gin = games.find((g) => g.id === 'ginrummy');
    const text = gin.rulebook({ ginBonus: 30, undercutBonus: 20, targetScore: 150, knockLimit: 8 }).flatMap((s) => [...(s.paras ?? []), ...(s.list ?? [])]).join('\n');
    expect(text).toContain('30点のボーナス');
    expect(text).toContain('20点を得ます');
    expect(text).toContain('累積150点');
    expect(text).toContain('8点以下');
  });
});
