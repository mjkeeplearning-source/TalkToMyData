import json
import logging
from collections.abc import AsyncGenerator

from anthropic import AsyncAnthropic

from app.models.schemas import Message
from app.services.mcp_bridge import MCPBridge

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 10
MODEL = "claude-sonnet-4-6"


def _tools_for_anthropic(bridge: MCPBridge) -> list[dict]:
    """Convert MCP tool list to Anthropic tool format."""
    return [
        {
            "name": tool.name,
            "description": tool.description or "",
            "input_schema": tool.inputSchema,
        }
        for tool in bridge.tools
    ]


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
        for _ in range(MAX_ITERATIONS):
            async with client.messages.stream(
                model=MODEL,
                max_tokens=4096,
                tools=tools,
                messages=messages,
            ) as stream:
                async for event in stream:
                    if event.type == "text":
                        yield f"event: token\ndata: {event.text}\n\n"
                message = await stream.get_final_message()

            if message.stop_reason == "end_turn":
                yield "event: done\ndata: {}\n\n"
                return

            if message.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": message.content})

                tool_results = []
                for block in message.content:
                    if block.type == "tool_use":
                        logger.info("Calling tool: %s", block.name)
                        yield f"event: tool_call\ndata: {block.name}\n\n"
                        result = await bridge.call_tool(block.name, block.input)
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

    except Exception:
        logger.exception("Unhandled error in agent loop")
        yield f"event: error\ndata: {json.dumps({'message': 'An unexpected error occurred'})}\n\n"
