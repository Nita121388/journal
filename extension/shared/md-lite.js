/**
 * md-lite.js — 极简只读 Markdown → 纯文本/行（shared 叶子）
 *
 * 为什么存在：月视图 42 格 × N 卡 = 上百个块。给每个块挂 Milkdown（完整 ProseMirror 实例）
 * 会直接把侧边栏拖死（见 .trellis/tasks/11-07-calendar-visual-refresh/design.md D2）。
 * 因此格内 pill / 短块走这一层「去标记」渲染，只有展开态才用 Milkdown。
 *
 * 范围：只做**单行/多行纯文本化**，不产出 DOM、不解析嵌套结构。
 * 无 DOM / 无 storage / 无平台依赖。
 */

/** 需要整段丢弃的块级前缀（代码块围栏、表格分隔行）。 */
const FENCE_RE = /^\s*(```|~~~)/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

/** 行首块级标记：标题 / 引用 / 列表 / 任务框。 */
const BLOCK_PREFIX_RE = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;

/**
 * 去掉行内 Markdown 标记，保留可读文字。
 *
 * 覆盖：粗体/斜体/删除线、行内代码、链接（保留文字）、图片（保留 alt）、
 * 自动链接、HTML 标签（丢弃标签只留文字）、转义反斜杠。
 * @param {string} text
 * @returns {string}
 */
export function stripInline(text) {
  if (!text) return '';
  // 转义字符必须先「藏起来」再处理标记，否则 `\*x\*` 里的 `*` 会被强调正则当成标记吞掉。
  // 藏法：把 `\X` 映射到私用区字符（U+E000 + X 的码位）——私用区不会被任何标记正则命中，
  // 处理完再整体还原。
  const ESCAPED = /\\([\\`*_{}[\]()#+\-.!>~|])/g;
  let out = String(text).replace(ESCAPED, (_m, ch) => String.fromCharCode(0xe000 + ch.charCodeAt(0)));
  // 图片 ![alt](url) → alt；链接 [text](url) → text（必须先于裸括号处理）
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // 自动链接 <https://...> → 原样
  out = out.replace(/<((?:https?|mailto):[^>]+)>/g, '$1');
  // HTML 标签整体丢弃（只读展示不需要标签本体）
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  // 行内代码：保留内容，去掉反引号
  out = out.replace(/`+([^`]*)`+/g, '$1');
  // 强调：**x** / __x__ / *x* / _x_ / ~~x~~
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
  out = out.replace(/(\*|_)(.*?)\1/g, '$2');
  out = out.replace(/~~(.*?)~~/g, '$1');
  // 还原被转义的字符
  out = out.replace(/[\ue000-\ue07f]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xe000));
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Markdown → 单行纯文本（用于 pill、标题、`aria-label`）。
 *
 * @param {string} md
 * @param {{maxLen?: number}} [opts] maxLen>0 时按字符数截断并补「…」
 * @returns {string}
 */
export function toPlainLine(md, opts = {}) {
  if (!md) return '';
  const lines = String(md).split(/\r?\n/);
  const parts = [];
  let inFence = false;
  for (const raw of lines) {
    if (FENCE_RE.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (TABLE_SEP_RE.test(raw)) continue;
    const text = stripInline(raw.replace(BLOCK_PREFIX_RE, ''));
    if (text) parts.push(text);
  }
  let out = parts.join(' ').trim();
  const maxLen = opts.maxLen ?? 0;
  if (maxLen > 0 && out.length > maxLen) out = `${out.slice(0, Math.max(1, maxLen - 1))}…`;
  return out;
}

/**
 * Markdown → 段落行数组（用于块内多行轻量渲染）。
 *
 * 每个元素是已去标记的纯文本；代码块内容原样保留（不当作正文截断），
 * 表格分隔行丢弃。
 * @param {string} md
 * @param {{maxLines?: number}} [opts] maxLines>0 时只保留前 N 行
 * @returns {string[]}
 */
export function toLines(md, opts = {}) {
  if (!md) return [];
  const maxLines = opts.maxLines ?? 0;
  const out = [];
  let inFence = false;
  for (const raw of String(md).split(/\r?\n/)) {
    if (FENCE_RE.test(raw)) { inFence = !inFence; continue; }
    if (TABLE_SEP_RE.test(raw)) continue;
    const text = inFence ? raw.trim() : stripInline(raw.replace(BLOCK_PREFIX_RE, ''));
    if (!text) continue;
    out.push(text);
    if (maxLines > 0 && out.length >= maxLines) break;
  }
  return out;
}
