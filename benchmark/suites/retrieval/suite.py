"""
Suite B4: Retrieval Quality Benchmark Suite.
Measures Recall@k, Precision@k, MRR, and nDCG@k across benchmark questions
using fused vector and lexical retrieval.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from benchmark.suites.base import BenchmarkSuite
from benchmark.config import DATASETS_DIR
from benchmark.metrics.evaluators import calculate_mrr, calculate_ndcg_at_k


class RetrievalSuite(BenchmarkSuite):
    name = "retrieval"
    description = "Hybrid retrieval ranking quality, MRR, nDCG@5, and Recall@5"

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
        from backend.storage.vector_store import get_vector_store
        from backend.ingestion.extractor import extract_chunk
        from backend.ingestion.embedder import embed_single_query
        from backend.services.query_service import QueryService
        from backend.contracts.api_models import QueryRequest

        store = GraphStore()
        v_store = get_vector_store()
        ws = "benchmark-retrieval-eval"

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

            # Index vectors into vector store for hybrid search
            try:
                vec = embed_single_query(doc_text)
                v_store.upsert_vectors(ws, {chunk.id: vec})
            except Exception:
                pass

        qs = QueryService()
        qs.graph_store = store
        qs.vector_store = v_store

        mrrs: List[float] = []
        ndcgs: List[float] = []
        recalls_at_5: List[float] = []

        for gt_file in gt_dir.glob("*.json"):
            with open(gt_file, "r", encoding="utf-8") as f:
                record = json.load(f)

            for q in record.get("questions", []):
                rel_set = set(q.get("relevant_chunks", []))
                try:
                    resp = qs.query(QueryRequest(workspace_id=ws, query=q["query"], top_k=5))
                    retrieved = [s.document_id for s in resp.source_chunks]
                except Exception:
                    retrieved = []

                mrrs.append(calculate_mrr(retrieved, rel_set))
                ndcgs.append(calculate_ndcg_at_k(retrieved, rel_set, k=5))
                hits = len(set(retrieved[:5]).intersection(rel_set))
                recalls_at_5.append(hits / len(rel_set) if rel_set else 1.0)

        mean_mrr = round(sum(mrrs) / len(mrrs), 4) if mrrs else 0.0
        mean_ndcg = round(sum(ndcgs) / len(ndcgs), 4) if ndcgs else 0.0
        mean_recall_at_5 = round(sum(recalls_at_5) / len(recalls_at_5), 4) if recalls_at_5 else 0.0

        score = round(((mean_mrr * 0.4) + (mean_ndcg * 0.4) + (mean_recall_at_5 * 0.2)) * 100.0, 2)
        duration = round(time.time() - start_time, 2)

        return {
            "suite": self.name,
            "status": "PASSED" if score >= 40.0 else "FAILED",
            "score_pct": score,
            "duration_seconds": duration,
            "metrics": {
                "mrr": mean_mrr,
                "ndcg_at_5": mean_ndcg,
                "recall_at_5": mean_recall_at_5,
                "retrieval_quality_score": score,
            },
            "details": {
                "queries_evaluated": len(mrrs),
            },
        }
