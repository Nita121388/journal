/**
 * named-view.js — 命名视图（保存/载入筛选组合）（views 层）
 *
 * 命名视图存 host meta `savedViews`；应用视图即写入 vs 的筛选字段并重渲染卡片池。
 */

import { els } from '../components/dom-refs.js';
import { promptDialog } from '../features/dialog.js';
import { runWrite, showToast } from '../features/toast.js';
import { getPort } from '../platform/index.js';
import { getHostMeta, updateHostMeta } from '../state/host-client.js';
import { vs } from '../state/view-state.js';
import { renderCardPool } from './pool.js';

export async function loadPoolViews() {
  // host 离线时保留已有内存列表（不拿空值覆盖）
  const saved = await getHostMeta('savedViews');
  if (Array.isArray(saved)) vs.savedViews = saved;
  const sel = els.viewSelect;
  if (!sel) return;
  sel.replaceChildren();
  const optAll = document.createElement('option');
  optAll.value = ''; optAll.textContent = '全部卡片';
  sel.append(optAll);
  for (const v of vs.savedViews) {
    const o = document.createElement('option');
    o.value = v.id; o.textContent = v.name;
    sel.append(o);
  }
  sel.value = vs.activeViewId;
}

/** 把当前筛选 + 布局存成命名视图 */
export async function saveCurrentView() {
  const name = await promptDialog({
    title: '保存为命名视图',
    label: '视图名称',
    value: '我的视图',
    placeholder: '如：本周待办',
    okLabel: '保存',
  });
  if (!name) return;
  const id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const view = {
    id, name,
    status: vs.poolStatusFilter,
    tag: vs.poolTagFilter,
    project: vs.poolProjectFilter,
    layout: vs.poolLayout,
  };
  // 先读后改：host 离线时 updateHostMeta 会抛错，**不会**把已有视图覆盖成一条
  const res = await runWrite(
    () => updateHostMeta('savedViews', (cur) => [...(Array.isArray(cur) ? cur : []), view]),
    '视图保存失败：本机服务未连接',
  );
  if (!res.ok) return;
  vs.savedViews = res.value;
  vs.activeViewId = id;
  await loadPoolViews();
  showToast('✅ 已保存视图：' + name, 'success');
}

/** 应用一个命名视图 */
export function applyView(view) {
  vs.poolStatusFilter = view.status ?? '';
  vs.poolTagFilter = view.tag ?? '';
  vs.poolProjectFilter = view.project ?? '';
  vs.poolLayout = view.layout ?? 'card';
  getPort().prefSet('journal.poolLayout', vs.poolLayout);
  vs.activeViewId = view.id;
  renderCardPool();
}
