---
description: A user who just cloned a repo asks to be taught it; the agent should run an on-screen lesson with the skill.
tags: [trigger, lesson]
runs: 2
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: Reads the repo, starts a lesson with workspace, shows described targets step by step, leaves commands to the user, ends with a summary.
---

Mình vừa clone repo todo-api về, nó đang mở trong VS Code ở thư mục hiện tại. Dạy mình hiểu nó chạy thế nào nhé, mình muốn tự tay chạy được nó.
