// @vitest-environment jsdom
/**
 * editor-fields.test.js — 编辑器属性集（jsdom）
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyFields, BASE_FIELDS, FIELD_ORDER, isLockedField, OPTIONAL_BUILTIN_FIELDS, resolveFields,
} from './editor-fields.js';

describe('resolveFields', () => {
  it('无模板时只给默认最小集（状态 / 标签）', () => {
    expect(resolveFields()).toEqual(['status', 'tags']);
    expect(BASE_FIELDS).toEqual(['status', 'tags']);
  });

  it('模板字段并入默认集，顺序恒为 FIELD_ORDER（不受声明顺序影响）', () => {
    expect(resolveFields(['project', 'priority', 'assignedDate']))
      .toEqual(['status', 'priority', 'assignedDate', 'tags', 'project']);
  });

  it('忽略属性库已删除的 key 与重复 key', () => {
    expect(resolveFields(['status', 'ghost-field', 'priority', 'priority']))
      .toEqual(['status', 'priority', 'tags']);
  });

  it('忽略非属性区字段（title/content 走头部与正文；自定义属性走自定义区）', () => {
    expect(resolveFields(['title', 'content', 'client-name'])).toEqual(['status', 'tags']);
  });

  it('空值/非数组不抛错', () => {
    expect(resolveFields(null)).toEqual(['status', 'tags']);
    expect(resolveFields(undefined)).toEqual(['status', 'tags']);
  });
});

describe('可选内建字段与锁定行', () => {
  it('可临时加入的内建可选 = FIELD_ORDER 去掉锁定行', () => {
    expect(OPTIONAL_BUILTIN_FIELDS).toEqual(['priority', 'progress', 'assignedDate', 'schedule', 'project']);
    for (const k of BASE_FIELDS) expect(OPTIONAL_BUILTIN_FIELDS).not.toContain(k);
  });

  it('status / tags 是锁定行，其余可隐藏', () => {
    expect(isLockedField('status')).toBe(true);
    expect(isLockedField('tags')).toBe(true);
    expect(isLockedField('priority')).toBe(false);
    expect(isLockedField('project')).toBe(false);
    expect(isLockedField('unknown-field')).toBe(false);
  });

  it('手动加入的字段与模板字段并集可见（去重）', () => {
    expect(resolveFields([...[], ...['priority', 'schedule']]))
      .toEqual(['status', 'priority', 'schedule', 'tags']);
    expect(resolveFields([...['progress'], ...['progress', 'project']]))
      .toEqual(['status', 'progress', 'tags', 'project']);
  });
});

describe('applyFields', () => {
  /** 构造与 sidepanel.html 同构的属性区（顺序故意打乱，验证重排） */
  function buildContainer() {
    const c = document.createElement('div');
    c.id = 'card-editor-props';
    for (const field of ['tags', 'schedule', 'status', 'project', 'priority', 'progress', 'assignedDate']) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.dataset.field = field;
      c.append(row);
    }
    return c;
  }

  let container;
  beforeEach(() => { container = buildContainer(); });

  it('默认集：只 status / tags 可见', () => {
    applyFields(container, resolveFields());
    const visible = [...container.querySelectorAll('.prop-row:not([hidden])')].map(r => r.dataset.field);
    expect(visible).toEqual(['status', 'tags']);
    expect(container.dataset.fields).toBe('status,tags');
  });

  it('模板集：并集可见且按 FIELD_ORDER 重排', () => {
    applyFields(container, resolveFields(['priority', 'assignedDate', 'schedule']));
    const order = [...container.querySelectorAll('.prop-row')].map(r => r.dataset.field);
    expect(order).toEqual(FIELD_ORDER);
    const visible = [...container.querySelectorAll('.prop-row:not([hidden])')].map(r => r.dataset.field);
    expect(visible).toEqual(['status', 'priority', 'assignedDate', 'schedule', 'tags']);
  });

  it('隐藏用 hidden 属性，不写内联 style', () => {
    applyFields(container, ['status']);
    const projectRow = container.querySelector('[data-field="project"]');
    expect(projectRow.hidden).toBe(true);
    expect(projectRow.getAttribute('style')).toBeNull();
  });

  it('容器为 null 时静默返回', () => {
    expect(() => applyFields(null, ['status'])).not.toThrow();
  });

  it('无 data-field 的系统只读行（来源三行）不受 applyFields 影响', () => {
    // 来源行在 #card-editor-props 之外；即使误放进容器，也必须因缺 data-field 而保持原状。
    const roRow = document.createElement('div');
    roRow.className = 'prop-row ce-ro-row';
    roRow.hidden = false;
    container.append(roRow);
    applyFields(container, ['status']);
    expect(roRow.hidden).toBe(false);
  });

  it('「＋ 添加属性」始终排在全部属性行之后（不被重排顶到前面）', () => {
    const addBtn = document.createElement('button');
    addBtn.className = 'ce-add-field';
    addBtn.id = 'card-editor-add-field';
    container.append(addBtn);
    applyFields(container, resolveFields(['project', 'priority']));
    const kids = [...container.children];
    expect(kids[kids.length - 1]).toBe(addBtn);
    expect(kids.filter(el => el.classList.contains('prop-row')).map(el => el.dataset.field))
      .toEqual(FIELD_ORDER);
  });
});
