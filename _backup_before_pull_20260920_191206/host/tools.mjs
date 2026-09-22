import { z } from 'zod';
/* ================================================================
   Journal host — tools.mjs
   MCP 工具定义：包装扩展暴露的 bridge RPC 方法。
   删除类工具需要 confirm=true（防 agent 误操作）。
   ================================================================ */

export function buildTools({ call, isConnected }) {
  return [
    {
      name: 'journal_get_day',
      description: '读取某一天的日志内容（date 缺省为今天）',
      schema: {
        date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
      },
      run: (p) => call('journal_get_day', p),
    },
    {
      name: 'journal_update_day',
      description: '写入/覆盖某一天的日志内容（content 为空会清空当天）',
      schema: {
        date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
        content: z.string().describe('新的日志内容（Markdown）'),
        confirm: z.boolean().describe('覆盖已有内容时必须显式传 true'),
      },
      run: (p) => call('journal_update_day', p),
    },
    {
      name: 'journal_append_day',
      description: '在某天日志末尾追加内容（保留已有内容）',
      schema: {
        date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
        content: z.string().describe('要追加的内容'),
      },
      run: (p) => call('journal_append_day', p),
    },
    {
      name: 'journal_list_dates',
      description: '列出所有有记录的日期（热力图来源）',
      schema: {},
      run: () => call('journal_list_dates'),
    },
    {
      name: 'journal_list_range',
      description: '查看某段时间内的日志（用于总结/回顾）',
      schema: {
        from: z.string().optional().describe('开始日期 YYYY-MM-DD'),
        to: z.string().optional().describe('结束日期 YYYY-MM-DD'),
      },
      run: (p) => call('journal_list_range', p),
    },
    {
      name: 'journal_add_todo',
      description: '创建一条待办',
      schema: {
        text: z.string().describe('待办内容'),
        dueDate: z.string().optional().describe('截止日期 YYYY-MM-DD'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('优先级，默认 medium'),
      },
      run: (p) => call('journal_add_todo', p),
    },
    {
      name: 'journal_list_todos',
      description: '列出待办（可按截止日/完成状态过滤）',
      schema: {
        dueDate: z.string().optional().describe('只看某天的待办 YYYY-MM-DD'),
        done: z.boolean().optional().describe('只看已完成/未完成'),
      },
      run: (p) => call('journal_list_todos', p),
    },
    {
      name: 'journal_toggle_todo',
      description: '切换某条待办的完成状态（需要 id，先 list 获取）',
      schema: {
        id: z.string().describe('待办 id'),
      },
      run: (p) => call('journal_toggle_todo', p),
    },
    {
      name: 'journal_update_todo',
      description: '修改某条待办（文字/完成/优先级/截止日）',
      schema: {
        id: z.string().describe('待办 id'),
        text: z.string().optional(),
        done: z.boolean().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        dueDate: z.string().optional().describe('YYYY-MM-DD，传空清除'),
      },
      run: (p) => call('journal_update_todo', p),
    },
    {
      name: 'journal_delete_todo',
      description: '删除某条待办（墓碑删除，可被同步合并）。必须 confirm=true 才执行',
      schema: {
        id: z.string().describe('待办 id'),
        confirm: z.boolean().describe('必须显式传 true 才会真的删除'),
      },
      run: (p) => {
        if (!p.confirm) throw new Error('refusing to delete without confirm=true');
        return call('journal_delete_todo', p);
      },
    },
    {
      name: 'journal_export',
      description: '导出全部 Journal 数据（days + todos，含墓碑）',
      schema: {},
      run: () => call('journal_export'),
    },
  ];
}
