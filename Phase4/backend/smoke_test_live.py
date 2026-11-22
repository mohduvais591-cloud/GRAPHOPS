"""Live Smoke Test for Neo4j AuraDB, Blast Radius, Audit Ledger, and Qwen Brain Router."""
import os
import sys
import json
import time

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

# Ensure Phase4 directory is in sys.path so 'backend' is resolved
phase4_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if phase4_dir not in sys.path:
    sys.path.insert(0, phase4_dir)

from fastapi.testclient import TestClient
from dotenv import load_dotenv

# Load environment
load_dotenv(os.path.join(phase4_dir, ".env"))
load_dotenv(os.path.join(os.path.dirname(phase4_dir), ".env"))

from backend.app import app

client = TestClient(app)

def run_tests():
    print("=" * 60, flush=True)
    print("🚀 GRAPH-OPS LIVE SMOKE TESTS", flush=True)
    print("=" * 60, flush=True)

    # 1. Test POST /v1/demo/seed-500
    print("\n1. Testing POST /v1/demo/seed-500 ...")
    t0 = time.time()
    res1 = client.post("/v1/demo/seed-500")
    t1 = time.time()
    print(f"Status Code: {res1.status_code} (took {round((t1-t0)*1000, 2)} ms)")
    assert res1.status_code == 200, f"Expected 200, got {res1.status_code}: {res1.text}"
    data1 = res1.json()
    print(f"Response: nodes_loaded={data1.get('nodes_loaded')}, edges_loaded={data1.get('edges_loaded')}, neo4j_persisted={data1.get('neo4j_persisted')}, elapsed_ms={data1.get('elapsed_ms')}")

    # 2. Test GET /v1/analytics/blast-radius/workstation-14
    print("\n2. Testing GET /v1/analytics/blast-radius/workstation-14 ...")
    res2 = client.get("/v1/analytics/blast-radius/workstation-14?depth=3")
    print(f"Status Code: {res2.status_code}")
    assert res2.status_code == 200, f"Expected 200, got {res2.status_code}: {res2.text}"
    data2 = res2.json()
    hop1 = len(data2.get("Hop 1", []))
    hop2 = len(data2.get("Hop 2", []))
    hop3 = len(data2.get("Hop 3", []))
    print(f"Blast Radius: Hop 1={hop1}, Hop 2={hop2}, Hop 3={hop3}")
    print(f"Crown Jewels Exposed: {data2.get('crown_jewels_exposed')}")
    print(f"Causal Attack Paths Found: {len(data2.get('causal_paths', []))}")

    # 3. Test GET /v1/audit/verify
    print("\n3. Testing GET /v1/audit/verify ...")
    res3 = client.get("/v1/audit/verify")
    print(f"Status Code: {res3.status_code}")
    assert res3.status_code == 200, f"Expected 200, got {res3.status_code}: {res3.text}"
    data3 = res3.json()
    print(f"Verification Result: valid={data3.get('valid')}, verified_blocks={data3.get('verified_blocks')}")

    # 4. Test POST /v1/ai/brain-analyze
    print("\n4. Testing POST /v1/ai/brain-analyze ...")
    res4 = client.post(
        "/v1/ai/brain-analyze",
        json={
            "prompt": "Simulate compromise on workstation-14 and isolate attack path",
            "selected_node_id": "workstation-14"
        }
    )
    print(f"Status Code: {res4.status_code}")
    assert res4.status_code == 200, f"Expected 200, got {res4.status_code}: {res4.text}"
    data4 = res4.json()
    print(f"Brain Intent: {data4.get('intent')}")
    print(f"Target Node: {data4.get('target_node')}")
    print(f"Narrative: {data4.get('narrative')}")
    print(f"Containment CLI: {data4.get('containment_cli')}")
    print(f"Cypher Query: {data4.get('cypher_query')}")
    print(f"Spoken Reply: {data4.get('spoken_reply')}")

    # 5. Test Audit Ledger after Brain Query
    print("\n5. Testing GET /v1/audit/ledger (Verifying append-only chain) ...")
    res5 = client.get("/v1/audit/ledger")
    assert res5.status_code == 200
    chain = res5.json().get("chain", [])
    print(f"Audit Chain Length: {len(chain)} blocks")
    latest_block = chain[-1] if chain else {}
    print(f"Latest Block: Action={latest_block.get('action')}, Actor={latest_block.get('actor')}, Target={latest_block.get('target_id')}")
    print(f"Latest Block Hash: {latest_block.get('hash')}")

    # 6. Test CERT-In export
    print("\n6. Testing GET /v1/audit/cert-in-report/INCIDENT-2026-001 ...")
    res6 = client.get("/v1/audit/cert-in-report/INCIDENT-2026-001")
    assert res6.status_code == 200
    cert = res6.json()
    print(f"CERT-In Certificate Root Hash: {cert.get('root_hash')}")
    print(f"Compliance Standard: {cert.get('compliance')}")

    print("\n" + "=" * 60)
    print("✅ ALL LIVE SMOKE TESTS PASSED WITH 200 OK!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
