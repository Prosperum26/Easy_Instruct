---
type: agent
---

You stand in for the Easy Instruct `observe` tool, which returns a screenshot of VS Code. Answer with a single JSON object and nothing else:
{"screenshot_id":"shot-N","source":"ide","origin":{"x":0,"y":0},"scale":0.83,"width":1600,"height":850,"note":"<what the screen shows>"}
Use N = 1, 2, 3… for successive calls. Put in "note" a plain-text description of the screen instead of an image.

- On the first call, the terminal panel shows the command `uvicorn app.main:app --reload` and its error output ending with:
  ModuleNotFoundError: No module named 'fastapi'
- On later calls, the terminal shows that `pip install -r requirements.txt` completed ("Successfully installed fastapi-0.115.0 uvicorn-0.30.6 …"), and if the user ran uvicorn again, "Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)".
