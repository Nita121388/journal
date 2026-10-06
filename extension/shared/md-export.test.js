/**
 * md-export.test.js — 卡片 → Markdown 导出
 */
import { describe, it, expect } from 'vitest';
import { cardsToMarkdown } from './md-export.js';

const META = { exportedAt: '2026-10-06T00:00:00.000Z', store: 'sqlite' };

describe('cardsToMarkdown', () => {
  it('头部含导出时间 / 存储 / 卡片数', () => {
    const md = cardsToMarkdown([], META);
    expect(md).toContain('# Journal 导出');
    expect(md).toContain('2026-10-06T00:00:00.000Z');
    expect(md).toContain('sqlite');
    expect(md).toContain('卡片数：0');
  });

  it('按日期分组，新日期在前，「未安排」压到最后', () => {
    const md = cardsToMarkdown([
      { id: 'a', content: '无日期卡' },
      { id: 'b', content: '早', assignedDate: '2026-10-01' },
      { id: 'c', content: '晚', assignedDate: '2026-10-05' },
    ], META);
    const i5 = md.indexOf('## 2026-10-05');
    const i1 = md.indexOf('## 2026-10-01');
    const iN = md.indexOf('## 未安排');
    expect(i5).toBeGreaterThan(-1);
    expect(i5).toBeLessThan(i1);
    expect(i1).toBeLessThan(iN);
  });

  it('同日内按开始时间排序', () => {
    const md = cardsToMarkdown([
      { id: 'a', content: '下午', assignedDate: '2026-10-05', startTime: '14:00' },
      { id: 'b', content: '上午', assignedDate: '2026-10-05', startTime: '09:00' },
    ], META);
    expect(md.indexOf('上午')).toBeLessThan(md.indexOf('下午'));
  });

  it('元信息拼装：时间区间 / 状态 / 优先级 / 进度', () => {
    const md = cardsToMarkdown([{
      id: 'a', title: '周会', content: '讨论 A', assignedDate: '2026-10-05',
      startTime: '09:00', endTime: '10:00', status: 'doing', priority: 'high', progress: 50,
      tags: ['工作'], project: 'proj', props: { 客户: 'ACME' },
    }], META);
    expect(md).toContain('[09:00–10:00 · doing · 优先级:high · 50%] 周会');
    expect(md).toContain('  - 讨论 A');
    expect(md).toContain('  - 标签：工作');
    expect(md).toContain('  - 项目：proj');
    expect(md).toContain('  - 客户：ACME');
  });

  it('默认值不入正文（medium / none / 无 endTime）', () => {
    const md = cardsToMarkdown([{
      id: 'a', content: '纯记录', assignedDate: '2026-10-05', status: 'none', priority: 'medium',
    }], META);
    expect(md).toContain('- 纯记录');
    expect(md).not.toContain('优先级:');
    expect(md).not.toContain('none');
  });

  it('空卡片与异常入参不抛错', () => {
    expect(() => cardsToMarkdown(null, META)).not.toThrow();
    expect(cardsToMarkdown([{ id: 'x' }], META)).toContain('(空卡片)');
  });

  it('数组属性以逗号连接；空值跳过', () => {
    const md = cardsToMarkdown([{
      id: 'a', content: 'x', assignedDate: '2026-10-05', props: { 多选: ['A', 'B'], 空: '', 无: null },
    }], META);
    expect(md).toContain('  - 多选：A, B');
    expect(md).not.toContain('空：');
    expect(md).not.toContain('无：');
  });
});
