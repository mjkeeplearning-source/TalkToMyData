# Stage 1: Build Next.js static export
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Prepare MCP (pre-built artifacts committed to repo)
FROM node:20-slim AS mcp-build
WORKDIR /mcp
COPY tableau-mcp/build/ ./build/
COPY tableau-mcp/node_modules/ ./node_modules/

# Stage 3: Runtime — python:3.12-slim + Node 20 + uv
FROM python:3.12-slim AS runtime

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy and install Python deps (reproducible, no dev deps)
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./backend/
RUN cd backend && uv sync --frozen --no-dev

# Copy backend source
COPY backend/app/ ./backend/app/

# Copy MCP pre-built artifacts
COPY --from=mcp-build /mcp ./mcp/

# Copy frontend static export
COPY --from=frontend-build /frontend/out ./frontend/out/

ENV MCP_SERVER_PATH=/app/mcp/build/index.js
ENV STATIC_DIR=/app/frontend/out

WORKDIR /app/backend
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
