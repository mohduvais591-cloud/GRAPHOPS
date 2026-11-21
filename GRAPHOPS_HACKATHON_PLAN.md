# GraphOps: Proactive Threat Hunting & Blast Radius Containment
## Strategic & Technical Execution Plan for PS T2.1 (Hackathon Guide)

---

## 1. Executive Summary: What We Are Solving (Plain English)

### The Real Problem in Modern Security Operations Centers (SOCs)
* **Alert Fatigue & Disconnection:** Traditional SIEMs (Splunk, Elastic, Sentinel) store log rows in relational tables. When an attacker breaches an endpoint and moves laterally across 5 machines, the SOC receives 20+ separate, disconnected alerts. Analysts waste 4–8 hours manually stitching log rows together with SQL JOIN queries.
* **The "Blast Radius" Blindspot:** When an alert fires saying *Laptop-A is infected with malware*, an analyst cannot instantly answer: *"What can this laptop reach within 1, 2, or 3 hops? Can it reach our core banking database, Active Directory, or production server?"*
* **The Indian Board & Regulatory Context:** As cybersecurity moves from an IT concern to a board-level accountability mandate (CERT-In directives, DPDP Act 2023), companies must provide **auditable evidence** of blast radius containment and attack mitigation rather than mere promises.

### The Solution: GraphOps
Instead of storing isolated log rows, **GraphOps models the enterprise as an interconnected web (knowledge graph)**:
* **Nodes:** Users, Laptops, Servers, IP Addresses, Applications, Vulnerabilities (CVEs).
* **Edges:** Network connections, Logins/Auth, Process executions, Access permissions.

**Why Graph wins:** Finding a lateral movement path across 5 hops in SQL takes exponential, slow JOIN queries. In a graph database, traversing relationships is a direct pointer lookup executed in **milliseconds**.

---

## 2. Leverage: How the Cloned Repository (`Know-edge-graph`) Fast-Tracks Us

We cloned the **AegisGraph AI / Know-edge-graph** repository, which gives us an immediate 70% head start:

| What the Repo Already Provides | How We Use It for PS T2.1 | What We Need to Add/Adapt |
| :--- | :--- | :--- |
| **Full FastAPI Backend + React UI** | Working frontend and backend out of the box. | Tailor UI labels and views for SOC analysts. |
| **Knowledge Graph Engine & Traversal** | Directed graph modeling, hop counting, and route tracing. | Ingest synthetic SOC telemetry (auth logs, network flows, asset list). |
| **Blast Radius & Attack Path Logic** | Already contains attack path calculation and blast radius queries. | Enhance with 1-hop, 2-hop, 3-hop visual neighborhood filters. |
| **Vulnerability & Asset Mapping** | Models Assets, Vulnerabilities (CVEs), and Techniques. | Tag edges with MITRE ATT&CK tactics (e.g., T1078 Valid Accounts, T1021 Remote Services). |
| **Interactive Graph Visualizer** | Interactive canvas displaying nodes and connecting edges. | Add color-coded blast radius rings (Red = Compromised, Orange = 1-hop, Yellow = 2-hop). |

---

## 3. The GraphOps Data Model (Schema Design)

In simple terms, everything is an Entity (Node) or a Relationship (Edge).

### A. Graph Entities (Nodes)
1. **User Identity:** (e.g., `user:rahul_analyst`, `user:svc_backup_admin`)
2. **Endpoint / Host:** (e.g., `host:workstation-014`, `host:db-prod-primary`)
3. **Network / IP:** (e.g., `ip:192.168.1.50`, `subnet:dmz_zone`, `subnet:prod_database_vlan`)
4. **Vulnerability (CVE):** (e.g., `cve:CVE-2024-4577`, `cve:CVE-2023-38606`)
5. **Critical Crown Jewel / Data Asset:** (e.g., `asset:Customer_PII_Vault`, `asset:Core_Ledger_DB`)

### B. Graph Relationships (Edges)
1. `(User)-[:LOGGED_INTO]->(Host)`
2. `(Host)-[:HAS_VULNERABILITY]->(CVE)`
3. `(Host)-[:NETWORK_CAN_REACH {port: 445, protocol: 'SMB'}]->(Host)`
4. `(Host)-[:COMMUNICATES_WITH]->(IP)`
5. `(User)-[:HAS_ACCESS_PERMITTED]->(Asset)` (Static entitlement / policy)
6. `(Process)-[:TOUCHED_FILE]->(Asset)`

---

## 4. Four Core Graph Analytics Engines to Build

### 1. Real-Time Blast Radius Calculator (1-Hop, 2-Hop, 3-Hop)
* **How it works:** When an analyst marks `workstation-014` as COMPROMISED:
  * **1-Hop (Immediate Danger):** All hosts, accounts, or file shares directly connected to `workstation-014` via active sessions or open network routes.
  * **2-Hop (Lateral Threat):** Systems reachable from the 1-hop neighbors (e.g., an internal jump-server or shared domain controller).
  * **3-Hop (Crown Jewel Threat):** Core databases or cloud infrastructure within three steps.
* **Analyst Benefit:** Instead of reading 50 firewall logs, the analyst sees a clear visual ring of affected systems in seconds.

### 2. Proactive Attack Path Modeling (Shortest Path to Crown Jewels)
* **How it works:** Using graph traversal (Dijkstra / Breadth-First Search), the system continuously tests: *"Can an untrusted node in the DMZ reach the Core Banking DB?"*
* **Kill Chain Mapping:** Each step along the path is tagged with the corresponding **MITRE ATT&CK tactic** (e.g., Initial Access $\rightarrow$ Lateral Movement $\rightarrow$ Privilege Escalation).
* **Analyst Benefit:** Pre-incident defense. SOC teams discover paths that attackers *could* take before any exploit actually happens.

### 3. Choke Point Discovery (Betweenness Centrality)
* **What is a Choke Point?** A bridge server, gateway, or service account that appears in 80% of all potential attack paths toward critical assets.
* **How it works:** Graph algorithms calculate which nodes have the highest centrality in paths leading to high-value assets.
* **Analyst Benefit:** Recommends high-impact defensive actions to IT leadership: *"If you revoke admin rights on this single jump host or enforce MFA on account `svc_deploy`, you cut off 14 different attack paths at once."*

### 4. Structural Anomaly Detection & Zero-Trust Gap Analysis
* **Topology vs. Static Rules:** Static rules check *"Did user X log in from IP Y?"*. Graph topology checks: *"Did user X access Server B through Path [User $\rightarrow$ Workstation $\rightarrow$ Dev Server $\rightarrow$ Server B] when historical graph traffic has never seen this connection pattern?"*
* **Zero-Trust Gap (Entitled vs. Actual):**
  * Graph A (Policy): What the user is officially permitted to access.
  * Graph B (Observed): What the user actually connects to in real telemetry.
  * Flag shadow access paths that violate zero-trust architecture.

---

## 5. End-to-End Workflow & Demo Story (For Hackathon Judges)

To win, the live presentation should tell a compelling, realistic 4-minute story:

```
[Step 1: The Alert Storm]
Relational SIEM receives 5 isolated alerts:
- Phishing link clicked on User Laptop
- New PowerShell process spawned
- SSH connection to Staging Server
- Unusual LDAP query
- Port scan towards DB subnet

[Step 2: The GraphOps Ingestion & Stitching]
GraphOps correlates all 5 events onto the connected knowledge graph.
Instead of 5 separate alerts, it outputs 1 unified Incident Narrative:
"Threat Actor moving from Workstation-014 -> Staging-Bastion -> Core DB"

[Step 3: Real-Time Blast Radius Containment]
Analyst clicks "Calculate Blast Radius" for Workstation-014.
- 1-hop: 3 peer workstations quarantined
- 2-hop: Staging Jump Host highlighted in Orange
- 3-hop: Core Financial DB highlighted in Red as an exposed Crown Jewel

[Step 4: Choke Point Recommendation]
GraphOps displays:
"Cut connection between Staging-Bastion and Internal Switch (Port 3389)
to sever all paths to Crown Jewel DB immediately."
```

---

## 6. Phase-by-Phase Execution Roadmap (No-Code to Low-Code)

### Phase 1: Synthetic Telemetry & Graph Seeding (1–2 Hours)
* Prepare a realistic enterprise JSON dataset simulating:
  * 10–15 Enterprise Assets (Laptops, Web Servers, Jump Hosts, Domain Controller, Production DB).
  * 5 User Identities (HR, Developer, SysAdmin, Contractor).
  * 3 Known Vulnerabilities (CVE-2024-4577, Log4Shell, etc.).
  * Telemetry log feed (Auth events, network flows, firewall logs).
* Populate the graph structure using the existing backend storage schema.

### Phase 2: Analytics & Metric Calculators (2–3 Hours)
* **Blast Radius Engine:** Build or adapt an API endpoint (`/v1/analytics/blast-radius`) that takes `node_id` and `max_depth` (1, 2, 3) and returns neighboring nodes grouped by depth tier.
* **Attack Path & Choke Point Finder:** Adapt the existing `/v1/workspaces/{ws}/attack-paths` endpoint to tag each edge with MITRE ATT&CK labels and rank nodes by path frequency (choke points).
* **Zero-Trust Delta:** Compare granted ACL edges against observed telemetry edges.

### Phase 3: SOC Analyst UI Polish (2–3 Hours)
* Take the React/Vite frontend in `Phase4/frontend`:
  * Add a dedicated **"GraphOps SOC Workbench"** view.
  * Visual Controls:
    * **"Simulate Compromise"** button on any selected node.
    * **Blast Radius Tier Toggle** (Hop 1 / Hop 2 / Hop 3).
    * **Choke Point Indicator** highlighting critical bottlenecks in glowing purple/cyan.
    * **Incident Narrative Box** converting raw telemetry paths into human-readable sentences.

### Phase 4: Pitch & Presentation Preparation (1–2 Hours)
* Prepare 5 impactful slides:
  1. The Core Problem (Alert fatigue, relational DB slow joins, board liability in India).
  2. The Architecture (GraphOps Knowledge Graph vs. Traditional SIEM).
  3. Live Demo (Interactive UI, Blast radius calculation, choke point mitigation).
  4. Business Impact (Incident response time reduced from 4 hours to 90 seconds).
  5. Regulatory & Zero-Trust Alignment (Auditable graph traces for CERT-In / DPDP compliance).

---

## 7. Key Value Propositions to Emphasize to Judges

1. **"From Minutes to Milliseconds":** Relational multi-table JOINs fail at multi-hop depth. Graphs traverse pointers in real time.
2. **"Alert Consolidation":** Turning 25 disjointed log events into a single, cohesive attack trajectory.
3. **"Actionable Defense":** Not just notifying that an attack occurred, but giving the exact firewall rule or privilege revocation that cuts off the attack path (Choke Point).
4. **"Zero-Trust by Design":** Continuous comparison between who has access vs. who is actively traversing paths.
