/**
 * host-status.js — 本机 host 状态与启动（features 层）
 *
 * 健康探测、header 状态灯、等待就绪、经 native messaging 启动 host。
 * 启动成功后经 actions.refreshAll() 让组合根重渲染。
 */

import { els } from '../components/dom-refs.js';
import { showToast } from './toast.js';
import { getPort } from '../platform/index.js';
import { ROUTES } from '../shared/protocol.js';
import { actions } from '../state/actions.js';
import { pullFromHost } from '../state/sync-bridge.js';
import { withBusy } from './busy.js';
import { assertMachine, defineMachine, transition } from '../shared/fsm.js';

/**
 * host 连接状态机（P5 收编「stringly if 链」）。
 *
 * 转移表按**现有调用路径**定：健康探测（checkHostHealth）在任何状态下都可能
 * 落 ONLINE/OFFLINE（host 可能被外部杀掉或拉起，UI 必须无条件跟随）；
 * STARTING 来自 startHost（状态灯/离线横幅的点击都不判当前状态），
 * 所以 online 也必须允许 STARTING —— 否则点状态灯启动会出现「状态灯不更新」。
 * 自环（同事件重复发）合法且无操作，保证重复探测幂等。
 */
export const HOST_MACHINE = defineMachine({
  id: 'host',
  initial: 'unknown',
  states: {
    unknown: { ONLINE: 'online', OFFLINE: 'offline', STARTING: 'starting' },
    online: { ONLINE: 'online', OFFLINE: 'offline', STARTING: 'starting' },
    offline: { OFFLINE: 'offline', STARTING: 'starting' },
    starting: { ONLINE: 'online', OFFLINE: 'offline' },
  },
});

// 开发期自检：转移表写错（漏 initial / 悬空目标）只留痕，不阻断侧栏启动。
for (const err of assertMachine(HOST_MACHINE)) console.error('[journal]', err);

/** 对外状态字符串 → 事件名（setHostStatus 的入参是状态名，见下方兼容说明）。 */
const STATUS_EVENT = { online: 'ONLINE', offline: 'OFFLINE', starting: 'STARTING' };

/** 当前 host 状态（模块内单一真源；DOM 上的 `data-host-state` 是它的只读镜像）。 */
let hostState = HOST_MACHINE.initial;

/**
 * 当前 host 状态（unknown|online|offline|starting）—— dev-loop / 调试断言用。
 * @returns {string}
 */
export function getHostState() {
  return hostState;
}

export async function checkHostHealth() {
  try {
    // 经端口契约探测（不再裸 fetch）：桌面版/测试可替换传输层
    const r = await getPort().hostFetch('GET', ROUTES.health);
    const d = r.ok ? r.data : null;
    const online = Boolean(d && (d.ok || d.status === 'running'));
    setHostStatus(online ? 'online' : 'offline');
    return online;
  } catch {
    setHostStatus('offline');
    return false;
  }
}

/**
 * 切换 host 状态。对外签名保持「传状态名」(online|offline|starting)，
 * 内部映射成事件并经 {@link HOST_MACHINE} 转移，再渲染结果态。
 * 行为等价：现有调用路径的转移全部在表里，渲染逻辑逐字搬自旧实现。
 * @param {'online'|'offline'|'starting'} status
 */
export function setHostStatus(status) {
  const event = STATUS_EVENT[status];
  hostState = event
    ? transition(HOST_MACHINE, hostState, event).state
    : 'unknown'; // 非约定状态名 = 尚未判定，走 unknown 渲染（与旧代码同一分支）
  renderHostStatus(hostState);
}

/** 把状态渲染到状态灯 + 离线横幅（唯一 DOM 写入口）。 */
function renderHostStatus(status) {
  const btn = els.hostStatusBtn;
  if (!btn) return;
  // 观测约定：dev-loop 可断言 `[data-host-state]`，不必去猜 class 组合
  btn.dataset.hostState = status;
  btn.classList.toggle('is-online', status === 'online');
  btn.classList.toggle('is-offline', status === 'offline');
  btn.classList.toggle('is-starting', status === 'starting');
  // unknown = 尚未判定（探测中 / 超时前）。**绝不能**默认渲染成「在线」：
  // 半死 host（accept 但不回包）会让 UI 显示绿灯却什么都存不下。
  btn.classList.toggle('is-unknown',
    status !== 'online' && status !== 'offline' && status !== 'starting');
  btn.disabled = status === 'starting';
  // 图标本身是 SVG（`data-icon="status"`，实心圆点填充 currentColor），
  // 颜色只是附加信号，可读名称必须同步到 title / aria-label（状态不只靠颜色），
  // 所以这里**不写** btn.textContent（写了会把注入的 SVG 抹掉）。
  if (status === 'online') {
    btn.title = 'Host 在线';
    btn.setAttribute('aria-label', 'Host 在线');
  } else if (status === 'offline') {
    btn.title = 'Host 未连接，点击启动';
    btn.setAttribute('aria-label', 'Host 未连接，点击启动');
  } else if (status === 'starting') {
    btn.title = '正在启动 Host';
    btn.setAttribute('aria-label', '正在启动 Host');
  } else { // unknown：未判定
    btn.title = 'Host 状态：检测中';
    btn.setAttribute('aria-label', 'Host 状态：检测中');
  }
  // 离线横幅：持久提示（不是瞬时 toast），并在「启动中」可看到反馈
  if (els.hostBanner) {
    els.hostBanner.classList.toggle('hidden', status === 'online');
    const label = els.hostBanner.querySelector('.host-banner-text');
    if (label) {
      label.textContent = status === 'starting'
        ? '正在启动本机服务…'
        : status === 'unknown'
          ? '正在检查本机服务…'
          : '本机服务未连接，改动不会保存';
    }
    if (els.hostBannerStart) els.hostBannerStart.disabled = status === 'starting';
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

/**
 * 启动 host（withBusy 入口守卫 + 按钮 disabled 双保险：
 * disabled 挡鼠标连点，withBusy 挡绕过 disabled 的直调路径 —— 启动中重复触发
 * 只会返回进行中的同一个 promise，不会并发跑两遍 native 启动）。
 */
export function startHost() {
  return withBusy('host.start', doStartHost);
}

async function doStartHost() {
  if (!els.hostStatusBtn) return;
  setHostStatus('starting');
  try {
    const result = await getPort().startHost();
    if (!result?.ok) throw new Error(result?.error || 'Native Host 未注册，请先运行 host\\deploy-host.ps1');
    const online = await waitForHost();
    if (!online) throw new Error('启动超时，请确认已运行 host\\deploy-host.ps1（并检查端口未被占用）');
    await pullFromHost();
    await actions.refreshAll();
    showToast('Host 已启动', 'success');
  } catch (e) {
    setHostStatus('offline');
    showToast(`启动失败：${e.message || '请先运行 host\\deploy-host.ps1'}`, 'error');
  } finally {
    if (els.hostStatusBtn) els.hostStatusBtn.disabled = false;
  }
}
