/* ================================================================
   Journal — lib/prop-infer.js
   按属性名推断属性定义：type / icon / options / defaultValue / key。
   纯本地规则，零网络、零依赖、零副作用（不碰 storage）。

   设计要点：
   - 推断只是「推荐」，用户可覆盖；confidence 供未来 AI 层判断是否需要升级。
   - key 由属性名派生，但**创建后永不随改名变化**（见 dedupeKey + sidepanel 调用处）。
   - 不 import storage / DOM，可在任意环境（node 测试、service worker、host）复用。
   ================================================================ */

import { searchEmojis } from './emoji.js';

/**
 * 关键词规则表。first-match-wins：按数组顺序匹配 name。
 * kws  : name 中包含任一关键词即命中
 * type : 推断出的属性类型（与 buildTplDefaultEditor 支持的类型一致）
 * icon : 显式图标；缺省时回退 emoji 库搜索
 * opts : select/multi 的候选选项
 */
const RULES = [
  // ── 时间类 ──────────────────────────────────────────────
  { kws: ['起止', '开始结束', '时间段', '周期', '时长', '耗时', 'schedule', 'duration'], type: 'schedule', icon: '⏱️' },
  { kws: ['日期', '截止', '到期', 'deadline', 'due', 'date', '哪天', '时间点'], type: 'date', icon: '🗓️' },
  { kws: ['提醒', '闹钟', '提醒时间', 'remind'], type: 'time', icon: '⏰' },

  // ── 数字类 ──────────────────────────────────────────────
  { kws: ['数量', '个数', '次数', '人数', '个数', '进度', '百分比', '分数', '评分', '打分',
    '金额', '价格', '费用', '成本', '预算', '收入', 'count', 'amount', 'price', 'score', 'progress'], type: 'number', icon: '🔢' },

  // ── 开关类 ──────────────────────────────────────────────
  { kws: ['是否', '完成', '已完成', '启用', '开关', '需要', 'check', 'done', 'flag'], type: 'checkbox', icon: '☑️' },

  // ── 选择类 ──────────────────────────────────────────────
  { kws: ['优先级', '优先', 'priority', '重要度', '紧急度', '重要程度'], type: 'select', icon: '⭐️', opts: ['高', '中', '低'] },
  { kws: ['风险', 'risk'], type: 'select', icon: '⚠️', opts: ['高', '中', '低', '无'] },
  { kws: ['状态', '阶段', 'status', 'state'], type: 'select', icon: '📌', opts: ['未开始', '进行中', '已完成'] },
  { kws: ['负责人', '责任人', '执行人', 'owner', 'assignee', '负责', '参与者', '成员'], type: 'text', icon: '👤' },
  { kws: ['类型', '类别', '分类', '级别', '等级', '部门', '来源', 'type', 'category'], type: 'select', icon: '🏷️' },

  // ── 标签 / 多选 ─────────────────────────────────────────
  { kws: ['标签', '技能', '擅长', '关键词', 'tags', 'tag', '多选'], type: 'multi', icon: '#️⃣' },

  // ── 文本类 ──────────────────────────────────────────────
  { kws: ['备注', '描述', '说明', '详情', '内容', '记录', 'note', 'desc', 'detail', 'comment', 'remark'], type: 'textarea', icon: '📝' },
  { kws: ['项目', '工程', 'project', '产品'], type: 'text', icon: '📁' },
  { kws: ['链接', '地址', 'url', 'link', '网址'], type: 'text', icon: '🔗' },
  { kws: ['文件', '附件', 'file', 'attachment'], type: 'text', icon: '📎' },
];

/** 兜底图标 */
const FALLBACK_ICON = '📄';
/** 兜底类型 */
const FALLBACK_TYPE = 'text';

/** 属性类型全集（修改类型菜单用） */
export const PROP_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'textarea', label: '文本域' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '选择' },
  { value: 'multi', label: '多选' },
  { value: 'date', label: '日期' },
  { value: 'time', label: '时间' },
  { value: 'checkbox', label: '勾选' },
  { value: 'schedule', label: '起止时间/时长' },
  { value: 'tags', label: '标签' },
  { value: 'status', label: '状态' },
];

/** 各类型的空默认值（与 sidepanel 的 defaultTplValue 保持一致） */
export function defaultValueForType(type) {
  if (type === 'checkbox') return false;
  if (type === 'tags') return [];
  if (type === 'schedule') return null;
  return '';
}

/**
 * 生成唯一 key：与已有 key 冲突时追加 (2)(3)…
 * @param {string} name 属性名
 * @param {Iterable<string>} existingKeys 已占用的 key
 */
export function dedupeKey(name, existingKeys = []) {
  const base = String(name || '').trim() || '新属性';
  const used = new Set(existingKeys);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}(${n})`)) n += 1;
  return `${base}(${n})`;
}

/** 在 emoji 库里按属性名找图标，命不中返回 null */
function inferIconFromEmojiLib(name) {
  try {
    const hits = searchEmojis(name);
    if (Array.isArray(hits) && hits.length) return hits[0].e;
  } catch { /* emoji 库异常不应影响推断 */ }
  return null;
}

/** 规则表匹配（first-match-wins） */
function matchRule(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const rule of RULES) {
    if (rule.kws.some(k => n.includes(k.toLowerCase()))) return rule;
  }
  return null;
}

/**
 * 推断一个属性定义。
 * @param {string} name 用户输入的属性名
 * @param {{ existingKeys?: Iterable<string> }} [opts]
 * @returns {{ key:string, label:string, icon:string, type:string,
 *             options?:string[], defaultValue:any, confidence:'rule'|'emoji'|'fallback' }}
 */
export function inferProp(name, opts = {}) {
  const label = String(name || '').trim() || '新属性';
  const rule = matchRule(label);
  const type = rule?.type ?? FALLBACK_TYPE;
  const options = rule?.opts ? [...rule.opts] : undefined;

  // 图标：规则显式 > emoji 库搜索 > 兜底
  let icon = rule?.icon;
  let confidence = 'rule';
  if (!icon) {
    icon = inferIconFromEmojiLib(label) || FALLBACK_ICON;
    confidence = rule ? 'rule' : (icon !== FALLBACK_ICON ? 'emoji' : 'fallback');
  }

  return {
    key: dedupeKey(label, opts.existingKeys ?? []),
    label,
    icon,
    type,
    ...(options ? { options } : {}),
    defaultValue: defaultValueForType(type),
    confidence,
  };
}
