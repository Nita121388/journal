/**
 * format.test.js — 纯展示格式化
 */
import { describe, it, expect } from 'vitest';
import { formatDateLabel, shortDate, typeIcon, formatProvenance } from './format.js';
import { todayKey } from './model.js';

describe('formatDateLabel', () => {
  it('形如「YYYY年M月D日星期X」', () => {
    expect(formatDateLabel('2026-10-06')).toContain('2026年10月6日');
  });
});

describe('shortDate', () => {
  it('今天/昨天/具体日期', () => {
    expect(shortDate(todayKey())).toBe('今天');
    const y = new Date(); y.setDate(y.getDate() - 1);
    expect(shortDate(y.toISOString().slice(0, 10))).toBe('昨天');
    expect(shortDate('2000-01-01')).toBe('2000-01-01');
  });
});

describe('typeIcon', () => {
  it('自定义 emoji 优先', () => {
    expect(typeIcon('task', '🔥')).toBe('🔥');
  });
  it('无 emoji 时按 type 默认', () => {
    expect(typeIcon('task')).toBe('☑️');
    expect(typeIcon('text')).toBe('📝');
    expect(typeIcon('idea')).toBe('📝');
  });
});

describe('formatProvenance', () => {
  it('无事件 → fallback', () => {
    expect(formatProvenance(null)).toBe('—');
    expect(formatProvenance(null, '无')).toBe('无');
  });
  it('未知 origin → 人类', () => {
    expect(formatProvenance({ origin: 'zzz' })).toContain('人类');
  });
  it('拼装 agent / model / project / 时间', () => {
    const out = formatProvenance({
      origin: 'agent-assisted', agent: 'pi', model: 'gpt', project: 'x',
      at: '2026-10-06T01:00:00.000Z',
    });
    expect(out).toContain('pi');
    expect(out).toContain('gpt');
    expect(out).toContain('x');
  });
  it('含 device.hostname', () => {
    expect(formatProvenance({ origin: 'human', device: { hostname: 'mbp' } })).toContain('mbp');
  });
});
