"""API router for the enhanced service scope flow.

All endpoints are prefixed with /api/service (set in main.py).
"""

from __future__ import annotations

import asyncio
import datetime
import json
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, select, text
from sqlmodel.ext.asyncio.session import AsyncSession

import config
from db import async_session, get_session
from models import (
    ScopeIntentSummary,
    ScopeReference,
    ScopeRevision,
    ScopeSession,
    ScopeSimilarityLog,
    ServiceScope,
)
from schemas_service import (
    BoQLineItem,
    ChatHistoryResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatRevisionSummary,
    ChatStartResponse,
    GoldPlatingCheckRequest,
    GoldPlatingFlaggedItem,
    GoldPlatingResponse,
    ScopeConstructResponse,
    ScopeGenerateRequest,
    ScopeGenerateResponse,
    ScopeReferenceCreate,
    ScopeReferenceRead,
    ScopeRefineRequest,
    ScopeRefineResponse,
    ScopeUploadResponse,
    ServiceScopeRead,
    SessionListItem,
    SimilarityMatch,
    SimilarityResponse,
)
from services.context_builder import should_summarise
from services.db_helpers import (
    get_active_session_for_scope,
    get_all_revisions,
    get_current_scope,
    get_intent_summary,
    get_latest_revision_number,
    get_recent_turns,
    save_revision,
    scope_snippet,
    word_count,
)
from services.scope_agents import (
    chat_refine_scope,
    chat_refine_scope_stream,
    check_gold_plating,
    compare_similarity,
    compress_intent_summary,
    construct_outputs,
    construct_outputs_stream,
    extract_scope_from_file,
    generate_embedding,
    generate_scope,
    refine_scope,
)

router = APIRouter(tags=["service-scope"])


# ---------------------------------------------------------------------------
# Generate a new scope
# ---------------------------------------------------------------------------


@router.post("/scope/generate", response_model=ScopeGenerateResponse)
async def api_generate_scope(
    body: ScopeGenerateRequest,
    session: AsyncSession = Depends(get_session),
):
    raw_text = await generate_scope(body.description, body.sector)

    scope = ServiceScope(
        source_type="new",
        initial_description=body.description,
        raw_scope_text=raw_text,
        oil_gas_sector=body.sector,
        status="draft",
    )
    session.add(scope)
    await session.commit()
    await session.refresh(scope)

    return ScopeGenerateResponse(scope_id=scope.id, raw_scope_text=raw_text)


# ---------------------------------------------------------------------------
# Upload an existing scope (PDF / DOCX)
# ---------------------------------------------------------------------------


@router.post("/scope/upload", response_model=ScopeUploadResponse)
async def api_upload_scope(
    file: UploadFile = File(...),
    description: str = Query("", description="Optional description of the scope"),
    sector: str = Query(None, description="Oil & Gas sector"),
    session: AsyncSession = Depends(get_session),
):
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:  # 20 MB limit
        raise HTTPException(status_code=413, detail="File too large. Max 20 MB.")

    raw_text = await extract_scope_from_file(contents, file.filename or "file.pdf")

    scope = ServiceScope(
        source_type="uploaded",
        initial_description=description or file.filename or "",
        raw_scope_text=raw_text,
        oil_gas_sector=sector,
        status="draft",
    )
    session.add(scope)
    await session.commit()
    await session.refresh(scope)

    return ScopeUploadResponse(
        scope_id=scope.id,
        raw_scope_text=raw_text,
        filename=file.filename or "",
    )


# ---------------------------------------------------------------------------
# Refine scope
# ---------------------------------------------------------------------------


@router.post("/scope/{scope_id}/refine", response_model=ScopeRefineResponse)
async def api_refine_scope(
    scope_id: int,
    body: ScopeRefineRequest,
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    current_text = scope.refined_scope_text or scope.raw_scope_text
    result = await refine_scope(current_text, body.feedback, body.edited_text)

    scope.refined_scope_text = result["refined_scope_text"]
    scope.status = "refined"
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)
    await session.commit()

    return ScopeRefineResponse(
        refined_scope_text=result["refined_scope_text"],
        changes_summary=result["changes_summary"],
    )


# ---------------------------------------------------------------------------
# Gold plating check
# ---------------------------------------------------------------------------


@router.post("/scope/{scope_id}/gold-plating-check", response_model=GoldPlatingResponse)
async def api_gold_plating_check(
    scope_id: int,
    body: GoldPlatingCheckRequest,
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    text = scope.refined_scope_text or scope.raw_scope_text
    result = await check_gold_plating(text, body.sector)

    scope.oil_gas_sector = body.sector
    scope.gold_plating_report = result
    scope.gold_plating_passed = result["passed"]
    scope.status = "gold_checked"
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)
    await session.commit()

    flagged = [GoldPlatingFlaggedItem(**item) for item in result.get("flagged_items", [])]
    return GoldPlatingResponse(
        passed=result["passed"],
        sector=body.sector,
        flagged_items=flagged,
    )


# ---------------------------------------------------------------------------
# Similarity check
# ---------------------------------------------------------------------------


@router.post("/scope/{scope_id}/similarity-check", response_model=SimilarityResponse)
async def api_similarity_check(
    scope_id: int,
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    scope_text = scope.refined_scope_text or scope.raw_scope_text

    # Pre-generate the new scope's embedding ONCE so we can use it for both
    # the SQL VECTOR_DISTANCE pre-retrieval against contracts AND the Python
    # cosine pass over SOW-internal ScopeReference rows. Falls back gracefully
    # if Azure OpenAI embeddings are not configured.
    from services.scope_agents import generate_embedding, _embeddings_available
    query_embedding = None
    if _embeddings_available() and scope_text:
        try:
            query_embedding = await generate_embedding(scope_text)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "Pre-embedding for similarity check failed, falling back: %s", exc
            )

    # --- Source 1: Contract Intelligence — ranked in SQL via VECTOR_DISTANCE ---
    # Uses the new contracts.scope_embedding_vec VECTOR(1536) column populated
    # by the parent project (Autonomous Sourcing). Returns top 5 pre-scored.
    # NOTE: NVARCHAR(MAX) double-cast — pyodbc binds long strings as ntext and
    # SQL Server forbids ntext -> VECTOR conversion. Cast to nvarchar first.
    ci_ref_data: list[dict] = []
    if query_embedding is not None:
        try:
            ci_result = await session.execute(
                text(
                    "SELECT TOP 5 id, contract_number, supplier_name, scope_normalized, "
                    "       (1 - VECTOR_DISTANCE('cosine', scope_embedding_vec, "
                    "             CAST(CAST(:q AS NVARCHAR(MAX)) AS VECTOR(1536)))) AS cos_sim "
                    "FROM contracts "
                    "WHERE scope_embedding_vec IS NOT NULL AND scope_normalized IS NOT NULL "
                    "ORDER BY VECTOR_DISTANCE('cosine', scope_embedding_vec, "
                    "         CAST(CAST(:q AS NVARCHAR(MAX)) AS VECTOR(1536))) ASC"
                ),
                {"q": json.dumps(query_embedding)},
            )
            ci_rows = ci_result.fetchall()
            for row in ci_rows:
                ci_ref_data.append({
                    "id": row[0],
                    "title": f"{row[1]} — {row[2]}",
                    "description": row[3] or "",
                    "_cosine": float(row[4]),  # pre-scored — compare_similarity will honor this
                    "source": "contract_intelligence",
                })
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "VECTOR_DISTANCE query failed, falling back to legacy JSON path: %s", exc
            )
            # Fallback: legacy path reads scope_embedding (still dual-written)
            try:
                ci_result = await session.execute(
                    text(
                        "SELECT id, contract_number, supplier_name, scope_normalized, scope_embedding "
                        "FROM contracts WHERE scope_normalized IS NOT NULL"
                    )
                )
                for row in ci_result.fetchall():
                    ci_ref_data.append({
                        "id": row[0],
                        "title": f"{row[1]} — {row[2]}",
                        "description": row[3] or "",
                        "embedding": row[4],
                        "source": "contract_intelligence",
                    })
            except Exception as exc2:
                logging.getLogger(__name__).warning(
                    "Legacy fallback also failed: %s", exc2
                )

    # --- Source 2: SOW Agent reference scopes (ScopeReference table) ---
    # These live in SOW's own table, not in contracts, so they still go through
    # Python cosine inside compare_similarity.
    sow_result = await session.execute(select(ScopeReference))
    sow_refs = sow_result.scalars().all()
    sow_ref_data = [
        {
            "id": r.id,
            "title": r.title,
            "description": r.normalized_text or r.description,
            "embedding": r.embedding,
            "source": "scope_reference",
        }
        for r in sow_refs
    ]

    # Combine both sources
    all_refs = ci_ref_data + sow_ref_data

    if not all_refs:
        scope.similarity_results = {"matches": []}
        scope.status = "similarity_checked"
        scope.updated_at = datetime.datetime.utcnow()
        session.add(scope)
        await session.commit()
        return SimilarityResponse(matches=[])

    matches = await compare_similarity(
        scope_text, all_refs, precomputed_query_embedding=query_embedding
    )

    # Log results (only for ScopeReference matches, not CI matches)
    for match in matches:
        if match.get("source") == "scope_reference":
            log_entry = ScopeSimilarityLog(
                service_scope_id=scope_id,
                reference_scope_id=match.get("reference_id"),
                similarity_score=match.get("score", 0),
                matching_sections=match.get("matching_sections"),
            )
            session.add(log_entry)

    scope.similarity_results = {"matches": matches}
    scope.status = "similarity_checked"
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)
    await session.commit()

    sim_matches = [
        SimilarityMatch(
            reference_id=m.get("reference_id", 0),
            title=m.get("title", ""),
            score=m.get("score", 0),
            matching_sections=m.get("matching_sections", []),
        )
        for m in matches
    ]
    return SimilarityResponse(matches=sim_matches)


# ---------------------------------------------------------------------------
# Construct outputs (detailed scope, exec summary, BoQ)
# ---------------------------------------------------------------------------


@router.post("/scope/{scope_id}/construct", response_model=ScopeConstructResponse)
async def api_construct_outputs(
    scope_id: int,
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    text = scope.refined_scope_text or scope.raw_scope_text
    result = await construct_outputs(text, scope.oil_gas_sector)

    scope.detailed_scope = result["detailed_scope"]
    scope.executive_summary = result["executive_summary"]
    scope.bill_of_quantities = result["bill_of_quantities"]
    scope.status = "constructed"
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)
    await session.commit()

    boq = [BoQLineItem(**item) for item in result.get("bill_of_quantities", [])]
    return ScopeConstructResponse(
        detailed_scope=result["detailed_scope"],
        executive_summary=result["executive_summary"],
        bill_of_quantities=boq,
    )


@router.post("/scope/{scope_id}/construct/stream")
async def api_construct_outputs_stream(
    scope_id: int,
    session: AsyncSession = Depends(get_session),
):
    """SSE streaming variant of construct. Yields progress events per step
    so the UI can show a checklist that ticks off each output as it lands."""
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    text = scope.refined_scope_text or scope.raw_scope_text
    sector = scope.oil_gas_sector

    async def event_generator():
        final_data = None
        try:
            async for sse_chunk in construct_outputs_stream(text, sector):
                yield sse_chunk
                # Capture the final "done" event so we can persist after streaming.
                if '"type": "done"' in sse_chunk or '"type":"done"' in sse_chunk:
                    data_line = sse_chunk.strip().removeprefix("data: ")
                    try:
                        final_data = json.loads(data_line)
                    except Exception:
                        pass
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"
            return

        # Persist to DB once all three outputs have been produced.
        if final_data and final_data.get("detailed_scope"):
            try:
                async with async_session() as bg_session:
                    bg_scope = await bg_session.get(ServiceScope, scope_id)
                    if bg_scope:
                        bg_scope.detailed_scope = final_data["detailed_scope"]
                        bg_scope.executive_summary = final_data.get("executive_summary", "")
                        bg_scope.bill_of_quantities = final_data.get("bill_of_quantities", [])
                        bg_scope.status = "constructed"
                        bg_scope.updated_at = datetime.datetime.utcnow()
                        bg_session.add(bg_scope)
                        await bg_session.commit()
                yield f"data: {json.dumps({'type': 'saved'})}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'detail': f'Failed to save outputs: {exc}'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Get scope state
# ---------------------------------------------------------------------------


@router.get("/scope/{scope_id}", response_model=ServiceScopeRead)
async def api_get_scope(
    scope_id: int,
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    return scope


# ---------------------------------------------------------------------------
# Reference scopes CRUD
# ---------------------------------------------------------------------------


@router.get("/references", response_model=List[ScopeReferenceRead])
async def api_list_references(
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(ScopeReference).order_by(ScopeReference.created_at.desc())
    )
    return result.scalars().all()


@router.post("/references", response_model=ScopeReferenceRead, status_code=201)
async def api_create_reference(
    body: ScopeReferenceCreate,
    session: AsyncSession = Depends(get_session),
):
    # Generate embedding for the reference scope text
    embedding_json: str | None = None
    try:
        vector = await generate_embedding(body.description)
        embedding_json = json.dumps(vector)
    except Exception:
        pass  # Store without embedding if generation fails

    ref = ScopeReference(
        title=body.title,
        description=body.description,
        sector=body.sector,
        category=body.category,
        source="manual",
        metadata_info=body.metadata_info,
        embedding=embedding_json,
    )
    session.add(ref)
    await session.commit()
    await session.refresh(ref)
    return ref


# ---------------------------------------------------------------------------
# Chat-based Multi-Revision Refinement
# ---------------------------------------------------------------------------


async def _maybe_compress_summary(session_id: str) -> None:
    """Background task: compress older turns into intent summary."""
    try:
        async with async_session() as bg_session:
            revisions = await get_all_revisions(bg_session, session_id)
            if len(revisions) < config.settings.recent_turns_window:
                return

            existing = await bg_session.get(ScopeIntentSummary, session_id)
            covered_up_to = existing.covers_up_to_revision if existing else 0

            keep_recent = config.settings.recent_turns_window
            cutoff_index = max(0, len(revisions) - keep_recent)
            to_compress = [
                r for r in revisions[:cutoff_index]
                if r.revision_number > covered_up_to and r.user_instruction
            ]
            if not to_compress:
                return

            older_turns = [
                (r.user_instruction, r.agent_reply, r.changes_summary)
                for r in to_compress
            ]
            new_summary_text = await compress_intent_summary(
                existing.summary if existing else None,
                older_turns,
            )

            new_covers = to_compress[-1].revision_number
            if existing:
                existing.summary = new_summary_text
                existing.covers_up_to_revision = new_covers
                existing.updated_at = datetime.datetime.utcnow()
                bg_session.add(existing)
            else:
                bg_session.add(
                    ScopeIntentSummary(
                        session_id=session_id,
                        summary=new_summary_text,
                        covers_up_to_revision=new_covers,
                    )
                )
            await bg_session.commit()
    except Exception as exc:
        print(f"[_maybe_compress_summary] failed for {session_id}: {exc}")


@router.post("/scope/{scope_id}/chat/start", response_model=ChatStartResponse)
async def api_chat_start(
    scope_id: int,
    session: AsyncSession = Depends(get_session),
):
    """Idempotent: returns the existing active session if any, else creates one."""
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    existing = await get_active_session_for_scope(session, scope_id)
    if existing:
        # Return the latest revision's scope document
        result = await session.execute(
            select(ScopeRevision)
            .where(ScopeRevision.session_id == existing.session_id)
            .order_by(ScopeRevision.revision_number.desc())
            .limit(1)
        )
        latest = result.scalars().first()
        return ChatStartResponse(
            session_id=existing.session_id,
            scope_id=scope_id,
            revision_number=latest.revision_number if latest else 1,
            scope_document=latest.scope_document if latest else (scope.refined_scope_text or scope.raw_scope_text),
        )

    session_id = str(uuid.uuid4())
    title = (scope.initial_description or "Untitled Scope").strip()[:120] or "Untitled Scope"
    chat_session = ScopeSession(
        session_id=session_id,
        service_scope_id=scope_id,
        title=title,
        status="active",
    )
    session.add(chat_session)
    await session.flush()  # ensure parent row exists before child FK insert

    initial_scope = scope.refined_scope_text or scope.raw_scope_text or ""
    revision = ScopeRevision(
        session_id=session_id,
        revision_number=1,
        user_instruction="",
        agent_reply="Initial scope generated.",
        scope_document=initial_scope,
        changes_summary=None,
        tokens_estimate=word_count(initial_scope),
    )
    session.add(revision)

    # Keep ServiceScope.refined_scope_text in sync with the latest revision
    scope.refined_scope_text = initial_scope
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)

    await session.commit()
    return ChatStartResponse(
        session_id=session_id,
        scope_id=scope_id,
        revision_number=1,
        scope_document=initial_scope,
    )


@router.post("/scope/{scope_id}/chat/message", response_model=ChatMessageResponse)
async def api_chat_message(
    scope_id: int,
    body: ChatMessageRequest,
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    chat_session = await session.get(ScopeSession, body.session_id)
    if not chat_session or chat_session.service_scope_id != scope_id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    # Latest revision number
    latest_rev_num = await get_latest_revision_number(session, body.session_id)
    next_rev_num = latest_rev_num + 1

    # Get current scope (honor optional edited_scope override)
    current_scope = await get_current_scope(session, body.session_id, scope, body.edited_scope)

    # Load intent summary
    intent_text = await get_intent_summary(session, body.session_id)

    # Load recent turns (only those with a user_instruction; seed revision excluded)
    recent_turns = await get_recent_turns(session, body.session_id)

    result_data = await chat_refine_scope(
        current_scope=current_scope,
        revision_number=latest_rev_num,
        intent_summary=intent_text,
        recent_turns=recent_turns,
        user_message=body.message,
    )

    new_scope_doc = result_data["scope_document"]
    agent_reply = result_data["agent_reply"]
    changes_summary = result_data["changes_summary"]

    await save_revision(
        session,
        session_id=body.session_id,
        revision_number=next_rev_num,
        user_instruction=body.message,
        agent_reply=agent_reply,
        scope_document=new_scope_doc,
        changes_summary=changes_summary,
    )

    # Sync ServiceScope.refined_scope_text with latest revision
    scope.refined_scope_text = new_scope_doc
    scope.status = "refined"
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)

    await session.commit()

    # Fire-and-forget compression
    if should_summarise(next_rev_num):
        asyncio.create_task(_maybe_compress_summary(body.session_id))

    return ChatMessageResponse(
        revision_number=next_rev_num,
        scope_document=new_scope_doc,
        agent_reply=agent_reply,
        changes_summary=changes_summary,
    )


@router.post("/scope/{scope_id}/chat/stream")
async def api_chat_message_stream(
    scope_id: int,
    body: ChatMessageRequest,
    session: AsyncSession = Depends(get_session),
):
    """SSE streaming version of chat message. Returns text/event-stream."""
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")

    chat_session = await session.get(ScopeSession, body.session_id)
    if not chat_session or chat_session.service_scope_id != scope_id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    latest_rev_num = await get_latest_revision_number(session, body.session_id)
    next_rev_num = latest_rev_num + 1
    current_scope = await get_current_scope(session, body.session_id, scope, body.edited_scope)
    intent_text = await get_intent_summary(session, body.session_id)
    recent_turns = await get_recent_turns(session, body.session_id)

    async def event_generator():
        final_data = None
        try:
            async for sse_chunk in chat_refine_scope_stream(
                current_scope=current_scope,
                revision_number=latest_rev_num,
                intent_summary=intent_text,
                recent_turns=recent_turns,
                user_message=body.message,
            ):
                yield sse_chunk
                # Capture the final "done" event
                if '"type": "done"' in sse_chunk or '"type":"done"' in sse_chunk:
                    import json as _json
                    data_line = sse_chunk.strip().removeprefix("data: ")
                    try:
                        final_data = _json.loads(data_line)
                    except Exception:
                        pass
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"
            return

        # Save revision to DB after stream completes
        if final_data and final_data.get("scope_document"):
            try:
                async with async_session() as bg_session:
                    bg_scope = await bg_session.get(ServiceScope, scope_id)
                    await save_revision(
                        bg_session,
                        session_id=body.session_id,
                        revision_number=next_rev_num,
                        user_instruction=body.message,
                        agent_reply=final_data.get("agent_reply", "Scope updated."),
                        scope_document=final_data["scope_document"],
                        changes_summary=final_data.get("changes_summary"),
                    )
                    if bg_scope:
                        bg_scope.refined_scope_text = final_data["scope_document"]
                        bg_scope.status = "refined"
                        bg_scope.updated_at = datetime.datetime.utcnow()
                        bg_session.add(bg_scope)
                    await bg_session.commit()

                if should_summarise(next_rev_num):
                    asyncio.create_task(_maybe_compress_summary(body.session_id))

                # Send final revision confirmation
                yield f"data: {json.dumps({'type': 'saved', 'revision_number': next_rev_num})}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'detail': f'Failed to save revision: {exc}'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/scope/{scope_id}/chat/history", response_model=ChatHistoryResponse)
async def api_chat_history(
    scope_id: int,
    session_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    chat_session = await session.get(ScopeSession, session_id)
    if not chat_session or chat_session.service_scope_id != scope_id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    result = await session.execute(
        select(ScopeRevision)
        .where(ScopeRevision.session_id == session_id)
        .order_by(ScopeRevision.revision_number.asc())
    )
    revs = result.scalars().all()
    return ChatHistoryResponse(
        session_id=session_id,
        scope_id=scope_id,
        status=chat_session.status,
        revisions=[
            ChatRevisionSummary(
                revision_number=r.revision_number,
                user_instruction=r.user_instruction,
                agent_reply=r.agent_reply,
                changes_summary=r.changes_summary,
                created_at=r.created_at,
            )
            for r in revs
        ],
    )


@router.get("/scope/{scope_id}/chat/revision/{revision_number}")
async def api_chat_get_revision(
    scope_id: int,
    revision_number: int,
    session_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Return the full scope_document for a specific revision (read-only view)."""
    chat_session = await session.get(ScopeSession, session_id)
    if not chat_session or chat_session.service_scope_id != scope_id:
        raise HTTPException(status_code=404, detail="Chat session not found")
    result = await session.execute(
        select(ScopeRevision)
        .where(ScopeRevision.session_id == session_id)
        .where(ScopeRevision.revision_number == revision_number)
    )
    rev = result.scalars().first()
    if not rev:
        raise HTTPException(status_code=404, detail="Revision not found")
    return {
        "revision_number": rev.revision_number,
        "scope_document": rev.scope_document,
        "user_instruction": rev.user_instruction,
        "agent_reply": rev.agent_reply,
        "changes_summary": rev.changes_summary,
    }


@router.post("/scope/{scope_id}/chat/revert/{revision_number}", response_model=ChatMessageResponse)
async def api_chat_revert(
    scope_id: int,
    revision_number: int,
    session_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    scope = await session.get(ServiceScope, scope_id)
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    chat_session = await session.get(ScopeSession, session_id)
    if not chat_session or chat_session.service_scope_id != scope_id:
        raise HTTPException(status_code=404, detail="Chat session not found")

    # Find the target revision
    result = await session.execute(
        select(ScopeRevision)
        .where(ScopeRevision.session_id == session_id)
        .where(ScopeRevision.revision_number == revision_number)
    )
    target = result.scalars().first()
    if not target:
        raise HTTPException(status_code=404, detail="Revision not found")

    # Latest revision number
    result = await session.execute(
        select(func.max(ScopeRevision.revision_number)).where(
            ScopeRevision.session_id == session_id
        )
    )
    next_rev_num = (result.scalar() or 0) + 1

    new_revision = ScopeRevision(
        session_id=session_id,
        revision_number=next_rev_num,
        user_instruction=f"[Reverted to revision {revision_number}]",
        agent_reply=f"Reverted to revision {revision_number}.",
        scope_document=target.scope_document,
        changes_summary=f"Reverted scope to the state of revision {revision_number}.",
        tokens_estimate=word_count(target.scope_document),
    )
    session.add(new_revision)

    scope.refined_scope_text = target.scope_document
    scope.updated_at = datetime.datetime.utcnow()
    session.add(scope)
    await session.commit()

    return ChatMessageResponse(
        revision_number=next_rev_num,
        scope_document=target.scope_document,
        agent_reply=new_revision.agent_reply,
        changes_summary=new_revision.changes_summary or "",
    )


@router.post("/scope/{scope_id}/chat/finalise")
async def api_chat_finalise(
    scope_id: int,
    session_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    chat_session = await session.get(ScopeSession, session_id)
    if not chat_session or chat_session.service_scope_id != scope_id:
        raise HTTPException(status_code=404, detail="Chat session not found")
    chat_session.status = "finalised"
    session.add(chat_session)
    await session.commit()
    return {"session_id": session_id, "status": "finalised"}


@router.get("/sessions", response_model=List[SessionListItem])
async def api_list_sessions(
    session: AsyncSession = Depends(get_session),
):
    """List all chat sessions with rich metadata for the landing-page resume cards."""
    # Pull all sessions
    result = await session.execute(
        select(ScopeSession).order_by(ScopeSession.created_at.desc())
    )
    sessions = result.scalars().all()

    items: list[SessionListItem] = []
    for s in sessions:
        # Count revisions for this session
        rev_result = await session.execute(
            select(ScopeRevision)
            .where(ScopeRevision.session_id == s.session_id)
            .order_by(ScopeRevision.revision_number.desc())
        )
        revs = rev_result.scalars().all()
        if not revs:
            continue
        latest = revs[0]
        revision_count = len(revs)
        # turn count = number of revisions with a user_instruction (excludes seed)
        turn_count = sum(1 for r in revs if r.user_instruction and not r.user_instruction.startswith("[Reverted"))

        scope_obj = await session.get(ServiceScope, s.service_scope_id)
        sector = scope_obj.oil_gas_sector if scope_obj else None

        items.append(
            SessionListItem(
                session_id=s.session_id,
                service_scope_id=s.service_scope_id,
                title=s.title or "Untitled Scope",
                status=s.status,
                revision_count=revision_count,
                turn_count=turn_count,
                word_count=word_count(latest.scope_document),
                scope_snippet=scope_snippet(latest.scope_document),
                last_revision_at=latest.created_at,
                sector=sector,
            )
        )

    items.sort(key=lambda x: x.last_revision_at, reverse=True)
    return items
