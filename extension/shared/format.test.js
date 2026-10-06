/**
 * format.test.js — 纯展示格式化
 */
import { describe, it, expect } from 'vitest';
import { formatDateLabel, shortDate, typeIcon, formatProvenance, escapeHtml, sanitizeEmoji, cardPrimaryText, compactDateLabel } from './format.js';
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
    expect(typeIcon('idea')).toBe('💡');
  });
  it('与 escapeHtml 配合后不再有注入面（关键回归）', () => {
    // 恶意 emoji：旧实现会把它原样拼进 innerHTML
    const evil = '"><img src=x onerror=alert(1)>';
    expect(typeIcon('text', evil)).toBe('📝');
    expect(typeIcon('text', '<script>')).toBe('📝');
    expect(escapeHtml(typeIcon('text', evil))).not.toContain('<img');
  });
});

describe('escapeHtml', () => {
  it('转义五个元字符', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('null/undefined → 空串', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('sanitizeEmoji', () => {
  it('放行正常 emoji 与短文本图标', () => {
    expect(sanitizeEmoji('🔥')).toBe('🔥');
    expect(sanitizeEmoji('✅')).toBe('✅');
    expect(sanitizeEmoji('📝')).toBe('📝');
  });
  it('拒绝含 HTML 元字符的输入', () => {
    for (const bad of ['<script>', '"><img src=x>', 'a&b', "it's", '`x`']) {
      expect(sanitizeEmoji(bad)).toBe('');
    }
  });
  it('拒绝超长输入（防饱和/滥用）', () => {
    expect(sanitizeEmoji('x'.repeat(9))).toBe('');
    expect(sanitizeEmoji('x'.repeat(8))).toBe('x'.repeat(8));
  });
  it('空值 → 空串', () => {
    expect(sanitizeEmoji(null)).toBe('');
    expect(sanitizeEmoji('')).toBe('');
    expect(sanitizeEmoji('   ')).toBe('');
  });
});

describe('cardPrimaryText', () => {
  it('标题优先，其次内容', () => {
    expect(cardPrimaryText({ title: '周会', content: '讨论 A' })).toBe('周会');
    expect(cardPrimaryText({ content: '讨论 A' })).toBe('讨论 A');
  });
  it('只填标题不再落成「空卡片」（关键回归）', () => {
    expect(cardPrimaryText({ title: '开会', content: '' })).toBe('开会');
  });
  it('都没填才返回 fallback', () => {
    expect(cardPrimaryText({}, '(空卡片)')).toBe('(空卡片)');
    expect(cardPrimaryText(null, '(空)')).toBe('(空)');
  });
});

describe('compactDateLabel', () => {
  it('当年不重复年份', () => {
    const y = new Date().getFullYear();
    expect(compactDateLabel(`${y}-10-06`)).toBe('10月6日 周二');
  });
  it('跨年补年份', () => {
    expect(compactDateLabel('2000-01-01')).toBe('2000年1月1日 周六');
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
