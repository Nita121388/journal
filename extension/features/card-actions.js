/**
 * card-actions.js — 卡片写操作流程（features 层）
 *
 * 把「跨视图复用、且必须一致」的写流程收在一处：
 *   - 删除必须先给应用内确认（不再用原生 confirm）
 *   - 删除后提供 6 秒「撤销」（重建卡片；墓碑语义不变）
 *   - 所有失败走统一 toast，不产生 unhandled rejection
 *
 * 视图（卡片池 / 时间线卡片）只需 import 这一个函数，不要各自复制一份。
 */

import { actions } from '../state/actions.js';
import { deleteCardEntry, restoreCardEntry, updateCardEntry } from '../state/repository.js';
import { confirmDialog } from './dialog.js';
import { runWrite, showToast } from './toast.js';

/**
 * 删除一张卡片：确认 → 删除 → 可撤销。
 * @param {object} card
 * @param {string} [label] 确认框里用的显示名
 * @returns {Promise<boolean>} 是否真的删除了
 */
export async function deleteCardWithUndo(card, label) {
  const name = label || card.title || card.content || '这张卡片';
  const yes = await confirmDialog({
    title: '删除卡片',
    message: `删除「${name.slice(0, 40)}」？删除会同步到所有设备，但可以立即撤销。`,
    okLabel: '删除',
    danger: true,
  });
  if (!yes) return false;

  const snapshot = { ...card };
  const res = await runWrite(() => deleteCardEntry(card.id), '删除失败：本机服务未连接');
  if (!res.ok) return false;

  await actions.refreshAll();
  showToast('已删除', 'success', {
    action: '撤销',
    durationMs: 6000,
    onAction: async () => {
      const undo = await runWrite(() => restoreCardEntry(snapshot), '撤销失败：本机服务未连接');
      if (undo.ok) {
        await actions.refreshAll();
        showToast('已恢复', 'success');
      }
    },
  });
  return true;
}

/**
 * 更新卡片字段并刷新（统一错误提示，避免 unhandled rejection）。
 * @param {string} id
 * @param {object} patch
 * @param {string} [fallback]
 * @returns {Promise<boolean>} 是否成功
 */
export async function patchCard(id, patch, fallback) {
  const res = await runWrite(() => updateCardEntry(id, patch), fallback);
  // 无论成功失败都重渲染：
  //  - 成功：显示最新真源
  //  - 失败：把拖动/缩放期间乐观改过的 DOM（style.top / --height / 时间文案）**回滚**到真源，
  //          否则界面会停在一个从未保存过的位置，直到下次刷新才「回弹」。
  await actions.refreshAll();
  return res.ok;
}
