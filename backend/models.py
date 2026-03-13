from __future__ import annotations

import datetime
from typing import Optional

from sqlalchemy import Column, JSON
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
