/**
 * drag-ghost.js — 拖拽落地预览 + 落位（views 层）
 *
 * 问题（2026-11-11 用户反馈）：卡片池卡片拖到时间线上时只有画布整体描边，
 * 看不出会落在哪个 15 分钟格、占多高，只能松手后碰运气。
 *
 * 现在：`bindScheduleDrop(target, assignedDate)` 一步给画布/列装上
 * dragover（ghost 预览）+ drop（落库）。日视图时间线与周视图列共用这一份实现，
 * 落点换算走 shared/model.js 的 `slotMinutesAtY` / `clampStartMinutes` ——
 * **预览与 drop 必须共用同一换算**，否则预览会骗人（拖动时显示一个位置、
 * 松手落到另一个位置）。
 *
 * 行为约定（2026-11-11 用户拍板）：
 * - drop 后**不**自动打开编辑器（ghost 已可视化落点；想细调就点卡片）
 * - 拖拽只改日期与起点，**保留原时长**（时长链：起止差 → duration 字段 → 默认时长）
 * - ghost 三路清除：drop、dragleave、源 dragend（pool.js 兜底）
 *
 * 依赖方向：本模块 → timeline.js 取视图几何（SLOT_HEIGHT/scheduleHeight，几何唯一
 * 归属）；timeline.js 又会 import 本模块的 bindScheduleDrop 来装拖拽监听，因此两者是
 * 同层循环 import（与既有 timeline↔range-select 同性质）。安全前提：双方都只在
 * 函数体内使用对方导出，不在模块顶层求值（否则会踩 TDZ）——改动时勿把几何常量
 * 提到顶层使用。
 */

import {
  DEFAULT_CARD_DURATION_MIN, addMinutes, clampStartMinutes, getCardDuration, minutesToTime, slotMinutesAtY,
} from '../shared/model.js';
import { cardPrimaryText } from '../shared/format.js';
import { vs } from '../state/view-state.js';
import { patchCard } from '../features/card-actions.js';
import { SLOT_HEIGHT, scheduleHeight } from './timeline.js';

/** @type {HTMLElement|null} ghost 单例（同屏只有一个拖拽源） */
let ghostEl = null;
/** @type {{container: HTMLElement, startMin: number, durationMin: number}|null} */
let ghostState = null;

/**
 * 被拖卡的排程参数（drop 的唯一时长链）。
 * @param {object} card
 * @param {number} startMin 吸附后的起点分钟数
 * @returns {{startMin:number, durationMin:number, startTime:string, endTime:string}}
 */
export function droppedCardSchedule(card, startMin) {
  const durationMin = draggedDuration(card);
  const startTime = minutesToTime(startMin);
  return {
    startMin,
    durationMin,
    startTime,
    endTime: addMinutes(startTime, durationMin),
  };
}

/** 被拖卡的时长（分钟）：起止差 → duration 字段 → 默认时长。drop 预览共用这唯一一份。 */
function draggedDuration(card) {
  return getCardDuration(card) || card?.duration || DEFAULT_CARD_DURATION_MIN;
}

/**
 * 被拖的卡。
 *
 * dragover 阶段 dataTransfer 处于 protected mode，`getData()` 恒返回空串
 * （dev-loop 的合成 DataTransfer 不受此限，真实浏览器会），所以优先取
 * `vs.draggingCardId`（源头 dragstart 缓存）；getData 只作兼容兑底
 * （drop 是 read 模式，能读到）。找不到 = 拖的不是卡片池卡片，忽略。
 */
function draggedCard(e) {
  const cardId = vs.draggingCardId || e.dataTransfer?.getData?.('text/plain') || '';
  return cardId ? vs.allCardsCache.find((c) => c.id === cardId) ?? null : null;
}

/**
 * 显示/更新落点预览块。节流：同容器同起点同时长直接返回
 * （dragover 高频，每帧写 DOM 会让窄侧栏拖动发涩）。
 * @param {{container: HTMLElement, startMin: number, durationMin: number, title?: string}} opts
 */
export function showDropGhost({ container, startMin, durationMin, title = '' }) {
  if (!container) return;
  if (ghostState
    && ghostState.container === container
    && ghostState.startMin === startMin
    && ghostState.durationMin === durationMin) return;

  if (!ghostEl) {
    ghostEl = document.createElement('div');
    ghostEl.className = 'drop-ghost';
    ghostEl.setAttribute('aria-hidden', 'true');
    const titleEl = document.createElement('span');
    titleEl.className = 'drop-ghost-title';
    const timeEl = document.createElement('span');
    timeEl.className = 'drop-ghost-time';
    ghostEl.append(titleEl, timeEl);
  }
  ghostEl.querySelector('.drop-ghost-title').textContent = title;
  ghostEl.querySelector('.drop-ghost-time').textContent =
    `${minutesToTime(startMin)}–${minutesToTime(startMin + durationMin)}`;
  ghostEl.style.top = `${scheduleHeight(startMin)}px`;
  ghostEl.style.height = `${(durationMin / 15) * SLOT_HEIGHT}px`;
  if (ghostEl.parentElement !== container) container.append(ghostEl);
  ghostState = { container, startMin, durationMin };
}

/** 清除预览块（幂等；drop / dragleave / dragend 三路都能安全调用）。 */
export function hideDropGhost() {
  ghostEl?.remove();
  ghostState = null;
}

/**
 * 给画布/列绑定「拖入预览 + 落库」。
 *
 * @param {HTMLElement} target 时间线画布或周视图单日列（几何 = vs.viewStartMin + SLOT_HEIGHT）
 * @param {string} assignedDate 落位目标日期（dayKey）
 */
export function bindScheduleDrop(target, assignedDate) {
  if (!target) return;
  /** 指针 Y → 吸附钳制后的起点分钟数（预览与 drop 共用） */
  const slotOf = (clientY, card) => clampStartMinutes(
    slotMinutesAtY(clientY - target.getBoundingClientRect().top, vs.viewStartMin, SLOT_HEIGHT),
    vs.viewStartMin, vs.viewEndMin,
    draggedDuration(card),
  );

  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = draggedCard(e);
    if (!card) return;
    const startMin = slotOf(e.clientY, card);
    showDropGhost({
      container: target,
      startMin,
      durationMin: draggedDuration(card),
      title: cardPrimaryText(card, ''),
    });
  });
  // 落位指示只靠 ghost 预览块（2026-11-11 用户拍板：不画整块蓝底，
  // 故不再切 drag-over 类；dragleave 只负责清 ghost）。

  // 只在真正离开目标（进入子元素不算——dragleave 会随子元素边界冒上来，
  // 否则拖到画布内已排程卡上时 ghost 会闪没）时清除。
  target.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
    hideDropGhost();
  });

  target.addEventListener('drop', (e) => {
    e.preventDefault();
    hideDropGhost();
    const card = draggedCard(e);
    // 拖拽到此结束：无论 drop 后 refreshAll 是否重建了源头行（列表重建时
    // dragend 可能不再送达），都把源头缓存清掉，避免下次拖拽拿到陈旧的卡 id。
    vs.draggingCardId = '';
    if (!card) return;
    const sched = droppedCardSchedule(card, slotOf(e.clientY, card));
    // 统一走 patchCard（与拖回池取消排程同通路）：失败 toast + 重渲染回滚。
    void patchCard(card.id, {
      assignedDate,
      time: sched.startTime,
      startTime: sched.startTime,
      endTime: sched.endTime,
    }, '排程失败：本机服务未连接');
    // 不自动打开编辑器（2026-11-11 用户拍板）：drop 即完成排程。
  });
}
