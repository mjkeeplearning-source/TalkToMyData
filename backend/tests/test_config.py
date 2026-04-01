import pytest
from pydantic import ValidationError

from app.config import Settings


def test_missing_required_vars(monkeypatch):
    """All required vars absent raises ValidationError naming each field."""
    for var in ("ANTHROPIC_API_KEY", "TABLEAU_SERVER_URL", "TABLEAU_SITE_NAME",
                "TABLEAU_PAT_NAME", "TABLEAU_PAT_SECRET"):
        monkeypatch.delenv(var, raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    missing = {e["loc"][0] for e in exc_info.value.errors() if e["type"] == "missing"}
    assert missing == {"anthropic_api_key", "tableau_server_url", "tableau_site_name",
                       "tableau_pat_name", "tableau_pat_secret"}


def test_all_vars_present(monkeypatch):
    """All required vars present loads settings without error."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("TABLEAU_SERVER_URL", "https://example.online.tableau.com")
    monkeypatch.setenv("TABLEAU_SITE_NAME", "mysite")
    monkeypatch.setenv("TABLEAU_PAT_NAME", "mytoken")
    monkeypatch.setenv("TABLEAU_PAT_SECRET", "mysecret")

    s = Settings(_env_file=None)
    assert s.anthropic_api_key == "test-key"
    assert s.tableau_site_name == "mysite"


def test_log_level_default(monkeypatch):
    """LOG_LEVEL defaults to INFO when not set."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("TABLEAU_SERVER_URL", "https://example.online.tableau.com")
    monkeypatch.setenv("TABLEAU_SITE_NAME", "mysite")
    monkeypatch.setenv("TABLEAU_PAT_NAME", "mytoken")
    monkeypatch.setenv("TABLEAU_PAT_SECRET", "mysecret")
    monkeypatch.delenv("LOG_LEVEL", raising=False)

    s = Settings(_env_file=None)
    assert s.log_level == "INFO"
