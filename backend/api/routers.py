from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

import models, schemas
from db import get_session
from services import agents
from services.sap_stub import build_sap_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.post("/classify", response_model=schemas.ClassificationResponse)
async def classify(body: schemas.ClassificationRequest) -> schemas.ClassificationResponse:
    return await agents.classify_request(body.description)


@router.post("/material-details", response_model=schemas.MaterialDetailsResponse)
async def material_details(body: schemas.MaterialDetailsRequest) -> schemas.MaterialDetailsResponse:
    return await agents.material_details(body.description)


@router.post("/service-questions", response_model=schemas.ServiceQuestionsResponse)
async def service_questions(body: schemas.ServiceQuestionsRequest) -> schemas.ServiceQuestionsResponse:
    return await agents.service_questions(body.description)


@router.post("/purchase-requests", response_model=schemas.SAPPayload)
async def create_purchase_request(
    body: schemas.PurchaseRequestCreate, session: AsyncSession = Depends(get_session)
) -> schemas.SAPPayload:
    pr = models.PurchaseRequest(**body.model_dump())
    session.add(pr)
    await session.commit()
    await session.refresh(pr)
    return schemas.SAPPayload(payload=build_sap_payload(body))


@router.get("/purchase-requests", response_model=list[schemas.PurchaseRequestRead])
async def list_purchase_requests(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(models.PurchaseRequest).order_by(models.PurchaseRequest.created_at.desc()))
    return result.all()


@router.get("/purchase-requests/{request_id}", response_model=schemas.PurchaseRequestRead)
async def get_purchase_request(request_id: int, session: AsyncSession = Depends(get_session)):
    pr = await session.get(models.PurchaseRequest, request_id)
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase request not found")
    return pr


@router.post("/material-match", response_model=schemas.MaterialMatchResponse)
async def material_match(
    body: schemas.MaterialMatchRequest, session: AsyncSession = Depends(get_session)
) -> schemas.MaterialMatchResponse:
    """Find material master records similar to user's requirement specification."""
    from services.scope_agents import generate_embedding, _embeddings_available, _cosine_similarity

    # Compose query text from description + parameters
    parts = [body.description]
    for k, v in body.parameters.items():
        if v:
            parts.append(f"{k}: {v}")
    query_text = " | ".join(parts)

    if not _embeddings_available():
        raise HTTPException(
            status_code=503,
            detail="Azure OpenAI embeddings not configured — material matching requires embeddings",
        )

    try:
        query_embedding = await generate_embedding(query_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to generate query embedding: {exc}")

    q_str = json.dumps(query_embedding)
    matches: list[schemas.MaterialMatchItem] = []

    # Try Azure SQL VECTOR_DISTANCE first
    try:
        result = await session.execute(
            text(
                "SELECT TOP 10 material, material_description, manufacturer_name, "
                "       manufacturer_part_number, material_type, material_group, "
                "       base_unit, moving_price, long_text, "
                "       (1 - VECTOR_DISTANCE('cosine', embedding_vec, "
                "             CAST(CAST(:q AS NVARCHAR(MAX)) AS VECTOR(1536)))) AS cos_sim "
                "FROM material_master "
                "WHERE embedding_vec IS NOT NULL "
                "ORDER BY VECTOR_DISTANCE('cosine', embedding_vec, "
                "         CAST(CAST(:q AS NVARCHAR(MAX)) AS VECTOR(1536))) ASC"
            ),
            {"q": q_str},
        )
        rows = result.fetchall()
        for row in rows:
            matches.append(schemas.MaterialMatchItem(
                material=row.material,
                material_description=row.material_description,
                manufacturer_name=row.manufacturer_name,
                manufacturer_part_number=row.manufacturer_part_number,
                material_type=row.material_type,
                material_group=row.material_group,
                base_unit=row.base_unit,
                moving_price=row.moving_price,
                long_text=row.long_text,
                similarity_score=round(float(row.cos_sim), 4),
            ))
    except Exception as exc:
        logger.warning("VECTOR_DISTANCE query on material_master failed, trying fallback: %s", exc)
        # Fallback: load all embeddings and compute in Python (dev/SQLite mode)
        try:
            result = await session.execute(
                text("SELECT material, material_description, manufacturer_name, "
                     "       manufacturer_part_number, material_type, material_group, "
                     "       base_unit, moving_price, long_text, embedding_text "
                     "FROM material_master WHERE embedding_text IS NOT NULL")
            )
            # For SQLite fallback we'd need stored embeddings in a JSON column.
            # Since data lives only in Azure SQL, this path is a safety net.
            logger.warning("SQLite fallback: material_master VECTOR search not available")
        except Exception:
            pass

    return schemas.MaterialMatchResponse(matches=matches)
