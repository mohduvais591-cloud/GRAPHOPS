"""
Suite A: Functional Correctness Benchmark Suite.
Runs functional endpoint, auth, authorization, ingestion, and MCP tool tests.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, Optional

from benchmark.suites.base import BenchmarkSuite
from benchmark.config import PROJECT_ROOT


class FunctionalSuite(BenchmarkSuite):
    name = "functional"
    description = "Functional correctness, endpoints, auth, roles, and schema compliance"

    def run(self, dataset: Optional[Any] = None) -> Dict[str, Any]:
        phase4_dir = PROJECT_ROOT / "Phase4"
        xml_path = phase4_dir / ".benchmark_functional_junit.xml"

        venv_python = phase4_dir / ".venv" / "Scripts" / "python.exe"
        if not venv_python.exists():
            venv_python = Path(sys.executable)

        cmd = [
            str(venv_python),
            "-m",
            "pytest",
            "tests",
            f"--junitxml={str(xml_path)}",
            "-q",
        ]

        start_time = time.time()
        proc = subprocess.run(cmd, cwd=str(phase4_dir), capture_output=True, text=True)
        duration = round(time.time() - start_time, 2)

        total, failures, errors, skipped = 0, 0, 0, 0
        if xml_path.exists():
            try:
                tree = ET.parse(str(xml_path))
                root = tree.getroot()
                suite_elements = root.findall("testsuite") if root.tag == "testsuites" else [root]
                for suite in suite_elements:
                    total += int(suite.attrib.get("tests", 0))
                    failures += int(suite.attrib.get("failures", 0))
                    errors += int(suite.attrib.get("errors", 0))
                    skipped += int(suite.attrib.get("skipped", 0))
                xml_path.unlink(missing_ok=True)
            except Exception:
                pass

        executed = total - skipped
        passed = max(0, total - (failures + errors + skipped))
        pass_rate = round((passed / executed) * 100.0, 2) if executed > 0 else 0.0

        status = "PASSED" if (proc.returncode == 0 and failures == 0 and errors == 0) else "FAILED"

        return {
            "suite": self.name,
            "status": status,
            "score_pct": pass_rate,
            "duration_seconds": duration,
            "metrics": {
                "total_tests": total,
                "executed_tests": executed,
                "passed_tests": passed,
                "failed_tests": failures,
                "skipped_tests": skipped,
                "error_tests": errors,
                "pass_rate_pct": pass_rate,
            },
            "details": {
                "exit_code": proc.returncode,
            },
        }
