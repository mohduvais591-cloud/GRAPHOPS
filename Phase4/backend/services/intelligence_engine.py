"""
AegisGraph AI — Intelligence Engine & Grounded Analytical Tools.
Implements question intent classification, target resolution, evidence objects,
read-only graph analysis tools, Change Safety Reports, and structured grounding.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple


class IntentType(str, Enum):
    EXPLAIN = "EXPLAIN"
    TRACE = "TRACE"
    IMPACT = "IMPACT"
    SECURITY = "SECURITY"
    TEST_IMPACT = "TEST_IMPACT"
    DEBUG = "DEBUG"
    FIX_RECOMMENDATION = "FIX_RECOMMENDATION"
    GRAPH_EXPLANATION = "GRAPH_EXPLANATION"
    COMPARISON = "COMPARISON"
    CHANGE_SAFETY = "CHANGE_SAFETY"
    GENERAL_REPOSITORY_QUESTION = "GENERAL_REPOSITORY_QUESTION"


class EvidenceCategory(str, Enum):
    SOURCE_CODE = "SOURCE_CODE"
    GRAPH_RELATIONSHIP = "GRAPH_RELATIONSHIP"
    STATIC_FINDING = "STATIC_FINDING"
    GIT_CHANGE = "GIT_CHANGE"
    TEST_RESULT = "TEST_RESULT"
    COVERAGE_DATA = "COVERAGE_DATA"
    DOCUMENTATION = "DOCUMENTATION"
    USER_SELECTED_CONTEXT = "USER_SELECTED_CONTEXT"
    AI_INFERENCE = "AI_INFERENCE"


class ConfidenceLevel(str, Enum):
    VERIFIED = "verified"          # Directly backed by AST, parser, graph, or scanner
    SUPPORTED = "supported"        # Strongly inferred from static structure
    AI_INFERENCE = "ai_inference"  # AI synthesis / hypothesis
    UNKNOWN = "unknown"            # Missing evidence


@dataclass
class EvidenceObject:
    evidence_id: str
    category: str
    claim: str
    source: Dict[str, Any]       # {"file": str, "line_start": int, "line_end": int}
    relationship: Optional[Dict[str, str]] = None  # {"from": str, "to": str, "type": str}
    confidence: str = ConfidenceLevel.VERIFIED.value
    origin: str = "static_analysis"


# ==============================================================================
# 1. Intent Classification & Target Resolution
# ==============================================================================

def classify_intent(query: str, has_node: bool = False, has_finding: bool = False) -> IntentType:
    """Classifies user question into structured intent categories."""
    q = query.lower()

    if any(k in q for k in ("diff", "safety report", "commit", "pr change", "pull request")):
        return IntentType.CHANGE_SAFETY
    if any(k in q for k in ("vuln", "security", "exploit", "cve", "threat", "injection", "xss", "rce")):
        return IntentType.SECURITY
    if any(k in q for k in ("impact", "affect", "break", "blast radius", "depend on", "downstream")):
        return IntentType.IMPACT
    if any(k in q for k in ("trace", "path", "route", "flow from", "flow through", "reach")):
        return IntentType.TRACE
    if any(k in q for k in ("test", "coverage", "spec", "unit test", "e2e")):
        return IntentType.TEST_IMPACT
    if any(k in q for k in ("debug", "error", "exception", "crash", "failure", "traceback")):
        return IntentType.DEBUG
    if any(k in q for k in ("fix", "remediate", "patch", "how to resolve", "refactor")):
        return IntentType.FIX_RECOMMENDATION
    if any(k in q for k in ("graph", "node", "edge", "neighbor", "subgraph")):
        return IntentType.GRAPH_EXPLANATION
    if any(k in q for k in ("compare", "difference between", "versus", "vs")):
        return IntentType.COMPARISON
    if has_node or any(k in q for k in ("what does", "explain", "how does", "purpose of", "role")):
        return IntentType.EXPLAIN

    return IntentType.GENERAL_REPOSITORY_QUESTION


def resolve_target(
    query: str,
    nodes: List[Dict[str, Any]],
    vulnerabilities: List[Dict[str, Any]],
    selected_node_id: Optional[str] = None,
    selected_finding_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolves focal node or finding from explicit selections or query mentions."""
    # 1. Explicit selection
    if selected_node_id:
        node = next((n for n in nodes if n.get("id") == selected_node_id), None)
        if node:
            return {"type": "node", "id": node["id"], "name": node["name"], "data": node}

    if selected_finding_id:
        vuln = next((v for v in vulnerabilities if v.get("id") == selected_finding_id), None)
        if vuln:
            return {"type": "finding", "id": vuln["id"], "name": vuln["title"], "data": vuln}

    # 2. Query name matching
    q_lower = query.lower()
    for n in nodes:
        name_lower = n.get("name", "").lower()
        if name_lower and (name_lower in q_lower or n.get("id", "").lower() in q_lower):
            return {"type": "node", "id": n["id"], "name": n["name"], "data": n}

    for v in vulnerabilities:
        title_lower = v.get("title", "").lower()
        if title_lower and (title_lower in q_lower or v.get("file", "").lower() in q_lower):
            return {"type": "finding", "id": v["id"], "name": v["title"], "data": v}

    return {"type": "repository", "id": None, "name": "Repository", "data": None}


# ==============================================================================
# 2. Read-Only Analytical Tools
# ==============================================================================

def tool_get_symbol(node_id: str, nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Retrieves definition and locations for a specific symbol/functional node."""
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return {"error": f"Symbol/Node '{node_id}' not found."}
    return {
        "id": node["id"],
        "name": node["name"],
        "category": node["category"],
        "summary": node["summary"],
        "locations": node.get("locations", []),
    }


def tool_search_symbols(query: str, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Searches functional nodes by name, summary, or file path."""
    q = query.lower()
    matches = []
    for n in nodes:
        name = n.get("name", "").lower()
        summary = n.get("summary", "").lower()
        files = [loc.get("file", "").lower() for loc in n.get("locations", [])]
        if q in name or q in summary or any(q in f for f in files):
            matches.append({
                "id": n["id"],
                "name": n["name"],
                "category": n["category"],
                "summary": n["summary"],
                "primary_file": n.get("locations", [{}])[0].get("file", ""),
            })
    return matches[:10]


def tool_get_callers(node_id: str, edges: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Finds direct callers / incoming relationships to this node."""
    callers = []
    for e in edges:
        if e.get("target") == node_id:
            callers.append({
                "source": e["source"],
                "relationship": e["relationship"],
            })
    return callers


def tool_get_callees(node_id: str, edges: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Finds outgoing calls / dependencies dispatched from this node."""
    callees = []
    for e in edges:
        if e.get("source") == node_id:
            callees.append({
                "target": e["target"],
                "relationship": e["relationship"],
            })
    return callees


def tool_trace_path(source_id: str, target_id: str, edges: List[Dict[str, Any]], max_depth: int = 5) -> List[List[str]]:
    """Traces directed paths between two nodes using BFS up to max_depth."""
    if source_id == target_id:
        return [[source_id]]

    adj: Dict[str, List[str]] = {}
    for e in edges:
        src = e.get("source")
        dst = e.get("target")
        if src and dst:
            adj.setdefault(src, []).append(dst)

    paths: List[List[str]] = []
    queue: List[Tuple[str, List[str]]] = [(source_id, [source_id])]

    while queue and len(paths) < 5:
        curr, path = queue.pop(0)
        if len(path) > max_depth:
            continue
        for neighbor in adj.get(curr, []):
            if neighbor == target_id:
                paths.append(path + [neighbor])
            elif neighbor not in path:
                queue.append((neighbor, path + [neighbor]))

    return {
        "reachable": len(paths) > 0,
        "paths": paths,
        "path": paths[0] if paths else [],
    }


def tool_get_impact_analysis(
    node_id: str,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    vulnerabilities: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Computes deterministic blast radius: direct & indirect dependents, affected routes, and findings."""
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return {"error": f"Node '{node_id}' not found."}

    # Upstream dependents (nodes that call or depend on this node)
    incoming_map: Dict[str, List[Dict[str, str]]] = {}
    for e in edges:
        dst = e.get("target")
        src = e.get("source")
        if dst and src:
            incoming_map.setdefault(dst, []).append(e)

    direct_dependents: Set[str] = set()
    indirect_dependents: Set[str] = set()

    # Level 1 (Direct)
    for e in incoming_map.get(node_id, []):
        direct_dependents.add(e["source"])

    # Level 2 (Indirect)
    for direct_id in list(direct_dependents):
        for e in incoming_map.get(direct_id, []):
            if e["source"] != node_id and e["source"] not in direct_dependents:
                indirect_dependents.add(e["source"])

    # Files affected
    all_affected_nodes = {node_id} | direct_dependents | indirect_dependents
    affected_files: Set[str] = set()
    for n in nodes:
        if n["id"] in all_affected_nodes:
            for loc in n.get("locations", []):
                if loc.get("file"):
                    affected_files.add(loc["file"])

    # Security findings in affected files
    related_vulns = [v for v in vulnerabilities if v.get("file") in affected_files]

    return {
        "target_node": {"id": node["id"], "name": node["name"], "category": node["category"]},
        "direct_dependents": list(direct_dependents),
        "indirect_dependents": list(indirect_dependents),
        "total_blast_radius_nodes": len(all_affected_nodes),
        "total_affected": len(all_affected_nodes),
        "affected_files": list(affected_files),
        "related_vulnerabilities_count": len(related_vulns),
        "related_vulnerabilities": related_vulns[:5],
    }


def tool_get_security_findings(
    node_id: str,
    arg2: Any = None,
    arg3: Any = None,
    nodes: Optional[List[Dict[str, Any]]] = None,
    vulnerabilities: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Retrieves security findings associated with a node's files."""
    # Resolve nodes and vulns from either positional or keyword arguments
    resolved_nodes = nodes or (arg2 if isinstance(arg2, list) and arg2 and "locations" in arg2[0] else None) or (arg3 if isinstance(arg3, list) and arg3 and "locations" in arg3[0] else None) or []
    resolved_vulns = vulnerabilities or (arg2 if isinstance(arg2, list) and (not arg2 or "severity" in arg2[0]) else None) or (arg3 if isinstance(arg3, list) and (not arg3 or "severity" in arg3[0]) else None) or []

    node = next((n for n in resolved_nodes if n.get("id") == node_id), None)
    if not node:
        return {"total_findings": 0, "findings": []}
    node_files = {loc.get("file") for loc in node.get("locations", []) if loc.get("file")}
    matched = [v for v in resolved_vulns if v.get("file") in node_files]
    return {
        "total_findings": len(matched),
        "findings": matched,
    }


def tool_get_related_tests(node_id: str, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Identifies test components associated with the target node."""
    node = next((n for n in nodes if n.get("id") == node_id), None)
    if not node:
        return {"tests_identified": [], "test_files": [], "has_test_coverage": False}

    node_files = [loc.get("file", "") for loc in node.get("locations", [])]
    test_files: List[str] = []

    # 1. Graph edge relations (e.g. TESTS, TESTED_BY)
    for e in edges:
        rel = e.get("relationship", "").upper()
        if (e.get("target") == node_id and rel in ("TESTS", "TESTED_BY")) or \
           (e.get("source") == node_id and rel in ("TESTS", "TESTED_BY")):
            other_id = e.get("source") if e.get("target") == node_id else e.get("target")
            other_node = next((n for n in nodes if n.get("id") == other_id), None)
            if other_node:
                for loc in other_node.get("locations", []):
                    if loc.get("file"):
                        test_files.append(loc["file"])

    # 2. Look for matching test files e.g. test_auth.py for auth.py
    for f in node_files:
        base = os.path.basename(f)
        name, ext = os.path.splitext(base)
        test_patterns = [f"test_{name}{ext}", f"{name}.test{ext}", f"{name}.spec{ext}"]
        for n2 in nodes:
            for loc in n2.get("locations", []):
                f2 = loc.get("file", "")
                if any(p in f2 for p in test_patterns):
                    test_files.append(f2)

    has_coverage = len(test_files) > 0
    unique_tests = list(set(test_files))
    return {
        "target_node": node.get("name"),
        "tests_identified": unique_tests,
        "test_files": unique_tests,
        "has_test_coverage": has_coverage,
        "note": "Verified through test-file naming heuristics; no unit tests detected for this component." if not has_coverage else "Related test files located.",
    }


# ==============================================================================
# 3. Change Safety Report Generator
# ==============================================================================

def generate_change_safety_report(
    changed_files: List[str],
    nodes: Optional[List[Dict[str, Any]]] = None,
    edges: Optional[List[Dict[str, Any]]] = None,
    vulnerabilities: Optional[List[Dict[str, Any]]] = None,
    functional_nodes: Optional[List[Dict[str, Any]]] = None,
    functional_edges: Optional[List[Dict[str, Any]]] = None,
    diff_text: str = "",
) -> Dict[str, Any]:
    """
    Computes a comprehensive Change Safety Report for a set of changed files / Git diff.
    """
    nodes = nodes if nodes is not None else (functional_nodes or [])
    edges = edges if edges is not None else (functional_edges or [])
    vulnerabilities = vulnerabilities if vulnerabilities is not None else []
    # 1. Map changed files to functional nodes
    changed_set = set(f.replace("\\", "/").strip() for f in changed_files if f.strip())
    directly_impacted_nodes: List[Dict[str, Any]] = []

    for n in nodes:
        node_files = set(loc.get("file", "").replace("\\", "/") for loc in n.get("locations", []))
        if node_files & changed_set:
            directly_impacted_nodes.append(n)

    # 2. Compute downstream blast radius (nodes that depend on directly impacted nodes)
    direct_ids = {n["id"] for n in directly_impacted_nodes}
    indirect_ids: Set[str] = set()

    for e in edges:
        if e.get("target") in direct_ids and e.get("source") not in direct_ids:
            indirect_ids.add(e["source"])

    indirect_nodes = [n for n in nodes if n["id"] in indirect_ids]

    # 3. Security findings in changed & dependent files
    all_blast_ids = direct_ids | indirect_ids
    all_blast_files: Set[str] = set(changed_set)
    for n in nodes:
        if n["id"] in all_blast_ids:
            for loc in n.get("locations", []):
                if loc.get("file"):
                    all_blast_files.add(loc["file"].replace("\\", "/"))

    relevant_vulns = [
        v for v in vulnerabilities
        if v.get("file", "").replace("\\", "/") in all_blast_files
    ]

    # 4. Test gaps
    tests_identified: List[str] = []
    for f in changed_set:
        base = os.path.basename(f)
        name, ext = os.path.splitext(base)
        for n in nodes:
            for loc in n.get("locations", []):
                f2 = loc.get("file", "")
                if f"test_{name}" in f2 or f"{name}.test" in f2 or f"{name}.spec" in f2:
                    tests_identified.append(f2)

    has_test_coverage = len(tests_identified) > 0

    # Risk level heuristic (transparently labeled)
    critical_vulns = [v for v in relevant_vulns if v.get("severity") == "CRITICAL"]
    if critical_vulns or len(indirect_nodes) > 4:
        risk_level = "ELEVATED RISK"
        risk_rationale = f"Affects {len(direct_ids)} direct and {len(indirect_ids)} downstream components, with {len(critical_vulns)} CRITICAL vulnerabilities in the blast radius."
    elif indirect_nodes or not has_test_coverage:
        risk_level = "MODERATE RISK"
        risk_rationale = f"Downstream dependents identified ({len(indirect_nodes)} components). Test coverage should be verified."
    else:
        risk_level = "LOW RISK"
        risk_rationale = "Self-contained modification with no high-severity vulnerabilities identified in the dependency path."

    return {
        "report_type": "change_safety_report",
        "changed_files_count": len(changed_set),
        "changed_files": list(changed_set),
        "risk_level": risk_level,
        "risk_rationale": risk_rationale,
        "blast_radius": {
            "directly_impacted_nodes": [{"id": n["id"], "name": n["name"], "category": n["category"]} for n in directly_impacted_nodes],
            "indirectly_impacted_nodes": [{"id": n["id"], "name": n["name"], "category": n["category"]} for n in indirect_nodes],
            "total_components_affected": len(all_blast_ids),
        },
        "security_findings": {
            "total_findings": len(relevant_vulns),
            "critical_count": len(critical_vulns),
            "findings": relevant_vulns[:6],
        },
        "test_impact": {
            "has_tests_identified": has_test_coverage,
            "tests_identified": list(set(tests_identified)),
            "coverage_note": "Tests identified for changed components." if has_test_coverage else "No related unit tests identified by current repository analysis.",
        },
        "recommended_verification_steps": [
            f"Run regression tests on downstream callers: {', '.join(n['name'] for n in indirect_nodes[:3]) or 'None'}.",
            f"Verify that modifications do not trigger known security vulnerabilities in {', '.join(v['file'] for v in relevant_vulns[:2]) or 'changed files'}.",
            "Perform manual functional smoke testing on the primary user-facing entry points.",
        ],
        "limitations": [
            "Exploitability of static security findings is not verified at runtime.",
            "Dynamic runtime dependency injection is not traced beyond static import/call graph.",
        ],
    }


# ==============================================================================
# 4. Evidence Package Builder
# ==============================================================================

def build_evidence_package(
    target: Dict[str, Any],
    intent: IntentType,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    vulnerabilities: List[Dict[str, Any]],
) -> List[EvidenceObject]:
    """Generates structured evidence objects (E001, E002, ...) with confidence ratings."""
    evidence_list: List[EvidenceObject] = []
    counter = 1

    # Evidence from target node
    if target["type"] == "node" and target.get("data"):
        n = target["data"]
        for loc in n.get("locations", [])[:3]:
            evidence_list.append(EvidenceObject(
                evidence_id=f"E{counter:03d}",
                category=EvidenceCategory.SOURCE_CODE.value,
                claim=f"Component '{n['name']}' is defined and located in source code.",
                source={"file": loc.get("file", ""), "line_start": loc.get("start_line", 1), "line_end": loc.get("end_line", 1)},
                confidence=ConfidenceLevel.VERIFIED.value,
                origin="ast_parser",
            ))
            counter += 1

        # Relationships
        for e in edges:
            if e.get("source") == n["id"] or e.get("target") == n["id"]:
                evidence_list.append(EvidenceObject(
                    evidence_id=f"E{counter:03d}",
                    category=EvidenceCategory.GRAPH_RELATIONSHIP.value,
                    claim=f"'{e['source']}' {e['relationship']} '{e['target']}'",
                    source={"file": n.get("locations", [{}])[0].get("file", ""), "line_start": 1, "line_end": 1},
                    relationship={"from": e["source"], "to": e["target"], "type": e["relationship"]},
                    confidence=ConfidenceLevel.VERIFIED.value,
                    origin="graph_store",
                ))
                counter += 1

    # Evidence from target finding
    elif target["type"] == "finding" and target.get("data"):
        v = target["data"]
        evidence_list.append(EvidenceObject(
            evidence_id=f"E{counter:03d}",
            category=EvidenceCategory.STATIC_FINDING.value,
            claim=f"Static scanner detected {v.get('severity')} issue: {v.get('title')}",
            source={"file": v.get("file", ""), "line_start": v.get("line", 1), "line_end": v.get("line", 1)},
            confidence=ConfidenceLevel.VERIFIED.value,
            origin="static_analysis_scanner",
        ))
        counter += 1

    # General graph evidence if list is empty
    if not evidence_list:
        for n in nodes[:3]:
            loc = n.get("locations", [{}])[0]
            evidence_list.append(EvidenceObject(
                evidence_id=f"E{counter:03d}",
                category=EvidenceCategory.SOURCE_CODE.value,
                claim=f"Functional node '{n['name']}' registered in repository architecture.",
                source={"file": loc.get("file", ""), "line_start": loc.get("start_line", 1), "line_end": loc.get("end_line", 1)},
                confidence=ConfidenceLevel.VERIFIED.value,
                origin="functional_graph",
            ))
            counter += 1

    return evidence_list[:12]
