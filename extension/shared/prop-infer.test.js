/**
 * prop-infer.test.js — 本地规则属性推断
 */
import { describe, it, expect } from 'vitest';
import { PROP_TYPES, defaultValueForType, dedupeKey, inferProp } from './prop-infer.js';

describe('PROP_TYPES', () => {
  it('是 [{value,label}] 数组且含常用类型', () => {
    expect(Array.isArray(PROP_TYPES)).toBe(true);
    const vals = PROP_TYPES.map((t) => t.value);
    expect(vals).toContain('text');
    expect(vals).toContain('select');
  });
});

describe('defaultValueForType', () => {
  it('按类型给默认值（非 checkbox/tags/schedule 一律空串）', () => {
    expect(defaultValueForType('checkbox')).toBe(false);
    expect(defaultValueForType('tags')).toEqual([]);
    expect(defaultValueForType('schedule')).toBeNull();
    expect(defaultValueForType('number')).toBe('');
    expect(defaultValueForType('text')).toBe('');
    expect(defaultValueForType('unknown-type')).toBe('');
  });
});

describe('dedupeKey', () => {
  it('无冲突返回原名', () => {
    expect(dedupeKey('client', [])).toBe('client');
  });
  it('冲突时追加 (2)/(3)', () => {
    expect(dedupeKey('client', ['client'])).toBe('client(2)');
    expect(dedupeKey('client', ['client', 'client(2)'])).toBe('client(3)');
  });
});

describe('inferProp', () => {
  it('按名字推断出定义（key/label/type）', () => {
    const d = inferProp('重要度');
    expect(d.key).toBe('重要度');
    expect(d.label).toBe('重要度');
    expect(PROP_TYPES.map((t) => t.value)).toContain(d.type);
    expect(typeof d.icon).toBe('string');
  });
  it('空名也能返回结构完整的定义', () => {
    const d = inferProp('');
    expect(d).toHaveProperty('type');
    expect(d).toHaveProperty('icon');
  });
  it('可注入已用 key 做去重', () => {
    const d = inferProp('客户', { existingKeys: ['客户'] });
    expect(d.key).toBe('客户(2)');
  });
});
