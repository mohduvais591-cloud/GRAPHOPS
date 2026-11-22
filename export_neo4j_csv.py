"""Exports 500 Enterprise Nodes and 1,200 Edges into Neo4j CSV/TSV formats."""
import os
import sys
import csv

# Add Phase4 to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "Phase4"))
from backend.services.soc_graph_engine import get_soc_graph_engine

engine = get_soc_graph_engine()
engine.seed_500_enterprise_nodes()

nodes = list(engine.nodes.values())
edges = list(engine.edges.values())

export_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "neo4j_export")
os.makedirs(export_dir, exist_ok=True)

# 1. Standard CSV (Neo4j Data Importer / LOAD CSV)
nodes_csv_path = os.path.join(export_dir, "neo4j_nodes.csv")
edges_csv_path = os.path.join(export_dir, "neo4j_edges.csv")

# Also save directly in root for convenience
root_nodes_csv = os.path.join(os.path.dirname(os.path.abspath(__file__)), "neo4j_nodes.csv")
root_edges_csv = os.path.join(os.path.dirname(os.path.abspath(__file__)), "neo4j_edges.csv")

node_headers = [
    "id", "name", "label", "role", "type", "is_crown_jewel", "is_bridge",
    "ip", "os", "zone", "criticality", "is_compromised", "email",
    "department", "clearance", "cvss", "severity", "description"
]

edge_headers = [
    "id", "source", "target", "relationship", "first_seen", "last_seen",
    "mitre_tactic", "shadow_access", "severed"
]

for p in [nodes_csv_path, root_nodes_csv]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=node_headers, extrasaction="ignore")
        writer.writeheader()
        for n in nodes:
            writer.writerow(n)

for p in [edges_csv_path, root_edges_csv]:
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=edge_headers, extrasaction="ignore")
        writer.writeheader()
        for e in edges:
            writer.writerow(e)

# 2. Neo4j Admin Import Headers (:ID, :LABEL, :START_ID, :END_ID, :TYPE)
admin_nodes_csv = os.path.join(export_dir, "neo4j_nodes_admin_import.csv")
admin_edges_csv = os.path.join(export_dir, "neo4j_edges_admin_import.csv")

with open(admin_nodes_csv, "w", newline="", encoding="utf-8") as f:
    headers = [
        "id:ID", "name", "role", "type", "is_crown_jewel:boolean", "is_bridge:boolean",
        "ip", "os", "zone", "criticality", "is_compromised:boolean", "email",
        "department", "clearance", "cvss:float", "severity", "description", ":LABEL"
    ]
    writer = csv.writer(f)
    writer.writerow(headers)
    for n in nodes:
        lbl = f"SOCNode;{n.get('label', 'Host')}"
        writer.writerow([
            n.get("id", ""),
            n.get("name", ""),
            n.get("role", ""),
            n.get("type", ""),
            str(n.get("is_crown_jewel", False)).lower(),
            str(n.get("is_bridge", False)).lower(),
            n.get("ip", ""),
            n.get("os", ""),
            n.get("zone", ""),
            n.get("criticality", ""),
            str(n.get("is_compromised", False)).lower(),
            n.get("email", ""),
            n.get("department", ""),
            n.get("clearance", ""),
            n.get("cvss", ""),
            n.get("severity", ""),
            n.get("description", ""),
            lbl
        ])

with open(admin_edges_csv, "w", newline="", encoding="utf-8") as f:
    headers = [
        ":START_ID", ":END_ID", ":TYPE", "id", "first_seen", "last_seen",
        "mitre_tactic", "shadow_access:boolean", "severed:boolean"
    ]
    writer = csv.writer(f)
    writer.writerow(headers)
    for e in edges:
        writer.writerow([
            e.get("source", ""),
            e.get("target", ""),
            e.get("relationship", "SOC_EDGE"),
            e.get("id", ""),
            e.get("first_seen", ""),
            e.get("last_seen", ""),
            e.get("mitre_tactic", ""),
            str(e.get("shadow_access", False)).lower(),
            str(e.get("severed", False)).lower()
        ])

# 3. TSV (Tab-Separated Values) format
nodes_tsv_path = os.path.join(export_dir, "neo4j_nodes.tsv")
edges_tsv_path = os.path.join(export_dir, "neo4j_edges.tsv")

with open(nodes_tsv_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=node_headers, delimiter="\t", extrasaction="ignore")
    writer.writeheader()
    for n in nodes:
        writer.writerow(n)

with open(edges_tsv_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=edge_headers, delimiter="\t", extrasaction="ignore")
    writer.writeheader()
    for e in edges:
        writer.writerow(e)

# 4. Generate copy-paste LOAD CSV Cypher commands
cypher_script_path = os.path.join(export_dir, "neo4j_load_csv_guide.cypher")
with open(cypher_script_path, "w", encoding="utf-8") as f:
    f.write("""// ============================================================
// Neo4j Cypher Import Queries for GraphOps CTI Dataset
// ============================================================

// 1. Create Unique Constraints
CREATE CONSTRAINT IF NOT EXISTS FOR (n:SOCNode) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR ()-[r:SOC_EDGE]-() REQUIRE r.id IS UNIQUE;

// 2. Load Nodes from CSV (e.g. file:///neo4j_nodes.csv or hosted URL)
LOAD CSV WITH HEADERS FROM 'file:///neo4j_nodes.csv' AS row
MERGE (n:SOCNode {id: row.id})
SET n.name = row.name,
    n.label = row.label,
    n.role = row.role,
    n.type = row.type,
    n.ip = row.ip,
    n.os = row.os,
    n.zone = row.zone,
    n.criticality = row.criticality,
    n.email = row.email,
    n.department = row.department,
    n.cvss = toFloat(row.cvss),
    n.is_crown_jewel = (row.is_crown_jewel = 'True' OR row.is_crown_jewel = 'true'),
    n.is_bridge = (row.is_bridge = 'True' OR row.is_bridge = 'true'),
    n.is_compromised = (row.is_compromised = 'True' OR row.is_compromised = 'true');

// 3. Load Edges from CSV (e.g. file:///neo4j_edges.csv or hosted URL)
LOAD CSV WITH HEADERS FROM 'file:///neo4j_edges.csv' AS row
MATCH (s:SOCNode {id: row.source})
MATCH (t:SOCNode {id: row.target})
MERGE (s)-[r:SOC_EDGE {id: row.id}]->(t)
SET r.relationship = row.relationship,
    r.first_seen = row.first_seen,
    r.last_seen = row.last_seen,
    r.mitre_tactic = row.mitre_tactic,
    r.shadow_access = (row.shadow_access = 'True' OR row.shadow_access = 'true'),
    r.severed = (row.severed = 'True' OR row.severed = 'true');

// 4. Quick Verification Query (3-hop attack path)
MATCH path = (cve:SOCNode {id: 'CVE-2024-21413'})-[:SOC_EDGE*1..3]->(cj:SOCNode {is_crown_jewel: true})
RETURN path;
""")

print(f"Successfully generated Neo4j CSV and TSV files:")
print(f" - Nodes CSV: {nodes_csv_path} ({len(nodes)} nodes)")
print(f" - Edges CSV: {edges_csv_path} ({len(edges)} edges)")
print(f" - Nodes TSV: {nodes_tsv_path}")
print(f" - Edges TSV: {edges_tsv_path}")
print(f" - Admin Import Nodes: {admin_nodes_csv}")
print(f" - Admin Import Edges: {admin_edges_csv}")
print(f" - Root Nodes CSV: {root_nodes_csv}")
print(f" - Root Edges CSV: {root_edges_csv}")
print(f" - Cypher Guide: {cypher_script_path}")
