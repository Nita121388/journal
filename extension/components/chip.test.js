// @vitest-environment jsdom
/**
 * chip.test.js — 标签 chip（jsdom）
 *
 * 覆盖：可删除 / 只读两态、× 符号不进文本节点、点击只触发删除、选中态、DOM 契约。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChip } from './chip.js';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('createChip', () => {
  it('可删除时输出 button.tag-chip.chip-atom，文本不含 ×', () => {
    const el = createChip({ label: 'work', onRemove: () => {} });
    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toContain('tag-chip');
    expect(el.className).toContain('chip-atom');
    expect(el.classList.contains('is-static')).toBe(false);
    // × 必须是独立元素，不能被拼进文本（读屏会念「乘号」）
    expect(el.querySelector('.chip-label').textContent).toBe('work');
    expect(el.querySelector('.chip-x').textContent).toBe('×');
    expect(el.querySelector('.chip-x').getAttribute('aria-hidden')).toBe('true');
  });

  it('可删除时 aria-label 说明删除语义', () => {
    const el = createChip({ label: 'work', onRemove: () => {} });
    expect(el.getAttribute('aria-label')).toBe('移除标签 work');
  });

  it('点击触发 onRemove 且阻止冒泡（不误触父级选择）', () => {
    const onRemove = vi.fn();
    const parent = vi.fn();
    const wrap = document.createElement('div');
    wrap.addEventListener('click', parent);
    const el = createChip({ label: 'x', onRemove });
    wrap.append(el);
    document.body.append(wrap);
    el.click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });

  it('只读态（static）输出 span 而非 button，不加删除符号', () => {
    const onRemove = vi.fn();
    const el = createChip({ label: 'done', onRemove, static: true });
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('is-static')).toBe(true);
    expect(el.querySelector('.chip-x')).toBeNull();
    el.click();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('未提供 onRemove 时自动降级为只读 span', () => {
    const el = createChip({ label: 'plain' });
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('is-static')).toBe(true);
    expect(el.querySelector('.chip-x')).toBeNull();
  });

  it('active 时加 is-active；title 透传', () => {
    const el = createChip({ label: 'a', active: true, title: '提示' });
    expect(el.classList.contains('is-active')).toBe(true);
    expect(el.title).toBe('提示');
  });

  it('用户内容只经 textContent 写入（不解析 HTML）', () => {
    const el = createChip({ label: '<img src=x onerror=1>' });
    expect(el.querySelector('.chip-label').textContent).toBe('<img src=x onerror=1>');
    expect(el.querySelector('img')).toBeNull();
  });
});
