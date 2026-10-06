// @vitest-environment jsdom
/**
 * calendar.test.js — 月历网格视图（jsdom）
 *
 * 覆盖不适合放进 dev-loop 的分支：非本月灰显、卡片数指示器与档位、
 * roving tabindex（只允许一个 0）、方向键导航的边界。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMonthMatrix } from '../shared/model.js';

async function loadCalendar() {
  vi.resetModules();
  document.body.innerHTML = `
    <div id="calendar-grid" role="grid"></div>
    <span id="cal-month-label"></span>
    <time id="today-display"></time>
  `;
  return await import('./calendar.js');
}

const MATRIX = getMonthMatrix(2026, 9); // 2026-10

describe('renderCalendar', () => {
  beforeEach(() => { vi.resetModules(); });

  it('渲染 6×7 = 42 格，非本月灰显', async () => {
    const { renderCalendar } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', {});

    const cells = c.querySelectorAll('.cal-day');
    expect(cells).toHaveLength(42);
    expect(c.querySelectorAll('.cal-day.is-out-month').length).toBeGreaterThan(0);
  });

  it('选中日与今天标记，且只有选中日 tabIndex=0（roving）', async () => {
    const { renderCalendar } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', {});

    expect(c.querySelectorAll('.cal-day.is-selected')).toHaveLength(1);
    const focusable = [...c.querySelectorAll('.cal-day')].filter((el) => el.tabIndex === 0);
    expect(focusable).toHaveLength(1);
    expect(focusable[0].dataset.day).toBe('2026-10-06');
  });

  it('卡片数指示器：>5 显示 5+，档位类名封顶 level5', async () => {
    const { renderCalendar } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', { '2026-10-06': 9, '2026-10-07': 2 });

    const day6 = c.querySelector('.cal-day[data-day="2026-10-06"]');
    const day7 = c.querySelector('.cal-day[data-day="2026-10-07"]');
    expect(day6.querySelector('.cal-count').textContent).toBe('5+');
    expect(day6.classList.contains('count-5')).toBe(true);
    expect(day7.querySelector('.cal-count').textContent).toBe('2');
    expect(day7.classList.contains('count-2')).toBe(true);
  });

  it('aria-label 含日期 / 非本月 / 今天 / 卡片数', async () => {
    const { renderCalendar } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', { '2026-10-06': 3 });

    const day6 = c.querySelector('.cal-day[data-day="2026-10-06"]');
    expect(day6.getAttribute('aria-label')).toContain('2026-10-06');
    expect(day6.getAttribute('aria-label')).toContain('3张卡片');
    const out = c.querySelector('.cal-day.is-out-month');
    expect(out.getAttribute('aria-label')).toContain('非本月');
  });

  it('无卡片日不渲染计数指示器', async () => {
    const { renderCalendar } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', {});
    expect(c.querySelectorAll('.cal-count')).toHaveLength(0);
  });
});

describe('bindCalendarKeys', () => {
  beforeEach(() => { vi.resetModules(); });

  it('方向键移动 roving tabindex 且带动焦点', async () => {
    const { renderCalendar, bindCalendarKeys } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', {});
    bindCalendarKeys();

    const cells = [...c.querySelectorAll('.cal-day')];
    const start = cells.findIndex((el) => el.tabIndex === 0);
    cells[start].focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(cells[start].tabIndex).toBe(-1);
    expect(cells[start + 1].tabIndex).toBe(0);
    expect(document.activeElement).toBe(cells[start + 1]);
  });

  it('Home / End 跳到首尾；越界不抛错', async () => {
    const { renderCalendar, bindCalendarKeys } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', {});
    bindCalendarKeys();
    const cells = [...c.querySelectorAll('.cal-day')];

    cells[10].focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(cells[0]);

    cells[10].focus();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(cells[cells.length - 1]);

    // 从第一格 ArrowLeft → 越界，应被忽略且不抛
    cells[0].focus();
    expect(() => c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))).not.toThrow();
    expect(document.activeElement).toBe(cells[0]);
  });

  it('焦点不在格子上时不处理', async () => {
    const { renderCalendar, bindCalendarKeys } = await loadCalendar();
    const c = document.getElementById('calendar-grid');
    renderCalendar(c, MATRIX, '2026-10-06', {});
    bindCalendarKeys();
    expect(() => c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))).not.toThrow();
  });
});

describe('updateHeaderDate', () => {
  beforeEach(() => { vi.resetModules(); });

  it('写入长日期文案', async () => {
    const { updateHeaderDate } = await loadCalendar();
    const { vs } = await import('../state/view-state.js');
    vs.selectedDate = '2026-10-06';
    updateHeaderDate();
    expect(document.getElementById('today-display').textContent).toContain('2026年10月6日');
  });
});
