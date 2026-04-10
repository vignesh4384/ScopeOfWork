"""LLM-powered service functions for the enhanced service scope flow.

Functions:
    generate_scope       – Create a new scope of work from a description
    extract_scope_from_file – Parse PDF/DOCX and extract scope text
    refine_scope         – AI-refine a scope with optional user feedback
    check_gold_plating   – Detect gold-plated requirements vs O&G standards
    generate_embedding   – Generate Azure OpenAI embedding vector for text
    compare_similarity   – Two-stage: embedding retrieval (top 5) + LLM deep compare
    construct_outputs    – Produce detailed scope, executive summary, and BoQ
"""

from __future__ import annotations

import asyncio
import io
import json
import math
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from tenacity import retry, retry_if_not_exception_type, stop_after_attempt, wait_exponential

import config
from llm_providers.factory import get_provider
from services.context_builder import (
    SCOPE_UPDATE_TOOL,
    SCOPE_UPDATE_TOOL_CHOICE,
    build_claude_context,
)

provider = get_provider()

_LLM_TIMEOUT = 60  # seconds – scope prompts are heavier than classification
_TOP_N = 5  # number of candidates to retrieve via embedding before LLM comparison


def _extract_delimited_block(raw: str, name: str) -> Optional[str]:
    """Extract a block delimited by <<<NAME>>>...<<<END_NAME>>> markers.

    If the end marker is missing (truncated response), fall back to taking
    everything from the open marker to the next known delimiter or EOF.
    """
    pattern = rf"<<<{name}>>>\s*\n?(.*?)\n?\s*<<<END_{name}>>>"
    m = re.search(pattern, raw, re.S)
    if m:
        return m.group(1).strip()
    # Fallback: open marker without close — take from open marker to next
    # delimiter or end of string.
    open_pattern = rf"<<<{name}>>>\s*\n?"
    om = re.search(open_pattern, raw)
    if not om:
        return None
    rest = raw[om.end():]
    next_marker = re.search(r"<<<[A-Z_]+>>>", rest)
    if next_marker:
        rest = rest[: next_marker.start()]
    return rest.strip() or None


def _extract_json(raw: str) -> Dict[str, Any]:
    """Best-effort extraction of a JSON object from LLM text."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    m = re.search(r"\{.*\}", raw, re.S)
    blob = m.group(0) if m else raw
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        # Try adding closing braces for truncated responses
        for extra in range(1, 5):
            try:
                return json.loads(blob + "}" * extra)
            except json.JSONDecodeError:
                continue
        raise


# ---------------------------------------------------------------------------
# 1. Generate Scope
# ---------------------------------------------------------------------------


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=0.5, max=2))
async def generate_scope(description: str, sector: Optional[str] = None) -> str:
    """Use LLM to generate a comprehensive scope of work from a description."""
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    sector_ctx = f" for the {sector} Oil & Gas sector" if sector else " for the Oil & Gas industry"
    prompt = (
        f"You are an expert Oil & Gas procurement scope writer{sector_ctx}. "
        "Given the service description below, generate a comprehensive Scope of Work document. "
        "Structure it with these sections:\n"
        "1. **Objective** – What the service aims to achieve\n"
        "2. **Scope of Services** – Detailed description of work items\n"
        "3. **Deliverables** – Tangible outputs expected\n"
        "4. **Acceptance Criteria** – How work will be evaluated\n"
        "5. **Timeline & Milestones** – Key phases and durations\n"
        "6. **HSE Requirements** – Health, Safety, and Environment obligations\n"
        "7. **Vendor Qualifications** – Required certifications and experience\n"
        "8. **Exclusions** – What is explicitly out of scope\n\n"
        "Write in clear, professional language suitable for a procurement document. "
        "Be specific and practical — avoid vague or gold-plated requirements."
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": description},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=_LLM_TIMEOUT)
        return raw.strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scope generation failed: {e}")


# ---------------------------------------------------------------------------
# 2. Extract Scope from File
# ---------------------------------------------------------------------------


async def extract_scope_from_file(file_bytes: bytes, filename: str) -> str:
    """Extract text from a PDF or DOCX file."""
    lower = filename.lower()
    text = ""

    if lower.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            parts = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    parts.append(page_text)
            text = "\n\n".join(parts)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {e}")

    elif lower.endswith(".docx"):
        try:
            from docx import Document
            doc = Document(io.BytesIO(file_bytes))
            parts = [p.text for p in doc.paragraphs if p.text.strip()]
            text = "\n\n".join(parts)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse DOCX: {e}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload PDF or DOCX.")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text could be extracted from the file.")

    # Optionally normalize with LLM
    if provider.enabled:
        try:
            normalize_prompt = (
                "You are given raw text extracted from a scope of work document. "
                "Clean it up: fix formatting, remove headers/footers/page numbers, "
                "and structure it logically. Keep all content — do not add or remove requirements. "
                "Return the cleaned scope text only."
            )
            messages = [
                {"role": "system", "content": normalize_prompt},
                {"role": "user", "content": text[:12000]},  # limit to avoid token overflow
            ]
            cleaned = await asyncio.wait_for(provider.generate(messages), timeout=_LLM_TIMEOUT)
            return cleaned.strip()
        except Exception:
            return text  # fallback to raw text

    return text


# ---------------------------------------------------------------------------
# 3. Refine Scope
# ---------------------------------------------------------------------------


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=0.5, max=2))
async def refine_scope(
    scope_text: str,
    feedback: Optional[str] = None,
    edited_text: Optional[str] = None,
) -> Dict[str, str]:
    """AI-refine a scope of work. Returns refined text and a changes summary."""
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    text_to_refine = edited_text if edited_text else scope_text

    feedback_section = ""
    if feedback:
        feedback_section = f"\n\nThe user has provided this feedback to incorporate:\n{feedback}"

    prompt = (
        "You are an Oil & Gas procurement scope reviewer. "
        "Review the scope of work below and improve it:\n"
        "- Fix ambiguous language and make requirements measurable\n"
        "- Ensure completeness — flag missing sections\n"
        "- Remove duplicate or contradictory requirements\n"
        "- Improve structure and readability\n"
        "- Keep the scope practical and achievable\n"
        f"{feedback_section}\n\n"
        "Reply with JSON: {\"refined_scope_text\": \"...\", \"changes_summary\": \"...\"}\n"
        "The changes_summary should be a brief bullet list of what was changed."
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": text_to_refine},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=_LLM_TIMEOUT)
        data = _extract_json(raw)
        return {
            "refined_scope_text": data.get("refined_scope_text", text_to_refine),
            "changes_summary": data.get("changes_summary", "No changes detected."),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scope refinement failed: {e}")


# ---------------------------------------------------------------------------
# 3b. Chat-based Multi-Revision Refinement
# ---------------------------------------------------------------------------


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=0.5, max=2),
    retry=retry_if_not_exception_type(HTTPException),
)
async def chat_refine_scope(
    current_scope: str,
    revision_number: int,
    intent_summary: Optional[str],
    recent_turns: List[tuple],
    user_message: str,
) -> Dict[str, str]:
    """Run a single chat-refinement turn against the LLM.

    Returns dict with keys: scope_document, agent_reply, changes_summary.
    """
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    system_prompt, history_messages = build_claude_context(
        current_scope=current_scope,
        revision_number=revision_number,
        intent_summary=intent_summary,
        recent_turns=recent_turns,
        use_tool_output=True,
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend(history_messages)
    messages.append({"role": "user", "content": user_message})

    print(
        f"[chat_refine_scope] rev={revision_number} "
        f"system_chars={len(system_prompt)} history_msgs={len(history_messages)} "
        f"user_chars={len(user_message)}"
    )

    try:
        result = await provider.generate_structured(
            messages,
            tools=[SCOPE_UPDATE_TOOL],
            tool_choice=SCOPE_UPDATE_TOOL_CHOICE,
        )
        scope_doc = result.get("scope_document", "")
        if not scope_doc:
            raise ValueError("LLM response missing scope_document in tool output")
        return {
            "scope_document": scope_doc,
            "agent_reply": result.get("agent_reply", "Scope updated."),
            "changes_summary": result.get("changes_summary", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat refinement failed: {type(e).__name__}: {e}")


async def chat_refine_scope_stream(
    current_scope: str,
    revision_number: int,
    intent_summary: Optional[str],
    recent_turns: List[tuple],
    user_message: str,
):
    """Stream a chat-refinement turn. Yields SSE-formatted text chunks.

    Uses delimiter-based output (not tool_use) because tool_use streams
    JSON character-by-character which can't be meaningfully displayed.
    The final result is parsed from delimiters after streaming completes.
    """
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    system_prompt, history_messages = build_claude_context(
        current_scope=current_scope,
        revision_number=revision_number,
        intent_summary=intent_summary,
        recent_turns=recent_turns,
        use_tool_output=False,  # delimiters for streaming
    )

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    messages.extend(history_messages)
    messages.append({"role": "user", "content": user_message})

    full_text = ""
    async for chunk in provider.generate_stream(messages):
        full_text += chunk
        # Send text delta as SSE
        yield f"data: {json.dumps({'type': 'delta', 'text': chunk})}\n\n"

    # Parse delimiters from the complete response
    scope_doc = _extract_delimited_block(full_text, "SCOPE_DOCUMENT")
    agent_reply = _extract_delimited_block(full_text, "AGENT_REPLY")
    changes_summary = _extract_delimited_block(full_text, "CHANGES_SUMMARY")

    yield f"data: {json.dumps({'type': 'done', 'scope_document': scope_doc or full_text, 'agent_reply': agent_reply or 'Scope updated.', 'changes_summary': changes_summary or ''})}\n\n"


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=0.5, max=2))
async def compress_intent_summary(
    existing_summary: Optional[str],
    older_turns: List[tuple],  # list of (user_instruction, agent_reply, changes_summary)
) -> str:
    """Compress older conversation turns into a concise narrative (~200 words).

    Called every 3 revisions to keep the context window bounded. Merges with
    any existing summary so the narrative grows incrementally.
    """
    if not provider.enabled or not older_turns:
        return existing_summary or ""

    turns_text = ""
    for idx, (user_instr, agent_reply, changes) in enumerate(older_turns, start=1):
        turns_text += (
            f"\n[Turn {idx}]\n"
            f"User asked: {user_instr}\n"
            f"Changes made: {changes or agent_reply}\n"
        )

    existing_block = (
        f"\nEXISTING SUMMARY (extend this):\n{existing_summary}\n"
        if existing_summary
        else ""
    )

    prompt = (
        "You are summarising a multi-turn scope-of-work refinement conversation. "
        "Produce a concise narrative (~200 words) capturing the user's decisions, "
        "intent, and the evolution of the scope. Focus on WHY the user made changes "
        "(constraints, priorities) so a future model can interpret edge cases. "
        "Do not list every edit verbatim — synthesize the direction of refinement."
        f"{existing_block}\n"
        f"NEW TURNS TO INCORPORATE:{turns_text}\n\n"
        "Reply with just the narrative summary text, no preamble."
    )

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": "Produce the updated narrative summary."},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=_LLM_TIMEOUT)
        return raw.strip()
    except Exception as e:
        print(f"[compress_intent_summary] failed: {e}")
        return existing_summary or ""


# ---------------------------------------------------------------------------
# 4. Gold Plating Check
# ---------------------------------------------------------------------------


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=0.5, max=2))
async def check_gold_plating(scope_text: str, sector: str) -> Dict[str, Any]:
    """Analyze scope for gold-plated requirements relative to O&G sector standards."""
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    prompt = (
        f"You are an Oil & Gas procurement expert specializing in the **{sector}** sector "
        "(upstream = exploration & production, midstream = transportation & storage, "
        "downstream = refining & distribution).\n\n"
        "Analyze the scope of work below for **gold plating** — requirements that:\n"
        "- Exceed standard industry practice for this sector\n"
        "- Are unnecessarily expensive or over-specified\n"
        "- Add complexity without proportional value\n"
        "- Require certifications or standards beyond what is needed\n"
        "- Specify premium brands/materials where standard alternatives exist\n\n"
        "Reply ONLY with JSON:\n"
        "{\n"
        "  \"passed\": true/false,\n"
        "  \"flagged_items\": [\n"
        "    {\n"
        "      \"item\": \"the specific requirement\",\n"
        "      \"reason\": \"why it is gold plating\",\n"
        "      \"recommendation\": \"what the standard alternative would be\",\n"
        "      \"severity\": \"high|medium|low\"\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "If no gold plating is found, return {\"passed\": true, \"flagged_items\": []}."
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": scope_text},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=_LLM_TIMEOUT)
        data = _extract_json(raw)
        return {
            "passed": data.get("passed", True),
            "sector": sector,
            "flagged_items": data.get("flagged_items", []),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gold plating check failed: {e}")


# ---------------------------------------------------------------------------
# 5. Embeddings & Similarity (two-stage pipeline)
# ---------------------------------------------------------------------------


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def generate_embedding(text: str) -> List[float]:
    """Generate an embedding vector using Azure OpenAI text-embedding model.

    Returns a list of floats (the embedding vector).
    """
    from openai import AsyncAzureOpenAI

    endpoint = config.settings.azure_openai_endpoint
    key = config.settings.azure_openai_key
    deployment = config.settings.azure_openai_embedding_deployment

    if not endpoint or not key:
        raise HTTPException(
            status_code=503,
            detail="Azure OpenAI not configured — embeddings require azure_openai_endpoint and azure_openai_key",
        )

    client = AsyncAzureOpenAI(
        api_key=key,
        azure_endpoint=endpoint,
        api_version="2025-01-01-preview",
    )
    try:
        # Truncate to ~8000 tokens worth of text (~32k chars) to stay within model limits
        truncated = text[:32000]
        resp = await asyncio.wait_for(
            client.embeddings.create(
                model=deployment,
                input=truncated,
            ),
            timeout=30,
        )
        return resp.data[0].embedding
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Embedding generation failed: {e}")


def _embeddings_available() -> bool:
    """Check whether Azure OpenAI embedding credentials are configured."""
    return bool(config.settings.azure_openai_endpoint and config.settings.azure_openai_key)


async def compare_similarity(
    scope_text: str,
    reference_scopes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Similarity comparison with two possible strategies:

    If Azure OpenAI embeddings are available:
        Stage 1: Embedding cosine retrieval (top 5)
        Stage 2: LLM deep comparison on top candidates
    If embeddings are NOT available (e.g. only Anthropic configured):
        LLM-only comparison against all references (limited to top N by text)
    """
    if not reference_scopes:
        return []

    use_embeddings = _embeddings_available()

    if use_embeddings:
        # --- Stage 1: Embedding-based retrieval ---
        try:
            new_embedding = await generate_embedding(scope_text)
        except Exception:
            use_embeddings = False  # fall through to LLM-only path

    if use_embeddings:
        scored: List[Dict[str, Any]] = []
        for ref in reference_scopes:
            ref_embedding_str = ref.get("embedding")
            if not ref_embedding_str:
                scored.append({**ref, "_cosine": 0.0})
                continue
            try:
                ref_embedding = json.loads(ref_embedding_str)
            except (json.JSONDecodeError, TypeError):
                scored.append({**ref, "_cosine": 0.0})
                continue
            cos_sim = _cosine_similarity(new_embedding, ref_embedding)
            scored.append({**ref, "_cosine": cos_sim})

        scored.sort(key=lambda x: x["_cosine"], reverse=True)
        top_candidates = scored[:_TOP_N]

        if not top_candidates or all(c["_cosine"] < 0.05 for c in top_candidates):
            return []
    else:
        # No embeddings — take first N references for LLM comparison
        top_candidates = [{**ref, "_cosine": 0.0} for ref in reference_scopes[:_TOP_N]]

    # Build lookup for source metadata
    source_lookup = {c["id"]: c.get("source", "scope_reference") for c in top_candidates}

    # --- LLM deep comparison ---
    if not provider.enabled:
        return [
            {
                "reference_id": c["id"],
                "title": c["title"],
                "score": round(c["_cosine"], 3),
                "matching_sections": [],
                "source": c.get("source", "scope_reference"),
            }
            for c in top_candidates
            if c["_cosine"] > 0.1
        ]

    refs_text = ""
    for c in top_candidates:
        desc = c.get("description", "")[:3000]
        src = c.get("source", "scope_reference")
        cosine_note = f" | Embedding similarity: {c['_cosine']:.2f}" if use_embeddings else ""
        refs_text += (
            f"\n--- Reference ID: {c['id']} | Title: {c['title']} | "
            f"Source: {src}{cosine_note} ---\n{desc}\n"
        )

    prompt = (
        "You are a procurement analyst. Compare the following reference scopes against the NEW scope.\n"
        "For each reference, rate the similarity (0.0-1.0) and "
        "identify which specific sections or requirements overlap.\n\n"
        "Reply ONLY with JSON:\n"
        "{\n"
        "  \"matches\": [\n"
        "    {\n"
        "      \"reference_id\": <id>,\n"
        "      \"title\": \"...\",\n"
        "      \"score\": 0.0-1.0,\n"
        "      \"matching_sections\": [\"section or requirement that matches\"]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Only include references with score > 0.1. Sort by score descending.\n\n"
        f"REFERENCE SCOPES (top {_TOP_N}):\n{refs_text}"
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"NEW SCOPE:\n{scope_text}"},
    ]
    try:
        raw = await asyncio.wait_for(provider.generate(messages), timeout=_LLM_TIMEOUT)
        data = _extract_json(raw)
        matches = data.get("matches", [])
        for m in matches:
            m["source"] = source_lookup.get(m.get("reference_id"), "scope_reference")
        return matches
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Similarity comparison failed: {e}")


# ---------------------------------------------------------------------------
# 6. Construct Outputs
# ---------------------------------------------------------------------------


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=0.5, max=2))
async def construct_outputs(
    refined_scope: str,
    sector: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate three outputs: detailed scope, executive summary, and bill of quantities."""
    if not provider.enabled:
        raise HTTPException(status_code=503, detail="LLM provider not configured")

    sector_ctx = f" for the {sector} Oil & Gas sector" if sector else ""

    # --- Detailed Scope ---
    detailed_prompt = (
        f"You are a procurement document writer{sector_ctx}. "
        "Produce a final, production-ready detailed scope of work document from the refined scope below. "
        "It should be ready to attach to a purchase order or contract. "
        "Use professional formatting with numbered sections."
    )
    detailed_messages = [
        {"role": "system", "content": detailed_prompt},
        {"role": "user", "content": refined_scope},
    ]

    # --- Executive Summary ---
    summary_prompt = (
        "Write a concise 1-page executive summary of this scope of work. "
        "It should be suitable for management review and include: "
        "purpose, key deliverables, estimated timeline, and critical requirements. "
        "Keep it under 500 words."
    )
    summary_messages = [
        {"role": "system", "content": summary_prompt},
        {"role": "user", "content": refined_scope},
    ]

    # --- Bill of Quantities ---
    boq_prompt = (
        f"You are a quantity surveyor{sector_ctx}. "
        "Extract all quantifiable work items from this scope and produce a bill of quantities. "
        "Reply ONLY with JSON:\n"
        "{\n"
        "  \"items\": [\n"
        "    {\"item\": \"description\", \"quantity\": 1.0, \"unit\": \"LS|EA|HR|DAY|M2|KG|...\", \"estimated_cost\": 0.0}\n"
        "  ]\n"
        "}\n"
        "Provide realistic cost estimates based on industry rates. Use LS (Lump Sum) for items that cannot be unit-priced."
    )
    boq_messages = [
        {"role": "system", "content": boq_prompt},
        {"role": "user", "content": refined_scope},
    ]

    # Run the three LLM calls in parallel — they're independent and the three
    # prompts don't share any intermediate data. This cuts wall-clock from
    # ~3×_LLM_TIMEOUT down to ~max(_LLM_TIMEOUT). 3 concurrent requests is
    # well within Anthropic's per-minute rate limits for a single user.
    try:
        detailed_raw, summary_raw, boq_raw = await asyncio.gather(
            asyncio.wait_for(provider.generate(detailed_messages), timeout=_LLM_TIMEOUT),
            asyncio.wait_for(provider.generate(summary_messages), timeout=_LLM_TIMEOUT),
            asyncio.wait_for(provider.generate(boq_messages), timeout=_LLM_TIMEOUT),
        )

        # Parse BoQ JSON
        boq_items = []
        try:
            boq_data = _extract_json(boq_raw)
            boq_items = boq_data.get("items", [])
        except Exception:
            boq_items = [{"item": "Lump Sum — see detailed scope", "quantity": 1, "unit": "LS", "estimated_cost": 0}]

        return {
            "detailed_scope": detailed_raw.strip(),
            "executive_summary": summary_raw.strip(),
            "bill_of_quantities": boq_items,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Output construction failed: {e}")
