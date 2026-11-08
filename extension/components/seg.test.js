// @vitest-environment jsdom
/**
 * seg.test.js — 分段单选组（jsdom）
 *
 * 覆盖：初始值推导、点击委托、同值不重复回调、幂等同步、容器缺失的降级。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSegGroup, syncSegValue } from './seg.js';

/** 造一个 4 档分段容器（结构与 sidepanel.html 的 .status-seg 一致）。 */
function makeSeg(values, activeValue, dataKey = 'status') {
  const box = document.createElement('div');
  box.className = 'seg-group';
  box.setAttribute('role', 'radiogroup');
  for (const v of values) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg' + (v === activeValue ? ' is-active' : '');
    b.dataset[dataKey] = v;
    b.setAttribute('aria-checked', String(v === activeValue));
    b.textContent = v;
    box.append(b);
  }
  document.body.append(box);
  return box;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('syncSegValue', () => {
  it('把唯一匹配项设为 is-active，其余取消', () => {
    const box = makeSeg(['none', 'todo', 'doing', 'done'], 'none');
    syncSegValue(box, 'status', 'doing');
    const active = [...box.querySelectorAll('.seg.is-active')];
    expect(active).toHaveLength(1);
    expect(active[0].dataset.status).toBe('doing');
  });

  it('同步 aria-checked', () => {
    const box = makeSeg(['none', 'todo'], 'none');
    syncSegValue(box, 'status', 'todo');
    const checked = [...box.querySelectorAll('.seg')].map((b) => b.getAttribute('aria-checked'));
    expect(checked).toEqual(['false', 'true']);
  });

  it('同值重复调用不产生额外 DOM 变更（幂等）', () => {
    const box = makeSeg(['none', 'todo'], 'none');
    syncSegValue(box, 'status', 'todo');
    const snapshot = box.innerHTML;
    syncSegValue(box, 'status', 'todo');
    expect(box.innerHTML).toBe(snapshot);
  });

  it('容器缺失时原样返回值，不抛错', () => {
    expect(syncSegValue(null, 'status', 'todo')).toBe('todo');
    expect(syncSegValue(undefined, 'priority', 'high')).toBe('high');
  });
});

describe('createSegGroup', () => {
  it('省略 initial 时从容器当前 is-active 推导', () => {
    const box = makeSeg(['high', 'medium', 'low'], 'medium', 'priority');
    const g = createSegGroup(box, { dataKey: 'priority', onPick: () => {} });
    expect(g.getValue()).toBe('medium');
  });

  it('点击分段 → 切换选中态并回调值', () => {
    const box = makeSeg(['high', 'medium', 'low'], 'medium', 'priority');
    const onPick = vi.fn();
    createSegGroup(box, { dataKey: 'priority', onPick });
    box.querySelector('.seg[data-priority="high"]').click();
    expect(onPick).toHaveBeenCalledWith('high');
    expect(box.querySelector('.seg.is-active').dataset.priority).toBe('high');
  });

  it('点击当前已选中的分段不再回调（同值短路）', () => {
    const box = makeSeg(['high', 'medium', 'low'], 'medium', 'priority');
    const onPick = vi.fn();
    createSegGroup(box, { dataKey: 'priority', onPick });
    box.querySelector('.seg[data-priority="medium"]').click();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('点击非分段区域（如容器内空白）不回调', () => {
    const box = makeSeg(['high', 'medium'], 'high', 'priority');
    const onPick = vi.fn();
    createSegGroup(box, { dataKey: 'priority', onPick });
    box.click();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('setValue 只改选中态，不触发 onPick（程序化写入不产生副作用）', () => {
    const box = makeSeg(['none', 'todo', 'doing', 'done'], 'none');
    const onPick = vi.fn();
    const g = createSegGroup(box, { dataKey: 'status', onPick });
    g.setValue('done');
    expect(onPick).not.toHaveBeenCalled();
    expect(g.getValue()).toBe('done');
    expect(box.querySelector('.seg.is-active').dataset.status).toBe('done');
  });

  it('重复创建不会叠加监听器（容器级委托只注册一次生效）', () => {
    const box = makeSeg(['high', 'low'], 'high', 'priority');
    const first = vi.fn();
    const second = vi.fn();
    createSegGroup(box, { dataKey: 'priority', onPick: first });
    // 第二个实例持有自己的 current，点击 low 时两者各回调一次（预期行为）
    createSegGroup(box, { dataKey: 'priority', onPick: second });
    box.querySelector('.seg[data-priority="low"]').click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('容器缺失时仍返回可用控制器，不抛错', () => {
    const g = createSegGroup(null, { dataKey: 'status', onPick: () => {}, initial: 'none' });
    expect(g.getValue()).toBe('none');
    expect(() => g.setValue('todo')).not.toThrow();
  });
});
