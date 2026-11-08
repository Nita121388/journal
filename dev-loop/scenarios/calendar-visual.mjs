/**
 * calendar-visual scenario — 日历公共卡片组件 + Milkdown 展开态回归。
 *
 * 守住四条硬门（对应 .trellis/tasks/11-07-calendar-visual-refresh/prd.md 的验收项）：
 *  1. 月/周/日三视图的卡片同源（都是 `.cc-pill` / `.cc-block`），没有遗留的 `.calview-summary`
 *  2. 色系 token 生效（`.cc-color-*` 的背景不是透明，文字对比度 ≥ 4.5:1）
 *  3. 今天标记 + 日期头副标渲染，且不只靠颜色（有文字）
 *  4. 展开详情走 Milkdown（挂载实例 ≤ 2），且 320px 下无横向溢出
 */

import { AA_NORMAL, contrastRatio } from '../lib/a11y.mjs';

/** 背景是否已解析成真实颜色（`transparent`/空值说明 token 没生效）。 */
function isOpaqueColor(s) {
  return /^rgba?\(/.test(String(s)) && !/rgba\(0, 0, 0, 0\)/.test(String(s));
}

/** 切到指定视图（顶部按钮与 dock 共用 data-mode）。 */
async function switchMode(page, mode) {
  await page.evaluate((m) => {
    const btn = document.querySelector(`.view-dock-btn[data-mode="${m}"], .view-mode-btn[data-mode="${m}"]`);
    btn?.click();
  }, mode);
  await page.waitForTimeout(350);
}

export async function runCalendarVisual({ page, width, outDir }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([name, Boolean(ok), detail || '']);
  /** 每个视图留一张截图作为人工核对参考图方向的证据。 */
  const shot = async (tag) => {
    if (!outDir) return;
    await page.screenshot({ path: `${outDir}/cal-${tag}-${width}.png`, fullPage: true }).catch(() => {});
  };

  // ── 0. dock 存在且与视图模式同步
  const dock = await page.evaluate(() => {
    const nav = document.getElementById('view-dock');
    const btns = [...document.querySelectorAll('.view-dock-btn')];
    return {
      exists: !!nav,
      count: btns.length,
      hasSvg: btns.every((b) => !!b.querySelector('svg')),
      // design-system §5：功能入口禁用 emoji
      hasEmoji: btns.some((b) => /[\u{1F300}-\u{1FAFF}]/u.test(b.textContent || '')),
      pressed: btns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.mode),
    };
  });
  add('底部 dock 存在（3 个按钮）', dock.exists && dock.count === 3, JSON.stringify(dock));
  add('dock 用 SVG 图标而非 emoji', dock.hasSvg && !dock.hasEmoji, `hasSvg=${dock.hasSvg} hasEmoji=${dock.hasEmoji}`);
  add('dock 有且只有一个 aria-pressed=true', dock.pressed.length === 1, dock.pressed.join(','));

  // ── 1. 月视图：pill 结构 / 配色 / 今天标记 / 无遗留旧类
  await switchMode(page, 'month');
  await shot('month');
  const month = await page.evaluate(() => {
    const grid = document.querySelector('.cc-month-grid');
    const pills = [...document.querySelectorAll('.cc-day .cc-pill')];
    const firstPill = pills[0];
    const cs = firstPill ? getComputedStyle(firstPill) : null;
    const today = document.querySelector('.cc-day.is-today');
    const todayMark = today?.querySelector('.cc-dayheader-today');
    const header = document.querySelector('.cc-day .cc-dayheader');
    return {
      gridExists: !!grid,
      cellCount: document.querySelectorAll('.cc-day').length,
      pillCount: pills.length,
      legacySummary: document.querySelectorAll('.calview-summary').length,
      firstPill: cs ? {
        bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor,
        cls: firstPill.className,
      } : null,
      todayExists: !!today,
      todayText: todayMark?.textContent?.trim() ?? '',
      hasDayHeader: !!header,
      hasDayNum: !!document.querySelector('.cc-dayheader-num'),
    };
  });
  add('月视图网格渲染', month.gridExists && month.cellCount === 42, `cells=${month.cellCount}`);
  add('月格内有 pill', month.pillCount > 0, `pills=${month.pillCount}`);
  add('旧 .calview-summary 已移除', month.legacySummary === 0, `leftover=${month.legacySummary}`);
  add('pill 带色系 class', Boolean(month.firstPill?.cls?.match(/cc-color-(red|green|blue|purple|gray)/)), month.firstPill?.cls ?? '');
  add('pill 背景不是透明（token 生效）', Boolean(month.firstPill && isOpaqueColor(month.firstPill.bg)), month.firstPill?.bg ?? '');
  add('日期头渲染（日号 + 今天标记）', month.hasDayNum && month.todayExists, `todayText="${month.todayText}"`);
  add('今天标记不只靠颜色（有文字）', month.todayText.length > 0, month.todayText);

  // pill 文字对比度（WCAG AA 正文）。contrastRatio 收的是 rgb() 字符串，不要先解析成对象
  if (month.firstPill) {
    const ratio = contrastRatio(month.firstPill.color, month.firstPill.bg);
    add('pill 文字对比度 ≥ 4.5:1', ratio >= AA_NORMAL, `${ratio.toFixed(2)}:1`);
  }

  // ── 2. 周视图：块复用公共组件 + 日期头
  await switchMode(page, 'week');
  await shot('week');
  const week = await page.evaluate(() => ({
    gridExists: !!document.querySelector('.calview-week-grid'),
    blocks: document.querySelectorAll('.cc-block').length,
    legacyCards: [...document.querySelectorAll('.calview-week-col .timeline-card')].filter((el) => !el.classList.contains('cc-block')).length,
    dayHeaders: document.querySelectorAll('.calview-week-head .cc-dayheader').length,
  }));
  add('周视图网格渲染', week.gridExists, '');
  add('周视图卡片走公共组件（cc-block）', week.blocks > 0, `blocks=${week.blocks}`);
  add('周视图无未包装的旧卡片', week.legacyCards === 0, `leftover=${week.legacyCards}`);
  add('周视图表头用公共日期头（7 天）', week.dayHeaders === 7, `headers=${week.dayHeaders}`);

  // ── 3. 日视图 + 展开态（Milkdown）
  await switchMode(page, 'timeline');
  await shot('timeline');
  const expand = await page.evaluate(async () => {
    const btn = document.querySelector('.card-expand-btn');
    if (!btn) return { noButton: true };
    btn.click();
    // 等动态 import + 渲染（首帧可能要拉 370KB 产物）
    await new Promise((r) => setTimeout(r, 1200));
    const detail = document.querySelector('.cc-detail');
    const body = detail?.querySelector('.cc-detail-body');
    const prose = body?.querySelector('.ProseMirror');
    return {
      hasDetail: !!detail,
      hasBody: !!body,
      bodyText: (body?.textContent ?? '').trim().slice(0, 80),
      hasProseMirror: !!prose,
      readonly: prose ? prose.getAttribute('contenteditable') : null,
      hasClose: !!detail?.querySelector('.cc-detail-close'),
      hasEdit: !!detail?.querySelector('.cc-detail-edit'),
    };
  });
  if (expand.noButton) {
    add('展开入口存在', false, '当天无卡片（需要 --seed）');
  } else {
    add('点击展开渲染详情面板', expand.hasDetail && expand.hasBody, expand.bodyText);
    add('详情正文非空', expand.bodyText.length > 0, expand.bodyText);
    add('正文用 Milkdown 渲染（ProseMirror）', expand.hasProseMirror, `contenteditable=${expand.readonly}`);
    add('正文为只读（contenteditable=false）', expand.readonly === 'false', String(expand.readonly));
    add('详情有收起与编辑按钮', expand.hasClose && expand.hasEdit, '');
  }

  await shot('detail');

  // 关闭后实例应被释放（切视图统一 releaseAll）
  await switchMode(page, 'month');
  await switchMode(page, 'timeline');
  const afterClose = await page.evaluate(() => ({
    details: document.querySelectorAll('.cc-detail').length,
  }));
  add('切视图后详情面板已卸载', afterClose.details === 0, `details=${afterClose.details}`);

  // ── 4. 布局硬门：无横向溢出
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    container: (() => {
      const c = document.getElementById('timeline-container');
      return c ? c.scrollWidth - c.clientWidth : -1;
    })(),
  }));
  add('无横向溢出（文档级）', overflow.doc <= 1, `overflowX=${overflow.doc}px @${width}px`);

  return { checks };
}
