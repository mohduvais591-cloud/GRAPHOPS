"""
Legacy adapter for Gemma 4 Agent Service.
Delegates to the modern LLM Service supporting Qwen 3 and multi-provider execution.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from backend.services.llm_service import (
    generate_agent_response as llm_generate_agent_response,
    build_retrieval_context,
    synthesize_offline_response,
)
from backend.services.llm_provider import get_llm_provider

DEFAULT_GEMMA_MODEL = os.environ.get("LLM_MODEL") or os.environ.get("QWEN_MODEL", "qwen3:8b")


def query_ollama_gemma(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_GEMMA_MODEL,
    timeout_sec: float = 60.0
) -> Dict[str, Any]:
    """Compatibility wrapper that queries the active LLM provider."""
    provider = get_llm_provider()
    return provider.generate(messages, options={"timeout": timeout_sec})


def generate_agent_response(
    query: str,
    functional_nodes: List[Dict[str, Any]],
    functional_edges: List[Dict[str, Any]],
    vulnerabilities: List[Dict[str, Any]],
    repo_name: str = "Repository",
    model: Optional[str] = None
) -> Dict[str, Any]:
    """Delegates to the modern LLMService."""
    return llm_generate_agent_response(
        query=query,
        functional_nodes=functional_nodes,
        functional_edges=functional_edges,
        vulnerabilities=vulnerabilities,
        repo_name=repo_name,
        model=model,
    )
