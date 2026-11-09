// @vitest-environment jsdom
/**
 * calendar-card.test.js — 公共卡片组件（jsdom）
 *
 * 覆盖不适合放进 dev-loop 的分支：pill 结构/截断/配色、日期头今天与节日、
 * 事件列表 +N 溢出、详情面板的关闭与降级渲染。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setLoaderForTest } from './milkdown-mount.js';
import {
  MAX_PILLS_PER_DAY,
  cardTimeText,
  pillColorKey,
  renderCardDetail,
  renderCardPill,
  renderDayCardList,
  renderDayHeader,
} from './calendar-card.js';

/** 造一张卡（默认 text 类型、无时间）。 */
function card(patch = {}) {
  return {
    id: 'c1',
    type: 'text',
    title: '',
    content: '',
    tags: [],
    assignedDate: '2026-10-06',
    ...patch,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // 组件测试不加载真实 370KB 产物：一律走 md-lite 降级分支
  __setLoaderForTest(async () => null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('pillColorKey', () => {
  it('task 未完成 = red，已完成 = gray', () => {
    expect(pillColorKey(card({ type: 'task' }))).toBe('red');
    expect(pillColorKey(card({ type: 'task', done: true }))).toBe('gray');
  });

  it('text 默认 blue，有标签时按标签稳定取色', () => {
    expect(pillColorKey(card({ type: 'text' }))).toBe('blue');
    const a = pillColorKey(card({ type: 'text', tags: ['工作'] }));
    const b = pillColorKey(card({ type: 'text', tags: ['工作'] }));
    expect(a).toBe(b); // 同名标签恒同色
    expect(['red', 'green', 'blue', 'purple']).toContain(a);
  });

  it('props.color 显式值优先', () => {
    expect(pillColorKey(card({ type: 'task', props: { color: 'purple' } }))).toBe('purple');
  });

  it('非法 props.color 被忽略', () => {
    expect(pillColorKey(card({ type: 'task', props: { color: 'pink' } }))).toBe('red');
  });
});

describe('cardTimeText', () => {
  it('无开始时间 → 全天', () => {
    expect(cardTimeText(card())).toBe('全天');
  });

  it('有起止时间 → 区间', () => {
    expect(cardTimeText(card({ startTime: '09:00', endTime: '10:30' }))).toBe('09:00–10:30');
  });

  it('range=false → 只给开始时间', () => {
    expect(cardTimeText(card({ startTime: '09:00', endTime: '10:30' }), { range: false })).toBe('09:00');
  });

  it('只有开始时间时结束时间补 15 分钟', () => {
    expect(cardTimeText(card({ startTime: '09:00' }))).toBe('09:00–09:15');
  });
});

describe('renderCardPill', () => {
  it('渲染图标 + 标题 + 开始时间', () => {
    const el = renderCardPill(card({ content: '开会', startTime: '09:00' }));
    expect(el.tagName).toBe('BUTTON');
    expect(el.classList.contains('cc-pill')).toBe(true);
    expect(el.querySelector('.cc-pill-title').textContent).toBe('开会');
    expect(el.querySelector('.cc-pill-time').textContent).toBe('09:00');
  });

  it('Markdown 正文被去标记并截断', () => {
    const el = renderCardPill(card({ content: '# 标题\n**加粗**内容超长超长超长超长超长超长' }));
    const title = el.querySelector('.cc-pill-title').textContent;
    expect(title).not.toContain('**');
    expect(title).not.toContain('#');
    expect(title.endsWith('…')).toBe(true);
  });

  it('空卡片显示占位文案', () => {
    const el = renderCardPill(card());
    expect(el.querySelector('.cc-pill-title').textContent).toBe('(空卡片)');
  });

  it('showTime=false 时不渲染时间', () => {
    const el = renderCardPill(card({ content: 'x', startTime: '09:00' }), { showTime: false });
    expect(el.querySelector('.cc-pill-time')).toBeNull();
  });

  // 2026-11-09 类型退场：完成态由 status 单真值决定（不再看 type/done）
  it('status=done 的卡片带 is-done 类', () => {
    const el = renderCardPill(card({ type: 'task', status: 'done', content: 'x' }));
    expect(el.classList.contains('is-done')).toBe(true);
  });

  it('仅有 done=true（无 status）不再判定为完成', () => {
    const el = renderCardPill(card({ type: 'task', done: true, content: 'x' }));
    expect(el.classList.contains('is-done')).toBe(false);
  });

  it('不再输出 type-* 类名（类型已退出 UI）', () => {
    const el = renderCardPill(card({ type: 'task', content: 'x' }));
    expect([...el.classList].some((c) => c.startsWith('type-'))).toBe(false);
  });

  it('onOpen 回调收到卡片且不冒泡', () => {
    const onOpen = vi.fn();
    const parent = document.createElement('div');
    const parentClick = vi.fn();
    parent.addEventListener('click', parentClick);
    const el = renderCardPill(card({ content: 'x' }), { onOpen });
    parent.append(el);

    el.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('aria-label 含状态词与时间（类型退场后不再出现「任务」）', () => {
    const el = renderCardPill(card({ type: 'task', status: 'done', content: '跑测试', startTime: '08:00' }));
    expect(el.getAttribute('aria-label')).toContain('已完成');
    expect(el.getAttribute('aria-label')).toContain('08:00');
    expect(el.getAttribute('aria-label')).not.toContain('任务');
  });
});

describe('renderDayHeader', () => {
  it('显示日号，非今天显示节日副标', () => {
    const el = renderDayHeader('2026-10-01');
    expect(el.querySelector('.cc-dayheader-num').textContent).toBe('1');
    expect(el.querySelector('.cc-dayheader-sub').textContent).toBe('国庆节');
  });

  it('今天显示「今天」标记而非节日', () => {
    const el = renderDayHeader('2026-10-01', { isToday: true });
    expect(el.classList.contains('is-today')).toBe(true);
    expect(el.querySelector('.cc-dayheader-today').textContent).toBe('今天');
    expect(el.querySelector('.cc-dayheader-sub')).toBeNull();
  });

  it('普通日期无副标', () => {
    const el = renderDayHeader('2026-10-15');
    expect(el.querySelector('.cc-dayheader-sub')).toBeNull();
  });

  it('count>0 时显示计数徽标', () => {
    expect(renderDayHeader('2026-10-15', { count: 3 }).querySelector('.cc-dayheader-count').textContent).toBe('3');
    expect(renderDayHeader('2026-10-15', { count: 0 }).querySelector('.cc-dayheader-count')).toBeNull();
  });

  it('subLabel 覆盖默认节日', () => {
    const el = renderDayHeader('2026-10-01', { subLabel: '自定义' });
    expect(el.querySelector('.cc-dayheader-sub').textContent).toBe('自定义');
  });
});

describe('renderDayCardList', () => {
  it('超过上限时截断并显示 +N', () => {
    const cards = Array.from({ length: MAX_PILLS_PER_DAY + 2 }, (_, i) => card({ id: `c${i}`, content: `第${i}条` }));
    const el = renderDayCardList(cards);
    expect(el.querySelectorAll('.cc-pill')).toHaveLength(MAX_PILLS_PER_DAY);
    expect(el.querySelector('.cc-daylist-more').textContent).toBe('+2');
  });

  it('未超过上限时不显示 +N', () => {
    const el = renderDayCardList([card({ content: 'a' })]);
    expect(el.querySelector('.cc-daylist-more')).toBeNull();
  });
});

describe('renderCardDetail', () => {
  it('渲染标题/时间/编辑按钮，正文走降级渲染', async () => {
    const el = renderCardDetail(card({ content: '**重点**内容', startTime: '09:00', endTime: '10:00' }));
    expect(el.querySelector('.cc-detail-title').textContent).toBe('未命名');
    expect(el.querySelector('.cc-detail-time').textContent).toBe('09:00–10:00');
    expect(el.querySelector('.cc-detail-edit')).not.toBeNull();

    await vi.waitFor(() => {
      expect(el.querySelector('.cc-detail-body').textContent).toContain('重点内容');
    });
  });

  it('关闭按钮触发 onClose 且不冒泡', () => {
    const onClose = vi.fn();
    const parent = document.createElement('div');
    const parentClick = vi.fn();
    parent.addEventListener('click', parentClick);
    const el = renderCardDetail(card({ content: 'x' }), { onClose });
    parent.append(el);

    el.querySelector('.cc-detail-close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('无时间卡片不显示时长', () => {
    const el = renderCardDetail(card({ content: 'x' }));
    expect(el.querySelector('.cc-detail-meta')).toBeNull();
  });
});
