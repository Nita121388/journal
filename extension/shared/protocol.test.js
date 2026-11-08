/**
 * protocol.test.js — 前后端契约常量
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_HOST_PORT, DEFAULT_HOST_BASE, NATIVE_HOST_NAME, ROUTES, routes, META_KINDS, MESSAGES } from './protocol.js';

describe('host 基址', () => {
  it('端口属于已注册的两个变体之一', () => {
    // prod(main)=8765 / dev(dev-local)=8766。
    // 不要在这里写死单个值：main 分支的 protocol.js 是 8765，写死 8766 会让 main 的测试变红。
    expect([8765, 8766]).toContain(DEFAULT_HOST_PORT);
    expect(DEFAULT_HOST_BASE).toBe(`http://127.0.0.1:${DEFAULT_HOST_PORT}`);
  });

  it('native host 名与端口同源分叉', () => {
    // 端口和 host 名必须成对，否则 dev 扩展会去拉起 prod 的启动器（反之亦然）。
    expect(NATIVE_HOST_NAME).toBe(
      DEFAULT_HOST_PORT === 8766 ? 'com.journal.host.dev' : 'com.journal.host',
    );
  });
});

describe('ROUTES', () => {
  it('全部以 /api/ 开头且冻结', () => {
    for (const v of Object.values(ROUTES)) expect(v.startsWith('/api/')).toBe(true);
    expect(Object.isFrozen(ROUTES)).toBe(true);
  });
  it('包含关键端点', () => {
    expect(ROUTES.cards).toBe('/api/cards');
    expect(ROUTES.health).toBe('/api/health');
    expect(ROUTES.syncNow).toBe('/api/sync/now');
  });
});

describe('动态路由', () => {
  it('编码参数', () => {
    expect(routes.card('c 1')).toBe('/api/cards/c%201');
    expect(routes.journal('2026-01-01')).toBe('/api/journals/2026-01-01');
    expect(routes.todo('t1')).toBe('/api/todos/t1');
    expect(routes.meta('templates')).toBe('/api/meta/templates');
  });
});

describe('META_KINDS / MESSAGES', () => {
  it('与 host /api/meta/:kind 对齐', () => {
    expect([...META_KINDS]).toEqual(['savedViews', 'propertyLibrary', 'templates']);
  });
  it('消息类型命名空间', () => {
    expect(MESSAGES.startHost).toBe('journal:start-host');
  });
});
