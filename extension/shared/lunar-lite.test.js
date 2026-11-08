import { describe, expect, it } from 'vitest';
import { festivalOf, isFixedFestival } from './lunar-lite.js';

describe('festivalOf', () => {
  it('命中固定节日', () => {
    expect(festivalOf('2026-10-01')).toBe('国庆节');
    expect(festivalOf('2026-01-01')).toBe('元旦');
  });

  it('命中节气', () => {
    expect(festivalOf('2026-09-23')).toBe('秋分');
    expect(festivalOf('2026-09-08')).toBe('白露');
  });

  it('节日优先于节气', () => {
    // 05-01 既是劳动节（固定节日），不在节气表内时也只返回节日
    expect(festivalOf('2026-05-01')).toBe('劳动节');
  });

  it('普通日期返回空串', () => {
    expect(festivalOf('2026-09-15')).toBe('');
  });

  it('非法输入返回空串', () => {
    expect(festivalOf('')).toBe('');
    expect(festivalOf(null)).toBe('');
    expect(festivalOf('2026-1')).toBe('');
  });
});

describe('isFixedFestival', () => {
  it('节日为 true，节气为 false', () => {
    expect(isFixedFestival('2026-10-01')).toBe(true);
    expect(isFixedFestival('2026-09-23')).toBe(false);
  });

  it('非法输入为 false', () => {
    expect(isFixedFestival(null)).toBe(false);
  });
});
