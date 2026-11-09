// @vitest-environment jsdom
/**
 * version-badge.test.js — 版本徽标（jsdom）
 */

import { describe, expect, it } from 'vitest';
import { formatVersion, renderVersionBadge } from './version-badge.js';

describe('formatVersion', () => {
  it('拼出 label 与 title（name · vX.Y.Z · version_name）', () => {
    const r = formatVersion({ name: 'Journal (dev)', version: '0.2.0', version_name: '0.2.0 Quiet Desk' });
    expect(r.label).toBe('v0.2.0');
    expect(r.title).toBe('Journal (dev) · v0.2.0 · 0.2.0 Quiet Desk');
  });

  it('无 version_name / name 时不产生空分隔符', () => {
    expect(formatVersion({ version: '0.2.0' }).title).toBe('v0.2.0');
  });

  it('manifest 缺失时返回空 label（不抛错）', () => {
    expect(formatVersion(null)).toEqual({ label: '', title: '' });
    expect(formatVersion(undefined).label).toBe('');
  });

  it('version 为空白字符串时视为无版本', () => {
    expect(formatVersion({ version: '   ' }).label).toBe('');
  });
});

describe('renderVersionBadge', () => {
  it('写入 textContent 与 title，并显示元素', () => {
    const el = document.createElement('small');
    el.hidden = true;
    renderVersionBadge(el, { name: 'Journal', version: '0.2.0', version_name: 'Quiet Desk' });
    expect(el.textContent).toBe('v0.2.0');
    expect(el.title).toBe('Journal · v0.2.0 · Quiet Desk');
    expect(el.hidden).toBe(false);
  });

  it('无版本时隐藏元素而不是留空', () => {
    const el = document.createElement('small');
    renderVersionBadge(el, null);
    expect(el.textContent).toBe('');
    expect(el.hidden).toBe(true);
  });

  it('挂载点缺失时静默跳过', () => {
    expect(() => renderVersionBadge(null, { version: '0.2.0' })).not.toThrow();
  });
});
