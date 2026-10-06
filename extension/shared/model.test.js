/**
 * model.test.js — 纯逻辑（时间/卡片/聚合）单测
 */
import { describe, it, expect } from 'vitest';
import {
  todayKey, toDayKey, currentTime,
  timeToMinutes, minutesToTime, addMinutes, snapToQuarter, snapUpToQuarter,
  getCardStartTime, getCardEndTime, getCardDuration,
  layoutScheduleLanes, getCardsByDate,
  countCardsByDay, getCardTypeCounts,
  getMonthMatrix, dateRange, createCard,
  migrateOldJournals, migrateOldTodos,
} from './model.js';

describe('todayKey / toDayKey', () => {
  it('使用本地时区字段，避免 UTC 偏移', () => {
    expect(toDayKey(new Date(2026, 0, 2))).toBe('2026-01-02');
  });
  it('todayKey 与 toDayKey(new Date()) 一致', () => {
    expect(todayKey()).toBe(toDayKey(new Date()));
  });
  it('todayKey 形如 YYYY-MM-DD', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('currentTime', () => {
  it('形如 HH:MM', () => {
    expect(currentTime()).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('时间换算', () => {
  it('timeToMinutes', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('00:00')).toBe(0);
  });
  it('minutesToTime', () => {
    expect(minutesToTime(510)).toBe('08:30');
    expect(minutesToTime(0)).toBe('00:00');
  });
  it('addMinutes', () => {
    expect(addMinutes('08:00', 90)).toBe('09:30');
    expect(addMinutes('23:30', 60)).toBe('00:30'); // 跨天回绕
  });
  it('snapToQuarter / snapUpToQuarter', () => {
    expect(snapToQuarter('08:07')).toBe('08:00');
    expect(snapToQuarter('08:08')).toBe('08:15');
    expect(snapUpToQuarter('08:01')).toBe('08:15');
    expect(snapUpToQuarter('08:15')).toBe('08:15');
  });
});

describe('卡片起止/时长', () => {
  it('优先 startTime，回退 time', () => {
    expect(getCardStartTime({ startTime: '09:00', time: '08:00' })).toBe('09:00');
    expect(getCardStartTime({ time: '08:00' })).toBe('08:00');
    expect(getCardStartTime({})).toBeNull();
  });
  it('endTime 优先；无 endTime 时 start+15 分钟', () => {
    expect(getCardEndTime({ startTime: '09:00', endTime: '10:00' })).toBe('10:00');
    expect(getCardEndTime({ startTime: '09:00' })).toBe('09:15');
    expect(getCardEndTime({})).toBeNull();
  });
  it('getCardDuration 由起止推算', () => {
    expect(getCardDuration({ startTime: '09:00', endTime: '10:30' })).toBe(90);
    expect(getCardDuration({ startTime: '09:00' })).toBe(15);
    expect(getCardDuration({})).toBe(0);
  });
});

describe('layoutScheduleLanes', () => {
  it('不重叠的项共用 lane 0', () => {
    const out = layoutScheduleLanes([
      { id: 'a', start: '09:00', end: '10:00' },
      { id: 'b', start: '10:00', end: '11:00' },
    ]);
    expect(out.get('a').lane).toBe(0);
    expect(out.get('b').lane).toBe(0);
    expect(out.get('a').laneCount).toBe(1);
  });
  it('重叠的项分道', () => {
    const out = layoutScheduleLanes([
      { id: 'a', start: '09:00', end: '11:00' },
      { id: 'b', start: '09:30', end: '10:30' },
    ]);
    expect(out.get('a').lane).not.toBe(out.get('b').lane);
    expect(out.get('a').laneCount).toBe(2);
  });
  it('空数组返回空 Map', () => {
    expect(layoutScheduleLanes([]).size).toBe(0);
  });
});

describe('卡片查询', () => {
  const cards = [
    { id: '1', assignedDate: '2026-01-01', time: '10:00', createdAt: 'a' },
    { id: '2', assignedDate: '2026-01-01', time: '08:00', createdAt: 'b' },
    { id: '3', assignedDate: '2026-01-02', time: null, createdAt: 'c' },
    { id: '4', assignedDate: null, time: null, createdAt: 'd' },
  ];
  it('getCardsByDate 按时间升序', () => {
    expect(getCardsByDate(cards, '2026-01-01').map((c) => c.id)).toEqual(['2', '1']);
  });
  it('getCardsByDate 非数组返回空', () => {
    expect(getCardsByDate(null, '2026-01-01')).toEqual([]);
  });
});

describe('聚合', () => {
  const cards = [
    { id: '1', assignedDate: '2026-01-01', type: 'task', done: true },
    { id: '2', assignedDate: '2026-01-01', type: 'text' },
    { id: '3', assignedDate: null, type: 'task' },
  ];
  it('countCardsByDay', () => {
    expect(countCardsByDay(cards)).toEqual({ '2026-01-01': 2 });
  });
  it('countCardsByDay 非数组返回空对象', () => {
    expect(countCardsByDay(null)).toEqual({});
  });
  it('getCardTypeCounts', () => {
    expect(getCardTypeCounts(cards, '2026-01-01')).toEqual({ task: 1, text: 1 });
  });
});

describe('日历与日期范围', () => {
  it('getMonthMatrix 返回 6×7=42 格', () => {
    const m = getMonthMatrix(2026, 0);
    expect(m.length).toBeGreaterThanOrEqual(5);
    expect(m.flat().length % 7).toBe(0);
    expect(m.flat().some((c) => c.isToday !== undefined)).toBe(true);
  });
  it('dateRange 长度与末项为今天', () => {
    const r = dateRange(30);
    expect(r.length).toBe(30);
    expect(r[r.length - 1]).toBe(todayKey());
  });
});

describe('createCard', () => {
  it('补默认值', () => {
    const c = createCard({ content: 'x' });
    expect(c.id).toMatch(/^c_/);
    expect(c.type).toBe('text');
    expect(c.priority).toBe('medium');
    expect(c.status).toBe('none');
    expect(c.tags).toEqual([]);
  });
  it('task + done → status done 且 progress 100', () => {
    const c = createCard({ type: 'task', done: true });
    expect(c.status).toBe('done');
    expect(c.progress).toBe(100);
  });
  it('非法 type 回落 text；非法 priority 回落 medium', () => {
    const c = createCard({ type: 'zzz', priority: 'zzz' });
    expect(c.type).toBe('text');
    expect(c.priority).toBe('medium');
  });
  it('startTime 回退 time', () => {
    expect(createCard({ time: '09:00' }).startTime).toBe('09:00');
  });
});

describe('迁移', () => {
  it('migrateOldJournals 字符串与对象两种形态', () => {
    const out = migrateOldJournals({ '2026-01-01': 'x', '2026-01-02': { content: 'y' }, '2026-01-03': '' });
    expect(out.map((c) => c.id)).toEqual(['c_mj_2026-01-01', 'c_mj_2026-01-02']);
    expect(out[0].assignedDate).toBe('2026-01-01');
  });
  it('migrateOldJournals 非对象返回空', () => {
    expect(migrateOldJournals(null)).toEqual([]);
  });
  it('migrateOldTodos', () => {
    const out = migrateOldTodos([{ id: 't1', title: 'A', done: false, due: '2026-01-01' }, { title: '' }]);
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('task');
    expect(out[0].assignedDate).toBe('2026-01-01');
  });
  it('migrateOldTodos 非数组返回空', () => {
    expect(migrateOldTodos(null)).toEqual([]);
  });
});
