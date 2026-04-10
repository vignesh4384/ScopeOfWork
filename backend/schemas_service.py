from __future__ import annotations

import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# --------------- Scope Generation ---------------

class ScopeGenerateRequest(BaseModel):
    description: str = Field(..., min_length=3)
    sector: Optional[Literal["upstream", "midstream", "downstream"]] = None


class ScopeGenerateResponse(BaseModel):
    scope_id: int
    raw_scope_text: str


# --------------- Scope Upload ---------------

class ScopeUploadResponse(BaseModel):
    scope_id: int
    raw_scope_text: str
    filename: str


# --------------- Scope Refinement ---------------

class ScopeRefineRequest(BaseModel):
    feedback: Optional[str] = None
    edited_text: Optional[str] = None


class ScopeRefineResponse(BaseModel):
    refined_scope_text: str
    changes_summary: str


# --------------- Gold Plating ---------------

class GoldPlatingFlaggedItem(BaseModel):
    item: str
    reason: str
    recommendation: str
    severity: Literal["high", "medium", "low"] = "medium"


class GoldPlatingCheckRequest(BaseModel):
    sector: Literal["upstream", "midstream", "downstream"]


class GoldPlatingResponse(BaseModel):
    passed: bool
    sector: str
    flagged_items: List[GoldPlatingFlaggedItem] = []


# --------------- Similarity ---------------

class SimilarityMatch(BaseModel):
    reference_id: int
    title: str
    score: float
    matching_sections: List[str] = []


class SimilarityResponse(BaseModel):
    matches: List[SimilarityMatch] = []


# --------------- Scope Construction ---------------

class BoQLineItem(BaseModel):
    item: str
    quantity: float = 1.0
    unit: str = "LS"
    estimated_cost: float = 0.0


class ScopeConstructResponse(BaseModel):
    detailed_scope: str
    executive_summary: str
    bill_of_quantities: List[BoQLineItem] = []


# --------------- Scope Read ---------------

class ServiceScopeRead(BaseModel):
    id: int
    purchase_request_id: Optional[int] = None
    status: str
    source_type: str
    initial_description: str
    raw_scope_text: str
    refined_scope_text: Optional[str] = None
    oil_gas_sector: Optional[str] = None
    gold_plating_report: Optional[dict] = None
    gold_plating_passed: Optional[bool] = None
    similarity_results: Optional[dict] = None
    detailed_scope: Optional[str] = None
    executive_summary: Optional[str] = None
    bill_of_quantities: Optional[dict] = None

    class Config:
        from_attributes = True


# --------------- Reference Scopes ---------------

class ScopeReferenceCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=10)
    sector: Optional[Literal["upstream", "midstream", "downstream"]] = None
    category: Optional[str] = None
    metadata_info: Optional[dict] = None


class ScopeReferenceRead(BaseModel):
    id: int
    title: str
    description: str
    sector: Optional[str] = None
    category: Optional[str] = None
    source: str
    created_at: str

    class Config:
        from_attributes = True


# --------------- Chat Refinement ---------------

class ChatStartResponse(BaseModel):
    session_id: str
    scope_id: int
    revision_number: int
    scope_document: str


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str = Field(..., min_length=1)
    edited_scope: Optional[str] = None


class ChatMessageResponse(BaseModel):
    revision_number: int
    scope_document: str
    agent_reply: str
    changes_summary: str


class ChatRevisionSummary(BaseModel):
    revision_number: int
    user_instruction: str
    agent_reply: str
    changes_summary: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ChatRevisionDetail(BaseModel):
    revision_number: int
    user_instruction: str
    agent_reply: str
    changes_summary: Optional[str] = None
    scope_document: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ChatHistoryResponse(BaseModel):
    session_id: str
    scope_id: int
    status: str
    revisions: List[ChatRevisionSummary] = []


class SessionListItem(BaseModel):
    session_id: str
    service_scope_id: int
    title: str
    status: str
    revision_count: int
    turn_count: int
    word_count: int
    scope_snippet: str
    last_revision_at: datetime.datetime
    sector: Optional[str] = None
