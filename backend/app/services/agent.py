import json
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from anthropic import AsyncAnthropic, RateLimitError

from app.models.schemas import Message
from app.services.mcp_bridge import MCPBridge

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 10
MODEL = "claude-haiku-4-5"
SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "system.md"
TOOL_FILTER_PATH = Path(__file__).parent.parent.parent.parent / "tableau_tool.json"


def _load_system_prompt() -> str:
    """Read the system prompt from file. Called per request so edits take effect without restart."""
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()


def _load_tool_filter() -> set[str] | None:
    """Load allowed tool names from tableau_tool.json. Returns None if file missing (allow all)."""
    if not TOOL_FILTER_PATH.exists():
        logger.warning("tableau_tool.json not found at %s — using all tools", TOOL_FILTER_PATH)
        return None
    data = json.loads(TOOL_FILTER_PATH.read_text(encoding="utf-8"))
    return set(data.get("tool_to_use", []))


def _tools_for_anthropic(bridge: MCPBridge) -> list[dict]:
    """Convert MCP tool list to Anthropic tool format, filtered by tableau_tool.json whitelist."""
    allowed = _load_tool_filter()
    tools = [
        {
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.inputSchema,
        }
        for tool in bridge.tools
        if allowed is None or tool.name in allowed
    ]
    if tools:
        tools[-1]["cache_control"] = {"type": "ephemeral"}
    return tools


async def run_agent(
    client: AsyncAnthropic,
    bridge: MCPBridge,
    question: str,
    history: list[Message] | None = None,
) -> AsyncGenerator[str, None]:
    """Run the agentic loop, yielding SSE-formatted strings."""
    tools = _tools_for_anthropic(bridge)
    messages = [{"role": m.role, "content": m.content} for m in (history or [])]
    messages.append({"role": "user", "content": question})

    try:
        system_prompt = _load_system_prompt()
        system = [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]
        for _ in range(MAX_ITERATIONS):
            async with client.messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=system,
                tools=tools,
                messages=messages,
            ) as stream:
                async for event in stream:
                    if event.type == "text":
                        encoded = event.text.replace("\n", "\\n")
                        yield f"event: token\ndata: {encoded}\n\n"
                message = await stream.get_final_message()

            u = message.usage
            logger.debug(
                "Token usage — input: %d, output: %d, cache_write: %d, cache_read: %d",
                u.input_tokens,
                u.output_tokens,
                getattr(u, "cache_creation_input_tokens", 0) or 0,
                getattr(u, "cache_read_input_tokens", 0) or 0,
            )

            if message.stop_reason == "end_turn":
                yield "event: done\ndata: {}\n\n"
                return

            if message.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": message.content})

                tool_results = []
                for block in message.content:
                    if block.type == "tool_use":
                        logger.info("Calling tool: %s input=%s", block.name, block.input)
                        yield f"event: tool_call\ndata: {block.name}\n\n"
                        result = await bridge.call_tool(block.name, block.input)
                        logger.debug("Tool %s response: %.500s", block.name, result)
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            }
                        )

                messages.append({"role": "user", "content": tool_results})
                continue

            break

        yield f"event: error\ndata: {json.dumps({'message': 'Max iterations reached'})}\n\n"

    except RateLimitError:
        logger.warning("Anthropic rate limit hit")
        yield f"event: error\ndata: {json.dumps({'message': 'Rate limit reached. Please wait a moment and try again.'})}\n\n"
    except Exception:
        logger.exception("Unhandled error in agent loop")
        yield f"event: error\ndata: {json.dumps({'message': 'An unexpected error occurred'})}\n\n"
