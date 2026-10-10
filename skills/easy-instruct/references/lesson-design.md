# Designing a lesson

A good Easy Instruct lesson feels like a senior colleague pointing at the screen: short, in the
right order, always answering "why should I care?". These guidelines come from how people learn
an unfamiliar codebase, not from the tool.

## Before the overlay goes on

- **Read first, teach second.** Skim the README, the manifest (`package.json`, `pyproject.toml`,
  `requirements.txt`, `pom.xml`, `go.mod`…), the entry point, the main folders, the config and
  how tests run. You need the big picture to choose what to leave out.
- **Find out what the user wants.** "Understand the repo", "get it running", "find where X
  happens" and "fix this bug" are different lessons. If the request is vague, a one-line question
  in the chat before `start_session` is cheaper than a lesson aimed at the wrong goal.
- **Write the plan down** (in your head or the chat): 8–12 steps for a tour, fewer for a narrow
  question. Each step: one target, one idea, one mode.

## Shaping the steps

| Principle | Why |
|---|---|
| One idea per step | The bubble is small and the user is switching between reading and looking. Two ideas means one gets lost. |
| Under ~80 words per bubble | Longer text pushes the explanation away from the highlight it explains. |
| Say why, not only what | "`app/main.py` creates the app" is forgettable; "every request starts here, so this is where to look when a route is missing" sticks. |
| Big picture → detail | Folders before files, entry point before helpers, the happy path before edge cases. |
| Let them act early | Within the first third of the lesson, give them something to do (open a file, run a command). Doing keeps attention. |
| End on something that works | Finish with a successful run or a passing test, then the summary. |

Use `show_card` (no highlight) for the overview at the start, for transitions between parts
("Now that you know the layout, let's run it") and when nothing on screen illustrates the point.

## Choosing the mode

| Mode | Use when | The bubble should |
|---|---|---|
| `read` | Explaining what is highlighted | Explain, then let them press Next |
| `click` | They should open or select something: a file in the Explorer, a tab, the Search icon | Say exactly what to click; the step completes when they click inside the highlight |
| `do` | They should type, run or edit: a terminal command, a one-line change | Give the exact command in a code block, say "then press Enter", and ask them to press Done when it finishes |

Never use `do` for something you could have done invisibly *and* that teaches nothing (like
opening a file just so you can talk about it) — use `open_location` or a `lines` target instead.
Do use `do` for anything the user will need to repeat on their own later: installing
dependencies, starting the app, running the tests.

## Labels and pacing

- Set `step_label` like `"3/9"` so the user knows how far along they are. If you add steps for a
  question, keep the count honest ("3/11") rather than pretending the plan didn't change.
- After a `do` step, give the result a step of its own ("It's running — here's what that output
  means") instead of rushing to the next topic.

## When the user asks a question

`wait_for_user` returns `ask` with their question. Answer it on screen when you can: one to three
extra steps that highlight what they asked about. Then go back to where you were. If the question
shows the plan was aimed wrong (they already know this, or want something else), adjust the rest
of the plan — the lesson is for them, not for the plan.

## Ending well

`end_session` takes a short Markdown summary: the three or four things they now know, and one or
two concrete next steps ("read `app/services/orders.py` next", "try adding a field to `Order`").
The card stays until they close it.
