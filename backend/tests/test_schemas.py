import pytest
from pydantic import ValidationError

from app.models.schemas import ChatRequest, Message


def test_message_valid_roles():
    assert Message(role="user", content="hello").role == "user"
    assert Message(role="assistant", content="hi").role == "assistant"


def test_message_invalid_role():
    with pytest.raises(ValidationError):
        Message(role="system", content="x")


def test_chat_request_max_length():
    ChatRequest(message="x" * 2000)  # exactly 2000 — should pass


def test_chat_request_exceeds_max_length():
    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 2001)


def test_chat_request_default_history():
    r = ChatRequest(message="hello")
    assert r.history == []


def test_chat_request_with_history():
    history = [Message(role="user", content="hi"), Message(role="assistant", content="hello")]
    r = ChatRequest(message="follow up", history=history)
    assert len(r.history) == 2
    assert r.history[0].role == "user"
