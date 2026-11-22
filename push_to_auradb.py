"""Direct push of 500 nodes and 1,200 edges to live Neo4j AuraDB."""
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("Phase4/.env")

import neo4j

# Import the engine data generator
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "Phase4"))
from backend.services.soc_graph_engine import get_soc_graph_engine

engine = get_soc_graph_engine()
engine.seed_500_enterprise_nodes()

nodes = list(engine.nodes.values())
edges = list(engine.edges.values())

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER")
pwd = os.getenv("NEO4J_PASSWORD")

print(f"Connecting to live Neo4j AuraDB at {uri}...")
driver = neo4j.GraphDatabase.driver(uri, auth=(user, pwd))

with driver.session() as session:
    print("1. Creating unique constraints...")
    session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (n:SOCNode) REQUIRE n.id IS UNIQUE")

    print(f"2. Pushing {len(nodes)} nodes via UNWIND batch...")
    t0 = time.time()
    nodes_cypher = """
    UNWIND $nodes AS n
    MERGE (node:SOCNode {id: n.id})
    SET node += n
    WITH node, n
    CALL apoc.create.addLabels(node, [n.label]) YIELD node AS labeledNode
    RETURN count(labeledNode)
    """
    # Standard labels without requiring APOC:
    std_nodes_cypher = """
    UNWIND $nodes AS n
    MERGE (node:SOCNode {id: n.id})
    SET node += n
    """
    session.run(std_nodes_cypher, nodes=nodes)
    
    # Also assign specific domain labels for Bloom visual categorization:
    session.run("MATCH (n:SOCNode) WHERE n.label = 'Host' SET n:Host")
    session.run("MATCH (n:SOCNode) WHERE n.label = 'User' SET n:User")
    session.run("MATCH (n:SOCNode) WHERE n.label = 'Vulnerability' SET n:Vulnerability")
    session.run("MATCH (n:SOCNode) WHERE n.is_crown_jewel = true SET n:CrownJewel")
    session.run("MATCH (n:SOCNode) WHERE n.is_bridge = true SET n:InfraBridge")
    session.run("MATCH (n:SOCNode) WHERE n.is_compromised = true SET n:Compromised")
    print(f"   Nodes synced in {round((time.time() - t0), 2)}s.")

    print(f"3. Pushing {len(edges)} edges in batches...")
    t1 = time.time()
    # Batch edges in chunks of 400 for rapid execution over cloud connection
    batch_size = 400
    edges_cypher = """
    UNWIND $edges AS e
    MATCH (source:SOCNode {id: e.source})
    MATCH (target:SOCNode {id: e.target})
    MERGE (source)-[rel:SOC_EDGE {id: e.id}]->(target)
    SET rel += e
    """
    for i in range(0, len(edges), batch_size):
        chunk = edges[i:i + batch_size]
        session.run(edges_cypher, edges=chunk)
        print(f"   Batch {i // batch_size + 1}/{(len(edges) + batch_size - 1) // batch_size} committed ({len(chunk)} edges).")
    print(f"   Edges synced in {round((time.time() - t1), 2)}s.")

    # Verification
    n_count = session.run("MATCH (n:SOCNode) RETURN count(n) AS cnt").single()["cnt"]
    e_count = session.run("MATCH ()-[r:SOC_EDGE]->() RETURN count(r) AS cnt").single()["cnt"]
    print("\n" + "=" * 50)
    print(f"🎉 VERIFIED IN LIVE AURA-DB:")
    print(f"   Total Nodes: {n_count}")
    print(f"   Total Edges: {e_count}")
    print("=" * 50)

driver.close()
