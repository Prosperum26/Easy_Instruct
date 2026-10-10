# When something does not work

The overlay always shows the step: if no target could be drawn, the bubble appears as a centred
card. So a failure is never a dead end for the user, but you should notice it and fix the step.

## `unresolved` reasons from `show_step`

| reason | What happened | What to do |
|---|---|---|
| `off_screen` | The rect lies entirely outside the screen | Re-measure with `observe` (grid on), or describe the target instead |
| `unknown_screenshot` | The `screenshot_id` is unknown or too old (only the last 10 are kept) | `observe` again and use the new id |
| `window_not_found` | No VS Code window was found | Ask the user to open the repo in VS Code (`code <folder>`), then show the step again; pass `workspace` to `start_session` |
| `helper_unavailable` | The Windows helper could not run (see `HELPER_UNAVAILABLE` below) | Fall back to explicit rects from `observe` if that works, otherwise teach with cards and plain directions ("the Explorer on the left") |
| `element_not_found` | That VS Code part is not on screen or this is not VS Code | `observe` to see what is there; choose another element or a rect |
| `not_visible` | The part exists but is hidden: panel closed, sidebar hidden, view closed | Make it a step: a `click` step on the view's icon (`ui: "explorer"` etc. gives the icon when closed), or a `do` step ("press Ctrl+\` to open the terminal"). Then show the original step |
| `text_not_found` | Neither accessible names nor OCR found the text | Check spelling and that it is on screen (`observe`); use a shorter distinctive part; narrow or drop `within`; use `lines` for code |
| `file_not_found` | The `lines` file does not exist | Use an absolute path or one relative to the `workspace` you passed |
| `ide_cli_not_found` | VS Code's command line (cli.js) was not found next to Code.exe | Ask the user to open the file; then use `lines` again (the file is already open) or a `text` target on the tab |
| `ide_cli_failed` | VS Code's command line ran but failed | Same as above; mention it in the chat if it keeps happening |
| `editor_not_found` | The file did not become the active editor in time (or a diff / preview is shown instead of the text editor) | Show the step again; if a diff or Markdown preview is open, ask the user to open the file normally |
| `line_numbers_hidden` | The gutter shows no line numbers (`editor.lineNumbers: off`) | Ask the user to turn line numbers on, or highlight with a `text` target on a distinctive line |
| `relative_line_numbers` | Line numbers are relative (`editor.lineNumbers: relative`) | Same as above |
| `line_not_visible` | The lines are not on screen even after revealing them | Use a shorter range starting at the line you care about |
| `line_folded` | The lines are inside folded code | `do` step: "click the arrow next to line N to unfold", or open the file again |
| `ocr_failed` | Windows OCR is not available on this machine | Use `ui` targets and accessible-name `text`; for code, use `lines` only if OCR returns (it powers the gutter) or explicit rects |

## Tool errors (`isError`, text starts with the code)

| code | Meaning | What to do |
|---|---|---|
| `NO_SESSION` | No lesson is running (never started, ended, or the user quit) | If the user quit, respect it. Otherwise `start_session` |
| `SESSION_ACTIVE` | A lesson is already running | Continue it, or `end_session` first |
| `LAUNCH_FAILED` | The overlay could not start | Tell the user; teach in the chat instead. Suggest `npm run doctor` in the Easy Instruct folder: it says what is missing and how to fix it |
| `WAIT_IN_PROGRESS` | Another `wait_for_user` is still waiting | Only one wait at a time; let the first one return |
| `HELPER_UNAVAILABLE` | The Windows helper could not run (neither the exe nor the PowerShell host) | `observe` and smart targets are unavailable; use cards and plain directions. `npm run doctor` in the Easy Instruct folder shows why |
| `CAPTURE_FAILED` | The screen could not be captured | Try `observe` again; the screen may be locked |
| `BAD_REGION` | The `observe` region is outside the screen | Use `"ide"`, `"screen"` or a region inside the screen |
| `FILE_NOT_FOUND` | `open_location` file does not exist | Fix the path (absolute or relative to `workspace`) |
| `IDE_CLI_NOT_FOUND` | `open_location` could not find VS Code's CLI | Ask the user to open the file themselves |
| `IDE_CLI_FAILED` | VS Code's CLI failed | Ask the user to open the file themselves |

## `wait_for_user` events

| event | Meaning | What to do |
|---|---|---|
| `next` | Read step finished (or the intro's Start) | Next step |
| `clicked` | They clicked inside a click step's highlight | `observe` if what the click opened matters, then the next step |
| `skip` | They skipped a click step | Don't assume the click happened; show what it would have opened another way |
| `done` | They finished a do step | `observe`, read the result, then explain it (or the error) |
| `ask` | They asked something (`question`) | Answer with 1–3 steps, then resume |
| `timeout` | Nothing happened before `timeout_sec` | Call `wait_for_user` again |
| `exit` | The lesson ended: `reason` is `user` or `overlay_crashed` | Stop calling lesson tools; summarise in the chat |

## Signs the lesson itself is going wrong

- The user asks about the same thing twice → your explanation didn't land; try a different angle
  (an example, a smaller step, highlighting the concrete line).
- Several `skip`s in a row → the click steps feel pointless; switch to `read`.
- `exit` early → ask in the chat what they wanted instead.
