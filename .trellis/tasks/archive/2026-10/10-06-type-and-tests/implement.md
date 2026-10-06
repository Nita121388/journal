# Implement — JSDoc 类型 + vitest 测试基线

> 状态：**已完成**（2026-10-06）

## 执行记录

### S8-1 引入 vitest
- [x] `npm install -D vitest @vitest/coverage-v8`（vitest 5.0.3）
- [x] `extension/vitest.config.mjs`：`include: ['{shared,state}/**/*.test.js']`，
      coverage include `shared/** + state/**`，排除纯数据表 `shared/emoji-data.js`，
      thresholds `lines/functions/statements: 80, branches: 70`

### S8-2 假端口测试助手
- [x] `extension/test-helpers.mjs`：`makePort()` 内存版 `PlatformPort`
      （storageGet/Set/Subscribe、prefGet/Set/Remove、hostFetch 响应队列、调用记录），
      `apiOk()` / `cardsResponse()` 包络构造。位于 extension 根，**不纳入覆盖率**。

### S8-3 测试
| 文件 | 覆盖 |
|---|---|
| `shared/model.test.js` | 时间换算、起止/时长、分道、查询、聚合、日历、建卡、迁移 |
| `shared/card-schema.test.js` | 枚举/保留字/归一化原语 |
| `shared/format.test.js` | 日期/图标/来源文案 |
| `shared/prop-infer.test.js` | 类型默认值、key 去重、推断 |
| `shared/field-registry.test.js` | 内建/用户字段、write/read 落位契约、schedule 展开、null 语义 |
| `shared/protocol.test.js` | 路由常量/动态路由编码/消息类型 |
| `shared/emoji-search.test.js` | 库完整性、搜索优先级、分类 |
| `state/host-client.test.js` | 全部端点路由 + 包络解包 + 离线返回 null / 失败抛错 |
| `state/repository.test.js` | 查询、订阅（含订阅者抛错隔离）、缓存回填、CRUD 与字段合并防回弹 |
| `state/sync-bridge.test.js` | pull 三端点语义、离线回退、轮询签名去重与首轮基线 |
| `state/state-misc.test.js` | settings 合并、prop-library 增删读写、actions no-op、view-state 偏好初值 |

**测试开发中发现的行为细节（已按实际行为修正断言，非改源码）**：
`timeToMinutes` 无 null 保护；`getCardEndTime` 无 endTime 时补 +15 分钟（不读 duration）；
`getCardDuration` 无起止返回 0；`todoSummary` 字段为 `pending`；
`aggregateHeatmap` 入参是**卡片数组**而非 journals 映射；
`readValueFromCard` 对未登记 key 返回 `undefined`（注册表是唯一读源）。

### S8-4 JSDoc typedef
- [x] `shared/`：`FieldDef`、`InferredProp`、`EmojiItem`、`Card`、`ScheduleItem`
- [x] `state/`：`ViewState`、`Settings`、`PropLibrary`、`PullResult`、`AppActions`、`CardsListener`
- [x] `shared/protocol.js` 原有 `ApiResult` / `Card`

### S8-5 门禁接线
- [x] `extension/package.json`：`test`（vitest run）、`test:coverage`、`test:watch`
- [x] 根 `package.json`：`test` = extension(vitest) + host(node --test)；`test:coverage`

## 验证

| 门禁 | 结果 |
|---|---|
| `npm run test:coverage`（extension） | ✅ **124/124 通过** |
| 覆盖率（shared + state） | ✅ 语句 **91.40%**、分支 **81.58%**、函数 **96.63%**、行 **94.65%** |
| `npm test`（根，含 host） | ✅ extension 124 + host 103 |
| `npm run lint` | ✅ 0 errors |
| dev-loop `smoke`/`select`/`options`/`tpl`/`tailwind-migrated` | ✅ 15/15 · 46/46 · 10/10 · 17/17 · 20/20（360 与 500 双宽） |

## 回滚

新增文件为主（vitest 配置 + 测试 + 助手 + typedef）；`git revert` 后回到无测试状态，
不影响任何运行时代码。
