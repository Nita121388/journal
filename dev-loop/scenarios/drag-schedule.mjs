/**
 * drag-schedule scenario — 回归「卡片池 → 时间线/周视图」拖拽排程闭环（2026-11-11）
 *
 * 覆盖（prd .trellis/tasks/11-11-drag-schedule-ghost）：
 *  - ghost 落地预览：dragover 时预览块出现在吸附格（位置 + 时间段文字）
 *  - 真实浏览器口径：dragover 的 dataTransfer 读不到数据（protected mode），
 *    靠 dragstart 缓存的卡 id 兑底（合成 DataTransfer 测不出的回归）
 *  - drop 落位：不自动打开编辑器；保留原时长（90 分钟卡拖过去仍是 90 分钟）
 *  - 反向：拖回卡片池 = 取消排程（四个时间字段清空）
 *  - 周视图：列 drop（assignedDate = 列日期）；dragleave 后 ghost 清除
 *
 * 驱动方式：**合成 DragEvent（带 DataTransfer）**，不依赖真实鼠标 DnD 时序
 * （真实 HTML5 DnD 无法逐帧断言 ghost，且多宽度下时序抖动）。
 */

import { seedHost } from '../lib/seed.mjs';

/** 本地日期 YYYY-MM-DD（面板按本地 todayKey 取数，UTC 会落到「昨天」） */
function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 在某元素上派发合成拖拽事件（dragover / drop / dragleave / dragend） */
async function dispatchDrag(page, sel, cardId, y, type) {
  return page.evaluate(({ sel, id, y, type }) => {
    const target = document.querySelector(sel);
    if (!target) return false;
    const r = target.getBoundingClientRect();
    const dt = new DataTransfer();
    if (id) dt.setData('text/plain', id);
    target.dispatchEvent(new DragEvent(type, {
      bubbles: true, cancelable: true,
      clientX: r.left + Math.min(40, r.width / 2),
      clientY: r.top + y,
      dataTransfer: dt,
    }));
    return true;
  }, { sel, id: cardId, y, type });
}

/**
 * 在卡片池行上派发 dragstart / dragend（真拖拽的两端）。
 *
 * 用来复现真实浏览器行为：`dragstart` 里 `setData` 之后，dragover 阶段
 * dataTransfer 处于 **protected mode**，`getData()` 恒返回空串。
 * 页面必须在 dragstart 处缓存卡 id（`vs.draggingCardId`），否则真实环境里
 * 落点预览永远不出现——而合成 DataTransfer 的 dragover 能读到数据，测不出这个 bug。
 */
async function dispatchPoolDragLifecycle(page, cardId, type) {
  return page.evaluate(({ id, type }) => {
    const li = document.querySelector(`#cardpool-list li[data-id="${id}"]`);
    if (!li) return false;
    const dt = new DataTransfer();
    if (type === 'dragstart') { dt.setData('text/plain', id); dt.effectAllowed = 'move'; }
    li.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  }, { id: cardId, type });
}

/** host 里该卡片的当前落库状态 */
async function cardOf(hostPort, id) {
  const res = await fetch(`http://127.0.0.1:${hostPort}/api/cards`);
  const j = await res.json();
  return (j.data ?? j.cards ?? []).find((c) => c.id === id) ?? null;
}

/** 切换视图（#view-dock 是唯一视图入口） */
async function switchMode(page, mode) {
  await page.evaluate((m) => {
    document.querySelector(`#view-dock [data-mode="${m}"]`)?.click();
  }, mode);
  await page.waitForTimeout(400);
}

// 不用模块级 seeded 标志：每次运行都走 ensureSeedCards（多宽度共享 DB）。

/**
 * 确保本场景的 A/B 卡存在（**每次调用都校验**，不靠模块级标志）。
 *
 * 多宽度共用同一 isolated DB，而本场景末尾会清理自己建的卡 ——
 * 若用 `seeded` 短路，第二个宽度起就不再播种、卡片又不在了，会假红。
 * 同时返回最新列表（各宽度独立 id）。
 */
async function ensureSeedCards(hostPort) {
  const list = async () => {
    const res = await fetch(`http://127.0.0.1:${hostPort}/api/cards`);
    const j = await res.json();
    return j.data ?? j.cards ?? [];
  };
  let all = await list();
  const has = (t) => all.some((c) => (c.title || '').includes(t));
  const missing = [];
  if (!has('拖拽排程回归 A')) {
    missing.push({ content: '拖拽排程回归', type: 'task', status: '进行中', title: '拖拽排程回归 A 90分钟', duration: 90 });
  }
  if (!has('拖拽排程回归 B')) {
    missing.push({ content: '拖拽排程回归', type: 'task', status: 'todo', title: '拖拽排程回归 B 兜底' });
  }
  if (missing.length) {
    await seedHost(hostPort, missing);
    all = await list();
  }
  return all;
}

/**
 * @param {{page: import('playwright').Page, width: number, outDir?: string, hostPort?: number|null}} ctx
 */
export async function runDragSchedule({ page, _width, _outDir, hostPort }) {
  const checks = [];
  const add = (n, ok, d) => checks.push([n, Boolean(ok), d || '']);

  // ── 预置：A = 90 分钟卡（验证时长保留）；B = 无时长卡（15 分钟兜底）──
  // 每次运行都校验（ensure），然后 reload 拉进页面并**等到卡片池渲染完成**
  // 再派发拖拽 —— 否则 vs.allCardsCache 尚未水合，draggedCard() 返回 null，
  // ghost 不出现、drop 静默丢弃（实测 ~1/8 概率的时序抖动）。
  const seededCards = await ensureSeedCards(hostPort);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const t = document.getElementById('cardpool-list')?.textContent || '';
    return t.includes('拖拽排程回归 A') && t.includes('拖拽排程回归 B');
  }, null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(200);

  const cardA = seededCards.find((c) => (c.title || '').includes('拖拽排程回归 A'));
  const cardB = seededCards.find((c) => (c.title || '').includes('拖拽排程回归 B'));
  add('预置卡片就绪（host 返回 A/B）', Boolean(cardA && cardB),
    `A=${cardA?.id ?? '无'} B=${cardB?.id ?? '无'}`);
  if (!cardA || !cardB) return { checks };

  // 视图默认 08:00(480) 起；画布内 y=330px → 480 + (330/30)*15 = 645 → 吸附 08:45→10:45 附近
  // 直接选 y=240 → 480+120=600 → 10:00（正格，稳定无歧义）
  const Y_AT_1000 = 240;

  // 视图模式是持久化偏好（prefGet('journal.viewMode')）：上个宽度的末尾会停在周视图，
  // 新宽度页面随之从周视图启动 —— `.schedule-canvas` 不存在，时间线断言会假红。
  // 必须先显式切回时间线（与末尾切周视图对称）。
  await switchMode(page, 'timeline');

  // ── ① 时间线：ghost 预览（dragover）──
  await dispatchDrag(page, '.schedule-canvas', cardA.id, Y_AT_1000, 'dragover');
  await page.waitForTimeout(120);
  const ghost1 = await page.evaluate(() => {
    const g = document.querySelector('.schedule-canvas .drop-ghost');
    if (!g) return null;
    return {
      top: g.style.top, height: g.style.height,
      time: (g.querySelector('.drop-ghost-time')?.textContent || '').trim(),
      title: (g.querySelector('.drop-ghost-title')?.textContent || '').trim(),
    };
  });
  add('时间线 dragover 出现 ghost 预览块', Boolean(ghost1), JSON.stringify(ghost1));
  add('ghost 显示落点时间段与原时长（10:00–11:30）',
    ghost1?.time === '10:00–11:30',
    `time=${ghost1?.time} top=${ghost1?.top} h=${ghost1?.height}`);

  // ── ①' 真实浏览器口径：dragover 的 dataTransfer 读不到数据（protected mode）──
  // 先走源头 dragstart 缓存卡 id，再用**空** DataTransfer 派发 dragover：
  // 若 ghost 仍出现，说明实现没依赖 dragover 阶段 getData（真实 Chrome 恒空串）。
  // 先按正常路径清掉 ① 的 ghost（dragleave 会同时复位单例节流状态，
  // 直接 DOM remove 不够——节流快取还在，下一次同落点 dragover 会早退不重建）
  await dispatchDrag(page, '.schedule-canvas', cardA.id, Y_AT_1000, 'dragleave');
  await dispatchPoolDragLifecycle(page, cardA.id, 'dragstart');
  await dispatchDrag(page, '.schedule-canvas', null, Y_AT_1000, 'dragover');
  await page.waitForTimeout(120);
  const ghostProtected = await page.evaluate(() => {
    const g = document.querySelector('.schedule-canvas .drop-ghost');
    return g ? (g.querySelector('.drop-ghost-time')?.textContent || '').trim() : null;
  });
  add('dragover 读不到 dataTransfer 时 ghost 仍出现（dragstart 缓存兜底）',
    ghostProtected === '10:00–11:30', `time=${ghostProtected}`);
  // 源头 dragend 兑底：拖到非法区域后 ghost 必须清除（同时复位全局手势标志）
  await dispatchPoolDragLifecycle(page, cardA.id, 'dragend');
  await page.waitForTimeout(80);
  add('池卡 dragend 后 ghost 清除',
    await page.evaluate(() => !document.querySelector('.drop-ghost')));

  // ── ② 时间线：drop 落位（不开编辑器、保留 90 分钟）──
  await dispatchDrag(page, '.schedule-canvas', cardA.id, Y_AT_1000, 'drop');
  await page.waitForTimeout(900);
  const afterDrop = await page.evaluate(() => ({
    editorHidden: document.getElementById('card-editor-overlay')?.classList.contains('hidden') !== false,
    ghostGone: !document.querySelector('.drop-ghost'),
  }));
  const a1 = await cardOf(hostPort, cardA.id);
  add('drop 后编辑器不自动打开', afterDrop.editorHidden, JSON.stringify(afterDrop));
  add('drop 后 ghost 清除', afterDrop.ghostGone);
  add('A 卡落到今天 10:00–11:30（保留 90 分钟）',
    a1?.assignedDate === localDayKey() && a1?.startTime === '10:00' && a1?.endTime === '11:30',
    `assignedDate=${a1?.assignedDate} ${a1?.startTime}–${a1?.endTime}`);

  // ── ③ 反向：拖回卡片池 = 取消排程 ──
  await dispatchDrag(page, '#cardpool-list', cardA.id, 10, 'dragover');
  await page.waitForTimeout(80);
  const poolHi = await page.evaluate(() =>
    document.getElementById('cardpool-list')?.classList.contains('drag-over') === true);
  await dispatchDrag(page, '#cardpool-list', cardA.id, 10, 'drop');
  await page.waitForTimeout(900);
  const a2 = await cardOf(hostPort, cardA.id);
  add('卡片池 dragover 高亮', poolHi);
  add('拖回池后取消排程（四字段清空，duration 保留）',
    a2?.assignedDate == null && a2?.startTime == null && a2?.endTime == null && a2?.duration === 90,
    `assignedDate=${a2?.assignedDate} ${a2?.startTime ?? 'null'}–${a2?.endTime ?? 'null'} dur=${a2?.duration}`);

  // ── ④ 周视图：列 drop（assignedDate = 列日期）──
  await switchMode(page, 'week');
  const weekTarget = await page.evaluate(() => {
    const bodies = [...document.querySelectorAll('.calview-week-body')];
    return bodies.map((b) => ({ day: b.dataset.day })).slice(0, 7);
  });
  const someDay = weekTarget.find((b) => b.day && b.day !== localDayKey());
  add('周视图列就绪（有非今天的列）', Boolean(someDay), JSON.stringify(weekTarget.map((b) => b.day)));
  if (someDay) {
    const sel = `.calview-week-body[data-day="${someDay.day}"]`;
    await dispatchDrag(page, sel, cardB.id, Y_AT_1000, 'dragover');
    await page.waitForTimeout(120);
    const ghostW = await page.evaluate((d) => {
      const g = document.querySelector(`.calview-week-body[data-day="${d}"] .drop-ghost`);
      return g ? (g.querySelector('.drop-ghost-time')?.textContent || '').trim() : null;
    }, someDay.day);
    add('周视图列 dragover 出现 ghost（默认时长 30 分钟 = 两格）', ghostW === '10:00–10:30', `time=${ghostW}`);

    // ── ⑤ ghost 清理：dragleave ──
    await dispatchDrag(page, sel, cardB.id, Y_AT_1000, 'dragleave');
    await page.waitForTimeout(80);
    const ghostGoneAfterLeave = await page.evaluate(() => !document.querySelector('.drop-ghost'));
    add('周视图 dragleave 后 ghost 清除', ghostGoneAfterLeave);

    // ── ⑥ 周视图 drop：落列日期 ──
    await dispatchDrag(page, sel, cardB.id, Y_AT_1000, 'drop');
    await page.waitForTimeout(900);
    const b1 = await cardOf(hostPort, cardB.id);
    add('B 卡落到周视图目标列（10:00–10:30）',
      b1?.assignedDate === someDay.day && b1?.startTime === '10:00' && b1?.endTime === '10:30',
      `assignedDate=${b1?.assignedDate} ${b1?.startTime}–${b1?.endTime}`);
  }

  // ── ⑦ 清理：删掉本场景创建的卡（多宽度共享 DB，防污染既有断言）──
  for (const c of [cardA, cardB]) {
    await fetch(`http://127.0.0.1:${hostPort}/api/cards/${c.id}`, { method: 'DELETE' }).catch(() => null);
  }
  await page.waitForTimeout(400);
  // 视图模式是持久化偏好：跑完切回时间线，不把周视图留给后续宽度/场景。
  await switchMode(page, 'timeline');

  return { checks };
}
