import os

# Provide defaults so module-level `settings = Settings()` succeeds during collection.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("TABLEAU_SERVER_URL", "https://example.online.tableau.com")
os.environ.setdefault("TABLEAU_SITE_NAME", "test-site")
os.environ.setdefault("TABLEAU_PAT_NAME", "test-pat")
os.environ.setdefault("TABLEAU_PAT_SECRET", "test-secret")
