"""
Master Test Runner for AegisGraph AI / GRAPHOPS.
Phase 0 Implementation: Test Runner Foundation.
- Dynamic test discovery and execution (no hardcoded counts)
- JUnit XML and structured JSON report generation
- Passed, failed, skipped, and error tracking
- Execution runtime, environment metadata, and git commit recording
- Reliable exit codes adhering to Phase 0 benchmark specifications.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PHASE4_DIR = os.path.join(ROOT_DIR, "Phase4")
REPORTS_DIR = os.path.join(ROOT_DIR, "reports")
VENV_PYTHON = os.path.join(PHASE4_DIR, ".venv", "Scripts", "python.exe")

if not os.path.exists(VENV_PYTHON):
    VENV_PYTHON = sys.executable


def get_git_commit() -> str:
    """Retrieves current git commit hash if in a git repository."""
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_environment_metadata() -> Dict[str, Any]:
    """Captures environment metadata for reproducible benchmark audits."""
    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "architecture": list(platform.architecture()),
        "python_version": platform.python_version(),
        "python_compiler": platform.python_compiler(),
        "python_executable": VENV_PYTHON,
        "git_commit": get_git_commit(),
        "working_directory": ROOT_DIR,
    }


def parse_junit_xml(xml_path: str) -> Dict[str, Any]:
    """Parses JUnit XML to extract dynamic test execution metrics and failure details."""
    if not os.path.exists(xml_path):
        return {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "errors": 0,
            "time_seconds": 0.0,
            "testcases": [],
        }

    tree = ET.parse(xml_path)
    root = tree.getroot()

    # Handle either <testsuites> container or direct <testsuite>
    suite_elements = root.findall("testsuite") if root.tag == "testsuites" else [root]

    total = 0
    failures = 0
    errors = 0
    skipped = 0
    duration = 0.0
    testcases: List[Dict[str, Any]] = []

    for suite in suite_elements:
        total += int(suite.attrib.get("tests", 0))
        failures += int(suite.attrib.get("failures", 0))
        errors += int(suite.attrib.get("errors", 0))
        skipped += int(suite.attrib.get("skipped", 0))
        duration += float(suite.attrib.get("time", 0.0))

        for tc in suite.findall("testcase"):
            tc_name = tc.attrib.get("name", "unknown")
            tc_class = tc.attrib.get("classname", "")
            tc_time = float(tc.attrib.get("time", 0.0))

            fail_elem = tc.find("failure")
            err_elem = tc.find("error")
            skip_elem = tc.find("skipped")

            if fail_elem is not None:
                tc_status = "failed"
                tc_detail = fail_elem.attrib.get("message", fail_elem.text or "")
            elif err_elem is not None:
                tc_status = "error"
                tc_detail = err_elem.attrib.get("message", err_elem.text or "")
            elif skip_elem is not None:
                tc_status = "skipped"
                tc_detail = skip_elem.attrib.get("message", skip_elem.text or "")
            else:
                tc_status = "passed"
                tc_detail = None

            testcases.append({
                "name": tc_name,
                "classname": tc_class,
                "duration_seconds": tc_time,
                "status": tc_status,
                "detail": tc_detail,
            })

    passed = max(0, total - (failures + errors + skipped))

    return {
        "total": total,
        "passed": passed,
        "failed": failures,
        "skipped": skipped,
        "errors": errors,
        "time_seconds": round(duration, 3),
        "testcases": testcases,
    }


def run_full_suite() -> Dict[str, Any]:
    """Executes the complete test suite with dynamic telemetry and report generation."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    xml_report_path = os.path.join(REPORTS_DIR, "junit_report.xml")
    json_report_path = os.path.join(REPORTS_DIR, "test_report.json")

    env_meta = get_environment_metadata()

    print("=" * 70)
    print(" AegisGraph AI / GRAPHOPS — Unified Acceptance & Benchmark Suite")
    print(f" Environment : {env_meta['platform']} (Python {env_meta['python_version']})")
    print(f" Git Commit  : {env_meta['git_commit']}")
    print(f" Interpreter : {VENV_PYTHON}")
    print("=" * 70 + "\n")

    cmd = [
        VENV_PYTHON,
        "-m",
        "pytest",
        "tests",
        "-v",
        f"--junitxml={xml_report_path}",
    ]

    start_wall = time.time()
    proc = subprocess.run(cmd, cwd=PHASE4_DIR)
    wall_duration = time.time() - start_wall

    metrics = parse_junit_xml(xml_report_path)
    metrics["wall_time_seconds"] = round(wall_duration, 2)

    # In accordance with Benchmark Specification Rule 42:
    # Pass rate = passed / executed tests * 100. Skipped tests must not be counted as passing.
    executed_tests = metrics["total"] - metrics["skipped"]
    if executed_tests > 0:
        pass_rate = (metrics["passed"] / executed_tests) * 100.0
    else:
        pass_rate = 0.0

    metrics["executed"] = executed_tests
    metrics["pass_rate_pct"] = round(pass_rate, 2)

    # Construct final audit record
    final_report = {
        "benchmark_stage": "Phase 0 — Test Runner Foundation",
        "environment": env_meta,
        "metrics": metrics,
        "exit_code": proc.returncode,
        "success": proc.returncode == 0 and metrics["failed"] == 0 and metrics["errors"] == 0,
    }

    with open(json_report_path, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=2)

    # Print Dynamic Scorecard
    print("\n" + "=" * 70)
    print(" UNIFIED BENCHMARK & ACCEPTANCE SCORECARD")
    print("=" * 70)
    print(f" Total Tests Collected : {metrics['total']}")
    print(f" Tests Executed        : {metrics['executed']}")
    print(f" Passed                : {metrics['passed']}")
    print(f" Failed                : {metrics['failed']}")
    print(f" Skipped               : {metrics['skipped']}")
    print(f" Errors                : {metrics['errors']}")
    print(f" Pass Rate (Executed)  : {metrics['pass_rate_pct']:.2f}%")
    print(f" Wall Duration         : {metrics['wall_time_seconds']:.2f}s")
    print("-" * 70)
    print(f" JUnit XML Report      : {xml_report_path}")
    print(f" Structured JSON Report: {json_report_path}")
    print("=" * 70)

    if final_report["success"]:
        print("\n [PASSED] All acceptance gates verified successfully!\n")
    else:
        print(f"\n [FAILED] Test suite failed with {metrics['failed']} failure(s) and {metrics['errors']} error(s).\n")
        if metrics["failed"] > 0 or metrics["errors"] > 0:
            print(" Failure Details:")
            for tc in metrics["testcases"]:
                if tc["status"] in {"failed", "error"}:
                    print(f"  - [{tc['status'].upper()}] {tc['classname']}::{tc['name']}")
                    if tc["detail"]:
                        print(f"    {tc['detail'][:180]}...")

    return final_report


def main():
    report = run_full_suite()
    if report["success"]:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
