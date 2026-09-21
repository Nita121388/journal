# 设计并集成 Journal 项目图标

## Goal

为 Journal 浏览器扩展（Chrome MV3，sidepanel 每日日志 + 热力图打卡 + TODO）设计并集成一个项目图标，作为 `action` 默认图标出现在浏览器工具栏。

## Background / Confirmed Facts

- 项目是 `extension/` 下的 Chrome MV3 扩展，manifest 的 `action` 块目前**没有任何 `default_icon`**，扩展在工具栏用默认占位图标。
- 产品核心：每日日志、热力图打卡、TODO、AI 增删改查。
- 用户风格要求：**简洁清晰、参考 Twitter 系 Emoji、可爱但不过分甜腻、专业又带生活品味**。

## Requirements

- **主题：日历 + 笔**——以圆角日历为主体，斜置一支笔，呼应“打卡记录”。保留 Twitter-emoji 质感的粗线条圆角。
- **主色调：成长绿** `#5BB974` 系；搭配浅色纸面/白底 + 少量暖色点缀（如笔的粉色橡皮头）增加“可爱适度”与生活感。
- 提供一个或多个尺寸的扩展图标（Chrome 预期 16/32/48/128px）。
- 在 `action.default_icon` 中引用，使工具栏展示新图标。
- 风格符合：简洁、清晰、Twitter-emoji 气质、可爱适度、专业感。
- 可选但建议：从 SVG 源文件生成 PNG，便于后续复用。

## Acceptance Criteria

- [x] `extension/manifest.json` 的 `action` 引用新图标文件。
- [x] 图标源文件（SVG，路径可读、可编辑）存在。
- [x] 生成的 PNG（至少 128 + 16/32/48）存在并正确渲染。
- [x] 图标资源结构与尺寸合法；待在 Chrome `chrome://extensions` 中手动确认工具栏实际显示。

## Out of Scope

- 改动日志功能本体、sidepanel 界面布局。
- 为 options 页或其他入口单独设计图标（除非明显必要）。

## Design Direction

- 对标结论：采用 Twemoji 的圆润大色块与友好感，结合 Material/Google Calendar 的“顶部栏 + 装订环 + 独立纸面”结构，以及现代生产力工具的克制留白。
- 日历不使用完整日期网格，改为少量短线/圆点表达“记录”，保证 16/32px 仍清晰。
- 笔作为第二识别元素，以约 -35° 斜向落在右下角，覆盖约 20–25%，不遮挡顶部装订结构。
- 颜色：成长绿 `#5BB974` + 暖白纸面 + 深墨绿笔；可用低饱和珊瑚色作为少量笔部件点缀。

## Open Questions

- 无（主题、色彩与构图方向均已收敛）。

## Technical Notes

- 图标源：`extension/icons/icon.svg`（viewBox 0 0 128 128，扁平化、粗线条、圆角，Twitter-emoji 气质）。
- 由 SVG 渲染导出 PNG：`extension/icons/icon-16.png / 32 / 48 / 128`。
- manifest `action.default_icon` 引用 {16,32,48,128}。
- 对标调研记录：`research/calendar-icon-benchmarks.md`。