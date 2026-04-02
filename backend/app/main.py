import logging
import os
from contextlib import asynccontextmanager

from anthropic import AsyncAnthropic
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import chat
from app.services.mcp_bridge import MCPBridge

logger = logging.getLogger(__name__)

STATIC_DIR = os.getenv("STATIC_DIR", "/app/frontend/out")


@asynccontextmanager
async def lifespan(app: FastAPI):
    bridge = MCPBridge()
    await bridge.connect()
    app.state.bridge = bridge
    app.state.anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    logger.info("MCP bridge connected, %d tools available", len(bridge.tools))
    yield
    await bridge.disconnect()
    logger.info("MCP bridge disconnected")


app = FastAPI(lifespan=lifespan)
app.include_router(chat.router)


@app.get("/health")
async def health():
    return {"status": "ok", "mcp_tools": len(app.state.bridge.tools)}


if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
