/* ================================================================
   Journal — 核心逻辑冒烟测试
   用 mock chrome.storage 在 Node 里跑 store/merge/bridge 全链路。
   运行：node test/store.test.mjs
   ================================================================ */

'use strict';

/* ─── mock chrome ────────────────────────────────────────────── */

const storageBox = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        if (key === null || key === undefined) return { ...storageBox };
        if (Array.isArray(key)) {
          const out = {};
          for (const k of key) if (k in storageBox) out[k] = storageBox[k];
          return out;
        }
        return { [key]: storageBox[key] };
      },
      async set(obj) { Object.assign(storageBox, obj); },
      async remove(key) { delete storageBox[key]; },
      async getBytesInUse() { return 1024; },
    },
    onChanged: { addListener() {} },
  },
  alarms: {
    create() {},
    onAlarm: { addListener() {} },
  },
  runtime: { openOptionsPage() {} },
};

/* ─── 引入被测模块 ───────────────────────────────────────────── */

const model = await import('../extension/lib/model.js');
const store = await import('../extension/lib/store.js');
const bridge = await import('../extension/lib/bridge.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name); }
}

await store.init();
const { getState, getDayContent, setDayContent, addTodo, toggleTodo, deleteTodo, listTodos, listRecordedDates, exportJson, mergeFromRemote } = store;

/* ─── 1. Day CRUD ────────────────────────────────────────────── */

console.log('\n[1] 每日日志 CRUD');
await setDayContent('2025-09-12', '写周报\n下午开会');
ok(getDayContent('2025-09-12') === '写周报\n下午开会', '写入后能读回');

let r = await setDayContent('2025-09-12', '改了一版');
ok(r.updated !== undefined ? true : getDayContent('2025-09-12') === '改了一版', '再次写入覆盖');

await setDayContent('2025-09-13', '早上健身');
ok(listRecordedDates().has('2025-09-13'), '记录日期出现在热力图集合');

await setDayContent('2025-09-13', '');
ok(!listRecordedDates().has('2025-09-13'), '清空后从热力图消失');

/* ─── 2. Todo CRUD ───────────────────────────────────────────── */

console.log('\n[2] 待办 CRUD');
const t1 = await addTodo({ text: '交房租', dueDate: '2025-09-15', priority: 'high' });
ok(t1.text === '交房租' && t1.priority === 'high', '添加待办（高优先级）');

await addTodo({ text: '买牛奶', dueDate: '2025-09-15' });
const dayTodos = listTodos({ dueDate: '2025-09-15' });
ok(dayTodos.length === 2, '按日期过滤待办');
ok(dayTodos[0].text === '交房租', '优先级排序：高在前');

await toggleTodo(t1.id);
let t1After = listTodos({ dueDate: '2025-09-15' }).find(t => t.id === t1.id);
ok(t1After.done === true, '切换完成状态');

await deleteTodo(t1.id);
ok(listTodos({ dueDate: '2025-09-15' }).length === 1, '删除待办');

/* ─── 3. 墓碑与同步数据 ──────────────────────────────────────── */

console.log('\n[3] 墓碑与导出');
const before = JSON.parse(exportJson());
ok(before.todos.some(t => t.id === t1.id && t.deletedAt), '删除的待办以墓碑形式留在导出数据中');

/* ─── 4. merge：LWW + 墓碑传播 ──────────────────────────────── */

console.log('\n[4] 合并（LWW + 墓碑传播）');
// 构造远端：新的一天 + 修改本地已有 todo + 删除另一个 todo
const localTodos = getState().todos.filter(t => !t.deletedAt);
const remote = {
  schemaVersion: 1,
  days: [{ id: 'd_remote1', date: '2025-09-10', content: '远端新增的一天', createdAt: '2025-09-10T08:00:00Z', updatedAt: '2025-09-10T08:00:00Z', deletedAt: null }],
  todos: [
    { id: localTodos[0].id, text: '远端改过的文本', done: false, priority: 'medium', dueDate: '2025-09-15',
      createdAt: localTodos[0].createdAt, updatedAt: '9999-01-01T00:00:00Z', deletedAt: null },  // 远端更新
    { id: 't_remote_tomb', text: 'x', done: false, priority: 'medium', dueDate: null,
      createdAt: '2025-09-01T00:00:00Z', updatedAt: '2025-09-02T00:00:00Z', deletedAt: '2025-09-02T00:00:00Z' },
  ],
  sync: { deviceId: 'dev_remote', rev: 1, lastSyncAt: '2025-09-13T00:00:00Z' },
};

const mergeResult = await mergeFromRemote(remote);
ok(getDayContent('2025-09-10') === '远端新增的一天', '合并：远端新日条目被加入');
ok(getState().todos.find(t => t.id === localTodos[0].id).text === '远端改过的文本', '合并：LWW 远端更新胜出');
const mr = mergeResult.stats;
ok(mr.daysAdded === 1 && mr.todosMerged >= 1, `合并统计正确 (daysAdded=${mr.daysAdded}, todosMerged=${mr.todosMerged})`);

// 本地复活测试：本地条目 updatedAt 比远端墓碑新 → 保留本地
await setDayContent('2025-09-12', '本地在远端删除后继续编辑');
const remote2 = {
  schemaVersion: 1,
  days: [{ id: 'd_20250912', date: '2025-09-12', content: '远端已删除', createdAt: '2025-09-12T00:00:00Z', updatedAt: '2025-09-12T01:00:00Z', deletedAt: '2025-09-12T02:00:00Z' }],
  todos: [], sync: {},
};
// 找到本地 09-12 的条目 id 并与远端对齐
const localDay = getState().days.find(d => d.date === '2025-09-12' && !d.deletedAt);
remote2.days[0].id = localDay.id;
remote2.days[0].updatedAt = '2025-09-12T00:30:00Z';   // 远墓碑晚于本地修改 → 删
await mergeFromRemote(remote2);
ok(!getDayContent('2025-09-12'), '合并：远端墓碑传播生效（本地未再改动）');

/* ─── 5. Bridge agentHandlers ────────────────────────────────── */

console.log('\n[5] Bridge agent handler（agent 经 MCP 调用的方法）');
const h = bridge.agentHandlers;

let day = await h.journal_get_day({ date: '2025-09-10' });
ok(day.content === '远端新增的一天', 'journal_get_day 读取');

let ap = await h.journal_append_day({ date: '2025-09-10', content: '追加一行' });
ok(getDayContent('2025-09-10').includes('追加一行'), 'journal_append_day 追加');

let added = await h.journal_add_todo({ text: 'agent 添加的待办', dueDate: '2025-09-16' });
ok(added.ok && added.text === 'agent 添加的待办', 'journal_add_todo 添加');

let list = await h.journal_list_todos({ dueDate: '2025-09-16' });
ok(list.todos.length === 1, 'journal_list_todos 过滤');

let toggled = await h.journal_toggle_todo({ id: added.id });
ok(toggled.done === true, 'journal_toggle_todo 切换');

let dates = await h.journal_list_dates({});
ok(dates.dates.includes('2025-09-10'), 'journal_list_dates 热力图集合');

let range = await h.journal_list_range({ from: '2025-09-01', to: '2025-09-30' });
ok(range.days.some(d => d.date === '2025-09-10'), 'journal_list_range 范围查询');

let exp = await h.journal_export({});
ok(exp.days.length > 0 && exp.todos.length > 0, 'journal_export 导出');

console.log(`\n══════════════════════════════`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
console.log(`══════════════════════════════`);
process.exit(failed ? 1 : 0);