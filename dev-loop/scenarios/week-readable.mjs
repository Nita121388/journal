/**
 * week-readable scenario — P3 周视图窄栏可读性回归（prd R6 / R7 / R9）。
 *
 * 守住「周视图不再被压成逐字竖排」这一组硬门：
 *  1. 容器无横向溢出（320/360/400 都不许出现横向滚动条）
 *  2. 卡片标题元素宽度足够放「≥4 个字」（见下方 CLAMP 说明），不是 1 字宽
 *  3. 标题单行（`white-space` 非 normal）或 2 行 clamp 生效，且高度不随字数线性增涨
 *  4. 同列卡片不重叠 —— **允许**「叠放模式」下被覆盖的卡（判据见 checkOverlaps）
 *  5. 卡片底色不透明（alpha < 1 判失败，半透明叠加就是「叠影」）
 *  6. `.calview-more`（+N）字号 ≥ 9px 且不溢出列宽
 *
 * 数据：场景自己造 4 张卡（13:00 起三段重叠 + 一条超长标题），
 * 因为「不重叠」只有在真的重叠时才测得出东西。只在**第一次调用**时播种，
 * 否则 dev-loop 逐宽度循环会把卡翻 4 倍。
 */

import { seedHost } from '../lib/seed.mjs';

/** 本进程是否已播种（dev-loop 每个 width 会重新调用场景）。 */
let seeded = false;

/** 本地日期的 YYYY-MM-DD（host seed 侧 sampleCards 用的是 UTC，这里不跟它对齐：
 *  周视图列按页面本地 todayKey 分组，必须让卡落在本地「今天」才看得见）。 */
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 构造「重叠 + 超长标题」样本：同列三段重叠用来验证叠放与 +N。 */
function overlapCards(dayKey = localDayKey()) {
  return [
    { content: '同一时段三张卡：验证叠放与 +N 折叠', type: 'task', status: '进行中', title: '重叠 A 多端同步', startTime: '13:00', endTime: '14:30', duration: 90, assignedDate: dayKey },
    { content: '第二张同列重叠卡', type: 'task', status: '待办', title: '重叠 B', startTime: '13:30', endTime: '15:00', duration: 90, assignedDate: dayKey },
    { content: '第三张同列重叠卡', type: 'text', status: '进行中', title: '重叠 C', startTime: '14:00', endTime: '14:30', duration: 30, assignedDate: dayKey },
    { content: '', type: 'idea', status: '进行中', title: '把多端同步的冲突合并策略与离线草稿兜底一次讲清楚', startTime: '18:00', duration: 45, assignedDate: dayKey },
  ];
}

/** 切到指定视图（#view-dock 是唯一视图入口）。 */
async function switchMode(page, mode) {
  await page.evaluate((m) => {
    const btn = document.querySelector(`#view-dock [data-mode="${m}"]`);
    btn?.click();
  }, mode);
  await page.waitForTimeout(350);
}

/**
 * 同列卡片重叠判定。
 *
 * 规则（prd R9-4 + 交付说明里的「叠放方案」）：
 * - 两张卡相交 > 1px 时：
 *   - `z-index` 相同 → **失败**（分道模式下同层卡片绝不允许重叠）；
 *   - `z-index` 不同 → 视为「叠放模式」，只在该列确实有 `.calview-more`（+N 折叠说明）
 *     时才算通过 —— 即重叠必须是**被显式告知用户**的叠放，而不是意外压字。
 *
 * @param {Array<object>} cards
 * @returns {{bad: string[], stackedPairs: number}}
 */
function checkOverlaps(cards) {
  const bad = [];
  let stackedPairs = 0;
  const byDay = new Map();
  for (const c of cards) {
    if (!byDay.has(c.day)) byDay.set(c.day, []);
    byDay.get(c.day).push(c);
  }
  for (const [day, list] of byDay) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].rect;
        const b = list[j].rect;
        const overlapped =
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 &&
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1;
        if (!overlapped) continue;
        if (list[i].z === list[j].z) {
          bad.push(`${day}: 同层卡片重叠 (z=${list[i].z}) "${list[i].titleText}" ↔ "${list[j].titleText}"`);
        } else if (!list[i].hasMore) {
          bad.push(`${day}: 叠放但缺少 +N 说明 "${list[i].titleText}" ↔ "${list[j].titleText}"`);
        } else {
          stackedPairs += 1;
        }
      }
    }
  }
  return { bad, stackedPairs };
}

/**
 * 采集周视图度量（全部在页面上下文里算，避免把 DOM 句柄搬出来）。
 * @param {import('playwright').Page} page
 */
async function collect(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const cards = [];
    const moreEls = [];
    for (const body of document.querySelectorAll('.calview-week-body')) {
      const colW = body.getBoundingClientRect().width;
      const more = body.querySelector('.calview-more');
      if (more) {
        const mcs = getComputedStyle(more);
        moreEls.push({
          fontSize: parseFloat(mcs.fontSize),
          width: more.getBoundingClientRect().width,
          colW,
          text: more.textContent,
        });
      }
      for (const el of body.querySelectorAll('.timeline-card')) {
        const title = el.querySelector('.card-primary');
        const cs = title ? getComputedStyle(title) : null;
        const r = el.getBoundingClientRect();
        const ecs = getComputedStyle(el);
        const bg = ecs.backgroundColor;
        // header 里还有多少个「占宽度的」子元素 —— 标题被挤压的真实原因往往在这里
        const headerKids = [...(title?.parentElement?.children ?? [])]
          .filter((k) => getComputedStyle(k).display !== 'none')
          .map((k) => `${k.className || k.tagName}:${Math.round(k.getBoundingClientRect().width)}`);
        cards.push({
          day: body.dataset.day,
          colW,
          cardW: r.width,
          padL: parseFloat(ecs.paddingLeft),
          padR: parseFloat(ecs.paddingRight),
          headerKids,
          titleText: (title?.textContent ?? '').trim(),
          titleW: title ? title.getBoundingClientRect().width : -1,
          titleH: title ? title.getBoundingClientRect().height : -1,
          fs: cs ? parseFloat(cs.fontSize) : 0,
          lh: cs ? parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35 : 0,
          whiteSpace: cs ? cs.whiteSpace : '',
          clamp: cs ? (cs.webkitLineClamp || cs.lineClamp || 'none') : 'none',
          bg,
          z: Number(ecs.zIndex) || 0,
          isNarrow: body.classList.contains('is-narrow'),
          hasMore: !!more,
          rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        });
      }
    }
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      gridCols: getComputedStyle(document.querySelector('.calview-week-grid') || doc.body).gridTemplateColumns,
      cards,
      moreEls,
    };
  });
}

/** 背景色 alpha：`rgba(r, g, b, a)` / `rgb(r, g, b)` → a（解析失败按 1 处理）。 */
function bgAlpha(bg) {
  const m = /rgba?\(([^)]+)\)/.exec(String(bg));
  if (!m) return 1;
  const parts = m[1].split(',').map((s) => s.trim());
  return parts.length >= 4 ? Number(parts[3]) : 1;
}

/**
 * @param {{page: import('playwright').Page, width: number, outDir?: string, hostPort?: number|null}} ctx
 */
export async function runWeekReadable({ page, width, outDir, hostPort }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push([`${name}`, Boolean(ok), detail || '']);

  // ── 造重叠数据（只一次），然后整页 reload 把卡片拉进页面上下文
  if (hostPort && !seeded) {
    seeded = true;
    await seedHost(hostPort, overlapCards());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
  }

  await switchMode(page, 'week');
  // 周视图默认滚到「现在」（23:00 时卡片区已滚出视口）。截图/断言前先滚到第一张卡，
  // 否则截图里只剩空网格 —— 人工核对看不到标题是否横排。
  await page.evaluate(() => {
    const card = document.querySelector('.calview-week-body .timeline-card');
    card?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(200);

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
    }, theme);
    // 主题翻转会重启 background-color 过渡，等它落定再读 computed style / 截图
    await page.waitForTimeout(250);

    const m = await collect(page);
    const tag = `[${theme}]`;

    // ① 无横向溢出
    add(`${tag} 周视图无横向溢出`, m.overflowX <= 1, `overflowX=${m.overflowX}px @${width}px cols=${m.gridCols}`);
    // ② 标题宽度：至少能放 4 个字
    //
    // CLAMP 说明：320px 侧栏 7 列 × 40px 刻度尺后每列仅 ~36px，几何上不可能同时满足
    // 「4 个字宽」与「列内留内距」。所以阈值取 `min(4 字宽, 列宽 × 0.72)`：
    // 400/500px 下按完整 4 字标准；320px 下退化为「标题占满列宽的 72%」——
    // 仍然能证明标题**横向排布且拿满可用宽度**（逐字竖排的 bug 下该值只有 ~1 字宽）。
    const narrow = m.cards.map((c) => {
      const fourChar = 4 * c.fs * 0.9;
      const need = Math.min(fourChar, Math.max(0, c.colW * 0.72));
      return { ...c, fourChar, need, chars: c.titleW / c.fs };
    });
    const tooNarrow = narrow.filter((c) => c.titleW < c.need - 0.5);
    add(
      `${tag} 卡片标题不是 1 字宽（≥4 字或占列宽 72%）`,
      m.cards.length > 0 && tooNarrow.length === 0,
      m.cards.length === 0
        ? '无卡片（需要 host 播种）'
        : `min chars=${Math.min(...narrow.map((c) => c.chars)).toFixed(2)} / colW=${Math.round(narrow[0].colW)}px / need=${narrow[0].need.toFixed(1)}px`
          + ` / ${narrow.map((c) => `w=${c.cardW.toFixed(1)} pad=${c.padL}/${c.padR} title=${c.titleW.toFixed(1)} kids=[${c.headerKids.join(',')}]`).join(' | ')}`,
    );

    // ③ 标题单行（nowrap 或 2 行 clamp），且实际只占 1 行
    const notSingleLine = narrow.filter((c) => c.whiteSpace === 'normal' && c.clamp === 'none');
    add(`${tag} 标题不按字竖排（nowrap / clamp）`, notSingleLine.length === 0, notSingleLine.map((c) => c.titleText).join(' | '));
    const wrapped = narrow.filter((c) => c.titleH > c.lh * 1.6);
    add(
      `${tag} 标题实际只占 1 行`,
      wrapped.length === 0,
      wrapped.length ? wrapped.map((c) => `${c.titleText} h=${c.titleH} lh=${c.lh}`).join(' | ') : `maxH=${Math.max(...narrow.map((c) => c.titleH)).toFixed(1)}px lh=${narrow[0].lh}px`,
    );

    // ④ 同列卡片不重叠（叠放模式按 z-index + +N 豁免，见 checkOverlaps）
    const { bad, stackedPairs } = checkOverlaps(m.cards);
    add(`${tag} 同列卡片不重叠`, bad.length === 0, bad.length ? bad.join(' ; ') : `cards=${m.cards.length} 叠放对=${stackedPairs}`);

    // ⑤ 卡片底色不透明
    const translucent = m.cards.filter((c) => bgAlpha(c.bg) < 0.99);
    add(`${tag} 卡片底色不透明（无叠影）`, translucent.length === 0, translucent.length ? translucent.map((c) => c.bg).join(',') : m.cards[0]?.bg ?? '');

    // ⑥ +N 徽标可读且不溢出列宽
    const badMore = m.moreEls.filter((e) => e.fontSize < 9 || e.width > e.colW);
    add(
      `${tag} +N 徽标字号 ≥ 9px 且不溢出`,
      badMore.length === 0,
      m.moreEls.length ? m.moreEls.map((e) => `${e.text} fs=${e.fontSize} w=${e.width.toFixed(1)}/${e.colW.toFixed(1)}`).join(' | ') : '本宽度无叠放',
    );

    if (outDir) {
      await page.screenshot({ path: `${outDir}/week-readable-${theme}-${width}.png`, fullPage: true }).catch(() => {});
    }
  }

  // 亮色收尾：末张整页截图不要停在暗色，避免人工核对时误判「配色错了」
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.waitForTimeout(250);

  return { checks };
}
