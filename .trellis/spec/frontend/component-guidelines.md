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
