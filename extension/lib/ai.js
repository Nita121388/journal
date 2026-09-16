/**
 * ai.js — AI 对接层骨架
 * 依赖图：ai.js → store.js（读取 settings）
 */

import { getSettings } from './store.js';

/**
 * 发送自然语言请求给 AI，返回结构化动作
 * TODO: 后续实现意图解析 + LLM 调用
 * @param {string} prompt — 用户输入的自然语言指令
 * @returns {Promise<{action: string, payload: object}>}
 */
export async function queryAI(prompt) {
  const settings = await getSettings();
  console.debug('[ai] provider:', settings.ai.provider);
  // TODO: 调用本地 host 或 API，返回解析后的动作
  throw new Error('AI not implemented yet');
}
