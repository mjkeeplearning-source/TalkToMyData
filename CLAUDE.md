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
├── tableau_tool.json          # whitelist of Tableau MCP tools exposed to the LLM
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
- **Verify:** ✅ `uv run pytest tests/test_agent.py` — 9 tests passing (tool conversion, end_turn flow, tool_use flow, tool result fed back, max iterations guard, history seeding, call_tool exception → event: error)


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

### TASK 9 — Error Handling ✅ DONE
- `agent.py`: entire agentic loop wrapped in `try/except Exception` — exceptions from `bridge.call_tool()` or `client.messages.stream()` emit `event: error` and close cleanly (no silent connection drop)
- Frontend: error bubble with "Try again" already implemented in `useChat.ts` / `MessageBubble`; connection drop → "Connection lost" bubble
- **Verify:** ✅ `test_run_agent_call_tool_raises_emits_error` — mock `call_tool` raises `RuntimeError` → exactly one `event: error` emitted, no `event: done`; max iterations test unchanged; frontend `event: error` → error bubble with retry button tested in `useChat.test.tsx`

### TASK 10 — Full Test Run ✅ DONE
- **Verify:** ✅ `cd backend && uv run pytest` — 28 tests passing; `cd frontend && npm test` — 24 tests passing
- Fixed 2 flaky `MessageInput` tests: replaced `userEvent.type("a".repeat(1801+))` with `fireEvent.change` — `userEvent.type` character-by-character on large strings causes timeout and incorrect count in jsdom

### TASK 11 — README ✅ DONE
- Overview, prerequisites, quick-start (all 3 platforms), env var table, troubleshooting table
- **Verify:** ✅ End-to-end test confirmed: `curl http://localhost:8000/health` → `{"status":"ok","mcp_tools":16}`; chat `"list data sources"` → agent called `list-datasources` MCP tool → streamed response listing Superstore Datasource

### Task 12 — AIDA Redesign ✅ DONE
- Rebranded to **AIDA** (Artificial Intelligence for Data Analytics) with  navy (#00395D) / teal (#00AEEF) design system
- CSS design tokens in `globals.css`: `--primary`, `--accent`, `--surface-alt`, `--border`, `--text-*`, `--bubble-*`, `--shadow-*`, `--sidebar-*`
- Header: AIDA logo + subtitle + hamburger for mobile + connection status + "Manish Jain" user avatar (initials MJ)
- **Multi-conversation sidebar**: `useConversations` hook — localStorage persistence, conversations grouped by date (Today / Yesterday / date), new chat button, per-conversation delete
- New hook architecture: `useChat({conversationId, initialMessages, initialHistory, onSave})` — resets state on conversation switch, calls `onSave(id, messages, history)` on `done`
- `lib/types.ts`: shared `ChatMessage` (with `id: string`, `timestamp: Date`), `ApiMessage`, `Conversation`
- `rehype-highlight` + `highlight.js` — syntax-highlighted code blocks with `github.css` theme
- Message bubbles: `message-appear` slide-up animation, absolute timestamps (HH:MM), copy-to-clipboard on hover, ARIA `role="alert"` on errors
- Chat window: `role="log"` aria region, stable `key={msg.id}` (no more index keys)
- Empty state (`EmptyState.tsx`): AIDA mark + 4 suggested prompts (data sources, top products, sales trends, regional comparison)
- Responsive: sidebar hidden on mobile (slide-in with overlay), always visible on `lg+` via CSS
- **Verify:** `npm test` — 37 tests passing (5 test files; added `useConversations` tests + 2 new MessageBubble tests); `npm run build` — static export succeeds, TypeScript clean

### POST-MVP — System Prompt ✅ DONE
- `backend/app/prompts/system.md` — editable system prompt file; read per-request so changes take effect without restart
- `agent.py`: `_load_system_prompt()` reads file via `Path.read_text()`; passed as `system=` to `client.messages.stream`

### POST-MVP — Logging ✅ DONE
- `main.py`: `logging.basicConfig(level=settings.log_level.upper(), ...)` — `LOG_LEVEL` env var now actually applied (was configured but never wired in)
- `agent.py`: tool call logged at INFO (`Calling tool: <name> input=<input>`); MCP response logged at DEBUG (truncated to 500 chars)
- View logs: `docker compose logs -f`; set `LOG_LEVEL=DEBUG` in `.env` to see MCP responses

### POST-MVP — Prompt Caching ✅ DONE
- `agent.py`: system prompt passed as content block list with `cache_control: {"type": "ephemeral"}` instead of plain string
- `agent.py`: `cache_control: {"type": "ephemeral"}` added to last tool in tools list — caches all tool schemas up to that point
- Cache TTL: 5 minutes; cache reads cost 10% of normal input tokens (writes cost 125%)
- Impact: 16 Tableau tools = ~22,276 tokens; subsequent calls in same conversation save ~20k tokens/call (~65% reduction), staying well under 30k TPM rate limit
- **Verify:** `uv run pytest tests/test_agent.py` — 10 tests passing (added `test_tools_for_anthropic_cache_control_on_last_only`)

### POST-MVP — Markdown Table Rendering ✅ DONE
- **Root cause**: Tailwind v4 has no `tailwind.config.ts`; `prose`/`prose-sm` classes from `@tailwindcss/typography` were never installed — tables rendered as unstyled bare HTML
- Added `.chat-content` scoped CSS in `frontend/app/globals.css`: bordered tables, grey header row, zebra striping, heading/list spacing
- `MessageBubble.tsx`: wrapped `<ReactMarkdown>` in `<div className="chat-content">`, removed dead `prose` classes
- **Verify:** `cd frontend && npm test` — 25 tests passing

### POST-MVP — SSE Newline Fix ✅ DONE
- **Root cause**: Previous multi-line `data:` SSE encoding created `\n\n` (empty data lines) inside events — the frontend `buffer.split("\n\n")` treated these as event terminators, randomly dropping all table rows and content after any blank line in LLM output
- `agent.py`: encode `\n` in token text as literal two-char `\n` escape (`event.text.replace("\n", "\\n")`) — single `data:` line per event, no ambiguity
- `useChat.ts`: unescape `\\n` back to `\n` when consuming token events (`eventData.replace(/\\n/g, "\n")`)
- **Verify:** `uv run pytest tests/test_agent.py` — 11 tests passing (added `test_run_agent_newlines_encoded_in_sse` with double-newline case); `npm test` — 25 tests passing

### POST-MVP — Colored Trend Arrows ✅ DONE
- **Root cause**: System prompt used LaTeX `${\color{green}↑}$` — `react-markdown` has no math renderer; raw LaTeX appeared verbatim in UI
- `system.md`: replaced with `<span style="color:#16a34a">↑</span>` and `<span style="color:#dc2626">↓</span>` HTML
- `MessageBubble.tsx`: added `rehype-raw` plugin to `ReactMarkdown` to render inline HTML spans
- Installed `rehype-raw@^7.0.0` in frontend
- **Verify:** `cd frontend && npm test` — 25 tests passing; trend arrows render as colored ↑/↓ in UI

### POST-MVP — Wide Table Horizontal Scroll ✅ DONE
- **Root cause**: `.chat-content table` had `width: 100%` with no overflow constraint — tables wider than the 80% chat bubble pushed outside it and were clipped
- `globals.css`: moved `border`, `border-radius`, and `overflow` to a new `.chat-content .table-wrap` wrapper div with `overflow-x: auto`; table itself gets `min-width: 400px` so narrow screens still scroll rather than compress
- `MessageBubble.tsx`: added a custom `table` component to `ReactMarkdown` that wraps each `<table>` in `<div className="table-wrap">` — wide tables now scroll horizontally inside the bubble
- **Verify:** `cd frontend && npm test` — 40 tests passing

### POST-MVP — Debug Token Usage Logging ✅ DONE
- `agent.py`: after each `stream.get_final_message()` call, log `message.usage` at DEBUG level — shows `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` per API call
- Multi-turn conversations with tool calls log one line per agentic loop iteration
- `tests/test_agent.py`: updated `_final_message()` mock to include `usage` SimpleNamespace so all 11 agent tests still pass
- **Verify:** `uv run pytest tests/test_agent.py` — 11 tests passing; set `LOG_LEVEL=DEBUG` in `.env` to see token lines in `docker compose logs -f`
- **Note on high token counts**: every API call includes all tool schemas + system prompt (~6,000 tokens) — this is the cost of the agentic design. Prompt caching reduces effective cost to ~10% for the cached portion (`cache_read` tokens). See Key Decisions for details.

### POST-MVP — Tool Whitelist (`tableau_tool.json`) ✅ DONE
- `tableau_tool.json` in project root: `{"tool_to_use": ["list-datasources", "get-datasource-metadata", "query-datasource"]}` — edit to control which Tableau MCP tools the LLM can use
- `agent.py`: `_load_tool_filter()` reads whitelist at call time; `_tools_for_anthropic()` filters `bridge.tools` to only whitelisted names before passing to the Anthropic API
- If file is missing, all tools are passed (fallback with warning log)
- `Dockerfile`: `COPY tableau_tool.json ./` — copies file to `/app/tableau_tool.json` so it's available in the container
- `tests/test_agent.py`: `_load_tool_filter` patched to `None` in unit tests that use arbitrary tool names; added `test_tools_for_anthropic_filters_by_whitelist` to verify filtering; `mock_bridge` fixture updated to use `query-datasource`
- **Verify:** `uv run pytest tests/test_agent.py` — 12 tests passing

---

## Implementation Order

| Phase | Tasks | Status |
|---|---|---|
| 1 | 1, 2 — Scaffolding + env config | done |
| 2 | 3 — MCP bridge | done |
| 3 | 4, 5 — Agent loop + FastAPI | done |
| 4 | 8 — Frontend | done |
| 5 | 6, 7 — Docker + scripts | done |
| 6 | 9, 10, 11 — Error handling + tests + README | done |

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
- `agent.py` error handling: `try/except Exception` (not `BaseException`) around the loop — `GeneratorExit` propagates normally for clean async generator shutdown
- `MessageInput` large-input tests use `fireEvent.change` not `userEvent.type` — typing 1800+ chars character-by-character in jsdom causes timeout and incorrect accumulated count due to React controlled-component batching
- System prompt in `backend/app/prompts/system.md`; loaded per-request via `Path.read_text()` — edit without restart
- `LOG_LEVEL` in `config.py` was never applied; fixed by adding `logging.basicConfig` in `main.py` at startup; DEBUG level logs MCP responses (truncated 500 chars)
- Prompt caching: `cache_control: {"type": "ephemeral"}` on both system prompt (as content block) and last tool — Anthropic caches the large tool schemas across calls within a 5-min TTL window
- SSE newline encoding: `\n` in token text escaped as two-char `\n` literal — multi-line `data:` approach caused `\n\n` inside events to be misread as event terminators, dropping content randomly
- Tailwind v4 has no `tailwind.config.ts` — `@tailwindcss/typography` `prose` classes don't exist; table/heading/list styles added as `.chat-content` scoped CSS in `globals.css`
- Trend arrows: system prompt must use `<span style="color:...">` HTML, not LaTeX `${\color{}}$` — ReactMarkdown has no math renderer; `rehype-raw` plugin required to render inline HTML
- Wide table scroll: `display: block` on `<table>` is not used — instead a `.table-wrap` div with `overflow-x: auto` wraps each table via a custom ReactMarkdown `table` component; this preserves table semantics while enabling horizontal scroll
- Token usage logging: `message.usage` fields (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) are all present on the Anthropic final message object; `getattr(..., 0) or 0` guards against `None` for the cache fields on older SDK versions
- High `cache_read` token counts are expected: tool schemas + system prompt (~6,000 tokens) are cached for 5 min; `cache_read` costs 10% of normal input price so effective cost is much lower than the raw count suggests
- Tool whitelist: `tableau_tool.json` at project root lists allowed tool names; `_load_tool_filter()` reads it per call; missing file falls back to all tools with a warning; `TOOL_FILTER_PATH` resolves via `Path(__file__).parent×4` — works for both local dev (`TalkToMyData/`) and Docker (`/app/`)

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
| System prompt in separate file (`prompts/system.md`) | Editable without code changes; reloaded per-request so no restart needed |
| `logging.basicConfig` at app startup | Wires `LOG_LEVEL` env var into Python logging; INFO shows tool calls, DEBUG adds MCP responses |
| Prompt caching on system prompt + last tool | ~22k tool schema tokens cached for 5 min; subsequent calls cost 10% of those tokens — avoids 30k TPM rate limit on multi-turn conversations |
| SSE `\n` escaped as two-char literal | Prevents `\n\n` inside a token from being misread as SSE event separator — multi-line `data:` encoding was the root cause of randomly dropped table content |
| `.chat-content` CSS instead of `prose` plugin | Tailwind v4 project — `@tailwindcss/typography` not installed, `prose` classes are no-ops; scoped CSS in `globals.css` is explicit and reliable |
| `rehype-raw` for HTML spans in markdown | Allows `<span style="color:...">` trend arrows from LLM to render; LaTeX math notation unusable without KaTeX/rehype-katex |
| `.table-wrap` div + custom ReactMarkdown `table` component | Wide tables scroll horizontally inside the bubble without breaking table semantics — `overflow-x: auto` on `display: table` has no effect, requires a block wrapper |
| DEBUG-level token logging per API call | Surfacing `input/output/cache_write/cache_read` tokens per iteration helps diagnose cost; not logged at INFO to avoid noise in production logs |
| `tableau_tool.json` whitelist at project root | Decouples tool selection from code — edit the file to add/remove tools without touching `agent.py`; fallback to all tools if file missing |
