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
./scripts/start-mac.sh      # macOS
./scripts/start-linux.sh    # Linux
.\scripts\start-windows.ps1 # Windows
```

Then open `http://localhost:8000`.

To stop:

```bash
./scripts/stop-mac.sh
```

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

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: command not found` | Install Docker Desktop and ensure it is running |
| `.env: No such file or directory` | Run `cp .env.example .env` and fill in values |
| Health check fails (`curl http://localhost:8000/health`) | Check `docker compose logs` for startup errors |
| `401 Unauthorized` from Tableau | Verify `TABLEAU_PAT_NAME` and `TABLEAU_PAT_SECRET` are correct |
| `AuthenticationError` from Anthropic | Verify `ANTHROPIC_API_KEY` is valid |
| Chat shows "unexpected error" | Check logs: `docker compose logs -f` |
| Port 8000 already in use | Stop the conflicting process or change the port in `docker-compose.yml` |
