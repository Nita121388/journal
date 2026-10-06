/**
 * emoji-search.test.js — emoji 纯搜索
 */
import { describe, it, expect } from 'vitest';
import { EMOJI_DB, EMOJI_CATS, searchEmojis, emojisByCat } from './emoji-search.js';

describe('数据', () => {
  it('库与分类非空', () => {
    expect(EMOJI_DB.length).toBeGreaterThan(100);
    expect(EMOJI_CATS.length).toBeGreaterThan(1);
  });
  it('每条含 e/n/k/c 字段', () => {
    for (const it of EMOJI_DB.slice(0, 20)) {
      expect(typeof it.e).toBe('string');
      expect(typeof it.n).toBe('string');
      expect(typeof it.k).toBe('string');
      expect(typeof it.c).toBe('string');
    }
  });
});

describe('searchEmojis', () => {
  it('空查询 → null', () => {
    expect(searchEmojis('')).toBeNull();
    expect(searchEmojis(null)).toBeNull();
    expect(searchEmojis('   ')).toBeNull();
  });
  it('按字符精确命中', () => {
    const first = EMOJI_DB[0];
    const out = searchEmojis(first.e);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].e).toBe(first.e);
  });
  it('按英文名/关键词子串命中', () => {
    const out = searchEmojis('smile');
    expect(out.length).toBeGreaterThan(0);
  });
  it('结果上限 48', () => {
    const out = searchEmojis('a');
    expect(out.length).toBeLessThanOrEqual(48);
  });
  it('无匹配 → []', () => {
    expect(searchEmojis('zzzzzzzzzz')).toEqual([]);
  });
});

describe('emojisByCat', () => {
  it('按分类过滤且与库一致', () => {
    const cat = EMOJI_CATS[0].id;
    const out = emojisByCat(cat);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.c === cat)).toBe(true);
  });
  it('未知分类 → []', () => {
    expect(emojisByCat('nope')).toEqual([]);
  });
});
