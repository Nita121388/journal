/**
 * field-registry.test.js — 统一字段注册表
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILTIN_KEYS, initFieldRegistry, getFieldDef, listFieldDefs,
  isReservedKey, writeValueToCard, readValueFromCard,
} from './field-registry.js';
import { RESERVED_PROPS } from './card-schema.js';

beforeEach(() => {
  initFieldRegistry({ getUserFields: () => ({}) });
});

describe('内建字段', () => {
  it('必选三件套 lock 且 required', () => {
    for (const k of ['title', 'content', 'tags']) {
      const d = getFieldDef(k);
      expect(d.source).toBe('builtin');
      expect(d.required).toBe(true);
    }
    expect(BUILTIN_KEYS.has('title')).toBe(true);
  });
  it('listFieldDefs({required:true}) 返回必选', () => {
    const req = listFieldDefs({ required: true });
    expect(req.map((d) => d.key)).toEqual(['title', 'content', 'tags']);
  });
  it('listFieldDefs({source:builtin}) 含可选字段', () => {
    expect(listFieldDefs({ source: 'builtin' }).length).toBeGreaterThan(3);
  });
  it('未登记 key → null', () => {
    expect(getFieldDef('nope')).toBeNull();
  });
});

describe('isReservedKey', () => {
  it('内建 key 与保留字都算保留', () => {
    expect(isReservedKey('title', RESERVED_PROPS)).toBe(true);
    expect(isReservedKey('custom', RESERVED_PROPS)).toBe(false);
  });
});

describe('用户字段', () => {
  it('initFieldRegistry 注入后 getFieldDef 能读到并补全 storage', () => {
    initFieldRegistry({ getUserFields: () => ({ 客户: { key: '客户', label: '客户', type: 'text' } }) });
    const d = getFieldDef('客户');
    expect(d.source).toBe('user');
    expect(d.storage.kind).toBe('props');
  });
  it('listFieldDefs({source:user})', () => {
    initFieldRegistry({ getUserFields: () => ({ a: { key: 'a', label: 'A', type: 'text' } }) });
    expect(listFieldDefs({ source: 'user' }).map((d) => d.key)).toEqual(['a']);
  });
});

describe('writeValueToCard / readValueFromCard', () => {
  it('一级字段写入并按 empty 兜底', () => {
    const c = {};
    writeValueToCard(c, 'title', 'hi');
    expect(c.title).toBe('hi');
    writeValueToCard(c, 'title', null);
    expect(c.title).toBe('');
  });
  it('schedule 展开为 start/end/duration', () => {
    const c = {};
    writeValueToCard(c, 'schedule', { start: '09:00', end: '10:00', duration: 60 });
    expect(c.startTime).toBe('09:00');
    expect(c.endTime).toBe('10:00');
    expect(c.duration).toBe(60);
    expect(readValueFromCard(c, 'schedule')).toMatchObject({ start: '09:00', end: '10:00', duration: 60 });
  });
  it('未登记 key 写入退化为 props（仅非空时创建/写入）', () => {
    const c = {};
    expect(writeValueToCard(c, 'nope', '')).toBe(false);
    expect(c.props).toBeUndefined();
    expect(writeValueToCard(c, 'nope', 'v')).toBe(true);
    expect(c.props.nope).toBe('v');
  });
  it('readValueFromCard：已登记读 storage，未登记 → undefined', () => {
    expect(readValueFromCard({ title: 't' }, 'title')).toBe('t');
    expect(readValueFromCard({ props: { x: 1 } }, 'x')).toBeUndefined();
  });
});
