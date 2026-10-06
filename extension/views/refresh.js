/**
 * refresh.js — 全量重渲染编排（views 层）
 *
 * 组合根与各交互在数据/状态变更后调用：从 repository 取快照 → 重算派生缓存 →
 * 依次重渲染各视图。自身不依赖 actions，故不会与入口形成循环。
 */

import { els } from '../components/dom-refs.js';
import { countCardsByDay } from '../shared/model.js';
import { getAllCards } from '../state/repository.js';
import { vs } from '../state/view-state.js';
import { renderCalendarView } from './calendar.js';
import { renderHeatmap } from './heatmap.js';
import { renderCardPool } from './pool.js';
import { renderRightView } from './rightview.js';
export async function refreshAll() {
  vs.allCardsCache = await getAllCards();
  vs.heatmapCache = countCardsByDay(vs.allCardsCache);
  renderHeatmap(els.heatmap, vs.heatmapCache);
  renderCalendarView();
  await renderRightView();
  await renderCardPool();
}
