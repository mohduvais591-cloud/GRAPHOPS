"""
Benchmark Runner and Orchestration Engine.
Coordinates execution across suites, records telemetry, and outputs reports.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from benchmark.config import BASELINE_DIR, HISTORY_DIR, PROJECT_ROOT, REGRESSION_THRESHOLDS
from benchmark.registry import SUITE_REGISTRY, get_suite
from benchmark.reports.html_reporter import generate_html_report
from benchmark.reports.json_reporter import write_json_report
from benchmark.reports.markdown_reporter import generate_markdown_summary
from benchmark.scoring.scorer import BenchmarkScorer


def get_environment_info() -> Dict[str, Any]:
    """Captures environment metadata."""
    import platform
    import subprocess
    commit = "unknown"
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0:
            commit = res.stdout.strip()
    except Exception:
        pass

    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "git_commit": commit,
    }


class BenchmarkRunner:
    """Orchestrates benchmark executions and outputs reports."""

    def __init__(self, output_dir: Optional[Path | str] = None):
        self.output_dir = Path(output_dir) if output_dir else HISTORY_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)
        BASELINE_DIR.mkdir(parents=True, exist_ok=True)

    def run_benchmark(
        self,
        suites: Optional[List[str]] = None,
        dataset: str = "v0.1",
        output_format: str = "all",
    ) -> Dict[str, Any]:
        """Executes selected or all benchmark suites."""
        suite_names = suites or list(SUITE_REGISTRY.keys())
        run_id = f"run-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

        print("=" * 70)
        print(" GRAPHOPS Independent Benchmark Engine")
        print(f" Run ID  : {run_id}")
        print(f" Dataset : {dataset}")
        print(f" Suites  : {', '.join(suite_names)}")
        print("=" * 70 + "\n")

        start_total = time.time()
        suite_results: Dict[str, Any] = {}

        for sname in suite_names:
            print(f">>> Running Suite: {sname}...")
            suite_inst = get_suite(sname)
            t0 = time.time()
            res = suite_inst.run(dataset=dataset)
            dur = round(time.time() - t0, 2)
            suite_results[sname] = res
            status_str = f"[{res['status']}]"
            print(f"    {status_str} Score: {res.get('score_pct', 0.0):.1f}% in {dur}s")

        total_duration = round(time.time() - start_total, 2)

        scorer = BenchmarkScorer()
        composite_score, breakdown, violations = scorer.compute_composite_score(suite_results)

        success = (
            len(violations) == 0
            and all(s.get("status") == "PASSED" for s in suite_results.values())
        )

        record: Dict[str, Any] = {
            "run_id": run_id,
            "dataset_name": dataset,
            "success": success,
            "total_duration_seconds": total_duration,
            "environment": get_environment_info(),
            "scoring": {
                "composite_score_pct": composite_score,
                "breakdown": breakdown,
                "weights": scorer.weights,
                "hard_gate_violations": violations,
            },
            "suites": suite_results,
        }

        # Save artifacts
        json_file = self.output_dir / f"{run_id}.json"
        write_json_report(record, json_file)

        if output_format in {"all", "markdown"}:
            md_content = generate_markdown_summary(record)
            md_file = self.output_dir / f"{run_id}.md"
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(md_content)

        if output_format in {"all", "html"}:
            html_content = generate_html_report(record)
            html_file = self.output_dir / f"{run_id}.html"
            with open(html_file, "w", encoding="utf-8") as f:
                f.write(html_content)

        # Print Scorecard
        print("\n" + "=" * 70)
        print(" BENCHMARK EVALUATION SCORECARD")
        print("=" * 70)
        print(f" Composite Quality Score : {composite_score:.2f}%")
        print(f" Overall Status          : {'PASSED' if success else 'FAILED'}")
        print(f" Total Runtime           : {total_duration:.2f}s")
        print("-" * 70)
        if violations:
            print(" ⚠️  HARD GATE FAILURES:")
            for v in violations:
                print(f"   - {v}")
            print("-" * 70)
        print(f" Artifacts Written To    : {self.output_dir}")
        print("=" * 70 + "\n")

        return record

    def compare_runs(self, path_a: str | Path, path_b: str | Path) -> Dict[str, Any]:
        """Compares two benchmark runs and prints metric deltas."""
        with open(path_a, "r", encoding="utf-8") as f:
            a = json.load(f)
        with open(path_b, "r", encoding="utf-8") as f:
            b = json.load(f)

        score_a = a.get("scoring", {}).get("composite_score_pct", 0.0)
        score_b = b.get("scoring", {}).get("composite_score_pct", 0.0)
        delta_score = round(score_b - score_a, 2)

        print("\n" + "=" * 70)
        print(" BENCHMARK RUN COMPARISON")
        print("=" * 70)
        print(f" Baseline Run  : {a.get('run_id')} ({score_a:.1f}%)")
        print(f" Current Run   : {b.get('run_id')} ({score_b:.1f}%)")
        print(f" Delta Score   : {delta_score:+.2f} percentage points")
        print("-" * 70)
        print(f" {'Suite':<20} {'Baseline':<12} {'Current':<12} {'Delta':<10}")
        print("-" * 70)

        all_suites = set(a.get("suites", {}).keys()).union(b.get("suites", {}).keys())
        deltas: Dict[str, float] = {}
        for s in sorted(all_suites):
            sa = a.get("suites", {}).get(s, {}).get("score_pct", 0.0)
            sb = b.get("suites", {}).get(s, {}).get("score_pct", 0.0)
            d = round(sb - sa, 2)
            deltas[s] = d
            print(f" {s:<20} {sa:>8.1f}%   {sb:>8.1f}%   {d:>+8.2f}%")

        print("=" * 70 + "\n")
        return {"baseline_score": score_a, "current_score": score_b, "delta": delta_score, "deltas": deltas}
