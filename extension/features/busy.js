/**
 * busy.js — in-flight 去重（features 层）
 *
 * 背景（11-09 隐式状态机勘察，缺陷 1）：saveEditor / startHost 这类「写操作」没有
 * 进行中守卫 —— ⌘⏎ 直调 saveEditor（绕过按钮 disabled）再叠加一次双击，
 * 会并发跑两遍 createCardEntry → **重复建卡**。
 *
 * 设计动机：
 *   - 按钮只挡得住鼠标；键盘路径（⌘⏎）与未来的语音/快捷指令都可能绕过 disabled。
 *     所以去重必须落在**函数入口**，而不是绑在按钮的 disabled 上。
 *   - `withBusy(key, fn)`：同一 key 进行中时**直接返回进行中的那个 promise**（不加队列），
 *     即「重复触发 = 幂等」。fn 结束（成功或失败）后 key 释放，下次可再执行。
 *   - `isBusy(key)` 供按钮文案（「保存中…」）/ disabled 查询，状态可观测。
 *
 * 不碰 DOM / storage / chrome：状态只是模块内的 Map，便于单测。
 */

/** key → 进行中的 promise */
const inflight = new Map();

/**
 * 以 key 为守卫执行 fn。
 * @template T
 * @param {string} key 互斥键（如 `'editor.save'`）
 * @param {() => T | Promise<T>} fn 要执行的写操作
 * @returns {Promise<T>} 进行中时返回**同一个** promise（去重）；结束（含 reject）后 key 释放
 */
export function withBusy(key, fn) {
  const existing = inflight.get(key);
  if (existing) return existing;
  let p;
  try {
    p = Promise.resolve(fn());
  } catch (e) {
    // fn 同步抛错：包成 rejected promise，与异步失败走同一套释放逻辑
    p = Promise.reject(e);
  }
  inflight.set(key, p);
  const release = () => { if (inflight.get(key) === p) inflight.delete(key); };
  p.then(release, release);
  return p;
}

/**
 * 该 key 是否正在执行（供按钮 disabled / 文案查询）。
 * @param {string} key
 * @returns {boolean}
 */
export function isBusy(key) {
  return inflight.has(key);
}
