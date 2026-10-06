/**
 * card-schema.test.js — 卡片字段契约与归一化原语
 */
import { describe, it, expect } from 'vitest';
import {
  CARD_TYPES, PRIORITIES, STATUSES, RESERVED_PROPS,
  statusFromTypeDone, normalizeProgress, normalizeDuration, normalizeProps, normalizeTags,
} from './card-schema.js';

describe('常量', () => {
  it('枚举冻结且内容正确', () => {
    expect(CARD_TYPES).toEqual(['text', 'task', 'idea']);
    expect(PRIORITIES).toEqual(['high', 'medium', 'low']);
    expect(STATUSES).toEqual(['none', 'todo', 'doing', 'done']);
    expect(Object.isFrozen(CARD_TYPES)).toBe(true);
  });
  it('保留字包含一级字段', () => {
    expect(RESERVED_PROPS.has('title')).toBe(true);
    expect(RESERVED_PROPS.has('deleted')).toBe(true);
    expect(RESERVED_PROPS.has('myField')).toBe(false);
  });
});

describe('statusFromTypeDone', () => {
  it('task 按 done 映射，其余为 none', () => {
    expect(statusFromTypeDone('task', false)).toBe('todo');
    expect(statusFromTypeDone('task', true)).toBe('done');
    expect(statusFromTypeDone('text', false)).toBe('none');
  });
});

describe('normalizeProgress', () => {
  it('夹取到 0-100 并取整', () => {
    expect(normalizeProgress(150, 'doing')).toBe(100);
    expect(normalizeProgress(-5, 'doing')).toBe(0);
    expect(normalizeProgress(33.6, 'doing')).toBe(34);
  });
  it('空值 + done → 100', () => {
    expect(normalizeProgress(null, 'done')).toBe(100);
    expect(normalizeProgress('', 'done')).toBe(100);
    expect(normalizeProgress(null, 'doing')).toBeNull();
  });
  it('非法值 → null', () => {
    expect(normalizeProgress('abc', 'doing')).toBeNull();
  });
});

describe('normalizeDuration', () => {
  it('非负取整', () => {
    expect(normalizeDuration(45.4)).toBe(45);
    expect(normalizeDuration(0)).toBe(0);
  });
  it('空/负数/非法 → null', () => {
    expect(normalizeDuration(null)).toBeNull();
    expect(normalizeDuration('')).toBeNull();
    expect(normalizeDuration(-1)).toBeNull();
    expect(normalizeDuration('x')).toBeNull();
  });
});

describe('normalizeProps', () => {
  it('剔除保留字与非字符串 key', () => {
    expect(normalizeProps({ title: 'x', ok: 1 })).toEqual({ ok: 1 });
    expect(normalizeProps({ id: 'x', a: true })).toEqual({ a: true });
  });
  it('非对象 → {}', () => {
    expect(normalizeProps(null)).toEqual({});
    expect(normalizeProps('x')).toEqual({});
  });
});

describe('normalizeTags', () => {
  it('trim + 小写 + 去重 + 过滤空串', () => {
    expect(normalizeTags([' 工作 ', '工作', '', 'Idea'])).toEqual(['工作', 'idea']);
  });
  it('非数组 → []', () => {
    expect(normalizeTags('x')).toEqual([]);
    expect(normalizeTags([1, null, 'ok'])).toEqual(['ok']);
  });
});
