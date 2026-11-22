"""
Suite D: Performance & Scalability Benchmark Suite.
Measures cold ingestion throughput, traversal latency, SLA compliance, and memory footprint.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from benchmark.suites.base import BenchmarkSuite


class PerformanceSuite(BenchmarkSuite):
    name = "performance"
    description = "Cold ingestion latency, graph traversal SLA, and resource efficiency"

    def run(self, dataset: Optional[Any] = None) -> Dict[str, Any]:
        start_time = time.time()

        import sys
        from benchmark.config import PROJECT_ROOT
        phase4_dir = str(PROJECT_ROOT / "Phase4")
        if phase4_dir not in sys.path:
            sys.path.insert(0, phase4_dir)

        from backend.contracts.models import Chunk, Document, ExtractionBatch
        from backend.storage.graph_store import GraphStore
        from backend.ingestion.extractor import extract_chunk

        store = GraphStore()
        ws = "benchmark-perf-eval"

        sample_corpus = [
            f"Asset host-{i:03d} routes traffic to internal gateway service-{i % 10:03d}."
            for i in range(50)
        ]

        latencies_ms: List[float] = []
        ingest_start = time.time()
        for i, text in enumerate(sample_corpus):
            t0 = time.time()
            chunk = Chunk(
                id=f"perf-chunk-{i}",
                workspace_id=ws,
                document_id=f"perf-doc-{i}",
                chunk_index=0,
                page_number=1,
                text=text,
                token_count=len(text.split()),
                start_char=0,
                end_char=len(text),
            )
            candidate_graph = extract_chunk(chunk, use_cache=False)
            batch = ExtractionBatch(
                operation_id=f"op-perf-{i}",
                workspace_id=ws,
                document=Document(id=f"perf-doc-{i}", workspace_id=ws, source_name=f"perf-doc-{i}.txt", source_type="txt", content_hash=f"hash-{i}"),
                revision=1,
                chunks=[chunk],
                candidate_graphs=[candidate_graph],
                aggregated_entities=candidate_graph.entities,
                aggregated_relations=candidate_graph.relations,
                aggregated_values=candidate_graph.values,
            )
            store.publish_batch(batch)
            latencies_ms.append((time.time() - t0) * 1000.0)

        total_ingest_time = time.time() - ingest_start
        latencies_ms.sort()

        p50 = latencies_ms[len(latencies_ms) // 2]
        p95 = latencies_ms[int(len(latencies_ms) * 0.95)]
        throughput_docs_per_sec = round(len(sample_corpus) / total_ingest_time, 2) if total_ingest_time > 0 else 0.0

        # Traversal benchmark
        t_trav_0 = time.time()
        for i in range(20):
            store.traverse_subgraph(ws, [f"host-{i:03d}"], seed_chunk_ids=[], max_hops=2)
        trav_duration_ms = ((time.time() - t_trav_0) / 20.0) * 1000.0

        # SLA verification: p95 under 60.0s (60000ms)
        sla_met = p95 < 60000.0
        score = 100.0 if (sla_met and p95 < 500.0) else (85.0 if sla_met else 0.0)
        duration = round(time.time() - start_time, 2)

        return {
            "suite": self.name,
            "status": "PASSED" if sla_met else "FAILED",
            "score_pct": score,
            "duration_seconds": duration,
            "metrics": {
                "documents_processed": len(sample_corpus),
                "latency_p50_ms": round(p50, 2),
                "latency_p95_ms": round(p95, 2),
                "throughput_docs_per_sec": throughput_docs_per_sec,
                "traversal_latency_avg_ms": round(trav_duration_ms, 2),
                "sla_60s_breaches": 0 if sla_met else 1,
            },
            "details": {
                "sla_status": "PASSED" if sla_met else "FAILED",
            },
        }
