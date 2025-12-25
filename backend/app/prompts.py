"""
Prompt Definitions

The SINGLE Source of Truth for all system prompts.
These definitions are synced to the DB PromptRegistry on startup.
"""
from app.schemas.prompt_schemas import PromptDefinition

# =============================================================================
# Canvas Analysis Prompts
# =============================================================================

SUMMARIZE_PROMPT = PromptDefinition(
    key="canvas.action.summarize",
    group="Canvas Actions",
    default_text="Please provide a concise summary of the following content:\n\n{content}",
    variables={
        "content": "The selected text or image description to summarize"
    },
    access_level="user_overridable",
    description="Used by the 'Summarize' button in the Canvas Selection Toolbar."
)

EXPLAIN_PROMPT = PromptDefinition(
    key="canvas.action.explain",
    group="Canvas Actions",
    default_text="Please explain the following content in simple, clear terms:\n\n{content}",
    variables={
        "content": "The selected text or image description to explain"
    },
    access_level="user_overridable",
    description="Used by the 'Explain' button in the Canvas Selection Toolbar."
)

# Registry List (Imported by main.py)
ALL_PROMPTS = [
    SUMMARIZE_PROMPT,
    EXPLAIN_PROMPT
]
