# TalkToMyData

Ask questions about your Tableau Cloud data sources in plain English. Claude autonomously calls Tableau MCP tools to answer.

## Architecture

```
Browser → FastAPI (port 8000) → Claude (claude-sonnet-4-6) → Tableau MCP subprocess → Tableau Cloud
                ↑
         Next.js static export (served by FastAPI)
```

Single Docker container. No separate Node server.

## Prerequisites

- Docker
- Tableau Cloud account with a Personal Access Token
- Anthropic API key

## Quick Start

```bash
cp .env.example .env
# fill in values in .env
./scripts/start-mac.sh
```

Then open `http://localhost:8000`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Anthropic API key |
| `TABLEAU_SERVER_URL` | yes | e.g. `https://<pod>.online.tableau.com` |
| `TABLEAU_SITE_NAME` | yes | Tableau Cloud site name |
| `TABLEAU_PAT_NAME` | yes | Personal Access Token name |
| `TABLEAU_PAT_SECRET` | yes | Personal Access Token secret |
| `MCP_SERVER_PATH` | no | Path to MCP entry point (default: `/app/mcp/build/index.js`) |
| `LOG_LEVEL` | no | Default: `INFO` |

## Development Status

| Task | Description | Status |
|---|---|---|
| 1 | Project scaffolding | done |
| 2 | Environment config + data models | done |
| 3 | MCP bridge | done |
| 4 | Agent service (agentic loop) | pending |
| 5 | FastAPI app + chat router | pending |
| 6 | Docker + docker-compose | pending |
| 7 | Platform start/stop scripts | pending |
| 8 | Frontend (Next.js) | pending |
| 9 | Error handling | pending |
| 10 | Full test run | pending |
| 11 | README finalization | pending |
