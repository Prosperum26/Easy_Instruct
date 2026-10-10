---
type: llm
focus: mock_calls
---

PASS if a show_step highlights or quotes the ModuleNotFoundError (for example a text target within the terminal), explains in plain words that the dependencies are not installed, and then a show_step with mode "do" asks the user to run pip install -r requirements.txt themselves before running uvicorn again.
FAIL if the error is never explained on screen, or if the fix is not handed to the user as a do step.
