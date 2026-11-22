"""
Benchmark configuration and path resolver for GRAPHOPS.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATASETS_DIR = BASE_DIR / "datasets"
RESULTS_DIR = BASE_DIR / "results"
BASELINE_DIR = RESULTS_DIR / "baseline"
HISTORY_DIR = RESULTS_DIR / "history"

# Section 9 Weights:
DEFAULT_WEIGHTS: Dict[str, float] = {
    "functional": 0.15,
    "extraction": 0.10,
    "relationships": 0.15,
    "attack_paths": 0.20,
    "citations": 0.15,
    "retrieval": 0.10,
    "security": 0.10,
    "performance": 0.05,
}

# Section 8 Regression Thresholds:
REGRESSION_THRESHOLDS: Dict[str, float] = {
    "critical_security_failure_max": 0,
    "citation_precision_drop_max": 0.0,
    "accuracy_drop_max_percentage_points": 2.0,
    "performance_degradation_warn_pct": 20.0,
    "performance_degradation_fail_pct": 40.0,
}
