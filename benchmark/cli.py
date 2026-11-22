"""
Command Line Interface for the GRAPHOPS Independent Benchmark Engine.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from benchmark.config import BASELINE_DIR, DATASETS_DIR, HISTORY_DIR, RESULTS_DIR
from benchmark.registry import list_suites
from benchmark.reports.html_reporter import generate_html_report
from benchmark.reports.markdown_reporter import generate_markdown_summary
from benchmark.runner import BenchmarkRunner


def cmd_run(args):
    runner = BenchmarkRunner(output_dir=args.output)
    suites = [args.suite] if args.suite and args.suite != "all" else None
    res = runner.run_benchmark(suites=suites, dataset=args.dataset, output_format=args.format)
    if not res["success"]:
        sys.exit(1)


def cmd_compare(args):
    runner = BenchmarkRunner()
    runner.compare_runs(args.run_a, args.run_b)


def cmd_report(args):
    run_file = Path(args.run_file)
    if not run_file.exists():
        print(f"Error: Run file '{args.run_file}' does not exist.")
        sys.exit(1)

    with open(run_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    if args.format == "html":
        content = generate_html_report(data)
        out = run_file.with_suffix(".html")
    else:
        content = generate_markdown_summary(data)
        out = run_file.with_suffix(".md")

    with open(out, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Report written to: {out}")


def cmd_list(args):
    print("\nAvailable Benchmark Suites:")
    for s in list_suites():
        print(f"  - {s['name']:<15} : {s['description']}")

    print("\nAvailable Datasets:")
    if DATASETS_DIR.exists():
        for d in DATASETS_DIR.iterdir():
            if d.is_dir() and (d / "manifest.json").exists():
                print(f"  - {d.name}")
    print()


def cmd_validate(args):
    ds_dir = DATASETS_DIR / args.dataset
    manifest_file = ds_dir / "manifest.json"
    if not manifest_file.exists():
        print(f"Error: Dataset '{args.dataset}' does not contain manifest.json")
        sys.exit(1)

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    docs_dir = ds_dir / "documents"
    gt_dir = ds_dir / "ground_truth"

    valid = True
    missing_docs = 0
    missing_gt = 0

    for rec in manifest.get("records", []):
        doc_p = docs_dir / rec["doc_file"]
        gt_p = gt_dir / rec["gt_file"]
        if not doc_p.exists():
            print(f"  [MISSING DOC] {rec['doc_file']}")
            missing_docs += 1
            valid = False
        if not gt_p.exists():
            print(f"  [MISSING GT] {rec['gt_file']}")
            missing_gt += 1
            valid = False

    print(f"\nDataset Validation: {args.dataset}")
    print(f"  Total Declared Records : {manifest.get('total_documents')}")
    print(f"  Missing Documents      : {missing_docs}")
    print(f"  Missing Ground Truth   : {missing_gt}")
    if valid:
        print("  Status                 : ✅ VALID (All documents and ground truth verified)\n")
    else:
        print("  Status                 : ❌ INVALID\n")
        sys.exit(1)


def cmd_history(args):
    print("\nHistorical Benchmark Runs:")
    runs = sorted(HISTORY_DIR.glob("run-*.json"), reverse=True)
    if not runs:
        print("  No runs found in history.")
        return

    print(f"  {'Run ID':<36} {'Score':<8} {'Status':<8} {'Date/Time'}")
    print("  " + "-" * 65)
    for r in runs[:15]:
        try:
            with open(r, "r", encoding="utf-8") as f:
                data = json.load(f)
            score = data.get("scoring", {}).get("composite_score_pct", 0.0)
            status = "PASSED" if data.get("success") else "FAILED"
            ts = data.get("environment", {}).get("timestamp_utc", "")[:19]
            print(f"  {data.get('run_id'):<36} {score:>5.1f}%  {status:<8} {ts}")
        except Exception:
            pass
    print()


def cmd_baseline(args):
    if args.set_run:
        target = Path(args.set_run)
        if not target.exists():
            print(f"Error: Target run '{args.set_run}' does not exist.")
            sys.exit(1)
        dest = BASELINE_DIR / "baseline.json"
        shutil.copy2(target, dest)
        print(f"Baseline established: {dest} (copied from {target})")
    else:
        baseline_file = BASELINE_DIR / "baseline.json"
        if not baseline_file.exists():
            print("No active baseline set. Use 'python -m benchmark baseline --set-run <run.json>'")
        else:
            with open(baseline_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"Active Baseline Run : {data.get('run_id')}")
            print(f"Score               : {data.get('scoring', {}).get('composite_score_pct'):.2f}%")
            print(f"Date/Time           : {data.get('environment', {}).get('timestamp_utc')}")


def cmd_regression(args):
    baseline_file = BASELINE_DIR / "baseline.json"
    if not baseline_file.exists():
        print("Error: No baseline configured. Run 'python -m benchmark baseline --set-run <run.json>' first.")
        sys.exit(1)

    runner = BenchmarkRunner()
    current_run = runner.run_benchmark(dataset=args.dataset, output_format="all")
    current_json = HISTORY_DIR / f"{current_run['run_id']}.json"

    comp = runner.compare_runs(baseline_file, current_json)
    delta = comp["delta"]
    print(f"Regression Check: Overall Delta is {delta:+.2f} percentage points.")
    if delta < -2.0:
        print("❌ REGRESSION DETECTED: Score dropped by more than 2 percentage points threshold.")
        sys.exit(1)
    else:
        print("✅ NO REGRESSION DETECTED.")


def main():
    parser = argparse.ArgumentParser(
        prog="benchmark",
        description="GRAPHOPS Independent Benchmark Engine CLI",
    )
    subparsers = parser.add_subparsers(dest="command", help="Benchmark command to execute")

    # run
    p_run = subparsers.add_parser("run", help="Execute benchmark suite(s)")
    p_run.add_argument("--suite", default="all", help="Suite to run (functional, extraction, security, etc.)")
    p_run.add_argument("--dataset", default="v0.1", help="Dataset name")
    p_run.add_argument("--output", default=None, help="Output directory")
    p_run.add_argument("--format", default="all", choices=["all", "json", "markdown", "html"], help="Output format")

    # compare
    p_comp = subparsers.add_parser("compare", help="Compare two benchmark run JSON files")
    p_comp.add_argument("run_a", help="Path to baseline run JSON")
    p_comp.add_argument("run_b", help="Path to comparison run JSON")

    # report
    p_rep = subparsers.add_parser("report", help="Generate HTML or Markdown report for a run")
    p_rep.add_argument("run_file", help="Path to run JSON file")
    p_rep.add_argument("--format", default="html", choices=["html", "markdown"], help="Report format")

    # list
    subparsers.add_parser("list", help="List available suites and datasets")

    # validate
    p_val = subparsers.add_parser("validate", help="Validate dataset integrity")
    p_val.add_argument("--dataset", default="v0.1", help="Dataset to validate")

    # history
    subparsers.add_parser("history", help="Show history of benchmark runs")

    # baseline
    p_base = subparsers.add_parser("baseline", help="Inspect or establish baseline run")
    p_base.add_argument("--set-run", default=None, help="JSON run file to establish as baseline")

    # regression
    p_reg = subparsers.add_parser("regression", help="Run benchmark and compare against baseline")
    p_reg.add_argument("--dataset", default="v0.1", help="Dataset to use")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    dispatch = {
        "run": cmd_run,
        "compare": cmd_compare,
        "report": cmd_report,
        "list": cmd_list,
        "validate": cmd_validate,
        "history": cmd_history,
        "baseline": cmd_baseline,
        "regression": cmd_regression,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
