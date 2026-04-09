"""
Root conftest — set dummy env vars before any test module is imported.

config.py instantiates Settings() at module level, which requires these
three env vars.  Setting them here (before collection) lets tests import
services.ai.claude_client etc. without a real .env file.
"""
import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "fake-service-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "fake-api-key")
