/**
 * protocol.test.js — 前后端契约常量
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_HOST_PORT, DEFAULT_HOST_BASE, ROUTES, routes, META_KINDS, MESSAGES } from './protocol.js';

describe('host 基址', () => {
  it('端口与基址一致', () => {
    expect(DEFAULT_HOST_PORT).toBe(8766);
    expect(DEFAULT_HOST_BASE).toBe(`http://127.0.0.1:${DEFAULT_HOST_PORT}`);
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
