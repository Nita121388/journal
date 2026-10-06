/**
 * md-export.js — 卡片 → 人类可读 Markdown（shared 叶子）
 *
 * 为什么放 shared：host（`GET /api/export?format=markdown`）与扩展设置页
 * 都要产出同一份 Markdown。放这里两边共用一份实现，不复制格式逻辑
 * （host 只可依赖 `extension/shared/**`，符合分层约束）。
 *
 * 无 DOM / 无存储 / 无网络；纯函数。
 */

/**
 * 卡片数组 → Markdown（按日期分组，一天一节；新的日期在前，「未安排」最后）。
 *
 * @param {object[]} cards
 * @param {{exportedAt?:string, store?:string}} [meta]
 * @returns {string}
 */
export function cardsToMarkdown(cards, meta = {}) {
  const list = Array.isArray(cards) ? cards : [];
  const byDay = new Map();
  for (const c of list) {
    const day = c.assignedDate || '未安排';
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(c);
  }
  // 新的在前；'未安排' 既不是日期也不该排最前，单独压到最后
  const days = [...byDay.keys()].sort((a, b) => {
    if (a === '未安排') return 1;
    if (b === '未安排') return -1;
    return a < b ? 1 : -1;
  });

  const out = [
    '# Journal 导出',
    '',
    `- 导出时间：${meta.exportedAt ?? new Date().toISOString()}`,
  ];
  if (meta.store) out.push(`- 存储：${meta.store}`);
  out.push(`- 卡片数：${list.length}`, '');

  for (const day of days) {
    out.push(`## ${day}`, '');
    const dayCards = byDay.get(day).slice()
      .sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')));
    for (const c of dayCards) {
      const parts = [];
      if (c.startTime) parts.push(c.endTime ? `${c.startTime}–${c.endTime}` : c.startTime);
      if (c.status && c.status !== 'none') parts.push(c.status);
      if (c.priority && c.priority !== 'medium') parts.push(`优先级:${c.priority}`);
      if (c.progress != null) parts.push(`${c.progress}%`);
      const head = `${c.emoji || ''}${c.title || c.content || '(空卡片)'}`.trim();
      out.push(`- ${parts.length ? `[${parts.join(' · ')}] ` : ''}${head}`);
      if (c.title && c.content) out.push(`  - ${c.content}`);
      if (Array.isArray(c.tags) && c.tags.length) out.push(`  - 标签：${c.tags.join(' ')}`);
      if (c.project) out.push(`  - 项目：${c.project}`);
      for (const [k, v] of Object.entries(c.props ?? {})) {
        if (v === null || v === undefined || v === '') continue;
        out.push(`  - ${k}：${Array.isArray(v) ? v.join(', ') : v}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}
