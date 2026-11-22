"""
Abstract Base Class for Benchmark Suites.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BenchmarkSuite(ABC):
    """Base interface for all GRAPHOPS benchmark suites."""

    name: str = "base"
    description: str = "Base benchmark suite"

    @abstractmethod
    def run(self, dataset: Optional[Any] = None) -> Dict[str, Any]:
        """
        Executes the benchmark suite and returns structured metric dictionary:
        {
            "suite": str,
            "status": "PASSED" | "FAILED",
            "score_pct": float,
            "metrics": dict,
            "duration_seconds": float,
            "details": list | dict
        }
        """
        raise NotImplementedError
