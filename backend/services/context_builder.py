"""Assemble bounded LLM context for chat-based scope refinement.

Responsibilities:
- Build system prompt with current scope + intent summary
- Build messages[] from recent turns
- Determine when to trigger intent compression
- Define tool schema for structured output (Phase B)
"""

from __future__ import annotations

from typing import Dict, List, Optional

import config


# ---------------------------------------------------------------------------
# Tool schema for structured output (used by generate_structured in Phase B)
# ---------------------------------------------------------------------------

SCOPE_UPDATE_TOOL = {
    "name": "update_scope",
    "description": "Update the scope of work document with requested changes",
    "input_schema": {
        "type": "object",
        "properties": {
            "scope_document": {
                "type": "string",
                "description": "The FULL updated scope of work document, including all unchanged sections",
            },
            "agent_reply": {
                "type": "string",
                "description": "1-2 sentence explanation of what was changed",
            },
            "changes_summary": {
                "type": "string",
                "description": "Bullet-point list of changes made",
            },
        },
        "required": ["scope_document", "agent_reply", "changes_summary"],
    },
}

SCOPE_UPDATE_TOOL_CHOICE = {"type": "tool", "name": "update_scope"}


# ---------------------------------------------------------------------------
# System prompt construction
# ---------------------------------------------------------------------------


def build_system_prompt(
    current_scope: str,
    intent_summary: Optional[str],
    *,
    use_tool_output: bool = False,
) -> str:
    """Build the system prompt carrying the current scope and decision history.

    When use_tool_output is True, instructs the model to use the update_scope
    tool instead of delimiter-based output (Phase B: tool_use).

    NOTE: revision_number is intentionally excluded from the system prompt to
    maximise prompt-cache hit rate across consecutive turns. It is prepended
    to the first user message instead.
    """
    history_block = (
        intent_summary
        if intent_summary
        else "Initial scope. No prior refinements."
    )

    output_instructions = (
        "Use the update_scope tool to return the updated scope. "
        "Always include the FULL document in scope_document, not a diff."
        if use_tool_output
        else (
            "Reply using EXACTLY this delimiter format "
            "(do not use JSON, do not wrap in markdown fences):\n\n"
            "<<<SCOPE_DOCUMENT>>>\n"
            "...full updated scope of work, including all unchanged sections...\n"
            "<<<END_SCOPE_DOCUMENT>>>\n"
            "<<<AGENT_REPLY>>>\n"
            "One or two sentences explaining what you changed.\n"
            "<<<END_AGENT_REPLY>>>\n"
            "<<<CHANGES_SUMMARY>>>\n"
            "- bullet point 1\n"
            "- bullet point 2\n"
            "- bullet point 3\n"
            "<<<END_CHANGES_SUMMARY>>>\n\n"
            "Always include the FULL updated scope document inside SCOPE_DOCUMENT, not a diff. "
            "The three delimiter blocks must appear in this exact order."
        )
    )

    return (
        "You are an Oil & Gas procurement scope writer and reviewer. "
        "Your task is to revise a Scope of Work document based on the user's natural-language instructions. "
        "Apply the requested changes precisely while preserving sections the user did not ask to modify.\n\n"
        f"CURRENT SCOPE:\n{current_scope}\n\n"
        f"DECISION HISTORY:\n{history_block}\n\n"
        f"When the user sends a new instruction, {output_instructions}"
    )


# ---------------------------------------------------------------------------
# Messages construction
# ---------------------------------------------------------------------------


def build_messages(recent_turns: List[tuple]) -> List[Dict[str, str]]:
    """Convert (user_instruction, agent_reply) tuples to role/content messages."""
    messages: List[Dict[str, str]] = []
    for user_instruction, agent_reply in recent_turns:
        if user_instruction:
            messages.append({"role": "user", "content": user_instruction})
        if agent_reply:
            messages.append({"role": "assistant", "content": agent_reply})
    return messages


# ---------------------------------------------------------------------------
# Full context assembly
# ---------------------------------------------------------------------------


def build_claude_context(
    current_scope: str,
    revision_number: int,
    intent_summary: Optional[str],
    recent_turns: List[tuple],
    *,
    use_tool_output: bool = False,
) -> tuple[str, List[Dict[str, str]]]:
    """Assemble bounded LLM input for chat refinement.

    System prompt carries the current scope + intent summary.
    Messages list only includes the last N turns (from config).
    """
    system_prompt = build_system_prompt(
        current_scope, intent_summary, use_tool_output=use_tool_output
    )
    messages = build_messages(recent_turns)
    return system_prompt, messages


# ---------------------------------------------------------------------------
# Compression trigger
# ---------------------------------------------------------------------------


def should_summarise(revision_number: int) -> bool:
    """Return True if it's time to compress older turns into intent summary."""
    return revision_number % config.settings.summary_trigger_every == 0
