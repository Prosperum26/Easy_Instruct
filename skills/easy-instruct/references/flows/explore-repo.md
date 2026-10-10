# Flow: exploring a freshly cloned repository

Goal: the user knows what the project is, where the important code lives, how a request or run
flows through it, and can run it and its tests themselves.

## Prepare (overlay off)

Read, in this order, and note what you will show:

1. README: what the project does, how to install and run it.
2. The manifest and lock files: language, framework, scripts (`npm run …`, `make …`).
3. The entry point: `main.py`, `app/__init__.py`, `src/index.ts`, `cmd/<name>/main.go`, `Program.cs`…
4. Two or three files on the main path from the entry point (a route → a service → storage).
5. Config and environment: `.env.example`, `config/`, settings modules.
6. How tests run and where they live.

Pick the 1–3 files that best show the main flow. Don't try to cover everything.

## Default plan (adapt it)

| # | Step | Target | Mode |
|---|---|---|---|
| 1 | Overview: what this project is, what the lesson covers | card | read |
| 2 | Folder layout: what lives where | `ui: explorer` (or a `click` on its icon first if closed) | read |
| 3 | The README: how the authors say to run it | `text: "README.md"` within explorer | click |
| 4 | Dependencies: framework and key libraries | `lines` in the manifest | read |
| 5 | Entry point: where execution starts | `lines` around the app creation | read |
| 6–7 | The main flow, one hop per step | `lines` in each file | read |
| 8 | Config / environment variables | `lines` or `text` | read |
| 9 | Open the terminal | `ui: terminal` (or `do`: "press Ctrl+\`") | do |
| 10 | Install dependencies | `ui: terminal`, command in a code block | do |
| 11 | Run the app, then explain the output | `ui: terminal` | do |
| 12 | Run the tests | `ui: terminal` | do |
| — | Summary | `end_session` | — |

## Tips

- In step 2, name the 3–5 folders that matter and say what kind of code lives in each. Skip
  boilerplate folders unless the user asks.
- For `lines` steps, highlight the few lines that carry the idea (a function signature and its
  key call), not the whole file.
- Run steps follow [run-and-debug.md](run-and-debug.md): observe after each `done`, explain errors
  before moving on.
- If the project can't run locally (needs a database, cloud keys), say so on a card and show where
  that configuration lives instead of failing a command on purpose.
