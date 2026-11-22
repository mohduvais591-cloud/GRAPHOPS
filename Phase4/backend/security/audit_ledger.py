"""Cryptographically verifiable, append-only audit ledger for SOC actions and containment events.
Persists SHA-256 (:AuditEvent) hash chain directly into Neo4j AuraDB with in-memory fallback.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv("Phase4/.env")
except Exception:
    pass

logger = logging.getLogger("audit_ledger")


class AuditLedger:
    """
    Append-only cryptographic audit ledger ensuring immutability of SOC actions.
    Each block is chained via SHA-256 over:
    f"{prev_hash}|{timestamp}|{actor}|{action}|{target_id}|{json.dumps(payload, sort_keys=True)}"
    Directly writes (:AuditEvent) nodes and [:CHAINED_TO] relationships to Neo4j AuraDB.
    """

    def __init__(self, genesis_prev_hash: str = "0" * 64):
        self._lock = threading.RLock()
        self.genesis_prev_hash = genesis_prev_hash
        self.chain: List[Dict[str, Any]] = []
        self.neo4j_driver = None
        self.neo4j_connected = False
        self._init_neo4j()

    def _init_neo4j(self) -> None:
        """Connects to live Neo4j AuraDB using environment credentials."""
        uri = (os.getenv("NEO4J_URI") or "").strip()
        user = (os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER") or "neo4j").strip()
        pwd = (os.getenv("NEO4J_PASSWORD") or "").strip()
        self.neo4j_db = (os.getenv("NEO4J_DATABASE") or "").strip()

        if uri and pwd:
            try:
                import neo4j
                driver = neo4j.GraphDatabase.driver(
                    uri,
                    auth=(user, pwd),
                    connection_timeout=5.0,
                    max_connection_lifetime=60.0,
                )
                # Test connectivity
                with driver.session() as s:
                    s.run("RETURN 1 AS ping").single()
                self.neo4j_driver = driver
                self.neo4j_connected = True
                logger.info("AuditLedger successfully connected to live Neo4j AuraDB.")
            except Exception as e:
                self.neo4j_connected = False
                self.neo4j_driver = None
                logger.warning(f"Neo4j AuraDB connection unavailable for AuditLedger, using in-memory: {e}")

    def _persist_to_neo4j(self, block: Dict[str, Any]) -> None:
        """Persists an (:AuditEvent) block and [:CHAINED_TO] link into Neo4j AuraDB."""
        if not self.neo4j_connected or not self.neo4j_driver:
            return

        try:
            cypher = """
            MERGE (b:AuditEvent {hash: $hash})
            SET b.index = $index,
                b.prev_hash = $prev_hash,
                b.timestamp = $timestamp,
                b.actor = $actor,
                b.action = $action,
                b.target_id = $target_id,
                b.payload = $payload_json

            WITH b
            OPTIONAL MATCH (p:AuditEvent {hash: $prev_hash})
            FOREACH (_ IN CASE WHEN p IS NOT NULL THEN [1] ELSE [] END |
                MERGE (p)-[:CHAINED_TO]->(b)
            )
            """
            payload_json = json.dumps(block.get("payload") or {}, sort_keys=True)
            with self.neo4j_driver.session() as session:
                session.run(
                    cypher,
                    hash=block["hash"],
                    index=block["index"],
                    prev_hash=block["prev_hash"],
                    timestamp=block["timestamp"],
                    actor=block["actor"],
                    action=block["action"],
                    target_id=block["target_id"],
                    payload_json=payload_json,
                )
        except Exception as e:
            logger.warning(f"Neo4j AuditEvent write failed, in-memory chain retained: {e}")

    def record_event(
        self,
        actor: str,
        action: str,
        target_id: str,
        payload: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Appends a new event block to the ledger with a cryptographic SHA-256 hash."""
        with self._lock:
            if payload is None:
                payload = {}
            if timestamp is None:
                timestamp = datetime.now(timezone.utc).isoformat()

            prev_hash = self.chain[-1]["hash"] if self.chain else self.genesis_prev_hash
            raw_data = f"{prev_hash}|{timestamp}|{actor}|{action}|{target_id}|{json.dumps(payload, sort_keys=True)}"
            event_hash = hashlib.sha256(raw_data.encode("utf-8")).hexdigest()

            block: Dict[str, Any] = {
                "index": len(self.chain),
                "prev_hash": prev_hash,
                "timestamp": timestamp,
                "actor": str(actor),
                "action": str(action),
                "target_id": str(target_id),
                "payload": payload,
                "hash": event_hash,
            }
            self.chain.append(block)

            # Persist directly into Neo4j AuraDB (:AuditEvent)
            self._persist_to_neo4j(block)
            return block

    def append_event(
        self,
        actor: str,
        action: str,
        target_id: str,
        payload: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Alias for record_event."""
        return self.record_event(actor, action, target_id, payload, timestamp)

    def get_chain(self) -> List[Dict[str, Any]]:
        """Returns the full append-only chain of blocks."""
        with self._lock:
            return [dict(block) for block in self.chain]

    def verify_chain(self) -> Dict[str, Any]:
        """
        Recomputes all block hashes from genesis to verify cryptographic integrity.
        Returns {"valid": True, "verified_blocks": len(chain)} on success.
        """
        with self._lock:
            if not self.chain:
                return {"valid": True, "verified_blocks": 0}

            expected_prev_hash = self.genesis_prev_hash
            for i, block in enumerate(self.chain):
                # Verify link to previous block
                if block.get("prev_hash") != expected_prev_hash:
                    return {
                        "valid": False,
                        "verified_blocks": i,
                        "error": f"Chain link broken at block {i}: expected prev_hash '{expected_prev_hash}', got '{block.get('prev_hash')}'",
                    }

                # Recompute and verify SHA-256 hash
                payload = block.get("payload") or {}
                raw_data = f"{block['prev_hash']}|{block['timestamp']}|{block['actor']}|{block['action']}|{block['target_id']}|{json.dumps(payload, sort_keys=True)}"
                computed_hash = hashlib.sha256(raw_data.encode("utf-8")).hexdigest()

                if block.get("hash") != computed_hash:
                    return {
                        "valid": False,
                        "verified_blocks": i,
                        "error": f"Cryptographic integrity violation at block {i}: expected hash '{computed_hash}', got '{block.get('hash')}'",
                    }

                expected_prev_hash = block["hash"]

            return {"valid": True, "verified_blocks": len(self.chain)}

    def export_cert_in_report(self, incident_id: str) -> Dict[str, Any]:
        """
        Exports a tamper-evident cryptographic containment certificate for inclusion
        in evidence and compliance reports.
        """
        verification = self.verify_chain()
        with self._lock:
            chain_len = len(self.chain)
            latest_hash = self.chain[-1]["hash"] if self.chain else self.genesis_prev_hash

            # Find all ledger events matching or targeting the incident
            matching_events = [
                b
                for b in self.chain
                if b.get("target_id") == incident_id
                or (
                    isinstance(b.get("payload"), dict)
                    and (
                        b["payload"].get("incident_id") == incident_id
                        or b["payload"].get("node_id") == incident_id
                        or incident_id in str(b["payload"])
                    )
                )
            ]

        cert_payload: Dict[str, Any] = {
            "certificate_type": "CRYPTOGRAPHIC_CONTAINMENT_VERIFICATION",
            "schema_version": "graphops-cert-in-report/v1",
            "incident_id": incident_id,
            "certified_at": datetime.now(timezone.utc).isoformat(),
            "ledger_verification": verification,
            "verified_blocks": verification.get("verified_blocks", 0),
            "latest_block_hash": latest_hash,
            "incident_event_count": len(matching_events),
            "incident_events": matching_events,
            "audit_chain_length": chain_len,
            "status": "CERTIFIED" if verification.get("valid") else "INTEGRITY_TAMPERED",
            "neo4j_backed": self.neo4j_connected,
        }

        cert_hash = hashlib.sha256(json.dumps(cert_payload, sort_keys=True).encode("utf-8")).hexdigest()
        cert_payload["certificate_seal_sha256"] = cert_hash
        return cert_payload


_GLOBAL_AUDIT_LEDGER: Optional[AuditLedger] = None
_LEDGER_LOCK = threading.Lock()


def get_audit_ledger() -> AuditLedger:
    """Thread-safe singleton accessor for the global AuditLedger."""
    global _GLOBAL_AUDIT_LEDGER
    if _GLOBAL_AUDIT_LEDGER is None:
        with _LEDGER_LOCK:
            if _GLOBAL_AUDIT_LEDGER is None:
                _GLOBAL_AUDIT_LEDGER = AuditLedger()
    return _GLOBAL_AUDIT_LEDGER
