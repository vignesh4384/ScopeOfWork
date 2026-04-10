"""Database helper functions for the chat-based scope refinement flow.

Extracted from service_router.py to keep route handlers thin and enable
reuse across endpoints (chat message, streaming, compression, etc.).
"""

from __future__ import annotations

import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

import config
from models import (
    ScopeIntentSummary,
    ScopeRevision,
    ScopeSession,
    ServiceScope,
)


def word_count(text: str) -> int:
    return len(text.split())


def scope_snippet(scope_text: str, max_chars: int = 220) -> str:
    """Strip markdown headers/bullets and produce a short preview snippet."""
    cleaned_lines: list[str] = []
    for line in scope_text.splitlines():
        stripped = line.strip().lstrip("#").lstrip("*").lstrip("-").strip()
        if stripped:
            cleaned_lines.append(stripped)
        if sum(len(l) for l in cleaned_lines) > max_chars:
            break
    snippet = " ".join(cleaned_lines)
    if len(snippet) > max_chars:
        snippet = snippet[:max_chars].rsplit(" ", 1)[0] + "\u2026"
    return snippet


async def get_active_session_for_scope(
    session: AsyncSession, scope_id: int
) -> Optional[ScopeSession]:
    result = await session.execute(
        select(ScopeSession)
        .where(ScopeSession.service_scope_id == scope_id)
        .where(ScopeSession.status == "active")
        .order_by(ScopeSession.created_at.desc())
    )
    return result.scalars().first()


async def get_recent_turns(
    session: AsyncSession,
    session_id: str,
    n: Optional[int] = None,
) -> list[tuple]:
    """Return last N (user_instruction, agent_reply) pairs ordered oldest-newest."""
    limit = n if n is not None else config.settings.recent_turns_window
    result = await session.execute(
        select(ScopeRevision)
        .where(ScopeRevision.session_id == session_id)
        .order_by(ScopeRevision.revision_number.desc())
        .limit(limit)
    )
    revs = list(result.scalars().all())
    revs.reverse()
    return [(r.user_instruction, r.agent_reply) for r in revs if r.user_instruction]


async def get_latest_revision_number(
    session: AsyncSession, session_id: str
) -> int:
    result = await session.execute(
        select(func.max(ScopeRevision.revision_number)).where(
            ScopeRevision.session_id == session_id
        )
    )
    return result.scalar() or 0


async def get_current_scope(
    session: AsyncSession,
    session_id: str,
    scope: ServiceScope,
    edited_scope: Optional[str] = None,
) -> str:
    """Return current scope text, honouring an optional edited override."""
    if edited_scope is not None and edited_scope.strip():
        return edited_scope
    result = await session.execute(
        select(ScopeRevision)
        .where(ScopeRevision.session_id == session_id)
        .order_by(ScopeRevision.revision_number.desc())
        .limit(1)
    )
    latest = result.scalars().first()
    return latest.scope_document if latest else (scope.refined_scope_text or scope.raw_scope_text or "")


async def get_intent_summary(
    session: AsyncSession, session_id: str
) -> Optional[str]:
    intent = await session.get(ScopeIntentSummary, session_id)
    return intent.summary if intent else None


async def save_revision(
    session: AsyncSession,
    *,
    session_id: str,
    revision_number: int,
    user_instruction: str,
    agent_reply: str,
    scope_document: str,
    changes_summary: Optional[str],
) -> ScopeRevision:
    rev = ScopeRevision(
        session_id=session_id,
        revision_number=revision_number,
        user_instruction=user_instruction,
        agent_reply=agent_reply,
        scope_document=scope_document,
        changes_summary=changes_summary,
        tokens_estimate=word_count(scope_document),
    )
    session.add(rev)
    return rev


async def get_all_revisions(
    session: AsyncSession, session_id: str
) -> list[ScopeRevision]:
    result = await session.execute(
        select(ScopeRevision)
        .where(ScopeRevision.session_id == session_id)
        .order_by(ScopeRevision.revision_number.asc())
    )
    return list(result.scalars().all())
