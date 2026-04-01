from contextlib import asynccontextmanager
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from mcp.types import CallToolResult, ListToolsResult, TextContent, Tool

from app.services.mcp_bridge import MCPBridge


def _make_tool(name: str) -> Tool:
    return Tool(name=name, inputSchema={"type": "object", "properties": {}})


def _make_text_content(text: str) -> TextContent:
    return TextContent(type="text", text=text)


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.initialize = AsyncMock()
    session.list_tools = AsyncMock(
        return_value=ListToolsResult(tools=[_make_tool("query_datasource")])
    )
    return session


@pytest.fixture
def patched_bridge(mock_session):
    """MCPBridge with stdio_client and ClientSession fully mocked."""

    @asynccontextmanager
    async def fake_stdio(_params):
        yield (MagicMock(), MagicMock())

    @asynccontextmanager
    async def fake_session(_read, _write):
        yield mock_session

    with (
        patch("app.services.mcp_bridge.stdio_client", fake_stdio),
        patch("app.services.mcp_bridge.ClientSession", fake_session),
    ):
        yield MCPBridge(), mock_session


async def test_connect_caches_tools(patched_bridge):
    bridge, mock_session = patched_bridge
    await bridge.connect()
    assert len(bridge.tools) == 1
    assert bridge.tools[0].name == "query_datasource"
    mock_session.initialize.assert_awaited_once()
    mock_session.list_tools.assert_awaited_once()


async def test_call_tool_returns_flattened_text(patched_bridge):
    bridge, mock_session = patched_bridge
    await bridge.connect()

    mock_session.call_tool = AsyncMock(
        return_value=CallToolResult(
            content=[_make_text_content("hello"), _make_text_content("world")]
        )
    )

    result = await bridge.call_tool("query_datasource", {"sql": "SELECT 1"})
    assert result == "hello\nworld"
    mock_session.call_tool.assert_awaited_once_with(
        "query_datasource",
        arguments={"sql": "SELECT 1"},
        read_timeout_seconds=timedelta(seconds=30),
    )


async def test_call_tool_single_block(patched_bridge):
    bridge, mock_session = patched_bridge
    await bridge.connect()

    mock_session.call_tool = AsyncMock(
        return_value=CallToolResult(content=[_make_text_content("only one")])
    )

    result = await bridge.call_tool("query_datasource", {})
    assert result == "only one"


async def test_call_tool_empty_content(patched_bridge):
    bridge, mock_session = patched_bridge
    await bridge.connect()

    mock_session.call_tool = AsyncMock(
        return_value=CallToolResult(content=[])
    )

    result = await bridge.call_tool("query_datasource", {})
    assert result == ""


async def test_disconnect_closes_stack(patched_bridge):
    bridge, _ = patched_bridge
    await bridge.connect()
    # Should not raise
    await bridge.disconnect()
