from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from anthropic import AsyncAnthropic
from httpx import ASGITransport, AsyncClient
from mcp.types import Tool

from app.main import app
from app.services.mcp_bridge import MCPBridge

_FAKE_TOOLS = [Tool(name="test_tool", description="A tool", inputSchema={"type": "object"})]


@pytest.fixture
async def client():
    mock_bridge = MagicMock()
    mock_bridge.tools = _FAKE_TOOLS
    mock_bridge.call_tool = AsyncMock(return_value="result")

    # Patch connect/disconnect so lifespan (if triggered) does not spawn a real subprocess.
    with (
        patch.object(MCPBridge, "connect", AsyncMock()),
        patch.object(MCPBridge, "disconnect", AsyncMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            # Set state after entering (overrides whatever lifespan may have set).
            app.state.bridge = mock_bridge
            app.state.anthropic_client = AsyncAnthropic(api_key="test-key")
            yield c


async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["mcp_tools"] == 1


async def test_chat_streams_sse(client):
    async def fake_run_agent(*args, **kwargs):
        yield "event: token\ndata: Hello\n\n"
        yield "event: done\ndata: {}\n\n"

    with patch("app.routers.chat.run_agent", fake_run_agent):
        response = await client.post("/api/chat", json={"message": "hi"})

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "event: token\ndata: Hello\n\n" in response.text
    assert "event: done\ndata: {}\n\n" in response.text


async def test_chat_passes_history(client):
    captured = {}

    async def fake_run_agent(anthropic_client, bridge, question, history=None):
        captured["question"] = question
        captured["history"] = history
        yield "event: done\ndata: {}\n\n"

    with patch("app.routers.chat.run_agent", fake_run_agent):
        await client.post(
            "/api/chat",
            json={
                "message": "new question",
                "history": [
                    {"role": "user", "content": "prev"},
                    {"role": "assistant", "content": "ans"},
                ],
            },
        )

    assert captured["question"] == "new question"
    assert len(captured["history"]) == 2
    assert captured["history"][0].role == "user"
    assert captured["history"][1].role == "assistant"


async def test_chat_rejects_oversized_message(client):
    response = await client.post("/api/chat", json={"message": "x" * 2001})
    assert response.status_code == 422


async def test_chat_uses_app_state(client):
    """Verify bridge and anthropic_client from app.state are passed to run_agent."""
    captured = {}

    async def fake_run_agent(anthropic_client, bridge, question, history=None):
        captured["client"] = anthropic_client
        captured["bridge"] = bridge
        yield "event: done\ndata: {}\n\n"

    with patch("app.routers.chat.run_agent", fake_run_agent):
        await client.post("/api/chat", json={"message": "test"})

    assert captured["bridge"] is app.state.bridge
    assert captured["client"] is app.state.anthropic_client
