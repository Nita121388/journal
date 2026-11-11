/**
 * templates.test.mjs — 单模板 API（upsert / delete / 内置保护 / seed 标记）单测
 * 运行：node --test host/test/templates.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createStore, getTemplates, saveTemplates,
  upsertTemplate, deleteTemplate, getTemplatesSeed, saveTemplatesSeed,
  TemplateValidationError, BuiltinTemplateError,
} from '../lib/storage.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'jtpl-')); }

async function freshStore() {
  const dir = tmp();
  const s = await createStore({ file: join(dir, 'j.db') });
  return { s, dir };
}

const valid = (id = 't_agent_1') => ({
  id, name: 'Agent 建的模板', emoji: '🤖',
  fields: [{ key: 'status', value: 'todo' }],
});

test('upsert：新建单模板（builtin 被剥离）', async () => {
  const { s, dir } = await freshStore();
  try {
    const tpl = { ...valid(), builtin: true }; // 恶意/误带 builtin 也必须被洗掉
    const saved = await upsertTemplate(s, tpl, 't_agent_1');
    assert.equal(saved.id, 't_agent_1');
    assert.equal(saved.name, 'Agent 建的模板');
    assert.equal(saved.builtin, undefined);
    assert.equal((await getTemplates(s)).length, 1);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('upsert：更新已有单模板（按 id 整条替换，其他模板不动）', async () => {
  const { s, dir } = await freshStore();
  try {
    await saveTemplates(s, [valid('t_agent_1'), valid('t_user_2')]);
    const saved = await upsertTemplate(s, { ...valid('t_agent_1'), name: '改名后', extra: 1 }, 't_agent_1');
    assert.equal(saved.name, '改名后');
    const list = await getTemplates(s);
    assert.equal(list.length, 2);
    assert.equal(list.find(t => t.id === 't_user_2').name, 'Agent 建的模板');
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('upsert 校验：id 不一致 / name 空 / fields 非数组 → TemplateValidationError', async () => {
  const { s, dir } = await freshStore();
  try {
    await assert.rejects(upsertTemplate(s, valid('t_other'), 't_agent_1'), TemplateValidationError);
    await assert.rejects(upsertTemplate(s, { ...valid(), name: '  ' }, 't_agent_1'), TemplateValidationError);
    await assert.rejects(upsertTemplate(s, { ...valid(), fields: 'oops' }, 't_agent_1'), TemplateValidationError);
    await assert.rejects(upsertTemplate(s, valid(), ''), TemplateValidationError);
    // 校验失败不落任何数据
    assert.deepEqual(await getTemplates(s), []);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('内置保护：upsert / delete 对 builtin 模板 → BuiltinTemplateError', async () => {
  const { s, dir } = await freshStore();
  try {
    await saveTemplates(s, [{ id: 't_builtin_todo', name: '待办任务', builtin: true, fields: [] }]);
    await assert.rejects(
      upsertTemplate(s, { id: 't_builtin_todo', name: '偷改内置', fields: [] }, 't_builtin_todo'),
      BuiltinTemplateError,
    );
    await assert.rejects(deleteTemplate(s, 't_builtin_todo'), BuiltinTemplateError);
    // 保护失败不落任何数据
    assert.equal((await getTemplates(s)).length, 1);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('delete：删除成功；不存在 id 幂等成功', async () => {
  const { s, dir } = await freshStore();
  try {
    await saveTemplates(s, [valid('t_agent_1')]);
    const removed = await deleteTemplate(s, 't_agent_1');
    assert.equal(removed.id, 't_agent_1');
    assert.deepEqual(await getTemplates(s), []);
    // 幂等：再删不存在的 id 不报错
    const again = await deleteTemplate(s, 't_agent_1');
    assert.equal(again, null);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('templatesSeed 标记：默认 null；合法整数可写可读；非法值拒绝', async () => {
  const { s, dir } = await freshStore();
  try {
    assert.equal(await getTemplatesSeed(s), null);
    assert.equal(await saveTemplatesSeed(s, 1), 1);
    assert.equal(await getTemplatesSeed(s), 1);
    assert.equal(await saveTemplatesSeed(s, '2'), 2);
    await assert.rejects(saveTemplatesSeed(s, 'abc'), TemplateValidationError);
    await assert.rejects(saveTemplatesSeed(s, -1), TemplateValidationError);
  } finally { await s.close(); rmSync(dir, { recursive: true, force: true }); }
});
