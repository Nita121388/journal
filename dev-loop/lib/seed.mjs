/**
 * Seed the isolated host with representative sample cards so the UI can be audited
 * in a realistic "has data" state. Targets only the ephemeral test host/port.
 */

/** Build a representative set of sample cards (today). */
export function sampleCards(today = new Date()) {
  const d = (x) => x.toISOString().slice(0, 10);
  const todayStr = d(today);
  return [
    { content: '完成 dev-loop 闭环脚本', type: 'task', status: '进行中', progress: 60, title: '闭环脚本', emoji: '🛠️', tags: ['dev'], startTime: '09:00', endTime: '10:30', duration: 90, assignedDate: todayStr },
    { content: '写 UX 审计报告', type: 'task', status: '待办', progress: 10, title: 'UX 审计', emoji: '📋', tags: ['design'], startTime: '14:00', endTime: '16:00', duration: 120, assignedDate: todayStr },
    { content: '读《设计中的设计》', type: 'text', status: '进行中', title: '读书', emoji: '📖', tags: ['学习'], startTime: '20:00', duration: 45, assignedDate: todayStr },
    { content: '产品灵感：把打卡和日志合并为一条时间线', type: 'idea', status: '进行中', title: '灵感', emoji: '💡', tags: ['产品'], assignedDate: todayStr },
    { content: '买咖啡豆', type: 'task', status: '已完成', progress: 100, done: true, title: '杂事', emoji: '☕', assignedDate: todayStr },
  ];
}

/** POST sample cards to the given host port. */
export async function seedHost(port, cards = sampleCards()) {
  const created = [];
  for (const c of cards) {
    const res = await fetch(`http://127.0.0.1:${port}/api/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.ok) created.push(j.data);
  }
  return created;
}
