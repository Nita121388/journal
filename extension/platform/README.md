# `platform/` — 平台适配层

**职责**：唯一允许出现 `chrome.*` 与浏览器/桌面平台差异的地方。向上暴露统一的 **PlatformPort** 契约，供 `entries/` 注入。

## 允许
- `chrome.*`、`localStorage`/`indexedDB`、`fetch`、Electron contextBridge。

## 禁止
- 不得 import `state/` `views/` `features/` `components/` `entries/`（只可依赖 `shared/` 的类型）。
- 不得包含业务逻辑。

## 规划内容
| 文件 | 实现 |
|---|---|
| `index.js` | `PlatformPort` 类型契约 + 环境选择 |
| `chrome.js` | `chrome.storage.local` / `chrome.runtime` / `connectNative` |
| `web.js` | `localStorage` / no-op runtime / `fetch` |

`PlatformPort` 契约见 `design.md` §3。
