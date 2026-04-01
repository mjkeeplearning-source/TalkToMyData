from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.models.schemas import ChatRequest
from app.services.agent import run_agent

router = APIRouter()


@router.post("/api/chat")
async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
    """Stream an SSE response from the agentic loop."""
    bridge = request.app.state.bridge
    client = request.app.state.anthropic_client
    return StreamingResponse(
        run_agent(client, bridge, body.message, history=body.history),
        media_type="text/event-stream",
    )
