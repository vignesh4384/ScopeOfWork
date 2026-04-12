from __future__ import annotations

from typing import Dict

from schemas import PurchaseRequestCreate


def build_sap_payload(req: PurchaseRequestCreate) -> Dict:
    return {
        "purchase_requisition": {
            "type": req.type,
            "description": req.initial_description,
            "need_by_date": str(req.need_by_date),
            "budget_type": req.budget_type,
            "wbs": req.wbs,
            "cost_center": req.cost_center,
            "gl_account": req.gl_account,
            "material_number": req.material_number,
            "details": req.parameters,
        }
    }
