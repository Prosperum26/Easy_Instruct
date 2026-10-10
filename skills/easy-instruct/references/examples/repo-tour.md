# Example: a tour of a small FastAPI repo

The user, in Vietnamese: *"Mình vừa clone repo này về, dạy mình hiểu nó chạy thế nào."*
The repo is at `C:\repos\todo-api`: `app/main.py`, `app/routes/todos.py`, `app/db.py`,
`requirements.txt`, `tests/`, `README.md`.

Results are abbreviated. Bubble text is in Vietnamese because the user wrote in Vietnamese.

## 1. Prepare (no overlay yet)

Read README, `requirements.txt`, `app/main.py`, `app/routes/todos.py`, `app/db.py`, a test.
Plan: overview → folders → README → dependencies → `create_app` → todo routes → run → tests → summary.

## 2. Start

```json
start_session {
  "title": "Tour of todo-api",
  "intro": "Mình sẽ đi qua **cấu trúc**, **luồng chạy** và cách **chạy app + test**. Khoảng 10 phút, 9 bước.",
  "workspace": "C:\\repos\\todo-api"
}
→ { "session_id": "…", "ide_window": { "title": "… - todo-api - Visual Studio Code", "bounds": {…}, "minimized": false } }

wait_for_user {}            → { "event": "next", "step_id": "s1" }
```

## 3. Folders — the Explorer is closed

```json
show_step {
  "title": "Mở Explorer", "mode": "click", "step_label": "1/9",
  "body": "Click vào icon **Explorer** để xem các file của project.",
  "targets": [{ "kind": "ui", "element": "explorer" }]
}
→ { "resolved": [{ "rect": {…}, "method": "uia", "confidence": 1, "detail": "icon" }], "unresolved": [] }

wait_for_user {}            → { "event": "clicked", "step_id": "s2" }

show_step {
  "title": "Cấu trúc thư mục", "mode": "read", "step_label": "2/9",
  "body": "- `app/`: code của API — bắt đầu từ `main.py`\n- `app/routes/`: mỗi file là một nhóm endpoint\n- `tests/`: test chạy bằng pytest\n\nKhi cần sửa một endpoint, bạn sẽ tìm trong `app/routes/`.",
  "targets": [{ "kind": "ui", "element": "explorer" }]
}
→ { "resolved": [{ …, "detail": "view" }] }
wait_for_user {}            → { "event": "next", "step_id": "s3" }
```

## 4. Code — a `lines` target, verified

```json
show_step {
  "title": "Nơi app được tạo", "mode": "read", "step_label": "4/9", "verify": true,
  "body": "`create_app()` tạo FastAPI app và gắn các router. Mọi request đều đi qua đây trước, nên khi một route 'biến mất', hãy kiểm tra `include_router` ở đây.",
  "targets": [{ "kind": "lines", "file": "app/main.py", "start": 8, "end": 16 }]
}
→ { "resolved": [{ "rect": {…}, "method": "ocr_gutter", "confidence": 1, "clipped": false }],
    "preview": { "screenshot_id": "shot-1", … } }  + an image with the lines outlined
```

The preview shows the outline on lines 8–16, so carry on.

## 5. The user asks a question

```json
wait_for_user {}  → { "event": "ask", "step_id": "s5", "question": "include_router là gì vậy?" }

show_step {
  "title": "include_router", "mode": "read", "step_label": "5/10",
  "body": "Router là một nhóm endpoint (ở đây: `/todos`). `include_router` gắn nhóm đó vào app, kèm prefix. Không gắn thì các endpoint trong file đó không tồn tại.",
  "targets": [{ "kind": "lines", "file": "app/main.py", "start": 14, "end": 14 },
              { "kind": "lines", "file": "app/routes/todos.py", "start": 5, "end": 5 }]
}
wait_for_user {}  → { "event": "next", … }
```

The plan grew by one step, so the label became `5/10`. Then continue where the lesson left off.

## 6. Running — a command fails

```json
show_step {
  "title": "Chạy app", "mode": "do", "step_label": "8/10",
  "body": "Gõ lệnh này trong terminal rồi nhấn **Enter**:\n\n```bash\nuvicorn app.main:app --reload\n```\n\nThấy dòng `Uvicorn running on…` thì bấm **Xong**.",
  "targets": [{ "kind": "ui", "element": "terminal" }]
}
wait_for_user {}  → { "event": "done", … }

observe { "region": "ide" }
→ image: the terminal shows  ModuleNotFoundError: No module named 'fastapi'

show_step {
  "title": "Lỗi: thiếu thư viện", "mode": "read", "verify": true,
  "body": "Python không tìm thấy `fastapi` vì các thư viện trong `requirements.txt` chưa được cài.",
  "targets": [{ "kind": "text", "text": "ModuleNotFoundError", "within": "terminal" }]
}
wait_for_user {}  → next

show_step {
  "title": "Cài thư viện", "mode": "do",
  "body": "```bash\npip install -r requirements.txt\n```\nChạy xong thì bấm **Xong**, rồi mình chạy lại app.",
  "targets": [{ "kind": "ui", "element": "terminal" }]
}
wait_for_user {}  → done
observe { "region": "ide" }            → install finished
… show the run step again → done → observe → "Uvicorn running on http://127.0.0.1:8000"
```

## 7. End

```json
end_session {
  "summary": "Bạn đã biết:\n- `app/main.py` tạo app và gắn router\n- endpoint nằm trong `app/routes/`\n- cài thư viện và chạy bằng `uvicorn`\n\n**Tiếp theo:** đọc `app/db.py`, rồi thử thêm field `due_date` vào Todo."
}
```
