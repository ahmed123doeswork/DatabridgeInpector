"""Single process-lifetime JobStore instance (AGENTS.md rule 6: in-memory
only, no database)."""

from app.store import JobStore

job_store = JobStore()
