"""
Benchmark Suite Registry for GRAPHOPS.
Maps suite identifiers to suite implementations.
"""

from __future__ import annotations

from typing import Dict, List, Type

from benchmark.suites.base import BenchmarkSuite
from benchmark.suites.functional.suite import FunctionalSuite
from benchmark.suites.extraction.suite import ExtractionSuite
from benchmark.suites.attack_paths.suite import AttackPathsSuite
from benchmark.suites.citations.suite import CitationsSuite
from benchmark.suites.retrieval.suite import RetrievalSuite
from benchmark.suites.security.suite import SecuritySuite
from benchmark.suites.performance.suite import PerformanceSuite

SUITE_REGISTRY: Dict[str, Type[BenchmarkSuite]] = {
    "functional": FunctionalSuite,
    "extraction": ExtractionSuite,
    "attack_paths": AttackPathsSuite,
    "citations": CitationsSuite,
    "retrieval": RetrievalSuite,
    "security": SecuritySuite,
    "performance": PerformanceSuite,
}


def get_suite(name: str) -> BenchmarkSuite:
    """Returns an instance of the requested benchmark suite."""
    if name not in SUITE_REGISTRY:
        raise ValueError(
            f"Unknown suite '{name}'. Available suites: {list(SUITE_REGISTRY.keys())}"
        )
    return SUITE_REGISTRY[name]()


def list_suites() -> List[Dict[str, str]]:
    """Returns metadata for all registered benchmark suites."""
    return [
        {"name": name, "description": cls.description}
        for name, cls in SUITE_REGISTRY.items()
    ]
