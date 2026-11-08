// @vitest-environment jsdom
/**
 * property-row.test.js — 属性行（jsdom）
 *
 * 覆盖：两列结构、可选图标、hint、分隔线、用户内容只走 textContent。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPropDivider, createPropRow } from './property-row.js';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('createPropRow', () => {
  it('输出 prop-row 两列结构，data-key 落到行上', () => {
    const { row, val } = createPropRow({ key: 'status', label: '状态' });
    expect(row.className).toBe('prop-row');
    expect(row.dataset.key).toBe('status');
    expect(row.querySelector('.prop-key')).not.toBeNull();
    expect(row.querySelector('.prop-val')).toBe(val);
    expect(row.children).toHaveLength(2);
  });

  it('键列显示标签文字', () => {
    const { row } = createPropRow({ key: 'progress', label: '进度' });
    expect(row.querySelector('.prop-key-label').textContent).toBe('进度');
  });

  it('提供 icon 时前置装饰图标且对读屏隐藏', () => {
    const { row } = createPropRow({ key: 'status', label: '状态', icon: '⚙️' });
    const icon = row.querySelector('.prop-key-icon');
    expect(icon.textContent).toBe('⚙️');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('不提供 icon 时不产生图标节点', () => {
    const { row } = createPropRow({ key: 'x', label: 'X' });
    expect(row.querySelector('.prop-key-icon')).toBeNull();
  });

  it('hint 落到键列 title（自定义属性显示原始 key）', () => {
    const { keyEl } = createPropRow({ key: 'client', label: '客户', hint: 'client' });
    expect(keyEl.title).toBe('client');
  });

  it('标签里的 HTML 字符按文本渲染', () => {
    const { row } = createPropRow({ key: 'k', label: '<b>粗</b>' });
    expect(row.querySelector('.prop-key-label').textContent).toBe('<b>粗</b>');
    expect(row.querySelector('b')).toBeNull();
  });
});

describe('createPropDivider', () => {
  it('输出 hr.prop-divider', () => {
    const hr = createPropDivider();
    expect(hr.tagName).toBe('HR');
    expect(hr.className).toBe('prop-divider');
  });
});
