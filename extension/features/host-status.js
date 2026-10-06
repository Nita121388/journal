/**
 * host-status.js — 本机 host 状态与启动（features 层）
 *
 * 健康探测、header 状态灯、等待就绪、经 native messaging 启动 host。
 * 启动成功后经 actions.refreshAll() 让组合根重渲染。
 */

import { els } from '../components/dom-refs.js';
import { showToast } from './toast.js';
import { getPort } from '../platform/index.js';
import { DEFAULT_HOST_BASE, ROUTES } from '../shared/protocol.js';
import { actions } from '../state/actions.js';
import { pullFromHost } from '../state/sync-bridge.js';
const HOST_HEALTH_URL = `${DEFAULT_HOST_BASE}${ROUTES.health}`;

export async function checkHostHealth() {
  try {
    const res = await fetch(HOST_HEALTH_URL, { signal: AbortSignal.timeout(1200) });
    const data = await res.json();
    const online = data.ok || data.status === 'running';
    setHostStatus(online ? 'online' : 'offline');
    return online;
  } catch {
    setHostStatus('offline');
    return false;
  }
}

/** 切换 header 右上角 host 状态按钮外观 */
export function setHostStatus(status) {
  const btn = els.hostStatusBtn;
  if (!btn) return;
  btn.classList.toggle('is-online', status === 'online');
  btn.classList.toggle('is-offline', status === 'offline');
  btn.classList.toggle('is-starting', status === 'starting');
  btn.disabled = status === 'starting';
  if (status === 'online') {
    btn.textContent = '🟢';
    btn.title = 'Host 在线';
    btn.setAttribute('aria-label', 'Host 在线');
  } else if (status === 'offline') {
    btn.textContent = '🔴';
    btn.title = 'Host 未连接，点击启动';
    btn.setAttribute('aria-label', 'Host 未连接，点击启动');
  } else { // starting
    btn.textContent = '⏳';
    btn.title = '正在启动 Host…';
    btn.setAttribute('aria-label', '正在启动 Host…');
  }
}

export async function waitForHost(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkHostHealth()) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

export async function startHost() {
  if (!els.hostStatusBtn) return;
  setHostStatus('starting');
  try {
    const result = await getPort().startHost();
    if (!result?.ok) throw new Error(result?.error || 'Native Host 未注册，请先运行 host\\install-host.bat');
    const online = await waitForHost();
    if (!online) throw new Error('启动超时，请确认已运行 host\\install-host.bat');
    await pullFromHost();
    await actions.refreshAll();
    showToast('Host 已启动', 'success');
  } catch (e) {
    setHostStatus('offline');
    showToast(`启动失败：${e.message || '请先运行 host\\install-host.bat'}`, 'error');
  } finally {
    if (els.hostStatusBtn) els.hostStatusBtn.disabled = false;
  }
}
