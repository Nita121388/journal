/**
 * template-menu.js — 模板菜单与模板管理（features 层）

保存模板、从当前卡预填、模板菜单（新建/管理/删除）、从模板建卡。
 */

import { els } from '../components/dom-refs.js';
import { writeValueToCard } from '../shared/field-registry.js';
import { RESERVED_PROPS, currentTime } from '../shared/model.js';
import { actions } from '../state/actions.js';
import { getHostMeta, updateHostMeta } from '../state/host-client.js';
import { savePropLibrary, upsertPropDef } from '../state/prop-library.js';
import { createCardEntry } from '../state/repository.js';
import { vs } from '../state/view-state.js';
import { editingCardId, openEditor } from './card-editor.js';
import { confirmDialog, pickDialog, promptDialog } from './dialog.js';
import { recordRecentEmoji, renderEmojiPicker } from './emoji.js';
import { runWrite, showToast } from './toast.js';
import { REQUIRED_DEFS, closeTemplateBuilder, closeTplPropDialog, findPropDef, isBuiltinKey, normalizeTemplateFields, openTemplateBuilder, openTplPropDialog, renderTemplateBuilder, tplBuilderCleanup, tplBuilderEmoji, tplBuilderName, tplBuilderPicker, tplBuilderState, tplEditKey, tplEditingId, tplNpIcon, tplNpIconPreview, tplNpKey, tplNpLabel, tplNpOk, tplNpOptions, tplNpType } from './template-builder.js';
import { defaultTplValue } from './template-fields.js';

export async function saveTemplateBuilder() {
  const name = (tplBuilderName?.value || '').trim();
  if (!name) { showToast('模板名称不能为空', 'error'); return; }
  const requiredFields = REQUIRED_DEFS.map(def => {
    const f = { key: def.key, value: tplBuilderState.values[def.key] ?? defaultTplValue(def) };
    const ov = tplBuilderState.reqOv?.[def.key] || {};
    if (ov.label && ov.label !== def.label) f.label = ov.label;
    if (ov.icon && ov.icon !== def.icon) f.icon = ov.icon;
    return f;
  });
  const extraFields = tplBuilderState.extra.map(e => {
    const f = { key: e.key, value: tplBuilderState.values[e.key] ?? defaultTplValue(e.def) };
    const base = findPropDef(e.key);
    const ov = {};
    if (e.def.label && e.def.label !== e.key && e.def.label !== base?.label) ov.label = e.def.label;
    if (e.def.icon && e.def.icon !== '•' && e.def.icon !== base?.icon) ov.icon = e.def.icon;
    if (e.def.type && e.def.type !== base?.type) ov.type = e.def.type;
    if (e.def.options && JSON.stringify(e.def.options) !== JSON.stringify(base?.options ?? [])) ov.options = e.def.options;
    return Object.assign(f, ov);
  });
  const fields = [...requiredFields, ...extraFields];
  const tpl = { id: tplEditingId || ('t_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)), name, emoji: tplBuilderState.emoji, fields };
  // 先读后改：host 离线时 updateHostMeta 会抛错（**不会**把已有模板覆盖成一条）
  let created = false;
  const res = await runWrite(
    () => updateHostMeta('templates', (cur) => {
      const list = Array.isArray(cur) ? cur : [];
      const i = list.findIndex(t => t.id === tpl.id);
      created = i === -1;
      return created ? [...list, tpl] : list.map(t => (t.id === tpl.id ? tpl : t));
    }),
    '模板保存失败：本机服务未连接',
  );
  if (!res.ok) return; // 失败：保留构建器内容，用户可重试
  closeTemplateBuilder();
  showToast(created ? '✅ 已保存模板：' + name : '✅ 已更新模板：' + name, 'success');
}

/** 以当前卡片为蓝本预填构建器 */
export function prefillTemplateFromCard() {
  const card = editingCardId ? vs.allCardsCache.find(c => c.id === editingCardId) : null;
  if (!card) { showToast('没有正在编辑的卡片', ''); return; }
  tplBuilderState = { name: tplBuilderState.name, emoji: card.emoji || tplBuilderState.emoji, extra: [], values: {}, reqOv: {} };
  const putReq = (key, value) => { if (value !== undefined && value !== null && value !== '') tplBuilderState.values[key] = value; };
  const putOpt = (key, value) => {
    if (value !== undefined && value !== null && value !== '' && !tplBuilderState.extra.some(x => x.key === key)) {
      const def = findPropDef(key);
      if (def) { tplBuilderState.extra.push({ key, def }); tplBuilderState.values[key] = value; }
    }
  };
  putReq('title', card.title);
  putReq('content', card.content);
  putReq('tags', (card.tags && card.tags.length) ? card.tags : []);
  putOpt('status', card.status && card.status !== 'none' ? card.status : undefined);
  putOpt('progress', card.progress);
  putOpt('priority', card.priority && card.priority !== 'medium' ? card.priority : undefined);
  putOpt('assignedDate', card.assignedDate);
  if (card.startTime || card.endTime || card.duration) putOpt('schedule', { start: card.startTime || '', end: card.endTime || '', duration: card.duration ?? null });
  putOpt('project', card.project);
  for (const [k, v] of Object.entries(card.props || {})) putOpt(k, v);
  if (tplBuilderName) tplBuilderName.value = tplBuilderState.name;
  if (tplBuilderEmoji) tplBuilderEmoji.textContent = tplBuilderState.emoji;
  renderTemplateBuilder();
}

/** 构建器内新建属性（打开表单） */
/** 编辑可选属性的定义（内建=仅此模板覆盖；自定义=写回属性库） */
export function openTplEditProp(key) {
  const entry = tplBuilderState.extra.find(x => x.key === key);
  if (!entry) return;
  tplEditKey = key;
  const isBuiltin = isBuiltinKey(key);
  const disp = entry.def.label && entry.def.label !== key ? entry.def.label : '';
  if (tplNpLabel) tplNpLabel.value = disp;
  if (tplNpKey) { tplNpKey.value = key; tplNpKey.disabled = true; tplNpKey.title = '属性键在编辑时不可改（避免破坏已有数据）'; }
  if (tplNpIcon) tplNpIcon.value = (entry.def.icon && entry.def.icon !== '•') ? entry.def.icon : '';
  if (tplNpIconPreview) tplNpIconPreview.textContent = tplNpIcon.value || '•';
  if (tplNpType) tplNpType.value = entry.def.type || 'text';
  if (tplNpOptions) tplNpOptions.value = (entry.def.options || []).join(',');
  const wrap = tplNpOptions?.closest('.prop-options-wrap');
  if (wrap) wrap.classList.toggle('hidden', entry.def.type !== 'select' && entry.def.type !== 'multi');
  if (tplNpOk) tplNpOk.textContent = isBuiltin ? '保存（仅此模板）' : '保存到属性库';
  openTplPropDialog(`编辑属性「${key}」`);
  tplNpLabel?.focus();
}

/** 新建/编辑属性提交 */
export function onTplNewPropOk() {
  if (tplEditKey) {
    const key = tplEditKey;
    const opts = tplNpOptions?.value ? tplNpOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    const def = { key, label: tplNpLabel?.value.trim() || key, icon: tplNpIcon?.value || '•', type: tplNpType?.value || 'text', ...(opts.length ? { options: opts } : {}) };
    const entry = tplBuilderState.extra.find(x => x.key === key);
    if (entry) entry.def = def;
    if (!isBuiltinKey(key)) { upsertPropDef(key, def); void savePropLibrary(); }
    closeTplPropDialog();
    renderTemplateBuilder();
    showToast(`已更新属性「${key}」`, 'success');
    return;
  }
  addTplNewProp();
}

/** 新建属性：造定义 → 入库 + 加入模板 */
export function addTplNewProp() {
  const key = (tplNpKey?.value || '').trim().replace(/\s+/g, '_');
  if (!key) { showToast('属性名不能为空', 'error'); return; }
  if (RESERVED_PROPS.has(key)) { showToast(`「${key}」是保留字段，不能用作属性名`, 'error'); return; }
  const opts = tplNpOptions?.value ? tplNpOptions.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
  const def = { key, label: tplNpLabel?.value.trim() || key, icon: tplNpIcon?.value || '•', type: tplNpType?.value || 'text', ...(opts.length ? { options: opts } : {}) };
  upsertPropDef(key, def);
  void savePropLibrary();
  if (!tplBuilderState.extra.some(x => x.key === key)) tplBuilderState.extra.push({ key, def });
  if (!(key in tplBuilderState.values)) tplBuilderState.values[key] = defaultTplValue(def);
  closeTplPropDialog();
  renderTemplateBuilder();
  showToast(`已新建属性「${key}」并加入模板`, 'success');
}

/** 构建器默认图标选择器 */
export function toggleTplBuilderPicker() {
  if (!tplBuilderPicker) return;
  if (!tplBuilderPicker.classList.contains('hidden')) { tplBuilderPicker.classList.add('hidden'); return; }
  tplBuilderPicker.classList.remove('hidden');
  tplBuilderCleanup?.();
  tplBuilderCleanup = renderEmojiPicker(tplBuilderPicker, (char) => {
    tplBuilderState.emoji = char;
    if (tplBuilderEmoji) tplBuilderEmoji.textContent = char;
    recordRecentEmoji(char);
    tplBuilderPicker.classList.add('hidden');
  }, { selected: tplBuilderState.emoji });
}

/* ─── 模板菜单（阶段 D 完善） ──────────────────────────── */

export async function openTemplateMenu() {
  const templates = (await getHostMeta('templates')) || [];
  renderTemplateMenu(templates);
}

/** 关闭模板下拉 */
export function closeTemplateMenu() {
  document.getElementById('template-menu')?.remove();
}

/** 用模板新建卡片：按注册表 storage 把模板字段落到卡片一级字段或 card.props */
export async function createFromTemplate(tpl) {
  const fields = normalizeTemplateFields(tpl);
  const patch = { content: '', emoji: tpl.emoji || '', props: {}, provenance: { origin: 'human' } };
  for (const f of fields) {
    writeValueToCard(patch, f?.key, f?.value);
  }
  const card = await createCardEntry(patch);
  await actions.refreshAll();
  openEditor(card, currentTime(), null, null);
}

/** 渲染模板下拉菜单（空白 + 模板 + 管理） */
export function renderTemplateMenu(templates) {
  closeTemplateMenu();
  const btn = els.btnTemplate;
  if (!btn) return;
  const menu = document.createElement('div');
  menu.id = 'template-menu';
  menu.className = 'template-menu';

  if (!templates.length) {
    const hint = document.createElement('div');
    hint.className = 'tpl-empty';
    hint.textContent = '还没有模板，先创建一个';
    menu.append(hint);
  }

  for (const t of templates) {
    const it = document.createElement('button');
    it.type = 'button'; it.className = 'tpl-item';
    const emoji = document.createElement('span');
    emoji.textContent = t.emoji || '🗂️';
    const nm = document.createElement('span');
    nm.textContent = t.name;
    it.append(emoji, nm);
    if (t.fields?.length || t.tags?.length) {
      const tags = Array.isArray(t.fields)
        ? t.fields.filter(f => f.key === 'tags' && Array.isArray(f.value)).flatMap(f => f.value)
        : (t.tags ?? []);
      const summary = t.fields?.length
        ? `${t.fields.length} 属性` + (tags.length ? ' · #' + tags.join(' #') : '')
        : (tags.length ? '#' + tags.join(' #') : '');
      const chips = document.createElement('span');
      chips.className = 'tpl-chips';
      chips.textContent = summary;
      it.append(chips);
    }
    it.addEventListener('click', () => { closeTemplateMenu(); createFromTemplate(t); });
    menu.append(it);
  }

  const create = document.createElement('button');
  create.type = 'button'; create.className = 'tpl-item tpl-create' + (!templates.length ? ' tpl-create-cta' : '');
  create.textContent = '＋ 新建模板' + (templates.length ? '…' : '');
  create.addEventListener('click', () => { closeTemplateMenu(); openTemplateBuilder(); });
  menu.append(create);

  if (templates.length) {
    const mgmt = document.createElement('button');
    mgmt.type = 'button'; mgmt.className = 'tpl-item tpl-manage';
    mgmt.textContent = '⚙️ 管理模板…';
    mgmt.addEventListener('click', () => { closeTemplateMenu(); manageTemplates(templates); });
    menu.append(mgmt);
  }

  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  document.body.append(menu);
  setTimeout(() => {
    const handler = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); } };
    document.addEventListener('click', handler);
  }, 0);
}

/** 模板管理：重命名 / 删除 / 编辑（应用内对话框，不再用原生 prompt/confirm） */
export async function manageTemplates(templates) {
  if (!templates.length) return;
  const idx = await pickDialog({
    title: '选择要管理的模板',
    items: templates.map(t => `${t.emoji || '🗂️'} ${t.name}`),
    okLabel: '下一步',
  });
  if (typeof idx !== 'number') return;
  const tpl = templates[idx];

  const action = await pickDialog({
    title: `「${tpl.name}」`,
    items: ['重命名', '删除', '编辑属性'],
    okLabel: '执行',
  });
  if (typeof action !== 'number') return;
  if (action === 2) {
    closeTemplateMenu();
    openTemplateBuilder(tpl);
    return;
  }

  /** @type {{ok: boolean}} */
  let res;
  if (action === 0) {
    const nn = await promptDialog({ title: '重命名模板', label: '新名称', value: tpl.name, okLabel: '保存' });
    if (!nn) return;
    res = await runWrite(
      () => updateHostMeta('templates', (cur) => (Array.isArray(cur) ? cur : []).map(t => (t.id === tpl.id ? { ...t, name: nn } : t))),
      '重命名失败：本机服务未连接',
    );
  } else {
    const yes = await confirmDialog({
      title: '删除模板',
      message: `删除模板「${tpl.name}」？已用该模板创建的卡片不受影响。`,
      okLabel: '删除',
      danger: true,
    });
    if (!yes) return;
    res = await runWrite(
      () => updateHostMeta('templates', (cur) => (Array.isArray(cur) ? cur : []).filter(t => t.id !== tpl.id)),
      '删除失败：本机服务未连接',
    );
  }
  if (!res.ok) return;
  showToast('✅ 模板已更新', 'success');
}

/** 保存当前卡片为模板 → 打开模板构建器（默认空白，可挑属性/新建属性） */
export function saveEditorAsTemplate() {
  openTemplateBuilder();
}
