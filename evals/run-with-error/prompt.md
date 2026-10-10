---
description: The user's run failed; the agent should look at the screen, explain the error on screen and have the user fix it themselves.
tags: [trigger, debugging]
runs: 2
max_turns: 50
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: Observes the terminal, highlights the ModuleNotFoundError, explains it, gives a do step with pip install -r requirements.txt, never runs it itself.
---

Mình chạy `uvicorn app.main:app --reload` trong terminal của VS Code mà bị lỗi đỏ lòm. Chỉ mình sửa trên màn hình với, mình muốn tự làm để hiểu.
