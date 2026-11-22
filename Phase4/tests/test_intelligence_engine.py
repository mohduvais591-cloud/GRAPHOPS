import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.services.intelligence_engine import (
    IntentType,
    EvidenceCategory,
    ConfidenceLevel,
    EvidenceObject,
    classify_intent,
    resolve_target,
    tool_get_symbol,
    tool_search_symbols,
    tool_get_callers,
    tool_get_callees,
    tool_trace_path,
    tool_get_impact_analysis,
    tool_get_security_findings,
    tool_get_related_tests,
    generate_change_safety_report,
    build_evidence_package,
)

SAMPLE_NODES = [
    {
        "id": "fn-auth",
        "name": "AuthMiddleware",
        "category": "Authentication",
        "summary": "Handles JWT authentication and token verification",
        "locations": [{"file": "src/auth/middleware.py", "start_line": 10, "end_line": 50}],
    },
    {
        "id": "fn-router",
        "name": "ProtectedRouter",
        "category": "API / Routing",
        "summary": "Routes incoming requests to protected endpoints",
        "locations": [{"file": "src/api/router.py", "start_line": 1, "end_line": 40}],
    },
    {
        "id": "fn-test-auth",
        "name": "AuthTest",
        "category": "Utility",
        "summary": "Unit tests for authentication",
        "locations": [{"file": "tests/test_auth.py", "start_line": 1, "end_line": 30}],
    },
]

SAMPLE_EDGES = [
    {"source": "fn-auth", "target": "fn-router", "relationship": "USES"},
    {"source": "fn-test-auth", "target": "fn-auth", "relationship": "TESTS"},
]

SAMPLE_VULNS = [
    {
        "id": "vuln-001",
        "file": "src/auth/middleware.py",
        "line": 25,
        "severity": "HIGH",
        "title": "Hardcoded Token Fallback",
        "description": "Fallback token found in auth middleware",
        "fix": "Use environment variable only",
    }
]


def test_classify_intent():
    assert classify_intent("Explain what this function does") == IntentType.EXPLAIN
    assert classify_intent("Trace the execution path from login") == IntentType.TRACE
    assert classify_intent("What is the impact of changing this?") == IntentType.IMPACT
    assert classify_intent("Is there a security vulnerability or attack path?") == IntentType.SECURITY
    assert classify_intent("Which tests should I run for this module?") == IntentType.TEST_IMPACT
    assert classify_intent("Why is this throwing an error, debug this") == IntentType.DEBUG
    assert classify_intent("How can I fix this issue?") == IntentType.FIX_RECOMMENDATION
    assert classify_intent("Generate a change safety report") == IntentType.CHANGE_SAFETY


def test_resolve_target():
    target = resolve_target("Explain AuthMiddleware", SAMPLE_NODES, SAMPLE_VULNS)
    assert target["id"] == "fn-auth"
    assert target["name"] == "AuthMiddleware"

    target_selected = resolve_target("Explain this", SAMPLE_NODES, SAMPLE_VULNS, selected_node_id="fn-router")
    assert target_selected["id"] == "fn-router"
    assert target_selected["name"] == "ProtectedRouter"


def test_read_only_tools():
    sym = tool_get_symbol("fn-auth", SAMPLE_NODES)
    assert sym is not None
    assert sym["name"] == "AuthMiddleware"

    search = tool_search_symbols("auth", SAMPLE_NODES)
    assert len(search) >= 2

    callers = tool_get_callers("fn-router", SAMPLE_EDGES)
    assert len(callers) == 1
    assert callers[0]["source"] == "fn-auth"

    callees = tool_get_callees("fn-auth", SAMPLE_EDGES)
    assert len(callees) == 1
    assert callees[0]["target"] == "fn-router"

    path = tool_trace_path("fn-test-auth", "fn-router", SAMPLE_EDGES)
    assert path["reachable"] is True
    assert len(path["path"]) == 3

    impact = tool_get_impact_analysis("fn-auth", SAMPLE_NODES, SAMPLE_EDGES, SAMPLE_VULNS)
    assert "fn-test-auth" in impact["direct_dependents"]
    assert impact["total_affected"] >= 1

    sec = tool_get_security_findings("fn-auth", SAMPLE_NODES, SAMPLE_VULNS)
    assert sec["total_findings"] == 1
    assert sec["findings"][0]["severity"] == "HIGH"

    tests = tool_get_related_tests("fn-auth", SAMPLE_NODES, SAMPLE_EDGES)
    assert tests["has_test_coverage"] is True
    assert "tests/test_auth.py" in tests["test_files"]


def test_change_safety_report():
    report = generate_change_safety_report(
        changed_files=["src/auth/middleware.py"],
        functional_nodes=SAMPLE_NODES,
        functional_edges=SAMPLE_EDGES,
        vulnerabilities=SAMPLE_VULNS,
    )
    assert "risk_level" in report
    assert report["blast_radius"]["total_components_affected"] >= 1
    assert report["security_findings"]["total_findings"] >= 1
    assert len(report["recommended_verification_steps"]) > 0


def test_build_evidence_package():
    target = {"id": "fn-auth", "type": "symbol", "name": "AuthMiddleware"}
    evidence = build_evidence_package(target, IntentType.EXPLAIN, SAMPLE_NODES, SAMPLE_EDGES, SAMPLE_VULNS)
    assert len(evidence) > 0
    assert evidence[0].evidence_id.startswith("E")
    assert evidence[0].confidence in {ConfidenceLevel.VERIFIED.value, ConfidenceLevel.SUPPORTED.value}


def test_api_change_safety_endpoint():
    client = TestClient(app)
    resp = client.post("/v1/analysis/change-safety", json={
        "changed_files": ["src/auth/middleware.py"],
        "nodes": SAMPLE_NODES,
        "edges": SAMPLE_EDGES,
        "vulnerabilities": SAMPLE_VULNS,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "risk_level" in data
    assert "blast_radius" in data


def test_api_tools_execute_endpoint():
    client = TestClient(app)
    resp = client.post("/v1/ai/tools/execute", json={
        "tool_name": "get_symbol",
        "arguments": {"symbol_id": "fn-auth"},
        "nodes": SAMPLE_NODES,
        "edges": SAMPLE_EDGES,
        "vulnerabilities": SAMPLE_VULNS,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["tool"] == "get_symbol"
    assert data["result"]["name"] == "AuthMiddleware"
