/**
 * gesture.js — 拖拽类手势的全局标志唯一写者（views 层）
 *
 * 动机（11-09 隐式状态机勘察 P4）：拖拽/缩放/框选/排序拖拽共 4 份复制粘贴的
 * 指针交互实现，各自手写 body 全局标志（is-dragging / is-resizing / tpl-dragging）
 * 与「拖完后吞掉一次 click」的 suppressClick —— 复制的第二份永远不同步修 bug
 * （周视图那份曾漏过 grid-label 守卫）。is-dragging 一旦泄漏，
 * entries/app.js 的轮询跳过渲染会永远成立，界面从此不更新。
 *
 * 收敛（本模块只做三件事，不动各手势的吸附/钳制/持久化逻辑）：
 *   1. beginGesture/endGesture：body 全局标志的**唯一写者**。
 *      写 `document.body.dataset.gesture`（观测约定，dev-loop 可断言）；
 *      迁移期同时写旧 body class（is-dragging 等，CSS 与 app.js 旧读还依赖它，
 *      待所有写方/读取方迁完、CSS 选择器退场后一并删除）。
 *   2. suppressNextClick(el)：统一「拖完后吞掉下一次 click」语义 ——
 *      document capture 一次 click 即失效，不再让每个实现各存一个布尔。
 *   3. bindPointerDrag：press → move → up/cancel 的挂载内核（监听器增删、
 *      finally 自愈）。各实现只需提供 onStart/onMove/onEnd 业务回调；
 *      回调抛错不会让全局标志泄漏（finally 兜底清）。
 *
 * 不做的事：不接管吸附/钳制/阈值判定 —— 阈值是各手势的本地实现细节，
 * 收进内核反而模糊语义（行为等价优先于统一）。
 */

/**
 * 手势登记表：kind → 迁移期需同步写的旧 body class。
 * kind 也是 `document.body.dataset.gesture` 的观测值（dev-loop 断言点）。
 */
export const GESTURES = Object.freeze({
  drag: { legacyBodyClass: 'is-dragging' },     // 时间线卡片纵向移动（timeline-card）
  resize: { legacyBodyClass: 'is-resizing' },   // 时间线卡片底部缩放手柄（timeline-card）
  'tpl-drag': { legacyBodyClass: 'tpl-dragging' }, // 模板构建器属性行排序拖拽（template-rows）
  'pool-drag': {},                             // 卡片池 HTML5 DnD（无旧 body class）
});

/** @type {Map<string, number>} kind → 在途手势数（同 kind 可嵌套，只清一次） */
const counts = new Map();
/** @type {string[]} 在途 kind 栈（dataset 展示栈顶；同 kind 合并计数） */
const order = [];

/** 把当前在途手势写到 body（dataset + 迁移期旧 class）。 */
function applyFlags() {
  if (typeof document === 'undefined' || !document.body) return;
  const body = document.body;
  if (order.length) body.dataset.gesture = order[order.length - 1];
  else delete body.dataset.gesture;
  for (const [kind, { legacyBodyClass }] of Object.entries(GESTURES)) {
    if (legacyBodyClass) body.classList.toggle(legacyBodyClass, counts.get(kind) > 0);
  }
}

/**
 * 开始一个手势（body 全局标志唯一入口）。
 * @param {keyof typeof GESTURES} kind 手势种类
 */
export function beginGesture(kind) {
  if (!GESTURES[kind]) return;
  const n = (counts.get(kind) ?? 0) + 1;
  counts.set(kind, n);
  if (n === 1) order.push(kind);
  applyFlags();
}

/**
 * 结束一个手势（幂等：未开始的 kind 不抛不写）。
 * @param {keyof typeof GESTURES} kind
 */
export function endGesture(kind) {
  if (!GESTURES[kind]) return;
  const n = counts.get(kind) ?? 0;
  if (n > 1) { counts.set(kind, n - 1); applyFlags(); return; }
  counts.delete(kind);
  const i = order.lastIndexOf(kind);
  if (i >= 0) order.splice(i, 1);
  applyFlags();
}

/** 当前在途手势快照（栈底 → 栈顶；观测用，勿写）。 */
export function activeGestures() {
  return [...order];
}

/** 复位全部手势标志（测试 / 自愈兜底用）。 */
export function resetGestures() {
  counts.clear();
  order.length = 0;
  applyFlags();
}

/* ── suppressNextClick：拖完后吞掉下一次 click ──
 * 语义统一自 4 份实现各自的 suppressClick 布尔：
 *   - document **capture** 抢在一切元素监听之前（早于各实现的冒泡 click）；
 *   - 命中一次即失效（下一次 click 正常派发）；
 *   - 标记的是「被拖的元素」，click 目标是它的后代也算命中（原实现挂在 el 上
 *     依赖冒泡，语义等同）；
 *   - click 落在原生交互控件（button/input 等，footer 按钮们）上时不吞 ——
 *     原实现里这些按钮自己 stopPropagation，本来就到不了 el 的 click 监听。
 */
const suppressed = new WeakSet();

function onSuppressClickCapture(e) {
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;
  let n = target;
  while (n) {
    if (suppressed.has(n)) {
      suppressed.delete(n);
      const ctl = target.closest('button, a, input, select, textarea');
      if (ctl && n.contains(ctl) && ctl !== n) return; // 控件有自己的语义，放行
      e.stopPropagation();
      return;
    }
    n = n.parentElement;
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', onSuppressClickCapture, true);
}

/**
 * 抑制 el 上的下一次 click（拖拽/缩放/框选结束后调用一次）。
 * @param {HTMLElement} el 被拖过的元素
 */
export function suppressNextClick(el) {
  if (el) suppressed.add(el);
}

/* ── bindPointerDrag：press → move → up/cancel 挂载内核 ──
 * 各手势实现原本各自手写「pointerdown 时挂 move/up/cancel、up 时摘掉」的
 * 监听器增删 + finally 自愈。这里统一挂载与清理，业务回调抛错时
 * endGesture / suppressNextClick 仍在 finally 里执行 —— 全局标志不泄漏。
 */

/**
 * @typedef {object} PointerDragOpts
 * @property {(e: PointerEvent) => void} [opts.onStart] 按下（setPointerCapture 等在此做）
 * @property {(e: PointerEvent) => void} [opts.onMove] 移动（阈值判定等本地逻辑在此做）
 * @property {(e: PointerEvent) => void} [opts.onEnd] 抬起/取消（持久化等在此做；抛错不泄漏标志）
 * @property {(e: PointerEvent) => boolean} [opts.shouldStart] 返回 false 忽略这次按下
 * @property {keyof typeof GESTURES} [opts.gestureKind] begin/endGesture 的 kind
 * @property {boolean | (() => boolean)} [opts.suppressClickOnEnd] 结束时是否吞下一次 click
 * @property {HTMLElement} [opts.suppressClickTarget] 吞 click 时标记的元素
 *   （默认 = el。若 el 只是手柄而「点击会触发动作」的是它的宿主（卡片本体），
 *   必须传宿主 —— click 事件的目标是 mousedown/mouseup 命中元素的公共祖先，
 *   常常不是手柄本身）
 */

/**
 * 在 el 上绑定一次「按下 → 移动 → 抬起/取消」的指针拖拽内核。
 * @param {HTMLElement} el 挂载元素（down/move/up/cancel 都在它身上，配合 setPointerCapture）
 * @param {PointerDragOpts} [opts]
 * @returns {() => void} 解绑函数
 */
export function bindPointerDrag(el, opts = {}) {
  if (!el) return () => {};
  const {
    onStart, onMove, onEnd, shouldStart, gestureKind = null,
    suppressClickOnEnd = false, suppressClickTarget = el,
  } = opts;
  let dragging = false;

  const teardown = () => {
    el.removeEventListener('pointermove', handleMove);
    el.removeEventListener('pointerup', handleUp);
    el.removeEventListener('pointercancel', handleUp);
  };

  const handleMove = (e) => {
    if (!dragging) return;
    try {
      onMove?.(e);
    } catch (err) {
      // 自愈：move 回调抛错说明手势状态已不可信，立即中止并清标志
      console.error('[gesture] onMove 抛错，手势中止', err);
      dragging = false;
      teardown();
      if (gestureKind) endGesture(gestureKind);
    }
  };

  const handleUp = (e) => {
    if (!dragging) return;
    dragging = false;
    teardown();
    try {
      onEnd?.(e);
    } catch (err) {
      // 回调抛错不向上冒（否则同一个坏回调会进全局 error 处理），但必须留痕；
      // 与原来 onUp 里的未处理拒绝可见度一致（console 里能看到）。
      console.error('[gesture] onEnd 抛错', err);
    } finally {
      // 自愈核心：onEnd 抛错也要清掉全局标志，
      // 否则 is-dragging 泄漏 = app.js 轮询渲染被永久跳过（界面冻结更新）
      if (gestureKind) endGesture(gestureKind);
      if (typeof suppressClickOnEnd === 'function' ? suppressClickOnEnd() : suppressClickOnEnd) {
        suppressNextClick(suppressClickTarget);
      }
    }
  };

  const handleDown = (e) => {
    if (dragging) return;
    if (shouldStart && !shouldStart(e)) return;
    dragging = true;
    if (gestureKind) beginGesture(gestureKind);
    try {
      onStart?.(e);
    } catch (err) {
      dragging = false;
      if (gestureKind) endGesture(gestureKind);
      console.error('[gesture] onStart 抛错', err);
      return;
    }
    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerup', handleUp);
    el.addEventListener('pointercancel', handleUp);
  };

  el.addEventListener('pointerdown', handleDown);
  return () => {
    teardown();
    el.removeEventListener('pointerdown', handleDown);
  };
}
