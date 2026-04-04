import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from mcp.types import Tool

from app.models.schemas import Message
from app.services.agent import MAX_ITERATIONS, _tools_for_anthropic, run_agent


# --- helpers ---

def _mcp_tool(name: str, description: str = "A tool") -> Tool:
    return Tool(name=name, description=description, inputSchema={"type": "object", "properties": {}})


def _text_event(text: str):
    return SimpleNamespace(type="text", text=text)


def _final_message(stop_reason: str, content=None):
    usage = SimpleNamespace(input_tokens=100, output_tokens=50, cache_creation_input_tokens=0, cache_read_input_tokens=0)
    return SimpleNamespace(stop_reason=stop_reason, content=content or [], usage=usage)


def _tool_use_block(name: str, input_: dict, id_: str = "tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=input_, id=id_)


class MockStream:
    """Minimal async context manager that mimics anthropic MessageStream."""

    def __init__(self, events, final_message):
        self._events = events
        self._final_message = final_message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def __aiter__(self):
        for event in self._events:
            yield event

    async def get_final_message(self):
        return self._final_message


@pytest.fixture
def mock_bridge():
    bridge = MagicMock()
    bridge.tools = [_mcp_tool("query_data", "Query Tableau data")]
    bridge.call_tool = AsyncMock(return_value="tool result")
    return bridge


# --- tests ---

def test_tools_for_anthropic(mock_bridge):
    result = _tools_for_anthropic(mock_bridge)
    assert result == [
        {
            "name": "query_data",
            "description": "Query Tableau data",
            "input_schema": {"type": "object", "properties": {}},
            "cache_control": {"type": "ephemeral"},
        }
    ]


def test_tools_for_anthropic_cache_control_on_last_only():
    bridge = MagicMock()
    bridge.tools = [
        Tool(name="a", description="first", inputSchema={"type": "object"}),
        Tool(name="b", description="last", inputSchema={"type": "object"}),
    ]
    result = _tools_for_anthropic(bridge)
    assert "cache_control" not in result[0]
    assert result[1]["cache_control"] == {"type": "ephemeral"}


def test_tools_for_anthropic_none_description():
    bridge = MagicMock()
    bridge.tools = [Tool(name="t", description=None, inputSchema={"type": "object"})]
    result = _tools_for_anthropic(bridge)
    assert result[0]["description"] == ""


async def test_run_agent_end_turn(mock_bridge):
    stream = MockStream([_text_event("Hello"), _text_event(" world")], _final_message("end_turn"))
    client = MagicMock()
    client.messages.stream.return_value = stream

    chunks = [c async for c in run_agent(client, mock_bridge, "Hi")]

    assert "event: token\ndata: Hello\n\n" in chunks
    assert "event: token\ndata:  world\n\n" in chunks
    assert "event: done\ndata: {}\n\n" in chunks
    assert not any("error" in c for c in chunks)


async def test_run_agent_newlines_encoded_in_sse(mock_bridge):
    """Newlines in token text must be escaped as \\n literals to avoid splitting SSE events."""
    stream = MockStream(
        [_text_event("### Heading\n| Col |\n\n| Row |")],
        _final_message("end_turn"),
    )
    client = MagicMock()
    client.messages.stream.return_value = stream

    chunks = [c async for c in run_agent(client, mock_bridge, "Hi")]

    token_chunk = next(c for c in chunks if c.startswith("event: token"))
    # newlines escaped as \n literals — double-newline cannot split SSE event boundary
    assert token_chunk == "event: token\ndata: ### Heading\\n| Col |\\n\\n| Row |\n\n"


async def test_run_agent_tool_use_then_end_turn(mock_bridge):
    tool_block = _tool_use_block("query_data", {"q": "sales"})
    streams = iter([
        MockStream([], _final_message("tool_use", content=[tool_block])),
        MockStream([_text_event("Result")], _final_message("end_turn")),
    ])
    client = MagicMock()
    client.messages.stream.side_effect = lambda **_: next(streams)

    chunks = [c async for c in run_agent(client, mock_bridge, "Show sales")]

    assert "event: tool_call\ndata: query_data\n\n" in chunks
    assert "event: token\ndata: Result\n\n" in chunks
    assert "event: done\ndata: {}\n\n" in chunks
    mock_bridge.call_tool.assert_awaited_once_with("query_data", {"q": "sales"})


async def test_run_agent_tool_result_fed_back(mock_bridge):
    """Tool result is appended as user message for next LLM call."""
    tool_block = _tool_use_block("query_data", {}, id_="abc123")
    mock_bridge.call_tool = AsyncMock(return_value="42 rows")

    call_messages = []

    def capture_stream(**kwargs):
        call_messages.append(kwargs["messages"])
        if len(call_messages) == 1:
            return MockStream([], _final_message("tool_use", content=[tool_block]))
        return MockStream([], _final_message("end_turn"))

    client = MagicMock()
    client.messages.stream.side_effect = capture_stream

    _ = [c async for c in run_agent(client, mock_bridge, "query")]

    # Second call should include tool_result message
    second_messages = call_messages[1]
    tool_result_msg = second_messages[-1]
    assert tool_result_msg["role"] == "user"
    assert tool_result_msg["content"][0]["type"] == "tool_result"
    assert tool_result_msg["content"][0]["tool_use_id"] == "abc123"
    assert tool_result_msg["content"][0]["content"] == "42 rows"


async def test_run_agent_max_iterations_emits_error(mock_bridge):
    tool_block = _tool_use_block("looper", {})
    client = MagicMock()
    client.messages.stream.return_value = MockStream([], _final_message("tool_use", content=[tool_block]))

    chunks = [c async for c in run_agent(client, mock_bridge, "loop")]

    error_chunks = [c for c in chunks if "event: error" in c]
    assert len(error_chunks) == 1
    data = json.loads(error_chunks[0].split("data: ", 1)[1])
    assert "message" in data
    assert client.messages.stream.call_count == MAX_ITERATIONS


async def test_run_agent_seeds_history(mock_bridge):
    history = [
        Message(role="user", content="first question"),
        Message(role="assistant", content="first answer"),
    ]
    captured = []

    def capture_stream(**kwargs):
        captured.append(kwargs["messages"])
        return MockStream([], _final_message("end_turn"))

    client = MagicMock()
    client.messages.stream.side_effect = capture_stream

    _ = [c async for c in run_agent(client, mock_bridge, "new question", history=history)]

    msgs = captured[0]
    assert msgs[0] == {"role": "user", "content": "first question"}
    assert msgs[1] == {"role": "assistant", "content": "first answer"}
    assert msgs[2] == {"role": "user", "content": "new question"}


async def test_run_agent_no_history(mock_bridge):
    client = MagicMock()
    client.messages.stream.return_value = MockStream([], _final_message("end_turn"))

    chunks = [c async for c in run_agent(client, mock_bridge, "hello")]
    assert "event: done\ndata: {}\n\n" in chunks


async def test_run_agent_call_tool_raises_emits_error(mock_bridge):
    """Exception from bridge.call_tool emits event: error and closes cleanly."""
    tool_block = _tool_use_block("query_data", {})
    mock_bridge.call_tool = AsyncMock(side_effect=RuntimeError("MCP timeout"))

    client = MagicMock()
    client.messages.stream.return_value = MockStream([], _final_message("tool_use", content=[tool_block]))

    chunks = [c async for c in run_agent(client, mock_bridge, "query")]

    error_chunks = [c for c in chunks if "event: error" in c]
    assert len(error_chunks) == 1
    assert not any("event: done" in c for c in chunks)
