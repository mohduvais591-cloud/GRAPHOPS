"""
Tests for Qwen 3 LLM Provider, Grounded Context Retrieval, and AI Endpoints.
"""

import json
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.services.llm_provider import OllamaProvider, get_llm_provider
from backend.services.llm_service import (
    build_retrieval_context,
    generate_agent_response,
    stream_agent_response,
    synthesize_offline_response,
)


@pytest.fixture
def sample_repo_data():
    nodes = [
        {
            "id": "fn-auth",
            "name": "Auth Controller",
            "category": "Authentication",
            "summary": "JWT verification and login endpoint",
            "locations": [{"file": "src/auth.py", "start_line": 10, "end_line": 50}],
        },
        {
            "id": "fn-db",
            "name": "User Database",
            "category": "Storage / DB",
            "summary": "User records and relational queries",
            "locations": [{"file": "src/models.py", "start_line": 20, "end_line": 80}],
        },
    ]
    edges = [
        {"source": "fn-auth", "target": "fn-db", "relationship": "QUERIES"}
    ]
    vulns = [
        {
            "id": "vuln-1",
            "severity": "CRITICAL",
            "title": "Command Injection via subprocess",
            "file": "src/auth.py",
            "line": 42,
            "code_snippet": "subprocess.run(cmd, shell=True)",
            "description": "Untrusted input passed directly to system shell.",
            "fix": "Pass argument list and set shell=False.",
        }
    ]
    return nodes, edges, vulns


def test_qwen_provider_configuration():
    provider = OllamaProvider(model="qwen3:8b", base_url="http://127.0.0.1:11434")
    assert provider.model == "qwen3:8b"
    assert provider.base_url == "http://127.0.0.1:11434"
    health = provider.health_check()
    assert "provider" in health
    assert health["provider"] == "ollama"
    assert health["configured_model"] == "qwen3:8b"


def test_build_retrieval_context_entire_repo(sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    ctx = build_retrieval_context("Explain architecture", nodes, edges, vulns, repo_name="TestApp")
    assert ctx["context_scope"] == "Entire repository"
    assert "Auth Controller" in ctx["context_prompt"]
    assert "User Database" in ctx["context_prompt"]


def test_build_retrieval_context_selected_node(sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    ctx = build_retrieval_context(
        "What does this node do?",
        nodes, edges, vulns,
        repo_name="TestApp",
        selected_node_id="fn-auth"
    )
    assert "Auth Controller" in ctx["context_scope"]
    assert "[FOCUSED NODE]" in ctx["context_prompt"]
    assert "src/auth.py:10-50" in ctx["context_prompt"]
    assert "fn-auth --(QUERIES)--> fn-db" in ctx["context_prompt"]


def test_build_retrieval_context_selected_finding(sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    ctx = build_retrieval_context(
        "How do I fix this?",
        nodes, edges, vulns,
        repo_name="TestApp",
        selected_finding_id="vuln-1"
    )
    assert "Command Injection" in ctx["context_scope"]
    assert "[FOCUSED VULNERABILITY]" in ctx["context_prompt"]
    assert "subprocess.run(cmd, shell=True)" in ctx["context_prompt"]


def test_offline_synthesis_grounding(sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    resp = generate_agent_response(
        query="Explain the critical security vulnerabilities",
        functional_nodes=nodes,
        functional_edges=edges,
        vulnerabilities=vulns,
        repo_name="TestApp"
    )
    assert resp["mode"] in ("ollama_qwen3_live", "graph_grounded_fallback")
    assert "Command Injection" in resp["answer"]
    assert "src/auth.py:42" in resp["answer"]
    assert resp["grounded_vulns"] == 1


def test_stream_agent_response(sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    chunks = list(stream_agent_response(
        query="Overview",
        functional_nodes=nodes,
        functional_edges=edges,
        vulnerabilities=vulns,
        repo_name="TestApp"
    ))
    assert len(chunks) > 0
    assert any("data:" in c for c in chunks)


def test_ai_status_endpoint(client):
    res = client.get("/v1/ai/status")
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "ollama"
    assert "configured_model" in data


def test_ai_chat_endpoint(client, sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    res = client.post("/v1/ai/chat", json={
        "query": "Tell me about authentication",
        "repo_name": "TestApp",
        "nodes": nodes,
        "edges": edges,
        "vulnerabilities": vulns,
        "selected_node_id": "fn-auth"
    })
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert "Auth Controller" in data["context_scope"]


def test_ai_context_endpoint(client, sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    res = client.post("/v1/ai/context", json={
        "query": "Fix bug",
        "repo_name": "TestApp",
        "nodes": nodes,
        "edges": edges,
        "vulnerabilities": vulns,
        "selected_finding_id": "vuln-1"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["has_selected_finding"] is True
    assert "Command Injection" in data["context_scope"]


def test_legacy_agent_query_compatibility(client, sample_repo_data):
    nodes, edges, vulns = sample_repo_data
    res = client.post("/v1/agent/query", json={
        "query": "What are the modules?",
        "repo_name": "TestApp",
        "nodes": nodes,
        "edges": edges,
        "vulnerabilities": vulns
    })
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
