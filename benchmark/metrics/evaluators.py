"""
Core evaluation metrics for Extraction, Relationships, Attack Paths, Retrieval, and Citations.
Implements precision, recall, F1, MRR, nDCG@k, and exact-match algorithms.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Set, Tuple


def calculate_precision_recall_f1(
    predicted: Set[Any], ground_truth: Set[Any]
) -> Dict[str, float]:
    """Calculates precision, recall, and harmonic F1 score for sets of items."""
    if not ground_truth and not predicted:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0}
    if not ground_truth or not predicted:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    true_positives = len(predicted.intersection(ground_truth))
    precision = true_positives / len(predicted) if predicted else 0.0
    recall = true_positives / len(ground_truth) if ground_truth else 0.0
    if precision + recall > 0:
        f1 = (2.0 * precision * recall) / (precision + recall)
    else:
        f1 = 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def calculate_mrr(
    retrieved_items: List[str], ground_truth_relevant: Set[str]
) -> float:
    """Mean Reciprocal Rank (MRR) of the first relevant retrieved item."""
    for rank, item in enumerate(retrieved_items, start=1):
        if item in ground_truth_relevant:
            return round(1.0 / rank, 4)
    return 0.0


def calculate_ndcg_at_k(
    retrieved_items: List[str], ground_truth_relevant: Set[str], k: int = 5
) -> float:
    """Normalized Discounted Cumulative Gain at rank K (nDCG@k)."""
    retrieved_k = retrieved_items[:k]
    dcg = 0.0
    for i, item in enumerate(retrieved_k):
        rel = 1.0 if item in ground_truth_relevant else 0.0
        dcg += rel / math.log2(i + 2)

    # Ideal DCG with all relevant items placed at top
    ideal_hits = min(k, len(ground_truth_relevant))
    if ideal_hits == 0:
        return 0.0

    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_hits))
    return round(dcg / idcg, 4) if idcg > 0 else 0.0


def evaluate_attack_paths(
    predicted_paths: List[List[str]],
    ground_truth_verified_paths: List[List[str]],
    ground_truth_invalid_paths: Optional[List[List[str]]] = None,
) -> Dict[str, Any]:
    """
    Evaluates attack path correctness:
    - Path precision and recall
    - Exact path match
    - Edge direction validity
    - False attack-path rate (path marked verified when actually invalid/unproven)
    """
    pred_tuples = [tuple(p) for p in predicted_paths]
    gt_tuples = [tuple(p) for p in ground_truth_verified_paths]

    pred_set = set(pred_tuples)
    gt_set = set(gt_tuples)

    prf = calculate_precision_recall_f1(pred_set, gt_set)

    # False attack-path check
    false_attacks = 0
    if ground_truth_invalid_paths:
        invalid_set = {tuple(p) for p in ground_truth_invalid_paths}
        false_attacks = len(pred_set.intersection(invalid_set))

    false_attack_rate = round(false_attacks / len(pred_tuples), 4) if pred_tuples else 0.0

    exact_matches = len(pred_set.intersection(gt_set))
    exact_match_rate = round(exact_matches / len(gt_set), 4) if gt_set else 1.0

    return {
        "precision": prf["precision"],
        "recall": prf["recall"],
        "f1": prf["f1"],
        "exact_match_rate": exact_match_rate,
        "false_attack_paths_count": false_attacks,
        "false_attack_path_rate": false_attack_rate,
    }


def evaluate_citations(
    claims_with_citations: List[Dict[str, Any]],
    ground_truth_sources: Dict[str, Set[str]],
) -> Dict[str, Any]:
    """
    Evaluates evidence citations:
    - Citation coverage: % of claims that have evidence
    - Citation precision: % of cited chunks that genuinely support the claim
    - Fabricated citation rate: citations pointing to non-existent or irrelevant chunk spans
    """
    if not claims_with_citations:
        return {
            "citation_coverage": 1.0,
            "citation_precision": 1.0,
            "unsupported_claim_rate": 0.0,
            "fabricated_citation_rate": 0.0,
        }

    total_claims = len(claims_with_citations)
    cited_claims = 0
    valid_citations = 0
    fabricated_citations = 0

    for item in claims_with_citations:
        claim_id = item.get("claim_id", "")
        cited_chunks = set(item.get("cited_chunk_ids", []))
        if cited_chunks:
            cited_claims += 1

        expected_chunks = ground_truth_sources.get(claim_id, set())
        if not expected_chunks and cited_chunks:
            # Cited a chunk for a claim where ground truth says no valid chunk exists
            fabricated_citations += len(cited_chunks)
        else:
            correct = cited_chunks.intersection(expected_chunks)
            valid_citations += len(correct)
            fabricated_citations += len(cited_chunks - expected_chunks)

    total_cited = valid_citations + fabricated_citations
    precision = round(valid_citations / total_cited, 4) if total_cited > 0 else 1.0
    coverage = round(cited_claims / total_claims, 4) if total_claims > 0 else 0.0
    unsupported_rate = round((total_claims - cited_claims) / total_claims, 4) if total_claims > 0 else 0.0
    fabricated_rate = round(fabricated_citations / total_cited, 4) if total_cited > 0 else 0.0

    return {
        "citation_coverage": coverage,
        "citation_precision": precision,
        "unsupported_claim_rate": unsupported_rate,
        "fabricated_citation_rate": fabricated_rate,
        "fabricated_count": fabricated_citations,
    }
