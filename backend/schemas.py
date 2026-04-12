from __future__ import annotations

import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ClassificationRequest(BaseModel):
    description: str = Field(..., min_length=3)


class ClassificationResponse(BaseModel):
    type: Literal["material", "service"]
    rationale: str


class ParameterField(BaseModel):
    name: str
    input_type: Literal["text", "number", "select", "date"] = "text"
    description: Optional[str] = None
    example: Optional[str] = None
    required: bool = True
    options: Optional[List[str]] = None


class MaterialDetailsRequest(BaseModel):
    description: str


class MaterialDetailsResponse(BaseModel):
    mandatory_parameters: List[ParameterField]
    optional_parameters: List[ParameterField] = []
    manufacturers: List[str] = []
    price_range: Optional[str] = None
    image_urls: List[str] = []
    rationale: Optional[str] = None
    references: List[str] = []


class ServiceQuestionsRequest(BaseModel):
    description: str


class ServiceQuestionsResponse(BaseModel):
    questions: List[ParameterField]
    rationale: Optional[str] = None


class PurchaseRequestCreate(BaseModel):
    type: Literal["material", "service"]
    initial_description: str
    parameters: dict
    need_by_date: datetime.date
    budget_type: Literal["CAPEX", "OPEX"]
    wbs: Optional[str] = None
    cost_center: Optional[str] = None
    gl_account: str
    material_number: Optional[str] = None


class SAPPayload(BaseModel):
    payload: dict


class PurchaseRequestRead(PurchaseRequestCreate):
    id: int
    created_at: datetime.datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Material Master Match
# ---------------------------------------------------------------------------


class MaterialMatchRequest(BaseModel):
    description: str
    parameters: dict


class MaterialMatchItem(BaseModel):
    material: str
    material_description: str
    manufacturer_name: Optional[str] = None
    manufacturer_part_number: Optional[str] = None
    material_type: Optional[str] = None
    material_group: Optional[str] = None
    base_unit: Optional[str] = None
    moving_price: Optional[str] = None
    long_text: Optional[str] = None
    similarity_score: float


class MaterialMatchResponse(BaseModel):
    matches: List[MaterialMatchItem]
