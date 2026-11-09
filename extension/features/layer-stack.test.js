// @vitest-environment jsdom
/**
 * layer-stack.test.js — 浮层栈唯一所有者（Esc / 外点统一派发）
 *
 * 守住：栈顶优先、重复 id 去重、Esc 只关栈顶且不吞空栈事件、外点只关允许外点关闭的层。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { layers, popLayer, pushLayer, resetLayers } from './layer-stack.js';

/** 派发 Esc（冒泡到 window，capture 派发器能收到） */
function pressEscape() {
  const ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.body.dispatchEvent(ev);
  return ev;
}

/** 派发一次外点 mousedown（target = node） */
function pressDown(node) {
  const ev = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  node.dispatchEvent(ev);
  return ev;
}

/** 新建一个挂在 body 下的浮层元素（带一个内部子节点） */
function makeOverlay() {
  const el = document.createElement('div');
  const inner = document.createElement('button');
  el.append(inner);
  document.body.append(el);
  return { el, inner };
}

afterEach(() => {
  resetLayers();
  document.body.replaceChildren();
});

describe('pushLayer / popLayer', () => {
  it('栈底 → 栈顶顺序与只读快照', () => {
    pushLayer({ id: 'a', close: () => {} });
    pushLayer({ id: 'b', close: () => {} });
    expect(layers().map((l) => l.id)).toEqual(['a', 'b']);
    // 快照是副本：改它不影响栈
    layers().pop();
    expect(layers().map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('重复 id：先出栈旧的再压入新的，栈内 id 唯一', () => {
    pushLayer({ id: 'a', close: () => {} });
    pushLayer({ id: 'b', close: () => {} });
    pushLayer({ id: 'a', close: () => {} });
    const ids = layers().map((l) => l.id);
    expect(ids.filter((x) => x === 'a')).toHaveLength(1);
    expect(ids[ids.length - 1]).toBe('a'); // 新的 a 在栈顶
  });

  it('popLayer(id) 按标识出栈（幂等）；缺省出栈顶', () => {
    pushLayer({ id: 'a', close: () => {} });
    pushLayer({ id: 'b', close: () => {} });
    popLayer('a');
    expect(layers().map((l) => l.id)).toEqual(['b']);
    popLayer('nope');
    popLayer();
    expect(layers()).toHaveLength(0);
    popLayer(); // 空栈再 pop 不抛
  });
});

describe('统一 Esc', () => {
  it('只关栈顶、不关下一层，且不穿透到 document 监听', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    pushLayer({ id: 'a', close: closeA, dismissOnOutsideClick: false });
    pushLayer({ id: 'b', close: closeB, dismissOnOutsideClick: false });
    const docListener = vi.fn();
    document.addEventListener('keydown', docListener);

    const ev = pressEscape();

    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    expect(docListener).not.toHaveBeenCalled(); // stopPropagation 生效

    document.removeEventListener('keydown', docListener);
  });

  it('栈空时 Esc 不被拦截（不 preventDefault、继续冒泡）', () => {
    const docListener = vi.fn();
    document.addEventListener('keydown', docListener);
    const ev = pressEscape();
    expect(ev.defaultPrevented).toBe(false);
    expect(docListener).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', docListener);
  });

  it('Esc 关掉栈顶后，再按一次关下一层', () => {
    const closeA = vi.fn(() => popLayer('a'));
    const closeB = vi.fn(() => popLayer('b'));
    pushLayer({ id: 'a', close: closeA, dismissOnOutsideClick: false });
    pushLayer({ id: 'b', close: closeB, dismissOnOutsideClick: false });
    pressEscape();
    pressEscape();
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(layers()).toHaveLength(0);
  });
});

describe('统一外点', () => {
  it('点浮层外关闭栈顶；点内部不关；点 ignore 元素不关', () => {
    const { el, inner } = makeOverlay();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const close = vi.fn();
    pushLayer({ id: 'menu', el, close, ignore: [trigger] });

    pressDown(inner);
    expect(close).not.toHaveBeenCalled();

    pressDown(trigger);
    expect(close).not.toHaveBeenCalled();

    pressDown(document.body);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('dismissOnOutsideClick=false 的模态层不被外点关闭（遮罩自身 click 另管）', () => {
    const { el } = makeOverlay();
    const close = vi.fn();
    pushLayer({ id: 'modal', el, close, dismissOnOutsideClick: false });
    pressDown(document.body);
    expect(close).not.toHaveBeenCalled();
  });

  it('栈非空但栈顶不允许外点关闭时，不连带关掉下层', () => {
    const closeA = vi.fn();
    pushLayer({ id: 'a', close: closeA, dismissOnOutsideClick: true });
    pushLayer({ id: 'b', close: vi.fn(), dismissOnOutsideClick: false });
    pressDown(document.body);
    expect(closeA).not.toHaveBeenCalled();
  });

  it('close 出栈后（closeX 模式）再次外点不会重复触发', () => {
    const close = vi.fn(() => popLayer('x'));
    pushLayer({ id: 'x', el: null, close });
    pressDown(document.body);
    pressDown(document.body);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
