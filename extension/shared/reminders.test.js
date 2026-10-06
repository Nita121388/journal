/**
 * reminders.test.js — 到点提醒的纯逻辑（不依赖 chrome / DOM）
 */
import { describe, it, expect } from 'vitest';
import { minuteOf, isDue, pickDueCards, reminderText, pruneReminded } from './reminders.js';

describe('minuteOf', () => {
  it('合法 HH:MM → 分钟数', () => {
    expect(minuteOf('00:00')).toBe(0);
    expect(minuteOf('09:30')).toBe(570);
    expect(minuteOf('23:59')).toBe(1439);
  });
  it('非法输入 → null', () => {
    for (const bad of ['24:00', '9:30', '', null, undefined, 'aa:bb', '12:60']) {
      expect(minuteOf(bad)).toBeNull();
    }
  });
});

describe('isDue', () => {
  it('到点窗口内为真（默认 1 分钟）', () => {
    expect(isDue('09:00', '09:00')).toBe(true);
    expect(isDue('09:00', '09:00', 5)).toBe(true);
    expect(isDue('09:00', '09:04', 5)).toBe(true);
  });
  it('窗口外 / 未到点为假', () => {
    expect(isDue('09:00', '09:01')).toBe(false);
    expect(isDue('09:00', '08:59')).toBe(false);
  });
  it('缺时间 / 非法 → 假（不误报）', () => {
    expect(isDue(null, '09:00')).toBe(false);
    expect(isDue('09:00', null)).toBe(false);
  });
});

describe('pickDueCards', () => {
  const base = { assignedDate: '2026-10-06', status: 'todo', startTime: '09:00' };
  const cards = [
    { ...base, id: 'due' },
    { ...base, id: 'other-time', startTime: '10:00' },
    { ...base, id: 'other-day', assignedDate: '2026-10-07' },
    { ...base, id: 'done', status: 'done' },
    { ...base, id: 'done-flag', status: 'todo', done: true },
    { ...base, id: 'deleted', deleted: true },
    { ...base, id: 'no-time', startTime: null },
    { ...base, id: 'already' },
  ];

  it('只挑当天、未完成、未删、未提醒过、且到点的卡片', () => {
    const out = pickDueCards(cards, '2026-10-06', '09:00', ['already']);
    expect(out.map((c) => c.id)).toEqual(['due']);
  });

  it('已提醒过的集合接受数组或 Set', () => {
    expect(pickDueCards(cards, '2026-10-06', '09:00', new Set(['due', 'already']))).toEqual([]);
  });

  it('异常入参不抛错', () => {
    expect(pickDueCards(null, '2026-10-06', '09:00', [])).toEqual([]);
    expect(pickDueCards([null, undefined], '2026-10-06', '09:00', [])).toEqual([]);
  });
});

describe('reminderText', () => {
  it('标题 + 时间；有内容时作为正文', () => {
    expect(reminderText({ emoji: '📌', startTime: '09:00', title: '周会', content: '讨论 A' }))
      .toEqual({ title: '📌 09:00 周会', message: '讨论 A' });
  });
  it('只有内容时用内容当标题', () => {
    expect(reminderText({ content: '买咖啡' }).title).toContain('买咖啡');
  });
  it('空卡片兜底（不出现空白通知）', () => {
    expect(reminderText({}).title).toBe('📓 (空卡片)');
    expect(reminderText({}).message).toBe('到点了');
  });
});

describe('pruneReminded', () => {
  it('跨天清空', () => {
    expect(pruneReminded({ day: '2026-10-05', ids: ['a'] }, '2026-10-06')).toEqual({ day: '2026-10-06', ids: [] });
  });
  it('当天保留', () => {
    expect(pruneReminded({ day: '2026-10-06', ids: ['a'] }, '2026-10-06')).toEqual({ day: '2026-10-06', ids: ['a'] });
  });
  it('损坏记录重置', () => {
    expect(pruneReminded(null, '2026-10-06')).toEqual({ day: '2026-10-06', ids: [] });
    expect(pruneReminded({ day: '2026-10-06', ids: 'x' }, '2026-10-06')).toEqual({ day: '2026-10-06', ids: [] });
  });
});
