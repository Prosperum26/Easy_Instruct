---
description: A quick question about one function should be answered in the chat, without starting an on-screen lesson.
tags: [no-trigger]
runs: 2
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: Reads app/routes/todos.py and answers briefly in the chat; no start_session.
---

Trong app/routes/todos.py, hàm add_todo làm gì vậy? Trả lời ngắn gọn thôi.
