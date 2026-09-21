# 实施计划

1. 读取 frontend 规范与现有 model/store/sidepanel 时间线实现。
2. 在 model 增加时间解析、吸附、加减分钟、兼容读取和 lane 分配纯函数；更新 Card JSDoc。
3. 扩展编辑器 HTML/CSS/JS，加入开始/结束时间和校验。
4. 将时间线渲染改为 15 分钟刻度 + 绝对定位画布，加入横向重叠 lane。
5. 加入底部 resize handle、Pointer Events、15 分钟吸附和持久化。
6. 验证旧卡片、当前时间 marker、卡片点击、滚动、拖拽和语法。
7. 运行 lint/test（若项目配置可用），记录无法运行的检查。

风险点：sidepanel.js 当前存在未提交的其他功能改动；实现必须保留这些改动，不覆盖无关行为。