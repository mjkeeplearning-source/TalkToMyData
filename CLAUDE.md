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
| `MCP_SERVER_PATH` | no | Default: `/app/mcp/build/index.js` |
| `STATIC_DIR` | no | Default: `/app/frontend/out`; override for local dev |

---

## Task Breakdown

### TASK 1 — Project Scaffolding ✅ DONE
- `git init` + `.gitignore` (Python, Node, `.env`)
- `uv init backend` → pin Python 3.12 → add deps: `fastapi uvicorn[standard] pydantic-settings anthropic mcp`; dev: `pytest pytest-asyncio httpx`
- `npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir`
- Clone `tableau/tableau-mcp` → `npm install` → `npm run build` → confirm entry point with `node -e "console.log(require('./package.json').main)"` → `npm ci --omit=dev`
- Commit `tableau-mcp/dist/` and `tableau-mcp/node_modules/`; do NOT commit `backend/.venv`, `frontend/node_modules`, `frontend/out`
- **Verify:** `uv run python -c "import fastapi, anthropic, mcp"` succeeds; `tableau-mcp/dist/index.js` exists; `cd frontend && npm run build` succeeds

### TASK 2 — Environment Configuration ✅ DONE
- `backend/app/config.py`: pydantic-settings `BaseSettings`; raises `ValidationError` at startup for missing vars
- `backend/app/models/schemas.py`: define `Message(role: Literal["user","assistant"], content: str)` and `ChatRequest(message: str = Field(max_length=2000), history: list[Message] = [])`
- Frontend needs no `.env` — calls backend at same origin
- **Verify:** ✅ `uv run pytest tests/test_config.py tests/test_schemas.py` — 9 tests passing (missing vars, role validation, 2000-char limit, default history)

### TASK 3 — MCP Bridge (`backend/app/services/mcp_bridge.py`) ✅ DONE
- Launch subprocess: `node <mcp_server_path>` — path from `settings.mcp_server_path` (default `/app/mcp/build/index.js`)
- `AsyncExitStack` manages `stdio_client` + `ClientSession`; Tableau env vars passed explicitly to `StdioServerParameters.env`
- Tool list cached on `connect()` via `session.list_tools()`
- `call_tool(name, tool_input)`: 30s timeout via `read_timeout_seconds=timedelta(seconds=30)`; content blocks flattened to string
- **Verify:** ✅ `uv run pytest tests/test_mcp_bridge.py` — 5 tests passing (connect caches tools, text flattening, single block, empty content, disconnect)


### TASK 4 — Agent Service (`backend/app/services/agent.py`) ✅ DONE
- `MAX_ITERATIONS = 10` guard; emit `event: error` if exceeded
- Convert `bridge.tools` → Anthropic tool format (`name`, `description`, `input_schema`)
- Streaming loop: `event.type == "text"` → yield `event: token`; `get_final_message()` handles tool input reassembly
- On `stop_reason == "tool_use"`: emit `event: tool_call` per tool, execute via bridge, feed results back
- On `stop_reason == "end_turn"`: emit `event: done`
- **Conversation memory:** accept `history: list[Message]` and seed `messages` before appending the new user question
- **Verify:** ✅ `uv run pytest tests/test_agent.py` — 8 tests passing (tool conversion, end_turn flow, tool_use flow, tool result fed back, max iterations guard, history seeding)


### TASK 5 — FastAPI App (`backend/app/main.py` + `routers/chat.py`) ✅ DONE
- Lifespan: instantiate `MCPBridge`, connect, store on `app.state.bridge` and `app.state.anthropic_client`
- `GET /health` → `{"status": "ok", "mcp_tools": N}`
- `POST /api/chat` → `StreamingResponse` SSE; inject bridge/client from `request.app.state` (no circular import)
- `ChatRequest`: `message: str`, `history: list[Message] = []`
- Mount Next.js static export at `/` if `/app/frontend/out` exists

**SSE events:**

| Event | Data |
|---|---|
| `token` | text fragment |
| `tool_call` | tool name |
| `error` | `{"message": "..."}` |
| `done` | `{}` |

- **Verify:** ✅ `uv run pytest tests/test_chat.py` — 5 tests passing (health endpoint, SSE streaming, history passthrough, 422 on oversized message, app.state injection); `uv run pytest` — 27 tests passing total

### TASK 6 — Docker (`Dockerfile` + `docker-compose.yml`) ✅ DONE
- 3-stage build: `frontend-build` (Next.js static export), `mcp-build` (copy pre-built dist + node_modules), `runtime` (python:3.12-slim + Node 20 + uv)
- `uv sync --frozen --no-dev` for reproducible Python deps
- `CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`
- **Verify:** ✅ `docker compose build` completes; `docker compose up -d` starts; `curl http://localhost:8000/health` → `{"status":"ok","mcp_tools":16}`; logs show no startup errors

### TASK 7 — Platform Scripts (`scripts/`) ✅ DONE
- `start-{mac,linux}.sh` / `start-windows.ps1`: check `.env` exists, check Docker running, `docker compose up --build -d`
- `stop-{mac,linux}.sh` / `stop-windows.ps1`: `docker compose down`


### TASK 8 — Frontend (Next.js static export) ✅ DONE
- `next.config.ts`: `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`
- Pages: `/` (redirects to `/chat`) and `/chat` (main UI)
- Components: `ChatWindow`, `MessageBubble` (react-markdown + remark-gfm), `ToolCallIndicator`, `MessageInput` (2000-char limit, Enter submits)
- `Header`: connection status dot polls `/health` every 30s
- `useChat.ts`: SSE streaming hook — manages messages, history ref, toolStatus, retry
- `lib/api.ts`: `POST /api/chat` with `{ message, history }`
- Error bubble includes "Try again" button wired to `retry()` in `useChat`
- `STATIC_DIR` env var overrides hardcoded `/app/frontend/out` for local dev
- **Verify:** ✅ `cd frontend && npm run build` — `out/` generated (3 static routes); `npm test` — 24 tests passing (MessageBubble ×7, MessageInput ×7, ToolCallIndicator ×2, useChat hook ×8)

### TASK 9 — Error Handling
- All SSE generator exceptions caught → emit `event: error`, return cleanly
- Frontend: error bubble with "Try again"; connection drop → "Connection lost" bubble
- **Verify:** mock bridge `call_tool` to raise an exception → SSE stream emits `event: error` and closes (no unhandled exception); trigger max iterations → `event: error` emitted; frontend test — `event: error` renders error bubble with retry button

### TASK 10 — Full Test Run ✅ PARTIAL
- **Verify:** `cd backend && uv run pytest` — 27 tests passing; `cd frontend && npm test` — 24 tests passing

### TASK 11 — README
- Overview, prerequisites, quick-start (cp .env.example, run start script), env var table, architecture diagram, troubleshooting table
- **Verify:** follow the README cold (no prior context) — container starts and chat works within the documented steps

---

## Implementation Order

| Phase | Tasks | Status |
|---|---|---|
| 1 | 1, 2 — Scaffolding + env config | done |
| 2 | 3 — MCP bridge | done |
| 3 | 4, 5 — Agent loop + FastAPI | done |
| 4 | 8 — Frontend | done |
| 5 | 6, 7 — Docker + scripts | done |
| 6 | 9, 10, 11 — Error handling + tests + README | partial (frontend tests done) |

## Implementation Notes

- `tableau-mcp` builds to `build/index.js` (not `dist/index.js` as originally planned — package changed)
- Dockerfile and agent must reference `tableau-mcp/build/index.js` as the MCP entry point
- `MCP_SERVER_PATH` added to `config.py` (default `/app/mcp/build/index.js`) — override via env var for local dev
- `[tool.pytest.ini_options] asyncio_mode = "auto"` added to `backend/pyproject.toml` for async tests
- `httpx.ASGITransport` does NOT trigger the ASGI lifespan — tests for `main.py` set `app.state` directly in the fixture (after patching `MCPBridge.connect/disconnect` to prevent real subprocess spawning)
- Frontend test runner: Vitest + React Testing Library (jsdom); config in `frontend/vitest.config.mts`; `vi.spyOn(global, 'fetch')` used to mock SSE streams
- Frontend `useChat` hook: `execute()` is the internal SSE runner; `sendMessage()` prepends user message; `retry()` strips last 2 messages and re-executes
- `STATIC_DIR` read from `os.getenv("STATIC_DIR", "/app/frontend/out")` in `main.py` — set in `.env` for local dev
- Tableau MCP expects `SERVER`, `SITE_NAME`, `PAT_NAME`, `PAT_VALUE` env vars (not `TABLEAU_*` prefixed names) — `mcp_bridge.py` maps settings fields to these names
- Docker frontend stage uses `npm install` not `npm ci` — `npm ci` fails cross-platform because macOS-generated lock files omit Linux-only optional deps (e.g. `@emnapi/runtime`)

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
| No landing page — `/` redirects to `/chat` | Simpler UX; no extra page to maintain |
| Tool call status shown as "Analyzing..." | Friendlier than raw tool names; hides implementation detail |
| `fetch` + `ReadableStream` for SSE (not `EventSource`) | `EventSource` is GET-only; POST required to send message + history |
