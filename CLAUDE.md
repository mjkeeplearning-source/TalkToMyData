# CLAUDE.md — RAG MVP: Tableau Cloud Data Source Q&A

## Project Overview

Single Docker container: FastAPI backend (Python/uv) serving a statically-built Next.js frontend. The LLM autonomously decides which Tableau MCP tools to call at runtime — no hardcoded tool wrappers.

**Tech stack:** Tableau MCP (stdio subprocess) · FastAPI · Next.js (static export) · Claude `claude-sonnet-4-6` · `uv`

> No authentication in this MVP. All endpoints are open.

---

## Architecture

User → API → Agent → MCP → Agent → User
```
Docker Container (port 8000)
┌──────────────────────────────────────────────────────────┐
│   FastAPI (uvicorn :8000)                                │
│   ├── POST /api/chat  → agentic loop (SSE stream)        │
│   └── /              → Next.js static export             │
│        ├── Tableau MCP subprocess (stdio)                │
│        │   └── Tableau Cloud (external HTTPS)            │
│        └── Anthropic API (external HTTPS)                │
└──────────────────────────────────────────────────────────┘
```

**Agentic loop:** user question → FastAPI reads MCP tool list → Anthropic API call with full tool list → LLM calls tools as needed (multi-turn) → streams final answer via SSE.


---

## Repository Layout

```
/
├── backend/                   # uv Python project (FastAPI)
│   ├── pyproject.toml / uv.lock / .python-version
│   └── app/
│       ├── main.py            # FastAPI app, lifespan, app.state, static mount
│       ├── config.py          # pydantic-settings (validates env vars at startup)
│       ├── routers/chat.py    # POST /api/chat — StreamingResponse SSE
│       ├── services/
│       │   ├── mcp_bridge.py  # MCP subprocess lifecycle (AsyncExitStack); tool list + call_tool
│       │   └── agent.py       # agentic loop: Anthropic stream ↔ MCP tool calls
│       └── models/schemas.py
│
├── frontend/                  # Next.js static export (output: 'export')
│   └── app/ components/ hooks/ lib/
│
├── scripts/                   # start/stop for mac, linux, windows
├── tableau-mcp/               # cloned + pre-built; dist/ and node_modules/ committed
├── Dockerfile                 # 3-stage: frontend-build, mcp-build, runtime
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Anthropic API key |
| `TABLEAU_SERVER_URL` | yes | e.g. `https://<pod>.online.tableau.com` |
| `TABLEAU_SITE_NAME` | yes | Tableau Cloud site name |
| `TABLEAU_PAT_NAME` | yes | Personal Access Token name |
| `TABLEAU_PAT_SECRET` | yes | Personal Access Token secret |
| `LOG_LEVEL` | no | Default: `INFO` |

---

## Task Breakdown

### TASK 1 — Project Scaffolding ✅ DONE
- `git init` + `.gitignore` (Python, Node, `.env`)
- `uv init backend` → pin Python 3.12 → add deps: `fastapi uvicorn[standard] pydantic-settings anthropic mcp`; dev: `pytest pytest-asyncio httpx`
- `npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir`
- Clone `tableau/tableau-mcp` → `npm install` → `npm run build` → confirm entry point with `node -e "console.log(require('./package.json').main)"` → `npm ci --omit=dev`
- Commit `tableau-mcp/dist/` and `tableau-mcp/node_modules/`; do NOT commit `backend/.venv`, `frontend/node_modules`, `frontend/out`
- **Verify:** `uv run python -c "import fastapi, anthropic, mcp"` succeeds; `tableau-mcp/dist/index.js` exists; `cd frontend && npm run build` succeeds

### TASK 2 — Environment Configuration
- `backend/app/config.py`: pydantic-settings `BaseSettings`; raises `ValidationError` at startup for missing vars
- `backend/app/models/schemas.py`: define `Message(role: Literal["user","assistant"], content: str)` and `ChatRequest(message: str = Field(max_length=2000), history: list[Message] = [])`
- Frontend needs no `.env` — calls backend at same origin
- **Verify:** remove one required var from `.env` → `uv run python -c "from app.config import settings"` prints a clear `ValidationError` naming the missing field

### TASK 3 — MCP Bridge (`backend/app/services/mcp_bridge.py`)
- Launch subprocess: `node /app/mcp/dist/index.js` (deterministic, no npx)
- Use `AsyncExitStack` to manage `stdio_client` + `ClientSession` context managers
- Cache tool list on connect (`session.list_tools()`)
- `call_tool(name, tool_input)`: `session.call_tool(name, arguments=tool_input)` with 30s timeout; flatten content blocks to string
- **Verify:** `test_mcp_bridge.py` — mock MCP subprocess; assert `bridge.tools` is non-empty after connect; assert `call_tool` passes correct name and arguments; assert `disconnect` closes cleanly

### TASK 4 — Agent Service (`backend/app/services/agent.py`)
- `MAX_ITERATIONS = 10` guard; emit `event: error` if exceeded
- Convert `bridge.tools` → Anthropic tool format (`name`, `description`, `input_schema`)
- Streaming loop: `event.type == "text"` → yield `event: token`; `get_final_message()` handles tool input reassembly
- On `stop_reason == "tool_use"`: emit `event: tool_call` per tool, execute via bridge, feed results back
- On `stop_reason == "end_turn"`: emit `event: done`
- **Conversation memory:** accept `history: list[Message]` and seed `messages` before appending the new user question
- **Verify:** `test_agent.py` — mock Anthropic stream + bridge; assert `event: token` and `event: done` emitted for a simple end_turn response; assert `event: tool_call` emitted and bridge called for a tool_use response; assert `event: error` emitted when iterations exceeded; assert history messages prepended correctly

### TASK 5 — FastAPI App (`backend/app/main.py` + `routers/chat.py`)
- Lifespan: instantiate `MCPBridge`, connect, store on `app.state.bridge` and `app.state.anthropic_client`
- `GET /health` → `{"status": "ok", "mcp_tools": N}`
- `POST /api/chat` → `StreamingResponse` SSE; inject bridge/client from `request.app.state` (no circular import)
- `ChatRequest`: `message: str`, `history: list[Message] = []`
- Mount Next.js static export at `/` if `/app/frontend/out` exists
- **Verify:** `test_chat.py` via `httpx.AsyncClient` — `GET /health` returns 200 with `mcp_tools` key; `POST /api/chat` SSE stream contains at least one `event: token` and ends with `event: done`; message over 2000 chars returns 422

**SSE events:**

| Event | Data |
|---|---|
| `token` | text fragment |
| `tool_call` | tool name |
| `error` | `{"message": "..."}` |
| `done` | `{}` |

### TASK 6 — Docker (`Dockerfile` + `docker-compose.yml`)
- 3-stage build: `frontend-build` (Next.js static export), `mcp-build` (copy pre-built dist + node_modules), `runtime` (python:3.12-slim + Node 20 + uv)
- `uv sync --frozen --no-dev` for reproducible Python deps
- `CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`
- **Verify:** `docker compose build` completes without error; `docker compose up -d` starts; `curl http://localhost:8000/health` returns `{"status":"ok",...}`; `docker compose logs` shows no startup errors

### TASK 7 — Platform Scripts (`scripts/`)
- `start-{mac,linux}.sh` / `start-windows.ps1`: check `.env` exists, check Docker running, `docker compose up --build -d`
- `stop-{mac,linux}.sh` / `stop-windows.ps1`: `docker compose down`
- **Verify:** run start script without `.env` → exits with clear error message; run with `.env` present → container starts and prints `http://localhost:8000`

### TASK 8 — Frontend (Next.js static export)
- `next.config.ts`: `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`
- Pages: `/` (landing) and `/chat` (main UI)
- Components: `ChatWindow`, `MessageBubble` (react-markdown + remark-gfm), `ToolCallIndicator`, `MessageInput` (2000-char limit, Enter submits)
- `Header`: connection status dot from `/health`
- `useChat.ts`: manages SSE, message array, conversation history sent with each request
- `lib/api.ts`: `POST /api/chat` with `{ message, history }`
- **Verify:** `npm run build` produces `out/` with no errors; `useChat.test.ts` — token events accumulate into assistant message, tool_call sets indicator, done clears streaming flag, history array grows with each exchange; `MessageInput.test.tsx` — 2000-char limit enforced, Enter submits, Shift+Enter inserts newline, disabled while streaming

### TASK 9 — Error Handling
- All SSE generator exceptions caught → emit `event: error`, return cleanly
- Frontend: error bubble with "Try again"; connection drop → "Connection lost" bubble
- **Verify:** mock bridge `call_tool` to raise an exception → SSE stream emits `event: error` and closes (no unhandled exception); trigger max iterations → `event: error` emitted; frontend test — `event: error` renders error bubble with retry button

### TASK 10 — Full Test Run
- **Verify:** `cd backend && uv run pytest` — all tests pass with no warnings; `cd frontend && npm test` — all tests pass

### TASK 11 — README
- Overview, prerequisites, quick-start (cp .env.example, run start script), env var table, architecture diagram, troubleshooting table
- **Verify:** follow the README cold (no prior context) — container starts and chat works within the documented steps

---

## Implementation Order

| Phase | Tasks | Status |
|---|---|---|
| 1 | 1, 2 — Scaffolding + env config | done |
| 2 | 3 — MCP bridge | pending |
| 3 | 4, 5 — Agent loop + FastAPI | pending |
| 4 | 8 — Frontend | pending |
| 5 | 6, 7 — Docker + scripts | pending |
| 6 | 9, 10, 11 — Error handling + tests + README | pending |

## Implementation Notes

- `tableau-mcp` builds to `build/index.js` (not `dist/index.js` as originally planned — package changed)
- Dockerfile and agent must reference `tableau-mcp/build/index.js` as the MCP entry point

---

## Key Decisions

| Decision | Rationale |
|---|---|
| Agentic MCP — no hardcoded tool wrappers | LLM picks tools at runtime; new MCP tools work automatically |
| `AsyncExitStack` for MCP lifecycle | Idiomatic context manager pattern; no manual `__aenter__`/`__aexit__` |
| `app.state` for shared services | Avoids circular imports between `main.py` and routers |
| `event.type == "text"` + `get_final_message()` | SDK handles partial_json reassembly; no manual accumulation needed |
| Single Docker container | Simplest MVP deployment |
| Next.js static export served by FastAPI | One port, one process, no separate Node server |
| No auth | MVP; add JWT in v2 |
| No CORS config | Frontend and backend share origin |
| Conversation history in `ChatRequest` | Stateless backend; frontend owns history state |
