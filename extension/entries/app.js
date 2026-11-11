/**
 * app.js — 组合根（entries 层）
 *
 * 启动顺序：装配外壳 → 装配视图/编辑器事件 → 拉取 host 数据 → 首次全量渲染。
 * 并把「全量重渲染 / 打开编辑器 / 重算时长」注入 state/actions.js，
 * 供各视图/功能反向调用（避免 views → entries 循环依赖）。
 */

import { pullFromHost, startHostSync } from '../state/sync-bridge.js';
import { actions } from '../state/actions.js';
import { loadPropLibrary, getPropLibrary } from '../state/prop-library.js';
import { initFieldRegistry } from '../shared/field-registry.js';
import { checkHostHealth } from '../features/host-status.js';
import { showToast } from '../features/toast.js';
import { refreshAll } from '../views/refresh.js';
import { loadPoolViews } from '../views/named-view.js';
import { ensureBuiltinTemplates } from '../state/template-seed.js';
import { loadSkillStatus } from '../views/skills.js';
import { markViewMode, requestFocusScroll } from '../views/rightview.js';
import { updateHeaderDate } from '../views/calendar.js';
import { openEditor, openEditorRange, updateEditorDuration } from '../features/card-editor.js';
import { hydrateIcons } from '../components/icon.js';
import { bindShell } from './bind-shell.js';
import { bindViews } from './bind-views.js';
import { bindEditor } from './bind-editor.js';

/** 启动应用。 */
export async function init() {
  // 组合根注入反向调用通道
  actions.refreshAll = refreshAll;
  actions.openEditor = openEditor;
  actions.openEditorRange = openEditorRange;
  actions.updateEditorDuration = updateEditorDuration;

  // HTML 里只有 `data-icon="name"` 占位，这里一次注入真实 SVG。
  // 必须在 bindShell/bindViews 之前：之后的事件绑定与断言都依赖图标已就位。
  hydrateIcons();

  await bindShell();
  bindViews();
  bindEditor();

  // 拉取 host 数据
  const pulled = await pullFromHost();
  if (!pulled.pulled) {
    showToast('⚠️ host 服务未连接，数据可能无法保存', 'warn');
  }
  await checkHostHealth();
  startHostSync(() => {
    // 拖拽/缩放中不打断；其余情况外部变化就全量重渲染。
    // ⚠️ 迁移期双读：dataset.gesture 优先（views/gesture.js 是 body 标志的唯一写者），
    // 旧 body class（is-dragging/is-resizing）兼容读 —— 等 CSS 里的 body.is-* 选择器
    // 退场后删除旧读（gesture P4 迁移期约定）。
    // 只跳过会打断画布手势的 drag/resize；tpl-drag/pool-drag 历史上不阻断渲染，保持不变。
    const g = document.body.dataset.gesture;
    if (g === 'drag' || g === 'resize') return;
    if (document.body.classList.contains('is-dragging') ||
        document.body.classList.contains('is-resizing')) return;
    refreshAll();
  });

  // 首次全量渲染
  updateHeaderDate();
  markViewMode();
  requestFocusScroll(); // 打开时聚焦当前时刻
  await refreshAll();
  await loadPoolViews();

  // 属性库 + 字段注册表（用户字段走 getter 实时读，变更后无需重新 init）
  await loadPropLibrary();
  initFieldRegistry({ getUserFields: () => getPropLibrary() });

  // 内置模板 seed（只一次、不复活；host 未就绪时静默跳过，下次启动自愈）
  await ensureBuiltinTemplates();

  // 本机 AI Skill 状态（供「复制所有路径给 AI」）
  await loadSkillStatus();
}
