from __future__ import annotations

import asyncio
import json
import re
from typing import List, Any

from fastapi import HTTPException
from tenacity import retry, stop_after_attempt, wait_exponential

from llm_providers.factory import get_provider
from schemas import (
    ClassificationResponse,
    MaterialDetailsResponse,
    ParameterField,
    ServiceQuestionsResponse,
)

provider = get_provider()


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=0.5, max=2))
async def classify_request(description: str) -> ClassificationResponse:
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")
    try:
        req_type = await asyncio.wait_for(provider.classify(description), timeout=12)
        return ClassificationResponse(type=req_type, rationale="Classification via Claude.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM classification failed, please retry. ({e})")


def _parse_fields(raw_list: Any) -> List[ParameterField]:
    fields: List[ParameterField] = []
    if not isinstance(raw_list, list):
        return fields
    for item in raw_list:
        try:
            fields.append(
                ParameterField(
                    name=str(item.get("name")),
                    input_type=item.get("input_type", "text"),
                    description=item.get("description"),
                    example=item.get("example"),
                    required=bool(item.get("required", True)),
                    options=item.get("options"),
                )
            )
        except Exception:
            continue
    return fields


async def _llm_material_suggestions(description: str) -> MaterialDetailsResponse | None:
    if not provider.enabled:
        return None
    prompt = (
        "You are a purchasing assistant. Given a material description, propose parameters needed to buy it. "
        "Reply ONLY with JSON in this shape: "
        "{ \"mandatory_parameters\": [{\"name\":..., \"input_type\":\"text|number|select|date\", \"description\":..., \"example\":..., \"required\":true, \"options\":[...] }], "
        "\"optional_parameters\": [...], \"manufacturers\": [\"...\"], \"price_range\": \"...\", \"image_urls\": [\"...\"], \"references\": [\"...\"] } "
        "Keep 5-10 mandatory fields max; include technical, sizing, compliance, brand, and delivery aspects relevant to the item."
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": description},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=25)
        raw = raw.strip()
        # Clean markdown fences or any prefix/suffix text
        if raw.startswith("```"):
            raw = raw.strip("`").strip()
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()
        # Extract first JSON object if extra text exists
        json_blob = raw
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            json_blob = m.group(0)
        try:
            data = json.loads(json_blob)
        except Exception as e:
            # Try a final rescue: add closing braces if clearly truncated
            try:
                fixed = json_blob + "}" * 3
                data = json.loads(fixed)
            except Exception:
                print("LLM parse error for material-details, raw response:\n", raw[:1500])
                raise HTTPException(status_code=502, detail=f"LLM response could not be parsed. Please retry. ({e})")
        mandatory = _parse_fields(data.get("mandatory_parameters", []))
        optional = _parse_fields(data.get("optional_parameters", []))
        manufacturers = data.get("manufacturers") or []
        price_range = data.get("price_range")
        image_urls = data.get("image_urls") or []
        references = data.get("references", [])

        if not mandatory:
            raise HTTPException(status_code=502, detail="LLM returned no parameters. Please retry.")
        if not image_urls:
            image_urls = [
                f"https://source.unsplash.com/featured/?{description}",
                "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&auto=format&fit=crop",
            ]
        if not references:
            references = [f"https://www.google.com/search?q={description.replace(' ', '+')}+price"]

        return MaterialDetailsResponse(
            mandatory_parameters=mandatory,
            optional_parameters=optional,
            manufacturers=manufacturers,
            price_range=price_range,
            image_urls=image_urls,
            references=references,
            rationale="Generated via Azure OpenAI.",
        )
    except HTTPException:
        raise
    except Exception as e:
        print("LLM request failed for material-details:", e)
        raise HTTPException(status_code=502, detail=f"LLM request failed. Please retry. ({e})")


async def _material_parameters(description: str) -> List[ParameterField]:
    base_fields = [
        ParameterField(
            name="Quantity", input_type="number", description="Number of units to purchase", example="3", required=True
        ),
        ParameterField(
            name="Delivery Location",
            input_type="text",
            description="Where the item should be delivered",
            example="Abu Dhabi warehouse",
            required=True,
        ),
    ]

    lower = description.lower()
    if "laptop" in lower or "notebook" in lower:
        specific = [
            ParameterField(name="CPU", input_type="text", description="Processor model", example="Intel i7-1360P"),
            ParameterField(name="RAM", input_type="text", description="Memory size", example="16 GB"),
            ParameterField(name="Storage", input_type="text", description="Drive type and size", example="512 GB NVMe SSD"),
            ParameterField(name="Display Size", input_type="number", description="Screen size in inches", example="14"),
            ParameterField(name="Resolution", input_type="select", options=["1920x1080", "2560x1600", "3840x2160"]),
            ParameterField(name="GPU", input_type="text", description="Integrated or discrete GPU", example="Intel Iris Xe"),
            ParameterField(name="Operating System", input_type="select", options=["Windows 11 Pro", "Windows 11 Home", "macOS", "Linux"]),
            ParameterField(name="Weight Limit", input_type="number", description="Max weight in kg", example="1.5"),
            ParameterField(name="Battery Life", input_type="text", description="Target battery life", example="8+ hours"),
            ParameterField(name="Ports", input_type="text", description="Key ports needed", example="2xUSB-A, 2xUSB-C, HDMI"),
            ParameterField(name="Warranty", input_type="text", description="Required warranty/onsite support", example="3Y onsite NBD"),
        ]
    elif any(word in lower for word in ["safety shoe", "safety boot", "work boot", "steel toe", "composite toe"]):
        specific = [
            ParameterField(name="Size", input_type="text", description="Shoe size and sizing system", example="US 10 / EU 44"),
            ParameterField(name="Toe Protection", input_type="select", options=["Steel toe", "Composite toe", "Aluminum toe"]),
            ParameterField(name="Midsole Protection", input_type="select", options=["None", "Steel plate", "Kevlar"]),
            ParameterField(name="Slip Rating", input_type="text", description="Slip resistance standard", example="SRC / ASTM F3445"),
            ParameterField(name="Electrical Hazard", input_type="select", options=["EH rated", "Non-EH"]),
            ParameterField(name="Waterproof Level", input_type="select", options=["Waterproof", "Water-resistant", "Not required"]),
            ParameterField(name="Upper Material", input_type="select", options=["Leather", "Synthetic", "Nubuck", "Textile"]),
            ParameterField(name="Sole Material", input_type="select", options=["PU", "TPU", "Rubber", "EVA"]),
            ParameterField(name="Certifications", input_type="text", description="Safety standards", example="EN ISO 20345 S3 or ASTM F2413-18"),
            ParameterField(name="Usage Environment", input_type="text", description="Work setting", example="Oil & gas site, outdoor"),
            ParameterField(name="Color/Branding", input_type="text", description="Color or branding needs", required=False),
        ]
    elif "compressor" in lower:
        specific = [
            ParameterField(name="Pressure Rating", input_type="number", description="Operating pressure", example="10 bar"),
            ParameterField(name="Voltage Rating", input_type="number", description="Power supply", example="400 V"),
            ParameterField(name="Capacity", input_type="number", description="Flow capacity", example="250 cfm"),
            ParameterField(name="Mounting Type", input_type="select", options=["Skid", "Trailer", "Base frame"]),
        ]
    else:
        specific = [
            ParameterField(name="Model/Spec", input_type="text", description="Model or specification details"),
            ParameterField(name="Material Grade", input_type="text", description="Applicable grade or standard"),
            ParameterField(name="Preferred Brand", input_type="text", description="Named brand if required", required=False),
        ]
    return base_fields + specific


async def _material_brands(description: str) -> List[str]:
    lower = description.lower()
    if "laptop" in lower or "notebook" in lower:
        return ["Lenovo ThinkPad", "Dell Latitude", "HP EliteBook", "Apple MacBook", "ASUS ExpertBook"]
    if any(word in lower for word in ["safety shoe", "safety boot", "steel toe", "composite toe", "work boot"]):
        return ["Timberland PRO", "Caterpillar", "Red Wing", "KEEN Utility", "Skechers Work"]
    if "compressor" in lower:
        return ["Atlas Copco", "Ingersoll Rand", "Kaeser", "Gardner Denver"]
    return ["Siemens", "Bosch", "Honeywell"]


async def _material_price(description: str) -> str:
    lower = description.lower()
    if "laptop" in lower or "notebook" in lower:
        return "USD 700 – 2,500 depending on CPU/RAM/GPU and business/consumer class"
    if any(word in lower for word in ["safety shoe", "safety boot", "steel toe", "composite toe", "work boot"]):
        return "USD 50 – 200 depending on safety rating, material, and brand"
    if "compressor" in lower:
        return "USD 8,000 – 25,000 depending on capacity and duty"
    return "Pricing varies; typical range USD 1,000 – 10,000"


async def _material_images(description: str) -> List[str]:
    lower = description.lower()
    if "laptop" in lower or "notebook" in lower:
        return [
            f"https://source.unsplash.com/featured/?laptop,{description}",
            "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop",
        ]
    if "compressor" in lower:
        return [
            f"https://source.unsplash.com/featured/?industrial-compressor,{description}",
            "https://images.unsplash.com/photo-1503389152951-9f343605f61e?w=800&auto=format&fit=crop",
        ]
    return [
        f"https://source.unsplash.com/featured/?product,{description}",
        "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&auto=format&fit=crop",
    ]


async def material_details(description: str) -> MaterialDetailsResponse:
    llm_result = await _llm_material_suggestions(description)
    if llm_result and llm_result.mandatory_parameters:
        return llm_result
    raise HTTPException(status_code=502, detail="LLM could not generate parameters. Please try again.")


async def service_questions(description: str) -> ServiceQuestionsResponse:
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    prompt = (
        "You are a procurement assistant. Given a service description, produce clarifying questions to scope it. "
        "Reply ONLY with JSON: {\"questions\":[{\"name\":..., \"input_type\":\"text|number|select|date\", \"description\":..., \"example\":..., \"required\":true, \"options\":[...]}]} "
        "Keep 5-10 questions tailored to the service."
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": description},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=25)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
        json_blob = raw
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            json_blob = m.group(0)
        data = json.loads(json_blob)
        questions = _parse_fields(data.get("questions", []))
        if questions:
            return ServiceQuestionsResponse(questions=questions, rationale="Generated via Claude.")
        raise HTTPException(status_code=502, detail="LLM returned no questions. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM could not generate questions. Please retry. ({e})")
