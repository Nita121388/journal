/**
 * actions.js — 组合根 ↔ 视图/功能 的显式回调通道
 *
 * 为什么需要：视图（如卡片池、时间线）在交互后需要「全量重渲染」或「打开卡片编辑器」，
 * 而这两者由 entries/sidepanel.js（组合根）拥有。若让视图直接 import 组合根会形成
 * views → entries → views 循环依赖。
 *
 * 做法：组合根在 init 时把自己的能力注册到这里；视图通过 actions.* 调用。
 * 注意默认实现是 no-op —— 未初始化时调用不会抛错（也不会误伤测试）。
 */

export const actions = {
  /** 全量重渲染（组合根注入） */
  refreshAll: () => {},

  /**
   * 打开卡片编辑器（组合根注入）
   * @param {object|null} card 现有卡片（null = 新建）
   * @param {string} [time] 起始时间 HH:MM
   * @param {string} [date] 日期 dayKey
   * @param {string} [assignedDate]
   */
  openEditor: () => {},

  /** 重算卡片编辑器时长标签（组合根注入；周视图框选建卡后需要） */
  updateEditorDuration: () => {},
};
