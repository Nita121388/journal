/**
 * fsm.js — 纯函数状态机原语（shared 层）
 *
 * 为什么自写而不引 XState/Zustand：
 *   - MV3 侧栏无打包器（保持 load unpacked 免构建），第三方状态库要过 bundle/CSP/
 *     审计三道关，而全项目只有十几台小状态机，迁移面得不偿失；
 *   - 转移表是纯数据（可单测、可断言、可文档化），非法转移**不抛**（见下），
 *     这两条 XState 都要靠额外配置才能近似。
 *
 * 为什么非法转移不抛：
 *   - UI 永不因状态库崩——转移失败=保持原状态+console.debug 留痕（开发期可见，
 *     生产静默）。真正的错误路径（如保存失败）由调用方自己的 try/catch + toast 负责。
 *
 * 零依赖约束（shared 层 lint 边界）：本模块不得出现 DOM / storage / chrome / node:*。
 * 状态由**调用方持有**（模块外 `let s = M.initial`），本模块只提供纯函数。
 */

/**
 * 定义一台状态机（纯数据，不冻结状态对象的嵌套形状）。
 *
 * `states` 形如 `{ closed: { OPEN: 'open' }, open: { CLOSE: 'closed', TICK: null } }`：
 *   - 键 = 状态名（恒为字符串），值 = 事件名 → 目标状态 的映射；
 *   - 目标 `null` = **显式自环**：合法事件、无操作（状态不变），用于声明
 *     「这个事件在本状态下出现是预期的，不是漏写转移」。
 *   - 目标省略（未声明的事件）= 非法转移（见 {@link transition}）。
 *
 * @param {{id: string, initial: string, states: Object<string, Object<string, string|null>>}} def
 * @returns {{id: string, initial: string, states: Object<string, Object<string, string|null>>}}
 */
export function defineMachine(def) {
  const { id, initial, states } = def ?? {};
  return { id, initial, states };
}

/**
 * 发一个事件。**纯函数**：不改 machine、不回调，返回转移结果。
 *
 * - 合法转移 → `{ state: 目标, from: 原状态, changed: state !== from }`；
 * - 显式自环（目标 `null`）→ `{ state: 原状态, from, changed: false }`（合法，无 debug）；
 * - 未声明的事件 / 未声明的状态 → 原状态 + `changed:false` + `console.debug`（不抛）。
 *
 * @param {ReturnType<typeof defineMachine>} machine
 * @param {string} state 当前状态（由调用方持有）
 * @param {string} event 事件名（SCREAMING_SNAKE_CASE）
 * @returns {{state: string, from: string, changed: boolean}}
 */
export function transition(machine, state, event) {
  const from = state;
  const row = machine?.states?.[state];
  if (!row) {
    console.debug(`[fsm:${machine?.id}] 未声明的状态「${String(state)}」，事件「${String(event)}」被忽略`);
    return { state: from, from, changed: false };
  }
  if (!Object.prototype.hasOwnProperty.call(row, event)) {
    console.debug(`[fsm:${machine?.id}] 状态「${from}」未声明事件「${String(event)}」，保持原状态`);
    return { state: from, from, changed: false };
  }
  const next = row[event];
  if (next === null) return { state: from, from, changed: false }; // 显式自环：合法无操作
  return { state: next, from, changed: next !== from };
}

/**
 * 某状态下可用的事件名列表（DX：改代码前能问「这里能发什么事件」）。
 * 未声明的状态返回 `[]`。
 * @param {ReturnType<typeof defineMachine>} machine
 * @param {string} state
 * @returns {string[]}
 */
export function availableEvents(machine, state) {
  const row = machine?.states?.[state];
  return row ? Object.keys(row) : [];
}

/**
 * 开发期自检：initial 必须在 states 里、所有非 null 目标必须是已声明的状态。
 * 返回错误描述数组（空数组 = 机器定义合法）。供单测 / 启动期调用，生产不阻断。
 * @param {ReturnType<typeof defineMachine>} machine
 * @returns {string[]}
 */
export function assertMachine(machine) {
  const errors = [];
  const id = machine?.id ?? '<anonymous>';
  const states = machine?.states ?? {};
  if (!machine || typeof machine.id !== 'string' || !machine.initial || !states) {
    return [`[${id}] 机器定义不完整（需 id/initial/states）`];
  }
  if (!(machine.initial in states)) {
    errors.push(`[fsm:${id}] initial「${machine.initial}」不在 states 里`);
  }
  for (const [state, row] of Object.entries(states)) {
    if (!row || typeof row !== 'object') {
      errors.push(`[fsm:${id}] 状态「${state}」的事件表必须是对象`);
      continue;
    }
    for (const [event, target] of Object.entries(row)) {
      if (target === null) continue; // 显式自环
      if (typeof target !== 'string' || !(target in states)) {
        errors.push(`[fsm:${id}] 状态「${state}」的事件「${event}」指向未声明的目标「${String(target)}」`);
      }
    }
  }
  return errors;
}
