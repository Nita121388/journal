import { describe, expect, it } from 'vitest';
import { stripInline, toLines, toPlainLine } from './md-lite.js';

describe('stripInline', () => {
  it('去掉强调标记但保留文字', () => {
    expect(stripInline('**粗** _斜_ ~~删~~')).toBe('粗 斜 删');
  });

  it('链接保留文字、图片保留 alt', () => {
    expect(stripInline('看 [文档](https://x.y) 和 ![图](a.png)')).toBe('看 文档 和 图');
  });

  it('行内代码去反引号保留内容', () => {
    expect(stripInline('用 `npm test` 跑')).toBe('用 npm test 跑');
  });

  it('丢弃 HTML 标签但保留内部文字', () => {
    expect(stripInline('a <b>粗</b> c')).toBe('a 粗 c');
  });

  it('处理转义字符', () => {
    expect(stripInline('\\*不是斜体\\*')).toBe('*不是斜体*');
  });

  it('空输入返回空串', () => {
    expect(stripInline('')).toBe('');
    expect(stripInline(null)).toBe('');
  });
});

describe('toPlainLine', () => {
  it('多行合并为单行并去块级标记', () => {
    expect(toPlainLine('# 标题\n- 条目\n> 引用')).toBe('标题 条目 引用');
  });

  it('跳过代码围栏内容', () => {
    expect(toPlainLine('前\n```\ncode\n```\n后')).toBe('前 后');
  });

  it('按 maxLen 截断并补省略号', () => {
    const out = toPlainLine('一二三四五六七八九十', { maxLen: 5 });
    expect(out).toBe('一二三四…');
    expect(out.length).toBe(5);
  });

  it('空内容返回空串', () => {
    expect(toPlainLine('')).toBe('');
  });
});

describe('toLines', () => {
  it('逐行返回去标记文本', () => {
    expect(toLines('## 标题\n正文一\n- 列表项')).toEqual(['标题', '正文一', '列表项']);
  });

  it('丢弃表格分隔行', () => {
    expect(toLines('| a | b |\n|---|---|\n| 1 | 2 |')).toEqual(['| a | b |', '| 1 | 2 |']);
  });

  it('按 maxLines 限制行数', () => {
    expect(toLines('a\nb\nc\nd', { maxLines: 2 })).toEqual(['a', 'b']);
  });

  it('保留代码围栏内的原始文本', () => {
    expect(toLines('```\nconst a = 1;\n```')).toEqual(['const a = 1;']);
  });

  it('空输入返回空数组', () => {
    expect(toLines('')).toEqual([]);
    expect(toLines(null)).toEqual([]);
  });
});
