// @vitest-environment jsdom
/**
 * gesture.test.js — 手势全局标志内核（jsdom）
 *
 * 覆盖不适合放进 dev-loop 的边界：标志写入/清除、幂等、嵌套、
 * 「回调抛错后标志仍被清除」（is-dragging 泄漏 = 轮询渲染永久跳过的核心防线）、
 * suppressNextClick 恰好吞一次 click。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeGestures,
  beginGesture,
  bindPointerDrag,
  endGesture,
  resetGestures,
  suppressNextClick,
} from './gesture.js';

/** jsdom 没有 PointerEvent，用 Event 冒充（只需 clientY/pointerId 等字段可枚举赋值）。 */
function pointerEvent(type, patch = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, clientY: 0, ...patch });
  return e;
}

/** 让 document 的 capture click 监听被调用（真实 click 派发路径）。 */
function clickOn(target) {
  const e = new Event('click', { bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  resetGestures();
  document.body.className = '';
  document.body.replaceChildren();
});

describe('beginGesture / endGesture', () => {
  it('写入 dataset.gesture + 迁移期旧 class', () => {
    beginGesture('drag');
    expect(document.body.dataset.gesture).toBe('drag');
    expect(document.body.classList.contains('is-dragging')).toBe(true);

    beginGesture('resize');
    expect(document.body.dataset.gesture).toBe('resize'); // 栈顶
    expect(document.body.classList.contains('is-resizing')).toBe(true);
  });

  it('结束时清除 dataset 与旧 class', () => {
    beginGesture('resize');
    endGesture('resize');
    expect(document.body.dataset.gesture).toBeUndefined();
    expect(document.body.classList.contains('is-resizing')).toBe(false);
  });

  it('endGesture 幂等：未开始/重复结束不抛、不残留', () => {
    expect(() => endGesture('drag')).not.toThrow();
    beginGesture('drag');
    endGesture('drag');
    expect(() => endGesture('drag')).not.toThrow();
    expect(document.body.dataset.gesture).toBeUndefined();
    expect(document.body.classList.contains('is-dragging')).toBe(false);
  });

  it('同 kind 嵌套：只按计数清，最后一层才清标志', () => {
    beginGesture('drag');
    beginGesture('drag');
    endGesture('drag');
    expect(document.body.dataset.gesture).toBe('drag');
    endGesture('drag');
    expect(document.body.dataset.gesture).toBeUndefined();
  });

  it('不同 kind 交错：栈顶反映出栈后的下一层', () => {
    beginGesture('drag');
    beginGesture('tpl-drag');
    expect(document.body.classList.contains('tpl-dragging')).toBe(true);
    endGesture('tpl-drag');
    expect(document.body.dataset.gesture).toBe('drag');
    expect(document.body.classList.contains('tpl-dragging')).toBe(false);
    expect(document.body.classList.contains('is-dragging')).toBe(true);
    endGesture('drag');
    expect(document.body.dataset.gesture).toBeUndefined();
  });

  it('pool-drag 只写 dataset，不写旧 class（原本就没有 body class）', () => {
    beginGesture('pool-drag');
    expect(document.body.dataset.gesture).toBe('pool-drag');
    expect(document.body.className).toBe('');
    endGesture('pool-drag');
    expect(document.body.dataset.gesture).toBeUndefined();
  });

  it('未登记的 kind 被忽略（不污染 dataset）', () => {
    beginGesture('nope');
    expect(document.body.dataset.gesture).toBeUndefined();
    expect(activeGestures()).toEqual([]);
  });

  it('activeGestures 返回栈快照（改副本不影响内部状态）', () => {
    beginGesture('drag');
    const snap = activeGestures();
    snap.push('resize');
    expect(activeGestures()).toEqual(['drag']);
  });
});

describe('bindPointerDrag', () => {
  it('onStart/onMove/onEnd 按序调用，结束后标志清除', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const calls = [];
    bindPointerDrag(el, {
      gestureKind: 'drag',
      onStart: () => calls.push('start'),
      onMove: () => calls.push('move'),
      onEnd: () => calls.push('end'),
    });

    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(document.body.dataset.gesture).toBe('drag');
    el.dispatchEvent(pointerEvent('pointermove'));
    el.dispatchEvent(pointerEvent('pointerup'));

    expect(calls).toEqual(['start', 'move', 'end']);
    expect(document.body.dataset.gesture).toBeUndefined();
    expect(document.body.classList.contains('is-dragging')).toBe(false);
  });

  it('onEnd 抛错后 endGesture 仍被调用（finally 自愈）', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bindPointerDrag(el, {
      gestureKind: 'resize',
      onEnd: () => { throw new Error('boom'); },
    });

    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(document.body.classList.contains('is-resizing')).toBe(true);

    el.dispatchEvent(pointerEvent('pointerup'));
    expect(errSpy).toHaveBeenCalled(); // 留痕，但不冒泡成未处理异常
    expect(document.body.dataset.gesture).toBeUndefined();
    expect(document.body.classList.contains('is-resizing')).toBe(false);
  });

  it('onMove 抛错时中止手势并清除标志（不留悬挂监听）', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onMove = vi.fn(() => { throw new Error('move-boom'); });
    const onEnd = vi.fn();
    bindPointerDrag(el, { gestureKind: 'drag', onMove, onEnd });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointermove'));
    expect(document.body.classList.contains('is-dragging')).toBe(false);

    // 已中止：后续 up 不再触发 onEnd/任何标志写入
    el.dispatchEvent(pointerEvent('pointerup'));
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('pointercancel 走同一收尾路径', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onEnd = vi.fn();
    bindPointerDrag(el, { gestureKind: 'drag', onEnd });

    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointercancel'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.gesture).toBeUndefined();
  });

  it('shouldStart 返回 false 时不开始手势', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onStart = vi.fn();
    bindPointerDrag(el, { gestureKind: 'drag', onStart, shouldStart: () => false });

    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(onStart).not.toHaveBeenCalled();
    expect(document.body.dataset.gesture).toBeUndefined();
  });

  it('重复 pointerdown 不叠加标志（第二次在途时忽略）', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onStart = vi.fn();
    bindPointerDrag(el, { gestureKind: 'drag', onStart });

    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(onStart).toHaveBeenCalledTimes(1);
    // 计数为 1：一次 up 即清干净
    el.dispatchEvent(pointerEvent('pointerup'));
    expect(document.body.dataset.gesture).toBeUndefined();
  });

  it('suppressClickOnEnd 支持函数形式（条件抑制）', () => {
    const el = document.createElement('div');
    document.body.append(el);
    let moved = false;
    bindPointerDrag(el, { suppressClickOnEnd: () => moved });

    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointerup'));
    const first = clickOn(el);
    expect(first.defaultPrevented).toBe(false); // 未抑制 → click 照常

    moved = true;
    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointerup'));
    const onEl = vi.fn();
    el.addEventListener('click', onEl);
    clickOn(el);
    expect(onEl).not.toHaveBeenCalled(); // 被吞：capture 阶段 stopPropagation
  });

  it('解绑后不再响应 pointerdown', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onStart = vi.fn();
    const unbind = bindPointerDrag(el, { gestureKind: 'drag', onStart });
    unbind();
    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('suppressNextClick', () => {
  it('恰好吞掉一次 click，第二次放行', () => {
    const el = document.createElement('button');
    const handler = vi.fn();
    el.addEventListener('click', handler);
    document.body.append(el);

    suppressNextClick(el);
    clickOn(el);
    expect(handler).not.toHaveBeenCalled();

    clickOn(el);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('标记元素的子节点上的 click 也算命中（原实现靠冒泡，语义等同）', () => {
    const el = document.createElement('div');
    const child = document.createElement('span');
    el.append(child);
    document.body.append(el);
    const onEl = vi.fn();
    el.addEventListener('click', onEl);

    suppressNextClick(el);
    clickOn(child);
    expect(onEl).not.toHaveBeenCalled();
    clickOn(child);
    expect(onEl).toHaveBeenCalledTimes(1);
  });

  it('不吞原生交互控件上的 click（页脚按钮有自己的语义）', () => {
    const card = document.createElement('div');
    const btn = document.createElement('button');
    card.append(btn);
    document.body.append(card);
    const onBtn = vi.fn();
    btn.addEventListener('click', onBtn);

    suppressNextClick(card);
    clickOn(btn);
    expect(onBtn).toHaveBeenCalledTimes(1);
  });

  it('未标记的元素不受影响', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const handler = vi.fn();
    el.addEventListener('click', handler);
    clickOn(el);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
