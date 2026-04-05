"""API router for the enhanced service scope flow.

All endpoints are prefixed with /api/service (set in main.py).
"""

from __future__ import annotations

import datetime
import json
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select, text
from sqlmodel.ext.asyncio.session import AsyncSession

from db import get_session
from models import ScopeReference, ScopeSimilarityLog, ServiceScope
from schemas_service import (
    BoQLineItem,
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
    SimilarityMatch,
    SimilarityResponse,
)
from services.scope_agents import (
    check_gold_plating,
    compare_similarity,
    construct_outputs,
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

    # --- Source 1: Contract Intelligence normalized scopes (read-only) ---
    ci_ref_data: list[dict] = []
    try:
        ci_result = await session.execute(
            text(
                "SELECT id, contract_number, supplier_name, scope_normalized, scope_embedding "
                "FROM contracts WHERE scope_normalized IS NOT NULL"
            )
        )
        ci_rows = ci_result.fetchall()
        for row in ci_rows:
            ci_ref_data.append({
                "id": row[0],
                "title": f"{row[1]} — {row[2]}",  # contract_number — supplier_name
                "description": row[3] or "",         # scope_normalized
                "embedding": row[4],                 # scope_embedding (JSON string or None)
                "source": "contract_intelligence",
            })
    except Exception:
        pass  # Contract Intelligence table may not exist in dev/SQLite — gracefully skip

    # --- Source 2: SOW Agent reference scopes (ScopeReference table) ---
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

    scope_text = scope.refined_scope_text or scope.raw_scope_text
    matches = await compare_similarity(scope_text, all_refs)

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
