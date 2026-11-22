"""
Suite B3: Evidence & Citations Benchmark Suite.
Measures citation accuracy, coverage, unsupported claim rate, and fabricated citations.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from benchmark.suites.base import BenchmarkSuite
from benchmark.config import DATASETS_DIR
from benchmark.metrics.evaluators import evaluate_citations


class CitationsSuite(BenchmarkSuite):
    name = "citations"
    description = "Evidence grounding, citation precision, coverage, and hallucination detection"

    def run(self, dataset: Optional[Any] = None) -> Dict[str, Any]:
        start_time = time.time()
        dataset_name = dataset or "v0.1"
        gt_dir = DATASETS_DIR / dataset_name / "ground_truth"

        import sys
        from benchmark.config import PROJECT_ROOT
        phase4_dir = str(PROJECT_ROOT / "Phase4")
        if phase4_dir not in sys.path:
            sys.path.insert(0, phase4_dir)

        from backend.contracts.models import Chunk, Document, ExtractionBatch
        from backend.storage.graph_store import GraphStore
        from backend.ingestion.extractor import extract_chunk
        from backend.services.query_service import QueryService
        from backend.contracts.api_models import QueryRequest

        store = GraphStore()
        ws = "benchmark-citation-eval"

        gt_sources: Dict[str, Set[str]] = {}
        claims: List[Dict[str, Any]] = []

        # Populate knowledge base
        for gt_file in gt_dir.glob("*.json"):
            with open(gt_file, "r", encoding="utf-8") as f:
                record = json.load(f)

            doc_id = record["id"]
            doc_text = record["text"]
            chunk = Chunk(
                id=f"{doc_id}-chunk",
                workspace_id=ws,
                document_id=doc_id,
                chunk_index=0,
                page_number=1,
                text=doc_text,
                token_count=len(doc_text.split()),
                start_char=0,
                end_char=len(doc_text),
            )
            candidate_graph = extract_chunk(chunk, use_cache=False)
            batch = ExtractionBatch(
                operation_id=f"op-{doc_id}",
                workspace_id=ws,
                document=Document(id=doc_id, workspace_id=ws, source_name=f"{doc_id}.txt", source_type="txt", content_hash=doc_id),
                revision=1,
                chunks=[chunk],
                candidate_graphs=[candidate_graph],
                aggregated_entities=candidate_graph.entities,
                aggregated_relations=candidate_graph.relations,
                aggregated_values=candidate_graph.values,
            )
            store.publish_batch(batch)

            for idx, q in enumerate(record.get("questions", [])):
                claim_id = f"{doc_id}-q{idx}"
                gt_sources[claim_id] = set(q.get("relevant_chunks", []))
                qs = QueryService()
                qs.graph_store = store
                try:
                    resp = qs.query(QueryRequest(workspace_id=ws, query=q["query"]))
                    cited = [s.document_id for s in resp.source_chunks]
                except Exception:
                    cited = []
                claims.append({
                    "claim_id": claim_id,
                    "cited_chunk_ids": cited,
                })

        eval_res = evaluate_citations(claims, gt_sources)
        score = round(eval_res["citation_precision"] * 100.0, 2)
        duration = round(time.time() - start_time, 2)

        status = "PASSED" if eval_res["fabricated_count"] == 0 and score >= 50.0 else "FAILED"

        return {
            "suite": self.name,
            "status": status,
            "score_pct": score,
            "duration_seconds": duration,
            "metrics": eval_res,
            "details": {
                "claims_evaluated": len(claims),
            },
        }
