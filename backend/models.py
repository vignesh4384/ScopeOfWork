from __future__ import annotations

import datetime
from typing import Optional

from sqlalchemy import Column, ForeignKey, JSON, String, Text
from sqlmodel import Field, SQLModel


class PurchaseRequest(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    type: str
    initial_description: str
    parameters: dict = Field(default_factory=dict, sa_column=Column(JSON))
    need_by_date: Optional[datetime.date] = None
    budget_type: Optional[str] = None  # CAPEX or OPEX
    wbs: Optional[str] = None
    cost_center: Optional[str] = None
    gl_account: Optional[str] = None
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )


# ---------------------------------------------------------------------------
# Service Scope Flow tables
# ---------------------------------------------------------------------------


class ServiceScope(SQLModel, table=True):
    """Central record tracking each service scope through the pipeline."""

    id: Optional[int] = Field(default=None, primary_key=True)
    purchase_request_id: Optional[int] = Field(default=None, foreign_key="purchaserequest.id")
    status: str = Field(default="draft")  # draft | refined | gold_checked | similarity_checked | constructed | completed
    source_type: str = Field(default="new")  # new | uploaded
    initial_description: str = ""
    raw_scope_text: str = Field(default="", sa_column=Column(Text))
    refined_scope_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    oil_gas_sector: Optional[str] = None  # upstream | midstream | downstream
    gold_plating_report: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    gold_plating_passed: Optional[bool] = None
    similarity_results: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    detailed_scope: Optional[str] = Field(default=None, sa_column=Column(Text))
    executive_summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    bill_of_quantities: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )
    updated_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )


class ScopeReference(SQLModel, table=True):
    """Historical/reference scopes for similarity comparison. Separate from Contract Intelligence."""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = Field(sa_column=Column(Text))
    sector: Optional[str] = None  # upstream | midstream | downstream
    category: Optional[str] = None  # maintenance, inspection, construction, etc.
    source: str = Field(default="manual")  # manual | completed_scope | imported
    normalized_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    embedding: Optional[str] = Field(default=None, sa_column=Column(Text))  # JSON-serialized float vector
    metadata_info: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )


class ScopeSimilarityLog(SQLModel, table=True):
    """Audit trail of similarity checks performed."""

    id: Optional[int] = Field(default=None, primary_key=True)
    service_scope_id: int = Field(foreign_key="servicescope.id")
    reference_scope_id: int = Field(foreign_key="scopereference.id")
    similarity_score: float = 0.0
    matching_sections: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )


# ---------------------------------------------------------------------------
# Chat-based Multi-Revision Refinement tables
# ---------------------------------------------------------------------------


class ScopeSession(SQLModel, table=True):
    """A conversational refinement session attached to a ServiceScope."""

    session_id: str = Field(
        sa_column=Column(String(64), primary_key=True)
    )  # UUID
    service_scope_id: int = Field(foreign_key="servicescope.id")
    title: str = Field(default="", sa_column=Column(String(255)))
    status: str = Field(default="active", sa_column=Column(String(32)))  # active | finalised
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )


class ScopeRevision(SQLModel, table=True):
    """One turn in a chat session — full scope snapshot at this point."""

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(
        sa_column=Column(
            String(64),
            ForeignKey("scopesession.session_id"),
            index=True,
            nullable=False,
        )
    )
    revision_number: int
    user_instruction: str = Field(default="", sa_column=Column(Text))
    agent_reply: str = Field(default="", sa_column=Column(Text))
    scope_document: str = Field(default="", sa_column=Column(Text))
    changes_summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    tokens_estimate: int = 0
    created_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )


class ScopeIntentSummary(SQLModel, table=True):
    """Compressed narrative of older conversation turns to keep LLM context bounded."""

    session_id: str = Field(
        sa_column=Column(
            String(64),
            ForeignKey("scopesession.session_id"),
            primary_key=True,
        )
    )
    summary: str = Field(default="", sa_column=Column(Text))
    covers_up_to_revision: int = 0
    updated_at: datetime.datetime = Field(
        default_factory=datetime.datetime.utcnow, nullable=False
    )
