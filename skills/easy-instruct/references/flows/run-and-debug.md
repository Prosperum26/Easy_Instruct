# Flow: the user runs something, you watch and explain

Running commands is where people learn the most and get stuck the most. The user types; you make
sure they understand what happened, including when it fails.

## A run step

1. `show_step` with `targets: [{ "kind": "ui", "element": "terminal" }]`, `mode: "do"`, and a body
   like:

   ````markdown
   Install the dependencies. Type this in the terminal, then press **Enter**:

   ```bash
   pip install -r requirements.txt
   ```

   Press **Done** when it finishes.
   ````

   If the terminal is closed (`not_visible`), first show a `do` step: "Press Ctrl+\` to open the
   terminal".
2. `wait_for_user` → `done`.
3. `observe` with `region: "ide"` (or the terminal's area) and read the output.
4. Show a step about the result:
   - **It worked**: highlight the meaningful part of the output (`text` within terminal, e.g.
     "Uvicorn running on") and say what it means.
   - **It failed**: go to the next section.

## When a command fails

1. Find the line that explains the error (the last exception line, `error:` from npm, the first
   compiler error) — not the whole stack trace.
2. `show_step` with a `text` target on that line `within: "terminal"`, `verify: true`, `mode:
   "read"`: what the error means in plain words and why it happened.
3. If the fix is something the user should learn (activate a virtual environment, install a
   missing package, create `.env` from `.env.example`), make it a `do` step with the exact command.
   If the fix is in code, highlight the line with a `lines` target and explain the change; let
   them make it (`do`).
4. Repeat the original run step.

Don't paper over errors by fixing things yourself; a failed command the user understood and fixed
is often the most valuable step of the lesson.

## Long-running commands

- Servers and watchers never "finish": ask them to press Done once they see the ready line
  ("Listening on…", "Uvicorn running on…").
- Show where to stop it later (Ctrl+C) before moving on, or tell them to leave it running if a
  later step needs it.

## Common errors worth a step

| Ecosystem | Error | Usual cause |
|---|---|---|
| Python | `ModuleNotFoundError` | Dependencies not installed, or the virtual environment not activated |
| Python | `command not found: python` / opens the Microsoft Store | Python not on PATH; use `py` on Windows |
| Node | `Cannot find module` | `npm install` not run, or wrong working directory |
| Node | `EADDRINUSE` | The port is taken by an earlier run |
| Any | `Permission denied` / execution policy | Script blocked by the OS or PowerShell policy |
| Any | Missing env var / `KeyError: 'DATABASE_URL'` | `.env` not created from the example |
