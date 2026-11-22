"""
Suite B1: Extraction Quality Benchmark Suite.
Measures precision, recall, and F1 for entities and relationships against ground truth,
with canonical and alias resolution.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from benchmark.suites.base import BenchmarkSuite
from benchmark.config import DATASETS_DIR
from benchmark.metrics.evaluators import calculate_precision_recall_f1


class ExtractionSuite(BenchmarkSuite):
    name = "extraction"
    description = "Entity and relationship extraction precision, recall, and F1"

    def run(self, dataset: Optional[Any] = None) -> Dict[str, Any]:
        start_time = time.time()
        dataset_name = dataset or "v0.1"
        gt_dir = DATASETS_DIR / dataset_name / "ground_truth"

        if not gt_dir.exists():
            return {
                "suite": self.name,
                "status": "FAILED",
                "score_pct": 0.0,
                "duration_seconds": 0.0,
                "metrics": {},
                "details": {"error": f"Dataset {dataset_name} not found"},
            }

        import sys
        from benchmark.config import PROJECT_ROOT
        phase4_dir = str(PROJECT_ROOT / "Phase4")
        if phase4_dir not in sys.path:
            sys.path.insert(0, phase4_dir)

        from backend.contracts.models import Chunk
        from backend.ingestion.extractor import extract_chunk

        total_gt_entities = 0
        matched_gt_entities = 0
        total_pred_entities = 0
        valid_pred_entities = 0

        total_gt_relations = 0
        matched_gt_relations = 0
        total_pred_relations = 0
        valid_pred_relations = 0

        for gt_file in gt_dir.glob("*.json"):
            with open(gt_file, "r", encoding="utf-8") as f:
                record = json.load(f)

            doc_text = record["text"]
            chunk = Chunk(
                id=f"{record['id']}-chunk",
                workspace_id="benchmark",
                document_id=record["id"],
                chunk_index=0,
                page_number=1,
                text=doc_text,
                token_count=len(doc_text.split()),
                start_char=0,
                end_char=len(doc_text),
            )
            candidate_graph = extract_chunk(chunk, use_cache=False)

            pred_entity_names = {ent.name.lower() for ent in candidate_graph.entities}
            gt_entities = record.get("entities", [])
            total_gt_entities += len(gt_entities)
            total_pred_entities += len(pred_entity_names)

            # Check which GT entities were found (by name or alias)
            for gt_ent in gt_entities:
                allowed_names = {gt_ent["name"].lower()} | {a.lower() for a in gt_ent.get("aliases", [])}
                if pred_entity_names.intersection(allowed_names):
                    matched_gt_entities += 1

            # Check which predicted entities are valid (match some GT entity or alias)
            for p_name in pred_entity_names:
                for gt_ent in gt_entities:
                    allowed_names = {gt_ent["name"].lower()} | {a.lower() for a in gt_ent.get("aliases", [])}
                    if p_name in allowed_names or any(p_name in a or a in p_name for a in allowed_names):
                        valid_pred_entities += 1
                        break

            # Relations
            pred_rels = [
                (r.source_entity_name.lower(), r.predicate.upper(), r.target_entity_name.lower())
                for r in candidate_graph.relations
            ]
            gt_rels = record.get("relationships", [])
            total_gt_relations += len(gt_rels)
            total_pred_relations += len(pred_rels)

            for gt_r in gt_rels:
                src_names = {gt_r["source"].lower()}
                tgt_names = {gt_r["target"].lower()}
                for gt_e in gt_entities:
                    if gt_e["name"].lower() == gt_r["source"].lower():
                        src_names.update(a.lower() for a in gt_e.get("aliases", []))
                    if gt_e["name"].lower() == gt_r["target"].lower():
                        tgt_names.update(a.lower() for a in gt_e.get("aliases", []))

                found = False
                for p_src, p_pred, p_tgt in pred_rels:
                    if (p_src in src_names or any(s in p_src for s in src_names)) and \
                       (p_tgt in tgt_names or any(t in p_tgt for t in tgt_names)):
                        matched_gt_relations += 1
                        found = True
                        break

            for p_src, p_pred, p_tgt in pred_rels:
                for gt_r in gt_rels:
                    if gt_r["source"].lower() in p_src or p_src in gt_r["source"].lower():
                        valid_pred_relations += 1
                        break

        # Compute precision, recall, F1
        ent_prec = round(valid_pred_entities / total_pred_entities, 4) if total_pred_entities > 0 else 1.0
        ent_rec = round(matched_gt_entities / total_gt_entities, 4) if total_gt_entities > 0 else 0.0
        ent_f1 = round((2 * ent_prec * ent_rec) / (ent_prec + ent_rec), 4) if (ent_prec + ent_rec) > 0 else 0.0

        rel_prec = round(valid_pred_relations / total_pred_relations, 4) if total_pred_relations > 0 else 1.0
        rel_rec = round(matched_gt_relations / total_gt_relations, 4) if total_gt_relations > 0 else 0.0
        rel_f1 = round((2 * rel_prec * rel_rec) / (rel_prec + rel_rec), 4) if (rel_prec + rel_rec) > 0 else 0.0

        score = round(((ent_f1 * 0.5) + (rel_f1 * 0.5)) * 100.0, 2)
        duration = round(time.time() - start_time, 2)

        return {
            "suite": self.name,
            "status": "PASSED" if score >= 30.0 else "FAILED",
            "score_pct": score,
            "duration_seconds": duration,
            "metrics": {
                "entity_precision": ent_prec,
                "entity_recall": ent_rec,
                "entity_f1": ent_f1,
                "relationship_precision": rel_prec,
                "relationship_recall": rel_rec,
                "relationship_f1": rel_f1,
                "combined_extraction_score": score,
            },
            "details": {
                "total_gt_entities": total_gt_entities,
                "matched_gt_entities": matched_gt_entities,
                "total_pred_entities": total_pred_entities,
                "total_gt_relationships": total_gt_relations,
                "matched_gt_relationships": matched_gt_relations,
            },
        }
