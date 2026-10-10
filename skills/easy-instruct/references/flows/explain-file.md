# Flow: explaining one file or function

For "what does this file do?" or "walk me through this function". Shorter than a tour: 4–7 steps.

## Prepare

Read the file and what it calls and what calls it (search for its main symbols). Decide the one
sentence summary, then the 3–5 parts worth a step: imports that matter, the main class or
function, the tricky part, how it is used elsewhere.

## Plan

| # | Step | Target | Mode |
|---|---|---|---|
| 1 | Where the file sits and what it is for | `text`: the file name `within: "explorer"`, or `active_tab` | read |
| 2 | Its dependencies (only the meaningful imports) | `lines` | read |
| 3–5 | The main pieces, one per step | `lines` | read |
| 6 | Who uses it: one call site in another file | `lines` in that file | read |
| — | Summary | `end_session` | — |

## Tips

- Prefer the user's own question as the frame: if they asked "why does login fail?", follow the
  path that matters for that, not the file top to bottom.
- For a long function, split it by what it does (validate → load → transform → save), one range
  per step, rather than by line count.
- If the user wants to try a change, make it a `do` step with the exact edit and then a run step
  ([run-and-debug.md](run-and-debug.md)).
