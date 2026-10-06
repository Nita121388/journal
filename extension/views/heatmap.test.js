// @vitest-environment jsdom
/**
 * heatmap.test.js — 热力图视图（jsdom）
 *
 * 为什么需要这层测试：`views/` 是重构后代码量最大的一层，此前零单测
 * （覆盖率只圈 shared+state）。这里覆盖不适合放进 dev-loop 断言的**分支逻辑**，
 * 尤其是打卡连续天数的宽限口径。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toDayKey, todayKey } from '../shared/model.js';

/** 相对今天偏移 n 天的 dayKey（本地时区）。 */
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

async function loadHeatmap() {
  vi.resetModules();
  document.body.innerHTML = '<div id="heatmap-container"></div><span id="heatmap-streak"></span>';
  return await import('./heatmap.js');
}

describe('renderHeatmap', () => {
  beforeEach(() => { vi.resetModules(); });

  it('渲染 365 格，今日唯一高亮，数量映射到档位', async () => {
    const { renderHeatmap } = await loadHeatmap();
    const c = document.getElementById('heatmap-container');
    renderHeatmap(c, { [todayKey()]: 3 });

    expect(c.querySelectorAll('.heatmap-cell')).toHaveLength(365);
    expect(c.querySelectorAll('.heatmap-cell.is-today')).toHaveLength(1);
    expect(c.querySelector('.heatmap-cell.is-today').classList.contains('level-3')).toBe(true);
  });

  it('5 张及以上并入最高档 level-5', async () => {
    const { renderHeatmap } = await loadHeatmap();
    const c = document.getElementById('heatmap-container');
    renderHeatmap(c, { [todayKey()]: 9 });
    expect(c.querySelector('.heatmap-cell.is-today').classList.contains('level-5')).toBe(true);
  });

  it('连续天数：今天与昨天都有记录 → 2 天且无「还没打卡」', async () => {
    const { renderHeatmap } = await loadHeatmap();
    renderHeatmap(document.getElementById('heatmap-container'), {
      [dayOffset(0)]: 1, [dayOffset(-1)]: 1,
    });
    const text = document.getElementById('heatmap-streak').textContent;
    expect(text).toContain('2 天');
    expect(text).not.toContain('还没打卡');
  });

  it('连续天数宽限：今天没记录但从昨天起连着 → 不清零（关键回归）', async () => {
    const { renderHeatmap } = await loadHeatmap();
    renderHeatmap(document.getElementById('heatmap-container'), {
      [dayOffset(-1)]: 1, [dayOffset(-2)]: 1, [dayOffset(-3)]: 1,
    });
    const text = document.getElementById('heatmap-streak').textContent;
    expect(text).toContain('3 天');
    expect(text).toContain('今天还没打卡');
  });

  it('完全没记录 → 明确文案（不出现空胶囊）', async () => {
    const { renderHeatmap } = await loadHeatmap();
    renderHeatmap(document.getElementById('heatmap-container'), {});
    const text = document.getElementById('heatmap-streak').textContent;
    expect(text.trim()).toBe('今天还没打卡');
  });

  it('中间断档即停止累加', async () => {
    const { renderHeatmap } = await loadHeatmap();
    renderHeatmap(document.getElementById('heatmap-container'), {
      [dayOffset(0)]: 1, [dayOffset(-1)]: 1, [dayOffset(-3)]: 1,
    });
    expect(document.getElementById('heatmap-streak').textContent).toContain('2 天');
  });

  it('无 streak 元素时不抛错', async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="heatmap-container"></div>';
    const { renderHeatmap } = await import('./heatmap.js');
    expect(() => renderHeatmap(document.getElementById('heatmap-container'), {})).not.toThrow();
  });
});
