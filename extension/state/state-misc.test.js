/**
 * state-misc.test.js — settings / prop-library / actions / view-state
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setPort } from '../platform/index.js';
import { makePort, apiOk } from '../test-helpers.mjs';

let port;
beforeEach(() => {
  port = makePort();
  setPort(port);
});

describe('settings', () => {
  it('缺省值', async () => {
    const { getSettings } = await import('./settings.js');
    const s = await getSettings();
    expect(s.sync).toEqual({ enabled: false, provider: '', endpoint: '' });
    expect(s.ai.provider).toBe('local');
    expect(s.ai.inferMode).toBe('auto');
    expect(s.theme).toBe('auto');
  });
  it('局部合并保存', async () => {
    const { getSettings, saveSettings } = await import('./settings.js');
    await saveSettings({ ai: { inferMode: 'always' } });
    const s = await getSettings();
    expect(s.ai.inferMode).toBe('always');
    expect(s.ai.provider).toBe('local'); // 未动字段保留
  });
});

describe('prop-library', () => {
  it('upsert / remove / set / get', async () => {
    const lib = await import('./prop-library.js');
    lib.setPropLibrary({});
    expect(lib.getPropLibrary()).toEqual({});
    lib.upsertPropDef('a', { key: 'a' });
    expect(lib.getPropLibrary().a).toEqual({ key: 'a' });
    lib.removePropDef('a');
    expect(lib.getPropLibrary().a).toBeUndefined();
    lib.setPropLibrary(null);
    expect(lib.getPropLibrary()).toEqual({});
  });
  it('loadPropLibrary 从 host meta 拉取', async () => {
    const lib = await import('./prop-library.js');
    port._pushResponse(apiOk({ 客户: { key: '客户' } }));
    await lib.loadPropLibrary();
    expect(lib.getPropLibrary().客户).toEqual({ key: '客户' });
  });
  it('loadPropLibrary 离线时保持原值', async () => {
    const lib = await import('./prop-library.js');
    lib.setPropLibrary({ keep: 1 });
    setPort(makePort());
    await lib.loadPropLibrary();
    expect(lib.getPropLibrary()).toEqual({ keep: 1 });
  });
  it('savePropLibrary 先读后写（合并到 host 当前值）', async () => {
    const lib = await import('./prop-library.js');
    lib.setPropLibrary({ mine: { key: 'mine' } });
    port._pushResponse(apiOk({ existing: { key: 'existing' } })); // GET 基线
    port._pushResponse(apiOk(null));                              // PUT
    await lib.savePropLibrary();
    const gets = port.calls.filter((c) => c.kind === 'hostFetch' && c.method === 'GET');
    const put = port.calls.filter((c) => c.kind === 'hostFetch').at(-1);
    expect(gets.at(-1).path).toBe('/api/meta/propertyLibrary');
    expect(put.method).toBe('PUT');
    expect(put.path).toBe('/api/meta/propertyLibrary');
    expect(put.body).toMatchObject({ existing: { key: 'existing' }, mine: { key: 'mine' } });
  });

  it('savePropLibrary 离线抛错（不静默丢失）', async () => {
    const lib = await import('./prop-library.js');
    setPort(makePort());
    await expect(lib.savePropLibrary()).rejects.toThrow();
  });
});

describe('actions', () => {
  it('默认实现为 no-op（未注入时不抛错）', async () => {
    vi.resetModules();
    const { actions } = await import('./actions.js');
    expect(() => actions.refreshAll()).not.toThrow();
    expect(() => actions.openEditor()).not.toThrow();
    expect(() => actions.updateEditorDuration()).not.toThrow();
  });
});

describe('view-state', () => {
  it('初始字段完整；偏好从端口读取', async () => {
    vi.resetModules();
    const p = await import('../platform/index.js');
    p.setPort(makePort({ storage: { 'journal.viewMode': 'week', 'journal.poolLayout': 'list', 'journal.timelineSpan': 'full' } }));
    const { vs, monthOf } = await import('./view-state.js');
    expect(vs.viewMode).toBe('week');
    expect(vs.poolLayout).toBe('list');
    expect(vs.timelineSpan).toBe('full');
    expect(vs.selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(vs.weekAnchor).toBe(vs.selectedDate);
    expect(vs.poolStatusFilter).toBe('');
    expect(vs.savedViews).toEqual([]);
    expect(monthOf('2026-03-05')).toEqual({ year: 2026, month: 2 });
  });
  it('偏好缺失时回落默认值', async () => {
    vi.resetModules();
    const p = await import('../platform/index.js');
    p.setPort(makePort());
    const { vs } = await import('./view-state.js');
    expect(vs.viewMode).toBe('timeline');
    expect(vs.poolLayout).toBe('card');
    expect(vs.timelineSpan).toBe('default');
  });
});
