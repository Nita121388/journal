/**
 * bind-editor.js — 编辑器与模板构建器事件装配（entries 层）
 *
 * 卡片编辑器浮层（键盘快捷键、字段联动、属性表单、emoji 瓦片）、
 * 模板构建器浮层（关闭/保存/预填/新建属性/外部点击关闭）。
 */

import {
  editorOverlay, editorStart, editorEnd, editorDurationMin,
  editorProgress, editorProgressNumber,
  btnEmojiTile,
  saveTemplateBtn, editorSave, editorCancel, editorClose,
  tplBuilderOverlay, tplBuilderClose, tplCancel, tplSave, tplPrefill, tplBuilderTile,
  tplNpOk, tplNpCancel, tplNpType, tplNpOptions,
} from '../components/dom-refs.js';
import {
  openEmojiPicker, saveEditor, updateEditorDuration, onEditorDurationInput,
  onEditorProgressChange,
  requestCloseEditor,
} from '../features/card-editor.js';
import { closeTemplateBuilder, closeTplPropDialog } from '../features/template-builder.js';
import {
  saveTemplateBuilder, prefillTemplateFromCard, onTplNewPropOk, toggleTplBuilderPicker,
  saveEditorAsTemplate,
} from '../features/template-menu.js';

/** 绑定编辑器与模板构建器的事件。 */
export function bindEditor() {
  // ── 键盘快捷键（Esc 关闭 / ⌘⏎ 保存） ──
  // Esc 的「只关最上层浮层」已由 features/layer-stack.js 统一派发（修缺陷 3：手写
  // 优先级链漏插队时，Esc 会穿透关掉编辑器丢表单）。编辑器/构建器本体也登记在栈里，
  // 栈在时这里的 Esc 分支不会触发；保留它是零成本的兜底（栈意外为空时仍可关闭）。
  document.addEventListener('keydown', (e) => {
    const cardOpen = editorOverlay && !editorOverlay.classList.contains('hidden');
    const tplOpen = tplBuilderOverlay && !tplBuilderOverlay.classList.contains('hidden');
    if (!cardOpen && !tplOpen) return;
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
  // 分段胶囊（优先级）的点击委托由 components/seg.js 在首次渲染时注册，
  // 此处不再重复绑定 —— 否则同一次点击会触发两遍（曾因此出现状态跳回）。
  // 状态/标签：值格点击打开 value-picker 浮层（绑定在 card-editor.js 的 bindStatusCell/bindTagsCell），
  // 选中即回调 onEditorStatusChange / renderEditorTags。
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
  // 自定义属性的添加/复用/新建统一走「＋ 添加属性」浮层（bindAddFieldEntry），
  // 2026-11-10 删掉了编辑器里重复的「新建自定义属性」常驻按钮与属性库 caret。
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
