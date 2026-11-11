/**
 * builtin-templates.js — 内置模板清单（shared 叶子：纯数据 + 纯函数）
 *
 * 2026-11-11：此前模板全部要用户手动建，冷启动零模板。本文件给出 5 个出厂模板，
 * 由 extension 首次启动 seed 到 host meta `templates`（见 state/template-seed.js）。
 *
 * 约束（由 ESLint 边界规则强制）：无 DOM / 无 storage / 无 chrome / 无 node:。
 *
 * 设计要点：
 * - **id 固定字符串**（非时间戳）：seed 幂等判重按 id；agent 文档可直接引用。
 * - `fields` 不必写 title/content/tags —— `normalizeTemplateFields`
 *   （features/template-builder.js）会自动补 REQUIRED_DEFS。
 * - 值为 `''` 的字段 = 只决定编辑器可见性、不预填（writeValueToCard 的空串兜底）。
 * - `builtin: true` 的写入源唯一：本清单的 seed。host 单模板 API 会剥离
 *   payload 里的 builtin，UI 只有「复制为我的模板」一个出口（复制体不带标记）。
 */

/**
 * 内置模板（2026-11-11 用户拍板的 5 个；灵感想法**不带优先级/排程**）。
 * @typedef {{id: string, name: string, emoji: string, builtin: boolean, fields: Array<{key: string, value: unknown}>}} Template
 * @type {ReadonlyArray<Template>}
 */
export const BUILTIN_TEMPLATES = Object.freeze([
  {
    id: 't_builtin_todo',
    name: '待办任务',
    emoji: '✅',
    builtin: true,
    fields: [
      { key: 'status', value: 'todo' },
      { key: 'priority', value: 'medium' },
      { key: 'assignedDate', value: '' },
      { key: 'project', value: '' },
    ],
  },
  {
    id: 't_builtin_idea',
    name: '灵感想法',
    emoji: '💡',
    builtin: true,
    fields: [
      { key: 'project', value: '' },
    ],
  },
  {
    id: 't_builtin_daily',
    name: '每日记录',
    emoji: '📅',
    builtin: true,
    fields: [
      { key: 'assignedDate', value: '' },
    ],
  },
  {
    id: 't_builtin_agent',
    name: 'Agent 任务',
    emoji: '🤖',
    builtin: true,
    fields: [
      { key: 'status', value: 'todo' },
      { key: 'priority', value: 'medium' },
      { key: 'project', value: '' },
    ],
  },
  {
    id: 't_builtin_meeting',
    name: '会议 / 会面',
    emoji: '🤝',
    builtin: true,
    fields: [
      { key: 'schedule', value: { duration: 60 } },
      { key: 'assignedDate', value: '' },
      { key: 'project', value: '' },
    ],
  },
]);

/**
 * seed 版本：升级内置清单（加/改条目）时 +1，可再触发一次「补缺 id」式 seed。
 * 只补 id 不存在的，**不复活用户已删的旧内置**（删除是主动选择）。
 * @type {number}
 */
export const TEMPLATES_SEED_VERSION = 1;

/**
 * 列表里缺哪些内置模板（按 id 判重，保序：按 BUILTIN_TEMPLATES 顺序）。
 *
 * @param {unknown} list host meta 里的 templates 数组（可能是任意形态）
 * @returns {Template[]}
 */
export function missingBuiltinTemplates(list) {
  const have = new Set(
    (Array.isArray(list) ? list : [])
      .map((t) => t?.id)
      .filter((id) => typeof id === 'string'),
  );
  return BUILTIN_TEMPLATES.filter((t) => !have.has(t.id));
}

/**
 * 「复制为我的模板」：深拷贝、换 id、名称 +「 副本」、**剥离 builtin 标记**。
 *
 * id 由调用方生成（seed/clone 的 id 策略不同：seed 用固定 id，clone 用时间戳 id），
 * 本函数保持纯。fields 深拷贝——模板值里可能有对象（schedule 的 {start,end,duration}）。
 *
 * @param {Template} tpl 任意模板（通常为内置）
 * @param {string} newId 新模板 id
 * @returns {Template & {builtin?: undefined}}
 */
export function cloneTemplate(tpl, newId) {
  const copy = structuredClone({
    id: newId,
    name: `${tpl?.name ?? '模板'} 副本`,
    emoji: tpl?.emoji ?? '',
    fields: Array.isArray(tpl?.fields) ? tpl.fields : [],
  });
  delete copy.builtin;
  return copy;
}
