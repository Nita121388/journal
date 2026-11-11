/**
 * format.test.js — 纯展示格式化
 */
import { describe, it, expect } from 'vitest';
import { formatDateLabel, shortDate, typeIcon, formatProvenance, formatDateTime, escapeHtml, sanitizeEmoji, cardPrimaryText, compactDateLabel, cardColorKey, CARD_COLOR_KEYS } from './format.js';
import { todayKey, toDayKey } from './model.js';

describe('formatDateLabel', () => {
  it('形如「YYYY年M月D日星期X」', () => {
    expect(formatDateLabel('2026-10-06')).toContain('2026年10月6日');
  });
});

describe('shortDate', () => {
  it('今天/昨天/具体日期', () => {
    expect(shortDate(todayKey())).toBe('今天');
    const y = new Date(); y.setDate(y.getDate() - 1);
    // 必须用 toDayKey（本地字段）：`toISOString()` 在 UTC+8 的 00:00–08:00
    // 会算成前一天，本测试于是在凌晨到早上整段时间假红（与被测实现的修法一致）。
    expect(shortDate(toDayKey(y))).toBe('昨天');
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

describe('formatDateTime', () => {
  it('合法 ISO → YYYY-MM-DD HH:mm（本地字段，补零）', () => {
    expect(formatDateTime('2026-11-11T06:05:00.000Z')).toMatch(/^2026-11-11 \d{2}:\d{2}$/);
    const d = new Date('2026-11-11T06:05:00.000Z');
    const pad = (n) => String(n).padStart(2, '0');
    expect(formatDateTime('2026-11-11T06:05:00.000Z'))
      .toBe(`2026-11-11 ${pad(d.getHours())}:${pad(d.getMinutes())}`);
  });
  it('空值 → fallback', () => {
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime(null, '保存后生成')).toBe('保存后生成');
  });
  it('非法值原样返回', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
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

describe('cardColorKey', () => {
  it('task 未完成 → red，已完成 → gray', () => {
    expect(cardColorKey({ type: 'task' })).toBe('red');
    expect(cardColorKey({ type: 'task', done: true })).toBe('gray');
  });

  it('text / idea 无标签 → blue', () => {
    expect(cardColorKey({ type: 'text' })).toBe('blue');
    expect(cardColorKey({ type: 'idea' })).toBe('blue');
  });

  it('同名标签恒得同色（纯函数、无状态）', () => {
    const a = cardColorKey({ type: 'text', tags: ['工作'] });
    const b = cardColorKey({ type: 'text', tags: ['工作'] });
    expect(a).toBe(b);
    expect(CARD_COLOR_KEYS.slice(0, 4)).toContain(a);
  });

  it('不同标签通常不同色（4 色桶，抽查 20 个不全部相同）', () => {
    const keys = Array.from({ length: 20 }, (_, i) => cardColorKey({ type: 'text', tags: [`标签${i}`] }));
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('显式 props.color 优先于类型与标签', () => {
    expect(cardColorKey({ type: 'task', done: true, tags: ['x'], props: { color: 'purple' } })).toBe('purple');
  });

  it('非法 props.color 被忽略，回落到类型规则', () => {
    expect(cardColorKey({ type: 'task', props: { color: '#fff' } })).toBe('red');
    expect(cardColorKey({ type: 'task', props: { color: 'pink' } })).toBe('red');
  });

  it('未知类型无标签 → gray', () => {
    expect(cardColorKey({ type: 'unknown' })).toBe('gray');
  });

  it('空卡片不抛错', () => {
    expect(cardColorKey({})).toBe('gray');
    expect(cardColorKey(undefined)).toBe('gray');
  });
});
