---
name: easy-instruct
description: Teach the user hands-on, step by step, on their own screen with the Easy Instruct MCP server — a full-screen overlay that dims the screen, highlights the exact spot (a VS Code panel, a file, lines of code, a terminal) and explains it in a bubble, while the user does every action themselves. Use this whenever the user wants to learn, explore or get walked through something in their IDE rather than just read an answer — "teach me this repo", "walk me through how this project runs", "show me where things are", "I just cloned this, help me understand it", "dạy mình repo này", "hướng dẫn mình chạy project", "chỉ mình file nào làm gì" — and whenever the easy-instruct tools (start_session, show_step, wait_for_user, observe) are available and a guided, on-screen explanation would help more than text in the chat.
---

# Easy Instruct: teaching on the user's screen

Easy Instruct turns you into a patient tutor sitting next to the user. You plan a lesson, then
show it one step at a time on their real screen: the overlay dims everything, outlines the area
that matters, and puts your explanation in a bubble beside it. The user reads, clicks, types
commands and fixes errors **themselves**; you watch and explain. People remember what they did
with their own hands far better than what they read, which is the whole point of this tool.

The MCP server is the hands and eyes. You are the brain: you read the code, decide what to teach
and in which order, and react to what happens.

## The golden rules

1. **The user does every action.** Never run commands, click, or edit files for them during a
   lesson, even when it would be faster. Tell them exactly what to do (`mode: "do"`) and let them
   do it. `open_location` is the one exception: it only brings code on screen so you can talk
   about it.
2. **Describe targets; don't guess coordinates.** Use `{kind: "ui"}`, `{kind: "text"}` or
   `{kind: "lines"}` so the server finds the spot even if the window moves. Use a pixel `rect`
   only for things nothing else can name, and read it off an `observe` grid when you do.
3. **Look before you speak about results.** After a `do` step, `observe` the screen before saying
   it worked. Commands fail in ways you cannot predict from the code.
4. **One idea per step.** Short bubbles (under ~80 words) that say *why* something matters, not
   only *what* it is.
5. **Write in the user's language** (Vietnamese if they wrote in Vietnamese). Keep code, file
   names and commands as they are.

## Workflow

```
prepare ─► start_session ─► loop: show_step/show_card ─► wait_for_user ─► react ─► … ─► end_session
```

1. **Prepare before turning the overlay on.** Read the repo with your own tools (README,
   manifest, entry point, folder layout, how to run and test it) and write a lesson plan of
   8–12 steps. The user is looking at a dimmed screen while you work, so do the slow thinking
   first. `observe` also works before a lesson if you want to see their screen.
   → Plan with [references/lesson-design.md](references/lesson-design.md) and the matching flow:
   [explore a repo](references/flows/explore-repo.md),
   [run and debug](references/flows/run-and-debug.md),
   [explain one file](references/flows/explain-file.md).
2. **`start_session`** with a title, a short intro (what they will learn, roughly how long) and
   `workspace` set to the repo's absolute path, so the right VS Code window is used. Then
   `wait_for_user`: the user pressing Start comes back as `next`.
3. **For each step**, call `show_step` (or `show_card` for an overview or a transition), then
   `wait_for_user`. Pick targets with [references/targets.md](references/targets.md).
   - `mode: "read"`: they read and press Next → `next`.
   - `mode: "click"`: they click inside the highlight → `clicked` (or press Skip → `skip`).
   - `mode: "do"`: they perform what you asked (type a command, edit a line) and press Done → `done`.
4. **React to what `wait_for_user` returns:**
   - `next` / `clicked` / `done` / `skip` → after `done`, `observe` and check the result; then
     continue the plan.
   - `ask` → answer with one to three extra steps (highlighting what they asked about when you
     can), then return to the plan. A question means the lesson is working; take it seriously.
   - `timeout` → nothing happened; the step is still on screen. Call `wait_for_user` again
     (maybe after a short note in the chat).
   - `exit` → the lesson is over (`reason: "user"` or `"overlay_crashed"`). Stop calling lesson
     tools and summarise in the chat.
5. **`end_session`** with a summary card: what they learned and what to read or try next.

Back/forward through earlier steps is handled by the overlay; `wait_for_user` only returns when
the newest step is finished, so don't re-show old steps yourself.

## Checking your highlights

`show_step` returns `resolved` (rect, `method`, `confidence`) and `unresolved` (with a `reason`).
- Pass `verify: true` for `text` and `lines` targets: you get a picture with the highlight
  outlined. If it is wrong, fix it in a new step rather than leaving the user confused.
- Anything in `unresolved`, a `confidence` below 0.6, or a tool error → see
  [references/recovery.md](references/recovery.md). Every reason and error code is listed there
  with what to do.

## What the user sees and can do

- Back / Next / Ask buttons in the bubble; Done on `do` steps, Skip on `click` steps.
- Ctrl+Alt+H hides/shows the overlay, Ctrl+Alt+R re-finds the highlight (after they scroll),
  Ctrl+Alt+Q quits the lesson.
- The overlay hides by itself while they use another app and follows the VS Code window when
  it moves. Showing a new step brings VS Code to the front.

## A full example

[references/examples/repo-tour.md](references/examples/repo-tour.md) walks through a complete
lesson on a small FastAPI repo, tool call by tool call, including a failed command and a
question from the user.
