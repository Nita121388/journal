// @vitest-environment jsdom
/**
 * icon.test.js — inline SVG 图标基元（jsdom）
 *
 * 覆盖：每个 name 都能生成合法 SVG、统一的 24 viewBox / 描边 / currentColor、
 * 装饰性语义（aria-hidden + focusable）、size/cls 覆盖、未知 name 的占位分支、
 * 以及「零外链」——离线与 MV3 CSP 下都不能有外部引用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ICONS, icon } from './icon.js';

/** design.md §3.1 的 26 个 + layout/list/grid（视图切换预留）。 */
const REQUIRED = [
  'menu', 'status', 'settings', 'plus', 'expand', 'range', 'calendar', 'week', 'month',
  'timeline', 'chevronLeft', 'chevronRight', 'search', 'filter', 'template', 'save', 'copy',
  'tag', 'folder', 'close', 'check', 'more', 'pin', 'sparkle', 'trash',
  'layout', 'list', 'grid',
];

const SVG_NS = 'http://www.w3.org/2000/svg';

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ICONS 表', () => {
  it('包含全部必需 name', () => {
    for (const name of REQUIRED) expect(Object.hasOwn(ICONS, name), `缺少图标 ${name}`).toBe(true);
  });

  it('key 数量 = 必需 name 数量（无多余无遗漏）', () => {
    expect(Object.keys(ICONS).length).toBe(REQUIRED.length);
  });

  it('每个条目都是「[tag, attrs] 描述符数组」而非字符串', () => {
    for (const [name, shapes] of Object.entries(ICONS)) {
      expect(Array.isArray(shapes), `${name} 应为数组`).toBe(true);
      expect(shapes.length, `${name} 至少一个图形`).toBeGreaterThan(0);
      for (const shape of shapes) {
        expect(Array.isArray(shape), `${name} 的形状应是 [tag, attrs]`).toBe(true);
        expect(typeof shape[0]).toBe('string');
        expect(typeof shape[1]).toBe('object');
      }
    }
  });
});

describe('icon()', () => {
  it('每个 name 都能生成 SVG 且含图形子节点', () => {
    for (const name of REQUIRED) {
      const svg = icon(name);
      expect(svg.tagName.toLowerCase(), name).toBe('svg');
      expect(svg.namespaceURI).toBe(SVG_NS);
      expect(svg.childNodes.length, `${name} 无图形`).toBeGreaterThan(0);
    }
  });

  it('统一 viewBox / 描边 / currentColor / 装饰性语义', () => {
    const svg = icon('menu');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.75');
    expect(svg.getAttribute('stroke-linecap')).toBe('round');
    expect(svg.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.classList.contains('icon')).toBe(true);
  });

  it('size 同时写入宽高（默认 20）', () => {
    expect(icon('plus').getAttribute('width')).toBe('20');
    expect(icon('plus').getAttribute('height')).toBe('20');
    const small = icon('plus', { size: 16 });
    expect(small.getAttribute('width')).toBe('16');
    expect(small.getAttribute('height')).toBe('16');
  });

  it('stroke 可覆盖；cls 追加到基类之后', () => {
    const svg = icon('plus', { stroke: 2, cls: 'nav-icon' });
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('class')).toBe('icon nav-icon');
  });

  it('不产生任何外链 / 外部引用（离线 + CSP 安全）', () => {
    const banned = new Set(['use', 'image', 'script', 'foreignobject']);
    for (const name of REQUIRED) {
      const svg = icon(name);
      // 注意：不能直接对 outerHTML 断言 http(s)，jsdom 序列化会带上 xmlns 命名空间 URL。
      for (const el of [svg, ...svg.querySelectorAll('*')]) {
        expect(banned.has(el.tagName.toLowerCase()), `${name} 含 <${el.tagName}>`).toBe(false);
        for (const attr of el.attributes) {
          const attrName = attr.name.toLowerCase();
          expect(attrName === 'href' || attrName.endsWith(':href'), `${name} 含外链属性 ${attr.name}`).toBe(false);
          expect(/^https?:/i.test(attr.value), `${name} 的 ${attr.name} 指向外链`).toBe(false);
        }
      }
    }
  });

  it('status 是实心圆点（fill=currentColor，不描边）', () => {
    const dot = icon('status').querySelector('circle');
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('fill')).toBe('currentColor');
    expect(dot.getAttribute('stroke')).toBe('none');
  });

  it('未知 name 退化为占位图形并 warn 一次（不 throw）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svg = icon('no-such-icon');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.childNodes.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledTimes(1);
    // 同一个笔误重复调用不再吵
    icon('no-such-icon');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
