/**
 * bind-editor.js — 编辑器与模板构建器事件装配（entries 层）
 *
 * 卡片编辑器浮层（键盘快捷键、字段联动、属性表单、emoji 瓦片）、
 * 模板构建器浮层（关闭/保存/预填/新建属性/外部点击关闭）。
 */

import {
  editorOverlay, editorStart, editorEnd, editorDurationMin, editorStatus,
  editorStatusCustom, editorStatusSeg, editorPrioritySeg, editorProgress, editorProgressNumber,
  btnAddProp, btnPropLib, btnEmojiTile, propFormOk, propFormCancel, propType, propOptions,
  saveTemplateBtn, editorSave, editorCancel, editorClose,
  tplBuilderOverlay, tplBuilderClose, tplCancel, tplSave, tplPrefill, tplBuilderTile,
  tplNpOk, tplNpCancel, tplNpType, tplNpOptions,
} from '../components/dom-refs.js';
import {
  openEmojiPicker, saveEditor, updateEditorDuration, onEditorDurationInput,
  onEditorStatusChange, onStatusClicked, onEditorProgressChange, updateStatusSeg, updatePrioritySeg,
  requestCloseEditor,
} from '../features/card-editor.js';
import { openPropForm, closePropForm, onPropFormOk, openPropLibrary } from '../features/editor-props.js';
import { tplPropOverlay, closeTplPropDialog, closeTemplateBuilder } from '../features/template-builder.js';
import {
  fieldPickerEl, closeFieldPicker, propRowMenuEl, closePropRowMenu,
  rowIconPop, closeRowIconPicker,
} from '../features/template-fields.js';
import {
  saveTemplateBuilder, prefillTemplateFromCard, onTplNewPropOk, toggleTplBuilderPicker,
  saveEditorAsTemplate,
} from '../features/template-menu.js';

/** 绑定编辑器与模板构建器的事件。 */
export function bindEditor() {
  // ── 键盘快捷键（Esc 关闭 / ⌘⏎ 保存） ──
  document.addEventListener('keydown', (e) => {
    const cardOpen = editorOverlay && !editorOverlay.classList.contains('hidden');
    const tplOpen = tplBuilderOverlay && !tplBuilderOverlay.classList.contains('hidden');
    if (!cardOpen && !tplOpen) return;
    // 属性行右键菜单 / 图标浮层 / 字段选择浮层开着时，Esc 只关浮层
    if (propRowMenuEl && e.key === 'Escape') {
      e.preventDefault(); closePropRowMenu(); return;
    }
    if (fieldPickerEl && e.key === 'Escape') {
      e.preventDefault(); closeFieldPicker(); return;
    }
    if (rowIconPop && e.key === 'Escape') {
      e.preventDefault(); closeRowIconPicker(); return;
    }
    // 属性编辑弹窗开着时，Esc 先关弹窗
    const propOpen = tplPropOverlay && !tplPropOverlay.classList.contains('hidden');
    if (propOpen && e.key === 'Escape') {
      e.preventDefault(); closeTplPropDialog(); return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (tplOpen) closeTemplateBuilder(); else void requestCloseEditor();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (tplOpen) void saveTemplateBuilder(); else void saveEditor();
    }
  });

  editorSave.addEventListener('click', saveEditor);
  editorCancel.addEventListener('click', () => void requestCloseEditor());
  editorClose.addEventListener('click', () => void requestCloseEditor());
  editorStart?.addEventListener('change', updateEditorDuration);
  editorEnd?.addEventListener('change', updateEditorDuration);
  editorDurationMin?.addEventListener('change', onEditorDurationInput);
  editorStatus?.addEventListener('change', onEditorStatusChange);
  // 分段状态胶囊
  editorStatusSeg?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (btn?.dataset.status) onStatusClicked(btn.dataset.status);
  });
  // 分段优先级胶囊（高/中/低）
  editorPrioritySeg?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (btn?.dataset.priority) updatePrioritySeg(btn.dataset.priority);
  });
  // 自定义状态：输入即设为自定义状态，清空回退纯记录
  editorStatusCustom?.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (v) { editorStatus.value = v; updateStatusSeg(v); onEditorStatusChange(); }
    else { editorStatus.value = 'none'; updateStatusSeg('none'); onEditorStatusChange(); }
  });
  // 进度：手输数值（滑块/手输双向）
  editorProgressNumber?.addEventListener('change', () => {
    const p = Math.max(0, Math.min(100, Math.round(Number(editorProgressNumber.value) || 0)));
    if (editorProgress) editorProgress.value = p;
    onEditorProgressChange();
  });
  // 点击头部图标瓦片打开 emoji picker
  btnEmojiTile?.addEventListener('click', openEmojiPicker);
  editorProgress?.addEventListener('change', onEditorProgressChange);
  editorProgress?.addEventListener('input', onEditorProgressChange);
  btnAddProp?.addEventListener('click', openPropForm);
  btnPropLib?.addEventListener('click', openPropLibrary);
  propFormCancel?.addEventListener('click', closePropForm);
  propFormOk?.addEventListener('click', onPropFormOk);
  propType?.addEventListener('change', () => {
    const wrap = propOptions?.closest('.prop-options-wrap');
    if (wrap) wrap.classList.toggle('hidden', propType.value !== 'select' && propType.value !== 'multi');
  });
  saveTemplateBtn?.addEventListener('click', saveEditorAsTemplate);
  // 遮罩点击 = 关闭（与 Esc / 取消同一语义）；有未保存改动时先确认。
  // 曾经是「点遮罩=保存」，与 Esc 的丢弃语义相反 —— 同一点击动作两种相反结果。
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) void requestCloseEditor();
  });

  // ── 模板构建器事件 ──
  tplBuilderClose?.addEventListener('click', closeTemplateBuilder);
  tplCancel?.addEventListener('click', closeTemplateBuilder);
  tplSave?.addEventListener('click', saveTemplateBuilder);
  tplPrefill?.addEventListener('click', prefillTemplateFromCard);
  tplBuilderTile?.addEventListener('click', toggleTplBuilderPicker);
  tplNpOk?.addEventListener('click', onTplNewPropOk);
  tplNpCancel?.addEventListener('click', closeTplPropDialog);
  tplNpType?.addEventListener('change', () => {
    const wrap = tplNpOptions?.closest('.prop-options-wrap');
    if (wrap) wrap.classList.toggle('hidden', tplNpType.value !== 'select' && tplNpType.value !== 'multi');
  });
  tplBuilderOverlay?.addEventListener('click', (e) => {
    // 点击外部关闭；点击瓦片容器内的 emoji picker 不关
    const path = e.composedPath ? e.composedPath() : [e.target];
    if (path.some(el => el?.classList?.contains('ce-tile-wrap') || el?.classList?.contains('template-builder'))) return;
    closeTemplateBuilder();
  });
}
