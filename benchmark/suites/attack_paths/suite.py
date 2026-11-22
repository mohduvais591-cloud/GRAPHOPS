"""
Suite B2: Attack Path Quality Benchmark Suite.
Measures attack path validity, exact match, false attack-path rate, and conditions.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from benchmark.suites.base import BenchmarkSuite
from benchmark.config import DATASETS_DIR
from benchmark.metrics.evaluators import evaluate_attack_paths


class AttackPathsSuite(BenchmarkSuite):
    name = "attack_paths"
    description = "Attack path traversal, edge validity, and false attack-path rate"

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
        from backend.services.attack_path_service import trace_attack_paths

        store = GraphStore()
        ws = "benchmark-attack-eval"

        pred_paths: List[List[str]] = []
        gt_verified_paths: List[List[str]] = []

        for gt_file in gt_dir.glob("*.json"):
            with open(gt_file, "r", encoding="utf-8") as f:
                record = json.load(f)

            if record.get("attack_paths"):
                for p in record["attack_paths"]:
                    gt_verified_paths.append([n.lower() for n in p])

            # Ingest into store
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

        # Traverse paths using trace_attack_paths
        for path in gt_verified_paths:
            if len(path) >= 2:
                src = path[0]
                res = trace_attack_paths(ws, src, max_depth=min(len(path), 6), store=store)
                for route in res.get("paths", []):
                    pred_paths.append([n.lower() for n in route.get("nodes", [])])

        eval_res = evaluate_attack_paths(pred_paths, gt_verified_paths)
        score = round(eval_res["f1"] * 100.0, 2)
        duration = round(time.time() - start_time, 2)

        status = "PASSED" if eval_res["false_attack_paths_count"] == 0 and score >= 20.0 else "FAILED"

        return {
            "suite": self.name,
            "status": status,
            "score_pct": score,
            "duration_seconds": duration,
            "metrics": eval_res,
            "details": {
                "verified_paths_evaluated": len(gt_verified_paths),
                "predicted_paths_found": len(pred_paths),
            },
        }
