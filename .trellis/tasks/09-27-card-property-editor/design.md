# 阶段C 属性编辑器 — 技术设计

> 依赖阶段 A 的 `props/status/progress/duration` 字段。详细见父任务 `design.md` §3/7。

## PropertyDef 结构（编辑器内）

```
PropertyDef = { key, label, icon, type, options[], defaultValue }
```

- `type` 决定控件：text=input；number=number；select/multi=下拉/多选；date=date；time=time；checkbox=checkbox；duration=分钟 input。
- `props` 值类型随 type 校验。

## 编辑器布局（属性区）

- 内建区（折叠）：日期、起止、时长、状态、进度、优先级、项目、标签。
- 自定义区：渲染当前卡 `props` 各属性行（label+icon+控件+删除）。
- 底部工具条：「＋ 添加属性」→ 打开 PropertyDef 表单；「从属性库＋」→ 列出现有 PropertyDef 勾选加入当前卡。

## 联动逻辑（纯函数入 model.js，可测）

- `statusForProgress(p)`：p>=100→'done'，否则保留；勾选 done → `{status:'done', progress:100}`；取消 done→'todo'（非 none）。
- `durationFromTimes(start,end)`：分钟；`endFromDuration(start,dur)`。
- 编辑任一改值即同步另一侧。

## 保留字保护

- 保留字集（来自阶段 A）：内建字段 + `props` + `meta` + `id/createdAt/updatedAt/deleted/type/done`。
- 新建属性 key 冲突 → 阻止 + 提示；属性库写入同理。

## 持久化

- 属性定义 → host `meta['propertyLibrary']`（经 store 接口）。
- 卡片值 → `props.<key>`（经 `updateCardEntry` 补丁）。

## 验证

```bash
npx eslint extension/
npx vitest run --coverage
# 手动：编辑器加/删/改属性、联动、属性库拉取
```
