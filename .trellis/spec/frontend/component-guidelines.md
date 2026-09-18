# Component Guidelines

> How UI building blocks are structured in the extension.

---

## Overview

The extension uses a **side panel** as its main surface. There is **no component framework** (no React/Vue). "Components" are reusable DOM-building functions or partial HTML fragments rendered by plain JS. Keep rendering logic small, pure, and DOM-light.

---

## Component Structure

A reusable UI block is a plain function that takes state and returns a DOM node:

```js
// lib/ui/heatmap.js
export function renderHeatmap(container, entriesByDay) {
  container.replaceChildren();
  for (const [dayKey, count] of Object.entries(entriesByDay)) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.day = dayKey;
    cell.title = `${dayKey}: ${count} entries`;
    if (count > 0) cell.classList.add('is-filled');
    container.append(cell);
  }
}
```

Rules:
- A "component" = one exported function, one responsibility.
- **Never** build HTML via `innerHTML` with user content (XSS risk). Use `createElement`/`textContent` for anything user-authored (journal text, todo titles).
- `innerHTML` is allowed only for **static, developer-controlled** markup.
- Rendering functions must be idempotent: calling twice with the same state gives the same DOM.

---

## Props Conventions

No framework props. Instead:

- Pass **plain data** (objects/arrays) into render functions; do not pass DOM nodes.
- Keep render functions **pure**: no storage reads, no side effects — the caller fetches state and passes it in.

```js
// bad — component reads storage itself
renderTodoList(); // reads chrome.storage internally

// good — caller owns data fetching
const todos = await loadTodos();
renderTodoList(todos, onToggle);
```

---

## Styling Patterns

- Plain CSS files per page (`sidepanel.css`, `options.css`).
- **CSS custom properties** for the theme palette, defined in `:root` in `sidepanel.css`:

```css
:root {
  --color-bg: #ffffff;
  --color-accent: #4caf50;   /* heatmap "filled" green */
  --color-muted: #9e9e9e;
}
```

- Class names prefixed by block name (`heatmap-cell`, `todo-item`, `todo-item--done`).
- Support `prefers-color-scheme: dark` via a `[data-theme="dark"]` attribute set on `<html>`.

---

## Accessibility

- All interactive elements are real `<button>` / `<input>` / `<textarea>` — no `div` with click handlers where a native control works.
- Side panel must be fully keyboard-navigable (Tab order, Enter/Space activation).
- `aria-label` on icon-only buttons (e.g. delete, toggle).
- The textarea for journal entry is a plain `<textarea>` with an explicit label.
- Focus states must be visible (don't strip `:focus-visible` outlines).

---

## Common Mistakes

- Concatenating user input into `innerHTML` → **XSS**. Always `textContent`.
- Rendering functions that secretly read storage → hard to test, re-render bugs.
- Multiple listeners attached on every render (leak) → attach once, use event delegation on the container.
- Styling with `!important` to fight specificity → restructure CSS instead.
- Debounce + 日期/上下文切换不同步 → 草稿丢失或写入错误目标（见下方 Gotcha）

---

## Gotcha: 防抖保存 + 上下文切换的竞态

**场景**：textarea 输入用 `debounce(500ms)` 保存，但用户可能在防抖窗口内切换编辑目标（如日历选另一天）。若不处理，待执行的防抖回调会用过期上下文保存，或新上下文内容被旧保存覆盖。

**处理模式（flush-before-switch）**：

1. `debounce()` 包装函数暴露 `cancel()` 方法，切换前取消未执行的定时器。
2. 切换函数先**立即落盘**当前内容（flush），再更新状态。
3. 用**序列号**防止并发切换：只有最后一次切换能提交，过期异步加载不覆盖 textarea。

```js
// debounce 需可 cancel
function debounce(fn, ms = 500) {
  let timer = null;
  const wrapped = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

// 切换前先 flush（sidepanel.js switchToDate 模式）
let switchSeq = 0;
async function switchToDate(newDate) {
  if (newDate === selectedDate) return;
  const seq = ++switchSeq;
  debouncedSave.cancel();           // 1. 取消防抖
  await saveJournal(selectedDate, textarea.value);  // 2. 落盘当前上下文
  if (seq !== switchSeq) return;    // 3. 已被更新的切换取代
  selectedDate = newDate;
  const text = await getJournal(newDate);
  if (seq !== switchSeq) return;    // 防过期加载覆盖
  textarea.value = text;
}
```

**原则**：任何「异步写入 + 可切换上下文」的 UI 都必须先 flush 再切换；防抖包装器应支持 cancel。
