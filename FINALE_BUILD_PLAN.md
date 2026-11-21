# FINALE BUILD PLAN: GRAPHOPS (PS T2.1)
**Theme:** T2 — Cybersecurity (Digital Innovation Sector)  
**Deliverable:** Step Zero — Product Audit and Finale Build Plan  
**Target Deadline:** 12:00 PM, 22 November 2026  

---

### 1. Where We Are Today (Prototype Audit)

* **What Works Today:**
  * **Full-Stack Application:** FastAPI backend with Python 3.14 + React/Vite split-screen UI running on localhost.
  * **Graph Traversal Core:** Embedded directed knowledge graph capable of multi-hop link tracing, path IDs, and entity-to-entity traversal.
  * **Cyber Knowledge Model:** Extracts and models `Vulnerability` (CVEs), `ThreatActor`, `Asset`, `Technique` (MITRE ATT&CK), and `AttackPayload`.
  * **Basic Attack Route & Blast Radius Logic:** Initial route tracing and document-cited evidence paths based on synthetic demo fixtures (CVE-2024-4577 / PHP Gateway demo).
  * **Graph Visualization Canvas:** Interactive node-link graph viewer rendered via Cytoscape.js in React.
  * **Storage Engine:** SQLite metadata and in-memory graph representation with baseline Neo4j projection connectors in place.

* **What is Mocked, Hardcoded, or Missing:**
  * **Mocked / Hardcoded:** Ingestion is currently driven by static threat intel documents rather than multi-source enterprise SOC telemetry streams (Active Directory logins, network NetFlow, and CMDB inventory).
  * **Missing — Dynamic Blast Radius Tiers:** No real-time 1-hop, 2-hop, and 3-hop visual neighborhood filters or impact weighting on crown jewel assets.
  * **Missing — Deepened Neo4j Graph Analytics:** Choke-point detection (betweenness centrality) and live Cypher graph algorithms are not yet executed natively on Neo4j.
  * **Missing — Anomaly & Zero-Trust Gap Detection:** No automated comparison between statically permitted access (ACL/Policy) vs. dynamically observed network connections.
  * **Missing — Incident Narrative Aggregator:** Alert signals are not yet automatically stitched into a unified MITRE kill-chain incident view for the analyst.

---

### 2. Where We Will Be (Target Deliverable by 12:00 PM, 22 November)

By the finale deadline, GraphOps will be a live, interactive SOC incident command engine featuring:

1. **Multi-Source SOC Telemetry Ingestion:** An automated pipeline ingesting synthetic enterprise data (AD auth logs, network connections, endpoint processes, and CMDB asset catalogs).
2. **Real-Time 1-3 Hop Blast Radius Containment Engine:** Given any compromised node, the graph instantly isolates and color-codes:
   * *1-Hop (Red):* Direct neighbor compromise risk (active sessions, shared credentials).
   * *2-Hop (Orange):* Lateral movement bridgeheads (jump hosts, domain controllers).
   * *3-Hop (Yellow):* Crown jewel assets (core databases, financial vaults).
3. **Automated Attack Path & Choke Point Discovery:** Native Neo4j Cypher algorithms identifying the single node or edge whose isolation cuts off $\ge 70\%$ of attack paths toward critical assets.
4. **Zero-Trust Gap & Anomaly Detection:** Visual graph overlay highlighting shadow access paths (observed traffic that has no corresponding authorization policy).
5. **Interactive SOC Workbench & Incident Timeline:** A single-pane React dashboard translating 20+ raw alerts into one coherent, MITRE-tagged incident story with an exportable CERT-In compliance incident summary.

---

### 3. User Segments

* **Primary Segment — Tier-1 & Tier-2 SOC Analysts:**
  * *Pain Point:* Drowning in 500+ daily disjointed alerts; spending 4+ hours manually correlating SQL logs during active lateral movement.
  * *Value:* Replaces fragmented alerts with a connected attack graph and an instant 2-second blast radius view.
* **Secondary Segment 1 — CISOs & Security Engineering Teams (Posture & Threat Hunting):**
  * *Pain Point:* Unable to identify high-risk architectural choke points before an adversary exploits them.
  * *Value:* Proactive attack path modeling and betweenness centrality to eliminate dangerous paths pre-incident.
* **Secondary Segment 2 — Boardroom & Compliance/Legal Officers (Indian Regulatory Compliance):**
  * *Pain Point:* CERT-In 6-hour incident reporting mandate and DPDP Act 2023 liability demanding auditable proof of breach containment.
  * *Value:* Deterministic, graph-backed audit trails proving exact containment boundaries and blast radius limits.

---

### 4. Partner Tech Choice: Neo4j

* **Selected Partner Tech:** **Neo4j** (Graph Database & Graph Data Science).
* **Product Need It Solves:**
  * Relational SQL databases require expensive, multi-table recursive JOINs that freeze when computing multi-hop paths across enterprise telemetry.
  * Deepening **Neo4j** provides native index-free adjacency and Cypher graph traversal, enabling sub-second shortest-path queries (`Dijkstra/BFS`), topological community detection, and betweenness centrality calculation for real-time choke point identification at enterprise scale.

---

### 5. Definition of Done

> **"GraphOps is complete when a SOC analyst can input a single compromised machine alert, visualize its 1-to-3 hop blast radius within two seconds on an interactive graph, and receive an automated MITRE-mapped attack trajectory and the exact network choke point required to sever the breach."**
