import { describe, expect, it } from 'vitest';
import { SOUNDS, soundForEntry } from './sound.js';

describe('soundForEntry', () => {
  it('操作の種類ごとの音', () => {
    expect(soundForEntry({ type: 'play', effects: [] })).toBe('card');
    expect(soundForEntry({ type: 'draw', source: 'deck', effects: [] })).toBe('draw');
    expect(soundForEntry({ type: 'discard', effects: [] })).toBe('discard');
    expect(soundForEntry({ type: 'pass' })).toBe('pass');
    expect(soundForEntry({ type: 'skip' })).toBe('pass');
  });
  it('ノック・ジン・特殊ルールは専用の音', () => {
    expect(soundForEntry({ type: 'knock', effects: ['knock'] })).toBe('knock');
    expect(soundForEntry({ type: 'gin', effects: ['gin'] })).toBe('gin');
    expect(soundForEntry({ type: 'play', effects: ['revolution'] })).toBe('special');
    expect(soundForEntry({ type: 'play', effects: ['eight-cut', 'flush'] })).toBe('special');
  });
  it('音のない操作は null', () => {
    expect(soundForEntry({ type: 'showdown', effects: ['knock'] })).toBe('knock');
    expect(soundForEntry({ type: 'unknown' })).toBeNull();
  });
  it('返す音の名前はすべて定義されている', () => {
    for (const e of [{ type: 'play' }, { type: 'draw' }, { type: 'discard' }, { type: 'pass' }, { type: 'knock' }, { type: 'gin' }, { type: 'play', effects: ['spade3'] }]) {
      expect(SOUNDS[soundForEntry(e)]).toBeTruthy();
    }
    expect(SOUNDS.win).toBeTruthy();
    expect(SOUNDS.lose).toBeTruthy();
  });
});
