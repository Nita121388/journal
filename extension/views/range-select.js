/**
 * range-select.js — 「拖动框选时间范围」交互（views 层）
 *
 * 日视图时间线画布与周视图列共用**同一实现**。
 *
 * 为什么必须共用：这两处原本各自复制了一份近 60 行、且已经分叉 ——
 * 周视图那份漏了 `.schedule-grid-label` 守卫，于是从整点标签上按下会误触发框选。
 * 复制粘贴的第二份永远不会同步修 bug，所以这里收敛成唯一实现。
 *
 * 交互约定：
 *   - 仅左键；在卡片 / 当前时刻线 / 网格标签 / 添加入口上按下不框选
 *   - 拖动 < 3px 视为单击（交由调用方的 click 处理单格创建）
 *   - 起止对齐 15 分钟网格、最小 15 分钟、钳制在 `vs.viewStartMin..viewEndMin`
 */

import { vs } from '../state/view-state.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';

/** 默认忽略的选择器（在其上按下不开始框选） */
const DEFAULT_IGNORE = '.timeline-card, .timeline-now-marker, .schedule-grid-label, .card-add-btn';

/** 拖动位移小于此像素数时视为单击 */
const DRAG_THRESHOLD_PX = 3;

/**
 * 在容器上绑定框选交互。
 * @param {HTMLElement} el 滚动容器
 * @param {(startMin:number, endMin:number)=>void} onRange 框选完成回调（已对齐 15 分钟）
 * @param {{ignore?:string}} [opts]
 * @returns {() => void} 解绑函数
 */
export function bindRangeSelect(el, onRange, opts = {}) {
  if (!el) return () => {};
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  /** @type {{startM:number, overlay:HTMLElement, dragging:boolean, endM?:number}|null} */
  let sel = null;
  let suppressClick = false;

  /** 鼠标 Y → 视图内的分钟数（钳制到可视范围） */
  const minuteAt = (clientY) => {
    const rect = el.getBoundingClientRect();
    const raw = vs.viewStartMin + ((clientY - rect.top) / SLOT_HEIGHT) * 15;
    return Math.max(vs.viewStartMin, Math.min(vs.viewEndMin, raw));
  };

  const removeSel = () => {
    sel?.overlay?.remove();
    sel = null;
  };

  const onDown = (e) => {
    if (e.button !== 0) return; // 仅左键
    if (e.target.closest(ignore)) return;
    const startM = minuteAt(e.clientY);
    const overlay = document.createElement('div');
    overlay.className = 'selection-overlay';
    overlay.style.top = `${scheduleHeight(Math.floor(startM / 15) * 15)}px`;
    overlay.style.height = '0px';
    el.append(overlay);
    sel = { startM, overlay, dragging: false };
  };

  const onMove = (e) => {
    if (!sel) return;
    e.preventDefault();
    const endM = minuteAt(e.clientY);
    if (Math.abs(endM - sel.startM) * (SLOT_HEIGHT / 15) < DRAG_THRESHOLD_PX) return;
    sel.dragging = true;
    const s = Math.floor(Math.min(sel.startM, endM) / 15) * 15;
    const eSlot = Math.ceil(Math.max(sel.startM, endM) / 15) * 15;
    sel.overlay.style.top = `${scheduleHeight(s)}px`;
    sel.overlay.style.height = `${scheduleHeight(eSlot) - scheduleHeight(s)}px`;
    sel.endM = endM;
  };

  const onUp = (e) => {
    if (!sel) return;
    e.preventDefault();
    const { startM, dragging } = sel;
    removeSel();
    if (!dragging) return; // 纯点击 → 交给调用方的 click（单格创建）
    suppressClick = true;
    // 对齐 15 分钟网格、最小 15 分钟、不越界
    let s = Math.floor(Math.min(startM, minuteAt(e.clientY)) / 15) * 15;
    let eSlot = Math.ceil(Math.max(startM, minuteAt(e.clientY)) / 15) * 15;
    if (eSlot - s < 15) eSlot = s + 15;
    eSlot = Math.min(vs.viewEndMin, eSlot);
    if (eSlot - s < 15) s = Math.max(vs.viewStartMin, eSlot - 15);
    onRange(s, eSlot);
  };

  // capture 阶段抢在单格 click 之前抑制一次
  const onClickCapture = (e) => {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
    }
  };

  el.addEventListener('mousedown', onDown);
  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseup', onUp);
  el.addEventListener('click', onClickCapture, true);

  return () => {
    el.removeEventListener('mousedown', onDown);
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseup', onUp);
    el.removeEventListener('click', onClickCapture, true);
    removeSel();
  };
}
