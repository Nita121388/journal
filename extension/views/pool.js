/**
 * pool.js — 统一卡片池视图（views 层）
 *
 * 待办不是独立区块：卡片池是唯一主视图，status ∈ {todo,doing} 即「待办」筛选。
 * 渲染从 `vs.allCardsCache` 过滤（不读数据源），徽标按 Field Registry 的 behavior 分发。
 *
 * 跨层调用（重渲染 / 打开编辑器）经 state/actions.js 由组合根注入。
 */

import { currentTime, snapUpToQuarter, addMinutes, cardMatchesQuery } from '../shared/model.js';
import { listFieldDefs, readValueFromCard } from '../shared/field-registry.js';
import { shortDate, typeIcon, cardPrimaryText } from '../shared/format.js';
import { els } from '../components/dom-refs.js';
import { vs } from '../state/view-state.js';
import { patchCard, deleteCardWithUndo } from '../features/card-actions.js';
import { actions } from '../state/actions.js';

// 术语统一（评审 P1-5）：`待办` 曾同时指「一个筛选集」「一个状态」「一个类型」
// 现在拆分清楚：筛选集叫「未完成」（todo ∪ doing），状态叫「未开始/进行中/已完成/纯记录」。
const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'active', label: '⏳ 未完成' },
  { value: 'todo', label: '📌 未开始' },
  { value: 'doing', label: '🔥 进行中' },
  { value: 'done', label: '✅ 已完成' },
  { value: 'none', label: '📝 纯记录' },
];
/** 与筛选条共用同一套词，避免同一状态两个名字 */
const STATUS_LABEL = { todo: '未开始', doing: '进行中', done: '已完成', none: '纯记录' };

/** 状态匹配：active = todo ∪ doing（待办视图） */
function statusMatches(card, f) {
  if (!f) return true;
  if (f === 'active') return card.status === 'todo' || card.status === 'doing';
  return card.status === f;
}

/** 卡片池状态 + 项目 筛选条（渲染到 pool-filter-row） */
function renderPoolFilters() {
  const row = els.poolFilterRow;
  if (!row) return;
  row.replaceChildren();
  for (const { value, label } of STATUS_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (vs.poolStatusFilter === value ? ' is-active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      vs.poolStatusFilter = value;
      vs.activeViewId = '';
      renderCardPool();
    });
    row.append(btn);
  }
  // 筛选区（项目/标签，渐进披露）：静态容器，JS 只填内容
  const extra = els.poolExtra;
  if (extra) {
    extra.replaceChildren();
    // 项目筛选
    const projects = [...new Set((vs.allCardsCache ?? []).map(c => c.project).filter(Boolean))];
    if (projects.length) {
      const label = document.createElement('span');
      label.className = 'pool-extra-label';
      label.textContent = '项目';
      extra.append(label);
      const sel = document.createElement('select');
      sel.className = 'pool-project-select';
      sel.title = '按项目筛选';
      const none = document.createElement('option');
      none.value = ''; none.textContent = '全部';
      sel.append(none);
      for (const p of projects) {
        const o = document.createElement('option');
        o.value = p; o.textContent = p;
        sel.append(o);
      }
      sel.value = vs.poolProjectFilter;
      sel.addEventListener('change', () => { vs.poolProjectFilter = sel.value; vs.activeViewId = ''; renderCardPool(); });
      extra.append(sel);
    }
  }
}

/** 卡片池标签筛选（填充到筛选区 #pool-extra） */
function renderPoolTagFilters(pool) {
  const extra = els.poolExtra;
  if (!extra) return;
  const names = [...new Set(pool.flatMap(c => c.tags ?? []))];
  if (!names.length) {
    if (els.poolExtraFilter) els.poolExtraFilter.hidden = !extra.querySelector('.pool-project-select');
    return;
  }
  if (els.poolExtraFilter) els.poolExtraFilter.hidden = false;
  const label = document.createElement('span');
  label.className = 'pool-extra-label';
  label.textContent = '标签';
  extra.append(label);
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (vs.poolTagFilter ? '' : ' is-active');
  all.textContent = '# 全部';
  all.addEventListener('click', () => { vs.poolTagFilter = ''; vs.activeViewId = ''; renderCardPool(); });
  extra.append(all);
  for (const name of names) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (vs.poolTagFilter === name ? ' is-active' : '');
    btn.textContent = '#' + name;
    btn.addEventListener('click', () => { vs.poolTagFilter = name; vs.activeViewId = ''; renderCardPool(); });
    extra.append(btn);
  }
}

/** 小芯片（属性/日期展示） */
function chipSpan(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}


/** 列表一次最多渲染的卡片数（避免几百张卡时侧栏卡顿）；更多靠筛筛选/搜索缩小范围。 */
const POOL_RENDER_LIMIT = 200;

/** 渲染整个卡片池（含筛选条与空态）。 */
export async function renderCardPool() {
  const all = vs.allCardsCache.filter(c => !c.deleted);
  const pool = all.filter(c => {
    const sOk = statusMatches(c, vs.poolStatusFilter);
    const tagOk = !vs.poolTagFilter || (c.tags ?? []).includes(vs.poolTagFilter);
    const projOk = !vs.poolProjectFilter || (c.project ?? '') === vs.poolProjectFilter;
    const qOk = cardMatchesQuery(c, vs.poolQuery ?? '');
    return sOk && tagOk && projOk && qOk;
  });
  els.cardpoolCount.textContent = pool.length;
  els.cardpoolList.replaceChildren();
  els.cardpoolList.classList.toggle('is-list', vs.poolLayout === 'list');
  renderPoolFilters();
  renderPoolTagFilters(all);

  if (!pool.length) {
    const li = document.createElement('li');
    li.className = 'todo-empty';
    const filtering = !!(vs.poolStatusFilter || vs.poolTagFilter || vs.poolProjectFilter || vs.poolQuery || vs.activeViewId);
    const title = document.createElement('div');
    title.className = 'empty-title';
    if (filtering) {
      title.textContent = vs.poolQuery ? `没有匹配「${vs.poolQuery}」的卡片` : '没有符合当前筛选的卡片';
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'empty-action';
      act.textContent = '清除筛选';
      act.addEventListener('click', () => {
        vs.poolStatusFilter = ''; vs.poolTagFilter = ''; vs.poolProjectFilter = '';
        vs.poolQuery = ''; vs.activeViewId = '';
        if (els.poolSearch) els.poolSearch.value = '';
        renderCardPool();
      });
      li.append(title, act);
    } else {
      title.textContent = all.length ? '还没有卡片' : '今天还没有记录';
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'empty-action';
      act.textContent = '＋ 新建卡片';
      act.addEventListener('click', () => actions.openEditor(null, currentTime(), vs.selectedDate));
      li.append(title, act);
    }
    els.cardpoolList.append(li);
    return;
  }

  // 徽标写的是**真实**总数，列表却只渲染前 200 —— 必须显式告知，
  // 否则用户看到「250」却怎么滚都只有 200 张，会认为数据丢了。
  const hiddenCount = Math.max(0, pool.length - POOL_RENDER_LIMIT);

  for (const card of pool.slice(0, POOL_RENDER_LIMIT)) {
    const li = document.createElement('li');
    // 状态灯类：按注册表 behavior:'status' 读取（等价于 card.status，集中声明）
    const statusVal = readValueFromCard(card, 'status') ?? card.status;
    li.className = 'cardpool-item status-' + (statusVal || 'none');
    if (statusVal === 'done') li.classList.add('is-done');
    li.dataset.id = card.id;
    // 键盘可达：卡片可 Tab 聚焦，Enter/空格打开编辑器
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${cardPrimaryText(card, '空卡片')}${statusVal && statusVal !== 'none' ? '，' + (STATUS_LABEL[statusVal] || statusVal) : ''}`);
    // 支持拖拽到今日时间线（HTML5 DnD）
    li.draggable = true;
    let cardDragged = false; // 真拖拽后抑制 click 打开编辑器
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('is-dragging');
      cardDragged = false;
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      cardDragged = true;
      setTimeout(() => { cardDragged = false; }, 0);
    });

    const icon = document.createElement('span');
    icon.className = 'cardpool-type-icon';
    icon.textContent = typeIcon(card.type, card.emoji);

    const text = document.createElement('span');
    text.className = 'cardpool-text';
    text.textContent = cardPrimaryText(card, '(空)');

    li.append(icon, text);

    // 状态 + 进度 + 优先级：按注册表 behavior 分发（种子顺序 = 渲染顺序）
    const metaRow = document.createElement('span');
    metaRow.className = 'cardpool-meta';
    for (const def of listFieldDefs({ source: 'builtin' })) {
      const b = def.behavior;
      if (!b || b === 'none' || def.required) continue;
      if (b !== 'status' && b !== 'priority' && b !== 'progress') continue;
      const v = readValueFromCard(card, def.key);
      if (b === 'status') {
        metaRow.append(chipSpan('cardpool-status-badge', STATUS_LABEL[v] || v || '纯记录'));
      } else if (b === 'priority') {
        if (v && v !== 'medium') metaRow.append(chipSpan('cardpool-prio', v === 'high' ? '🔴' : '🟢'));
      } else if (b === 'progress') {
        if (v != null) metaRow.append(chipSpan('cardpool-progress', `${v}%`));
      }
    }
    li.append(metaRow);

    // 日期 / 项目 / 自定义属性：按注册表 behavior 分发（种子顺序 = 渲染顺序）
    const chips = document.createElement('span');
    chips.className = 'cardpool-chips';
    for (const def of listFieldDefs({ source: 'builtin' })) {
      const b = def.behavior;
      if (b !== 'date' && b !== 'project' && b !== 'schedule') continue;
      const v = readValueFromCard(card, def.key);
      if (b === 'date') {
        if (v) chips.append(chipSpan('cardpool-chip', shortDate(v)));
      } else if (b === 'project') {
        if (v) chips.append(chipSpan('cardpool-chip', '📁 ' + v));
      } else if (b === 'schedule') {
        const d = v && typeof v === 'object' ? v.duration : v;
        if (d != null && d > 0) chips.append(chipSpan('cardpool-chip', `⏱️ ${d}分`));
      }
    }
    for (const [k, v] of Object.entries(card.props ?? {})) {
      if (v === null || v === undefined || v === '') continue;
      chips.append(chipSpan('cardpool-chip', `•${k}: ${v}`));
    }
    if (chips.childNodes.length) li.append(chips);

    // 只读系统元数据：修改时间 + 来源（AI/人工）
    const sysmeta = document.createElement('span');
    sysmeta.className = 'cardpool-sysmeta';
    const ub = card.meta?.updatedBy;
    const origin = ub?.origin === 'human' ? '👤人工' : (ub?.agent || ub?.model) ? '🤖AI' : '';
    const at = card.updatedAt ? shortDate(card.updatedAt.slice(0, 10)) : '';
    sysmeta.textContent = [at, origin].filter(Boolean).join(' · ');
    if (sysmeta.textContent) li.append(sysmeta);

    const schedBtn = document.createElement('button');
    schedBtn.className = 'cardpool-schedule-btn';
    schedBtn.textContent = '📅';
    schedBtn.title = '安排到某天';
    schedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = snapUpToQuarter(currentTime());
      void patchCard(
        card.id,
        { assignedDate: vs.selectedDate, time: st, startTime: st, endTime: addMinutes(st, 15) },
        '安排失败：本机服务未连接',
      );
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'cardpool-delete-btn';
    delBtn.textContent = '🗑️';
    delBtn.title = '删除卡片';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deleteCardWithUndo(card);
    });

    // 点击编辑（拖拽后抑制一次，避免 drop 后误触）
    li.addEventListener('click', () => { if (!cardDragged) actions.openEditor(card, currentTime(), vs.selectedDate); });
    li.addEventListener('keydown', (e) => {
      // 只响应 li 自身获得焦点的情况：子按钮（安排/删除）聚焦时 Enter/空格应走其原生激活，
      // 否则会被 preventDefault 拦下、误开编辑器
      if (e.target !== li) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        actions.openEditor(card, currentTime(), vs.selectedDate);
      }
    });

    li.append(schedBtn, delBtn);
    els.cardpoolList.append(li);
  }

  if (hiddenCount > 0) {
    const more = document.createElement('li');
    more.className = 'todo-empty pool-truncated';
    const t = document.createElement('div');
    t.className = 'empty-title';
    t.textContent = `仅显示前 ${POOL_RENDER_LIMIT} 张，还有 ${hiddenCount} 张未显示`;
    const hint = document.createElement('div');
    hint.className = 'pool-truncated-hint';
    hint.textContent = '用搜索或筛选缩小范围即可看到其余卡片（数据都在，没有丢）';
    more.append(t, hint);
    els.cardpoolList.append(more);
  }
}
