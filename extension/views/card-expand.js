/**
 * card-expand.js — 卡片展开态（Milkdown 正文渲染）的视图状态与挂载（views 层）
 *
 * 为什么单独一个模块：展开态是**全局唯一**的（`vs.expandedCardId`），
 * 而它同时被月格 pill、周/日时间块、以及 renderRightView 的重渲染路径触发。
 * 放在任一个视图里都会让其余视图反向依赖它。
 *
 * Milkdown 实例由 views/milkdown-mount.js 的实例池托管（上限 2），
 * 本模块只负责「谁来展开、展开后挂哪」。
 */

import { vs } from '../state/view-state.js';
import { actions } from '../state/actions.js';
import { renderCardDetail } from './calendar-card.js';
import { release } from './milkdown-mount.js';

/**
 * 切换某张卡的展开态并重渲染。
 *
 * @param {string} cardId
 * @returns {Promise<void>}
 */
export async function toggleCardDetail(cardId) {
  if (!cardId) return;
  vs.expandedCardId = vs.expandedCardId === cardId ? null : cardId;
  await actions.refreshAll();
}

/** 收起当前展开的卡片（若已收起则为 no-op）。 */
export async function closeCardDetail() {
  if (!vs.expandedCardId) return;
  vs.expandedCardId = null;
  await actions.refreshAll();
}

/**
 * 把当前展开的卡片详情挂到容器末尾。
 *
 * 卡片可能已被删除 / 改日期（展开期间数据变化），此时静默清空展开态。
 * @param {HTMLElement} container 主视图容器
 */
export function renderExpandedCard(container) {
  if (!vs.expandedCardId) return;
  const card = (vs.allCardsCache ?? []).find((c) => c.id === vs.expandedCardId);
  if (!card) {
    vs.expandedCardId = null;
    return;
  }
  const detail = renderCardDetail(card, {
    onClose: () => { closeCardDetail(); },
  });
  // 重渲染会整体替换容器内容；先把旧实例释放掉，避免 ProseMirror 悬挂
  container.append(detail);
}

/**
 * 容器被清空前的清理钩子（renderRightView 调用）。
 * @param {HTMLElement} [container]
 */
export function releaseExpandedCard(container) {
  if (!container) return;
  const body = container.querySelector('.cc-detail-body');
  if (body) release(body);
}
