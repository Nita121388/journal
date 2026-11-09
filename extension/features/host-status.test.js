// @vitest-environment jsdom
/**
 * host-status.test.js — host 状态机的转移与渲染（P5）
 *
 * 守住：
 *   - 初始态是 unknown，**绝不**默认渲染成「在线」（半死 host 会静默吞数据）；
 *   - online ⇄ offline 的类名/文案/横幅跟随；starting 时两个入口按钮 disabled；
 *   - `data-host-state` 与内部状态一致（dev-loop 的观测点）；
 *   - 转移表自检通过；未声明事件不抛、保持原状态。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildDom() {
  document.body.innerHTML = `
    <button id="btn-host-status" data-icon="status"></button>
    <div id="host-banner" class="host-banner hidden">
      <span class="host-banner-text"></span>
      <button id="host-banner-start"></button>
    </div>`;
}

let mod;
let btn;
let banner;
let bannerText;
let bannerStart;

beforeEach(async () => {
  vi.resetModules(); // 重新执行模块：hostState 回到 initial
  buildDom();
  btn = document.getElementById('btn-host-status');
  banner = document.getElementById('host-banner');
  bannerText = document.querySelector('.host-banner-text');
  bannerStart = document.getElementById('host-banner-start');
  mod = await import('./host-status.js');
});

describe('HOST_MACHINE', () => {
  it('转移表自检通过', () => {
    return import('../shared/fsm.js').then(({ assertMachine }) => {
      expect(assertMachine(mod.HOST_MACHINE)).toEqual([]);
    });
  });

  it('初始态是 unknown', () => {
    expect(mod.getHostState()).toBe('unknown');
  });
});

describe('setHostStatus 渲染等价', () => {
  it('unknown 不渲染成在线（硬约束）', () => {
    mod.setHostStatus('online');
    expect(btn.dataset.hostState).toBe('online');

    // 非约定状态名 = 尚未判定 → 必须回到 unknown，而不是沿用 online
    mod.setHostStatus('bogus');
    expect(mod.getHostState()).toBe('unknown');
    expect(btn.dataset.hostState).toBe('unknown');
    expect(btn.classList.contains('is-online')).toBe(false);
    expect(btn.classList.contains('is-unknown')).toBe(true);
    expect(btn.title).toBe('Host 状态：检测中');
    expect(banner.classList.contains('hidden')).toBe(false);
    expect(bannerText.textContent).toBe('正在检查本机服务…');
  });

  it('online → offline：类名/可读名/横幅同步', () => {
    mod.setHostStatus('online');
    expect(btn.classList.contains('is-online')).toBe(true);
    expect(banner.classList.contains('hidden')).toBe(true);

    mod.setHostStatus('offline');
    expect(mod.getHostState()).toBe('offline');
    expect(btn.dataset.hostState).toBe('offline');
    expect(btn.classList.contains('is-offline')).toBe(true);
    expect(btn.classList.contains('is-online')).toBe(false);
    expect(btn.getAttribute('aria-label')).toBe('Host 未连接，点击启动');
    expect(banner.classList.contains('hidden')).toBe(false);
    expect(bannerText.textContent).toBe('本机服务未连接，改动不会保存');
  });

  it('starting：状态灯与横幅按钮都 disabled，横幅给启动反馈', () => {
    mod.setHostStatus('offline');
    mod.setHostStatus('starting');
    expect(btn.dataset.hostState).toBe('starting');
    expect(btn.classList.contains('is-starting')).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(bannerStart.disabled).toBe(true);
    expect(bannerText.textContent).toBe('正在启动本机服务…');
  });

  it('starting → online：启动完成后恢复可点', () => {
    mod.setHostStatus('starting');
    mod.setHostStatus('online');
    expect(mod.getHostState()).toBe('online');
    expect(btn.disabled).toBe(false);
    expect(banner.classList.contains('hidden')).toBe(true);
  });

  it('未声明的转移（starting 再发 starting）：保持原状态且不抛', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    mod.setHostStatus('starting');
    mod.setHostStatus('starting');
    expect(mod.getHostState()).toBe('starting');
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it('缺 DOM 节点时 setHostStatus 静默 no-op（不抛）', async () => {
    vi.resetModules();
    document.body.replaceChildren();
    const fresh = await import('./host-status.js');
    expect(() => fresh.setHostStatus('online')).not.toThrow();
    expect(fresh.getHostState()).toBe('online');
  });
});
