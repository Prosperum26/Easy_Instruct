#!/usr/bin/env bash
# A small FastAPI repository for the eval cases, created in the run's empty workspace.
set -euo pipefail
mkdir -p app/routes tests
cat > README.md <<'MD'
# todo-api

A tiny FastAPI service for todos.

    pip install -r requirements.txt
    uvicorn app.main:app --reload
    pytest
MD
printf 'fastapi==0.115.0\nuvicorn==0.30.6\npytest==8.3.2\nhttpx==0.27.2\n' > requirements.txt
cat > app/__init__.py <<'PY'
PY
cat > app/main.py <<'PY'
from fastapi import FastAPI

from app.routes import todos


def create_app() -> FastAPI:
    app = FastAPI(title="todo-api")
    app.include_router(todos.router, prefix="/todos")
    return app


app = create_app()
PY
cat > app/routes/__init__.py <<'PY'
PY
cat > app/routes/todos.py <<'PY'
from fastapi import APIRouter

from app.db import TODOS

router = APIRouter()


@router.get("/")
def list_todos():
    return TODOS


@router.post("/")
def add_todo(title: str):
    todo = {"id": len(TODOS) + 1, "title": title, "done": False}
    TODOS.append(todo)
    return todo
PY
cat > app/db.py <<'PY'
TODOS: list[dict] = []
PY
cat > tests/test_todos.py <<'PY'
from fastapi.testclient import TestClient

from app.main import app


def test_add_and_list():
    client = TestClient(app)
    client.post("/todos/", params={"title": "write tests"})
    assert client.get("/todos/").json()[0]["title"] == "write tests"
PY
