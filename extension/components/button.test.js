// @vitest-environment jsdom
/**
 * button.test.js — 按钮基元（jsdom）
 *
 * 覆盖：4 变体 × 3 尺寸的类名/data 契约、图标插槽、label 只经 textContent、
 * iconButton 的 aria-label 硬要求、onClick 仅在传入时绑定、pressed/disabled 透传。
 * 五态（hover/active/focus-visible/disabled/aria-pressed）的视觉由 CSS 承担，
 * 这里只保证 DOM 侧的钩子齐全。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, iconButton } from './button.js';

const VARIANTS = ['solid', 'outline', 'quiet', 'ghost'];
const SIZES = ['xs', 'sm', 'md'];

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('button()', () => {
  it('默认 quiet / sm：类名与 data 属性同步', () => {
    const el = button({ label: '新建' });
    expect(el.tagName).toBe('BUTTON');
    expect(el.type).toBe('button');
    expect(el.className).toBe('btn btn-quiet btn-sm');
    expect(el.dataset.variant).toBe('quiet');
    expect(el.dataset.size).toBe('sm');
  });

  it('4 变体 × 3 尺寸都能生成正确契约', () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        const el = button({ label: 'x', variant, size });
        expect(el.classList.contains(`btn-${variant}`), `${variant}`).toBe(true);
        expect(el.classList.contains(`btn-${size}`), `${size}`).toBe(true);
        expect(el.dataset.variant).toBe(variant);
        expect(el.dataset.size).toBe(size);
      }
    }
  });

  it('传 icon 时前置一个装饰性 SVG（aria-hidden）', () => {
    const el = button({ label: '新建', icon: 'plus' });
    const svg = el.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    // 图标在文本之前
    expect(el.firstElementChild.tagName.toLowerCase()).toBe('svg');
    expect(el.querySelector('.btn-label').textContent).toBe('新建');
  });

  it('iconButton 图标 16px；button 的 icon 18px；xs 档再降一档', () => {
    expect(button({ label: 'a', icon: 'plus' }).querySelector('svg').getAttribute('width')).toBe('18');
    expect(button({ label: 'a', icon: 'plus', size: 'xs' }).querySelector('svg').getAttribute('width')).toBe('16');
    expect(iconButton({ name: 'menu', label: '菜单' }).querySelector('svg').getAttribute('width')).toBe('16');
    expect(iconButton({ name: 'menu', label: '菜单', size: 'xs' }).querySelector('svg').getAttribute('width')).toBe('14');
  });

  it('label 只经 textContent 写入（HTML 不解析）', () => {
    const el = button({ label: '<img src=x onerror=alert(1)>' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('无 label 时不产生 .btn-label（纯图标容器由 iconButton 负责）', () => {
    expect(button({ icon: 'plus' }).querySelector('.btn-label')).toBeNull();
  });

  it('onClick 仅在传入时绑定', () => {
    const onClick = vi.fn();
    const withHandler = button({ label: 'a', onClick });
    withHandler.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const noHandler = button({ label: 'b' });
    expect(() => noHandler.click()).not.toThrow();
  });

  it('pressed / disabled / title / ariaLabel 透传', () => {
    const el = button({ label: '范围', pressed: true, disabled: true, title: '时间范围', ariaLabel: '设置范围' });
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.disabled).toBe(true);
    expect(el.title).toBe('时间范围');
    expect(el.getAttribute('aria-label')).toBe('设置范围');
  });

  it('未传 pressed 时不写 aria-pressed（避免谎报切换型控件）', () => {
    expect(button({ label: 'a' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('未知变体/尺寸回落并 warn（不 throw）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = button({ label: 'a', variant: 'neon', size: 'huge' });
    expect(el.dataset.variant).toBe('quiet');
    expect(el.dataset.size).toBe('sm');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('iconButton()', () => {
  it('4 变体 × 3 尺寸 + 必有 aria-label 与 btn-icon 钩子', () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        const el = iconButton({ name: 'settings', label: '设置', variant, size });
        expect(el.classList.contains('btn-icon')).toBe(true);
        expect(el.dataset.variant).toBe(variant);
        expect(el.dataset.size).toBe(size);
        expect(el.getAttribute('aria-label')).toBe('设置');
        expect(el.querySelector('svg')).not.toBeNull();
      }
    }
  });

  it('默认 ghost / sm', () => {
    const el = iconButton({ name: 'menu', label: '菜单' });
    expect(el.dataset.variant).toBe('ghost');
    expect(el.dataset.size).toBe('sm');
  });

  it('缺少 label 直接报错（无障碍是硬门）', () => {
    expect(() => iconButton({ name: 'menu' })).toThrow(/aria-label/);
  });

  it('纯空白 label 同样报错（aria-label="   " 对读屏等于无名）', () => {
    expect(() => iconButton({ name: 'menu', label: '   ' })).toThrow(/aria-label/);
    expect(() => iconButton({ name: 'menu', label: '\t\n' })).toThrow(/aria-label/);
  });

  it('onClick / pressed 透传；按钮本身无文本节点', () => {
    const onClick = vi.fn();
    const el = iconButton({ name: 'more', label: '更多', onClick, pressed: false });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(el.getAttribute('aria-pressed')).toBe('false');
    expect(el.textContent.trim()).toBe('');
  });
});
