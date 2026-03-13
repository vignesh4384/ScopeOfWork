from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

import models, schemas
from db import get_session
from services import agents
from services.sap_stub import build_sap_payload

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
