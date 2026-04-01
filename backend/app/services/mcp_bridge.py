from contextlib import AsyncExitStack
from datetime import timedelta

from mcp import ClientSession, StdioServerParameters, stdio_client
from mcp.types import Tool

from app.config import settings


class MCPBridge:
    """Manages the MCP subprocess lifecycle and tool calls."""

    def __init__(self) -> None:
        self._stack = AsyncExitStack()
        self._session: ClientSession | None = None
        self.tools: list[Tool] = []

    async def connect(self) -> None:
        """Start the MCP subprocess, initialize the session, and cache the tool list."""
        params = StdioServerParameters(
            command="node",
            args=[settings.mcp_server_path],
            env={
                "TABLEAU_SERVER_URL": settings.tableau_server_url,
                "TABLEAU_SITE_NAME": settings.tableau_site_name,
                "TABLEAU_PAT_NAME": settings.tableau_pat_name,
                "TABLEAU_PAT_SECRET": settings.tableau_pat_secret,
            },
        )
        read, write = await self._stack.enter_async_context(stdio_client(params))
        self._session = await self._stack.enter_async_context(
            ClientSession(read, write)
        )
        await self._session.initialize()
        result = await self._session.list_tools()
        self.tools = result.tools

    async def call_tool(self, name: str, tool_input: dict) -> str:
        """Call a tool by name and return its text output."""
        assert self._session is not None, "Bridge not connected"
        result = await self._session.call_tool(
            name,
            arguments=tool_input,
            read_timeout_seconds=timedelta(seconds=30),
        )
        return "\n".join(
            block.text for block in result.content if hasattr(block, "text")
        )

    async def disconnect(self) -> None:
        """Shut down the session and terminate the subprocess."""
        await self._stack.aclose()
