---
type: llm
focus: mock_calls
---

PASS if the lesson's steps (show_step / show_card calls) go roughly from an overview or the folder layout, to the entry point (app/main.py or create_app), to running the app, AND the steps that run something use mode "do" with the exact command for the user to type (pip install and/or uvicorn), AND bubble bodies are short (most under about 100 words).
FAIL if commands are never handed to the user, if steps are mostly long walls of text, or if the lesson never reaches the code or never reaches running it.
