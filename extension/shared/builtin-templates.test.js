/**
 * builtin-templates.test.js — 内置模板清单与纯函数
 */
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TEMPLATES, TEMPLATES_SEED_VERSION, missingBuiltinTemplates, cloneTemplate,
} from './builtin-templates.js';

describe('BUILTIN_TEMPLATES', () => {
  it('5 个内置模板，id 唯一且都带 builtin 标记', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(5);
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(5);
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.builtin).toBe(true);
      expect(t.name).toBeTruthy();
      expect(Array.isArray(t.fields)).toBe(true);
    }
  });

  it('用户拍板的字段差异：待办带优先级，灵感不带优先级/排程', () => {
    const todo = BUILTIN_TEMPLATES.find((t) => t.id === 't_builtin_todo');
    const idea = BUILTIN_TEMPLATES.find((t) => t.id === 't_builtin_idea');
    const keys = (t) => t.fields.map((f) => f.key);
    expect(keys(todo)).toContain('priority');
    expect(keys(todo)).toContain('status');
    expect(keys(idea)).not.toContain('priority');
    expect(keys(idea)).not.toContain('schedule');
  });

  it('会议模板默认时长 60 分钟（schedule 值形态 {duration}）', () => {
    const meeting = BUILTIN_TEMPLATES.find((t) => t.id === 't_builtin_meeting');
    const f = meeting.fields.find((x) => x.key === 'schedule');
    expect(f.value).toEqual({ duration: 60 });
  });

  it('seed 版本号为正整数', () => {
    expect(Number.isInteger(TEMPLATES_SEED_VERSION)).toBe(true);
    expect(TEMPLATES_SEED_VERSION).toBeGreaterThan(0);
  });
});

describe('missingBuiltinTemplates', () => {
  it('空/非法列表 → 全部 5 个都缺（保序）', () => {
    expect(missingBuiltinTemplates(null).map((t) => t.id))
      .toEqual(BUILTIN_TEMPLATES.map((t) => t.id));
    expect(missingBuiltinTemplates(undefined)).toHaveLength(5);
    expect(missingBuiltinTemplates('oops')).toHaveLength(5);
  });

  it('已有部分（含用户自建模板）→ 只返回缺的', () => {
    const cur = [
      { id: 't_builtin_todo', name: '待办任务' },
      { id: 't_user_1', name: '我的模板' },
    ];
    const missing = missingBuiltinTemplates(cur).map((t) => t.id);
    expect(missing).not.toContain('t_builtin_todo');
    expect(missing).toContain('t_builtin_idea');
    expect(missing).toHaveLength(4);
  });

  it('全部已存在 → 空数组（幂等）', () => {
    expect(missingBuiltinTemplates([...BUILTIN_TEMPLATES])).toEqual([]);
  });
});

describe('cloneTemplate', () => {
  const tpl = BUILTIN_TEMPLATES.find((t) => t.id === 't_builtin_meeting');

  it('新 id、名称 +「副本」、不带 builtin 标记', () => {
    const copy = cloneTemplate(tpl, 't_clone_1');
    expect(copy.id).toBe('t_clone_1');
    expect(copy.name).toBe(`${tpl.name} 副本`);
    expect(copy.builtin).toBeUndefined();
    expect(Object.hasOwn(copy, 'builtin')).toBe(false);
  });

  it('fields 是深拷贝（改副本不影响内置清单）', () => {
    const copy = cloneTemplate(tpl, 't_clone_2');
    const f = copy.fields.find((x) => x.key === 'schedule');
    f.value.duration = 15;
    const origin = BUILTIN_TEMPLATES.find((t) => t.id === 't_builtin_meeting')
      .fields.find((x) => x.key === 'schedule');
    expect(origin.value.duration).toBe(60);
  });
});
