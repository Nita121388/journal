/**
 * prop-library.js — 自定义属性定义库（state 层）
 *
 * 属性库是「用户自定义字段定义」的持久化集合，存 host meta `propertyLibrary`。
 * 编辑器（建卡时选属性）与模板构建器（建模板时加字段）共用，且都可能写入，
 * 因此集中到此模块，用显式 getter/setter 取代跨模块的模块级 `let`。
 *
 * Field Registry 通过 `getUserFields: () => getPropLibrary()` 实时读取，
 * 所以属性库变更后无需重新 init。
 */

import { getHostMeta, setHostMeta } from './host-client.js';

/** @type {Record<string, object>} key → 属性定义 */
let library = {};

/** @returns {Record<string, object>} */
export function getPropLibrary() {
  return library;
}

/** 整体替换（少见；优先用 upsert/remove）。 */
export function setPropLibrary(next) {
  library = next && typeof next === 'object' ? next : {};
}

/** 新增或覆盖一条定义（不可变更新，保证引用变化可被感知）。 */
export function upsertPropDef(key, def) {
  library = { ...library, [key]: def };
}

/** 删除一条定义。 */
export function removePropDef(key) {
  const next = { ...library };
  delete next[key];
  library = next;
}

/** 从 host 拉取属性库（host 离线时保持原值）。 */
export async function loadPropLibrary() {
  const value = await getHostMeta('propertyLibrary');
  if (value && typeof value === 'object') library = value;
  return library;
}

/** 写回 host。 */
export async function savePropLibrary() {
  await setHostMeta('propertyLibrary', library);
}
