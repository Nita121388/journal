/**
 * bind-shell.js — 外壳交互装配（entries 层）
 *
 * 下拉增强、主题、宽屏初始跟随、侧栏抽屉、快捷新建、筛选区披露、
 * 设置入口、host 状态按钮、当前时刻 marker 计时器。
 */

import { els } from '../components/dom-refs.js';
import { autoEnhance as enhanceSelects } from '../features/select.js';
import { startHost } from '../features/host-status.js';
import { WIDE_QUERY, widePreference, applyWide } from '../features/wide-mode.js';
import { getPort } from '../platform/index.js';
import { currentTime } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { getSettings } from '../state/settings.js';
import { vs } from '../state/view-state.js';
import { renderCardPool } from '../views/pool.js';
import { startNowMarkerTimer } from '../views/timeline.js';

/** 绑定外壳级交互（不含数据拉取与视图导航）。 */
export async function bindShell() {
  // 自建下拉框（BoardUI 风格）：增强静态 select；动态生成由全局 observer 自动接管
  enhanceSelects();

  // 主题
  const settings = await getSettings();
  if (settings.theme === 'dark' ||
      (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }

  // 宽屏模式（初始 + 视口变化时跟随）
  applyWide();
  WIDE_QUERY.addEventListener('change', () => {
    // 非手动模式才需要跟随视口变化
    const p = widePreference();
    if (p !== 'on' && p !== 'off') applyWide();
  });

  // 侧栏抽屉（窄栏默认收起；宽屏时 CSS 自动隐藏按钮）
  // 唯一写入口：body class + aria + pref 都在这里同步（缺陷 2 修复：此前 Esc/点遮罩
  // 只改 body class 不写 pref，下次启动回到旧状态，与实际状态漂移）
  const setPanels = (open) => {
    document.body.classList.toggle('panels-open', open);
    els.btnPanels.setAttribute('aria-expanded', String(open));
    getPort().prefSet('journal.panelsOpen', open ? '1' : '0');
  };
  // 初始化：pref 是真源，但只读一次（宽屏下 CSS 自动隐藏抽屉，不回写）
  setPanels(getPort().prefGet('journal.panelsOpen') === '1');
  els.btnPanels.addEventListener('click', () => {
    setPanels(!document.body.classList.contains('panels-open'));
  });
  // 点击遮罩关闭抽屉
  els.board?.addEventListener?.('click', (e) => {
    if (e.target === els.board) setPanels(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('panels-open')) {
      setPanels(false);
      els.btnPanels.focus();
    }
  });

  // 快捷新建（今天/当前视图日期）
  els.btnQuickAdd?.addEventListener('click', () => {
    actions.openEditor(null, currentTime(), vs.selectedDate);
  });

  // 项目/标签筛选：展开/收起「筛选」区（渐进披露）
  if (els.poolExtraFilter && els.poolExtra) {
    const setExtra = (open) => {
      els.poolExtra.classList.toggle('is-open', open);
      els.poolExtraFilter.setAttribute('aria-expanded', String(open));
    };
    els.poolExtraFilter.addEventListener('click', () => setExtra(!els.poolExtra.classList.contains('is-open')));
  }

  // 今日当前时间 marker 每分钟更新
  startNowMarkerTimer();

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    getPort().openOptionsPage();
  });

  els.hostStatusBtn?.addEventListener('click', startHost);
  els.hostBannerStart?.addEventListener('click', startHost);

  // 卡片池搜索：纯本地过滤（对 vs.allCardsCache），零请求
  els.poolSearch?.addEventListener('input', (e) => {
    vs.poolQuery = String(e.target.value || '').trim();
    renderCardPool();
  });
}
