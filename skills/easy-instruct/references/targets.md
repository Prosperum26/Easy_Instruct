# Choosing targets

`show_step` takes up to 3 `targets`. Prefer describing *what* to highlight; the server finds
*where* it is on screen (UI Automation, accessible names, OCR) and finds it again when the window
moves or the user presses Ctrl+Alt+R. Coordinates are a fallback.

| Want to highlight | Target | Found by |
|---|---|---|
| A part of VS Code | `{ "kind": "ui", "element": "terminal" }` | UI Automation (`method: "uia"`) |
| A file name, button label, line of output | `{ "kind": "text", "text": "requirements.txt", "within": "explorer" }` | Accessible names, then OCR (`"uia"` or `"ocr"`) |
| Lines of code | `{ "kind": "lines", "file": "app/main.py", "start": 12, "end": 30 }` | Opens the file at the line, reads the line numbers (`"ocr_gutter"`) |
| Anything else | `{ "kind": "rect", "x": 640, "y": 300, "w": 420, "h": 60 }` | Taken as given (`"explicit"`) |
| Nothing (a card) | `[]` or `{ "kind": "none" }` | — |

## `ui` elements

| element | What it is |
|---|---|
| `editor` | The whole editor area (all editor groups) |
| `tabs` | The editor tab strip |
| `active_tab` | The tab of the file being shown |
| `sidebar` | The primary side bar, whatever view is open in it |
| `activity_bar` | The vertical icon bar that switches side bar views |
| `panel` | The bottom panel (Terminal, Problems, Output…) |
| `terminal` | The terminal inside the panel |
| `status_bar` | The status bar at the bottom |
| `explorer`, `search`, `run_debug`, `source_control`, `extensions` | A side bar view: the side bar when that view is open, otherwise its activity bar icon |

**`detail: "icon"`** in the result means the view is closed and the highlight is on its activity
bar icon. That is useful: make it a `click` step — "Click the Explorer icon to see the project's
files" — then show the view on the next step. If you meant to explain the view's contents, don't
pretend it is open.

The parts are recognised by VS Code's DOM ids and CSS classes, not by their labels, so they work
when VS Code's UI language is not English.

## `text` targets

- `text` is matched against accessible names first (Explorer items, tab titles, buttons — exact,
  then without VS Code's trailing shortcut like "(Ctrl+Shift+F)", then allowing small OCR-style
  slips), then against OCR of the screen.
- Narrow it with `within` (any `ui` element) when the same text appears in several places, e.g.
  a file name that is both a tab and an Explorer row. `occurrence` picks the n-th match in reading
  order (top to bottom, left to right).
- Matching ignores case and Vietnamese diacritics, because the Windows OCR engine may only know
  English. Prefer text that is distinctive and short: a file name, a command, an error class.
- A view that is closed has nothing to search: `within: "explorer"` on a closed Explorer reports
  `not_visible`.

## `lines` targets

- `file` is absolute or relative to the lesson's `workspace`. `end` defaults to `start`.
- The server opens the file at `start` in the user's VS Code (this scrolls their editor), waits
  for the tab, reads the line-number gutter and highlights the lines across the editor's width.
  Sticky-scroll headers, wrapped lines, CodeLens rows and folded regions are handled.
- Keep ranges to what fits on screen (roughly 25–30 lines). A range that runs past the visible
  lines is drawn up to the edge and comes back with `clipped: true`.
- Prefer one `lines` target per step. If the step needs two places in the same file, two
  `lines` targets work when both are visible after opening at the first one.

## `rect` targets

- `space: "screen"` (default): physical screen pixels. Read them off the labels of an
  `observe` grid (`grid: true`), which are screen coordinates.
- `space: "screenshot"` with `screenshot_id`: pixels in an `observe` or `verify` image; the server
  converts them. Easier when you measure on the image itself.
- Explicit rects move with the VS Code window, but nothing re-finds what is inside them. Use them
  for things the other kinds cannot name (a chart in a webview, a region of a browser preview).

## Verifying

- `verify: true` returns a picture of the area with the highlights outlined in orange. Use it for
  `text` and `lines` targets and for any rect you computed yourself.
- `confidence` is 1 for exact finds; lower for OCR (0.85 exact text, 0.7 with slips), for lines
  OCR missed and filled in (0.8), clipped ranges (0.7) and folded code (0.6). Below 0.6, verify
  and consider a different target.
- If a highlight is wrong, show a corrected step; don't leave the user looking at the wrong place.
