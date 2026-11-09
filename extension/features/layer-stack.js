/**
 * layer-stack.js — 浮层唯一所有者（features 层）
 *
 * 动机（11-09 隐式状态机勘察，缺陷 3「Esc 穿透链」）：
 * 每个浮层模块各自在 document 上挂 Esc / 外点监听，entries/bind-editor.js 又手写一条
 * 「哪个浮层先关」的优先级 if 链 —— 新增浮层忘了插队，Esc 会直接穿透关掉编辑器，
 * 丢掉整份未保存的表单（昨天加字段浮层时已差点踩到）。
 *
 * 收敛：所有浮层在这里登记成一个栈（pushLayer）。
 *   - Esc：window capture keydown，只关**栈顶**一层（preventDefault + stopPropagation）；
 *     栈空时不拦截，让既有逻辑兜底。
 *   - 外点：document capture mousedown，只 dismiss **栈顶**且 dismissOnOutsideClick 的层
 *     （目标在 el 或 ignore 元素内则不关 —— 兼容「点触发器重开」语义）。
 *   - 关闭动作不属于这里：各层 close 回调沿用既有 closeX 函数（全部幂等），
 *     本模块只决定「谁被关闭」，不决定「怎么关闭」。
 *
 * 新增浮层只需要：打开时 pushLayer、关闭函数里 popLayer，Esc / 外点自动获得正确优先级。
 */

/**
 * z-index 阶梯（单一来源，值抄自 sidepanel.css / select.css 的既有注释与规则）。
 * 新增浮层必须从这里取常量建层，不得自写数字；改阶梯 = 同时改两侧 CSS 注释与这里。
 */
export const LAYER_Z = Object.freeze({
  EDITOR: 100,      // 卡片编辑器 overlay（#card-editor-overlay）
  BUILDER: 120,     // 模板构建器 overlay（#template-builder-overlay）
  POPOVER: 130,     // 行级浮层：右键菜单 / 字段选择 / 行内图标选择（fixed 定位那批）
  PROP_DIALOG: 140, // 属性定义弹窗（#tpl-prop-overlay）
  SELECT: 150,      // 自建下拉 popover（.js-select-pop）
  APP_DIALOG: 300,  // 应用内对话框（#app-dialog）
});
// 注：编辑器/构建器内的 emoji picker（.emoji-picker，absolute、随宿主 overlay 层级）
// 不占独立阶梯位 —— 它们在栈里是宿主之上的独立层，视觉上仍嵌在宿主内。

/**
 * @typedef {object} Layer
 * @property {string} layer.id 层标识（同 id 视为同一浮层，栈内唯一）
 * @property {HTMLElement|null} layer.el 浮层元素（外点判断「是否在内」；null = 无外点内区）
 * @property {() => void} layer.close 关闭回调（复用既有 closeX，必须幂等）
 * @property {boolean} layer.dismissOnOutsideClick 外点是否关闭（菜单/下拉 true，模态 false）
 * @property {HTMLElement[]} layer.ignore 外点豁免元素（触发器等：点它不算外点）
 */

/** @type {Layer[]} 栈底 → 栈顶 */
const stack = [];

/**
 * 登记一个浮层（通常在 open* 里调用）。重复 id 先静默出栈旧的（openX 一般已先 closeX，
 * 这里只是防御：保证栈内 id 唯一，不重复关闭）。
 * @param {Layer} opts
 * @returns {Layer}
 */
export function pushLayer({ id, el = null, close, dismissOnOutsideClick = true, ignore = [] }) {
  const i = stack.findIndex((l) => l.id === id);
  if (i >= 0) {
    stack.splice(i, 1);
    console.debug(`[layer-stack] pushLayer 重复 id「${id}」：旧层被静默出栈`);
  }
  const layer = { id, el, close, dismissOnOutsideClick, ignore: [...ignore] };
  stack.push(layer);
  return layer;
}

/**
 * 出栈（通常在 close* 里调用）。只出栈，**不调用 close**（关闭动作由调用方自己的
 * 关闭路径执行；这里只负责让栈与 DOM 状态保持一致）。
 * @param {string} [id] 指定 id；缺省 = 出栈顶。找不到 = 幂等 no-op。
 */
export function popLayer(id) {
  if (!stack.length) return;
  if (id === undefined) { stack.pop(); return; }
  const i = stack.findIndex((l) => l.id === id);
  if (i >= 0) stack.splice(i, 1);
}

/** 栈的只读快照（栈底 → 栈顶；返回副本，改副本不影响栈）。 */
export function layers() {
  return [...stack];
}

/** 清空栈（测试用）。 */
export function resetLayers() {
  stack.length = 0;
}

/* ── 统一 Esc：只关栈顶 ──
 * capture 在 window 上（比任何 document/元素监听都早），preventDefault + stopPropagation
 * 之后，旧的「浮层各自抢 Esc」与「编辑器全局 Esc」都不会再收到这次按键。
 */
window.addEventListener('keydown', (e) => {
  if (!stack.length || e.key !== 'Escape') return;
  // IME 输入法组合中：Esc 用于取消组合（不关浮层）
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1].close();
}, true);

/* ── 统一外点：只 dismiss 栈顶且允许外点关闭的层 ──
 * 用 mousedown（早于 click）：登记发生在某次 click 的处理器里时，
 * 那次点击的 mousedown 已经过去，不会「一打开就被自己关掉」。
 */
document.addEventListener('mousedown', (e) => {
  if (!stack.length) return;
  const top = stack[stack.length - 1];
  if (!top.dismissOnOutsideClick) return;
  const t = /** @type {Node} */ (e.target);
  if (top.el && top.el.contains(t)) return;
  if (top.ignore.some((el) => el && (el === t || el.contains(t)))) return;
  top.close();
}, true);
