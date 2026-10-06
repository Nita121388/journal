# `shared/` — 纯逻辑叶子层

**职责**：与平台、DOM、存储完全无关的纯函数与数据契约。

## 允许
- 纯函数、常量、`@typedef` 类型定义。
- 被 `state/` `views/` `features/` `components/` `entries/` 以及 `host/` 依赖。

## 禁止
- 不得 import 任何其他层（本层是依赖图的叶子）。
- 不得出现 `document` `window` `chrome` `localStorage` `fetch` `node:*`。

## 规划内容
| 文件 | 职责 |
|---|---|
| `model.js` | 时间/卡片/热力图聚合（自 `../lib/model.js` 迁入） |
| `field-registry.js` | 统一字段注册表（自 `../lib/field-registry.js` 迁入） |
| `prop-infer.js` | 本地规则属性推断（自 `../lib/prop-infer.js` 迁入） |
| `card-schema.js` | 卡片字段常量 + 归一化原语（与 `host/lib/storage.js` 去重） |
| `protocol.js` | HTTP 路由 + 消息类型 + API `@typedef` |

> 契约见 `.trellis/tasks/10-06-package-boundaries-refactor/design.md` §2、§7。
