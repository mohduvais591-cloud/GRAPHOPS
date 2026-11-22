import React, { useState, useEffect, useRef, useCallback } from 'react';
import GraphCanvas from './components/GraphCanvas';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Minimal Category Styles ──────────────────────────────────────────────────
const CATEGORY_STYLES = {
  'UI':             { border: '#0284c7', text: '#0369a1', bg: '#f0f9ff', tag: 'UI' },
  'API / Routing':  { border: '#4f46e5', text: '#4338ca', bg: '#eef2ff', tag: 'API' },
  'Authentication': { border: '#e11d48', text: '#be123c', bg: '#fff1f2', tag: 'AUTH' },
  'Storage / DB':   { border: '#059669', text: '#047857', bg: '#ecfdf5', tag: 'DB' },
  'Service':        { border: '#d97706', text: '#b45309', bg: '#fffbeb', tag: 'SVC' },
  'Module':         { border: '#111111', text: '#111111', bg: '#f5f5f5', tag: 'MOD' },
  'Utility':        { border: '#475569', text: '#334155', bg: '#f8fafc', tag: 'UTIL' },
};

const getCategoryStyle = (cat) => CATEGORY_STYLES[cat] || CATEGORY_STYLES['Module'];

const SEVERITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'CRITICAL' },
  HIGH:     { color: '#ea580c', bg: '#fff7ed', border: '#fdba74', label: 'HIGH' },
  MEDIUM:   { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: 'MEDIUM' },
  LOW:      { color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', label: 'LOW' },
};

const WISPR_VOCABULARY = [
  'GraphOps', 'Qwen 3', 'Neo4j', 'Ollama', 'FastAPI', 'ChromaDB',
  'AST', 'call graph', 'dependency graph', 'blast radius', 'source-to-sink',
  'test impact', 'middleware', 'route handler', 'Supabase', 'TypeScript',
  'React', 'Vite', 'evidence object', 'Change Safety Report',
];

// ─── SVG Interactive Graph Canvas (4 Modes) ──────────────────────────────────
function MinimalGraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  categoryFilter,
  graphMode,          // 'architecture' | 'impact' | 'security' | 'tests'
  vulnerabilities,
  onAskAboutNode,
  onInspectNode,
}) {
  const svgRef = useRef(null);
  const [positions, setPositions] = useState({});
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState(null);

  const W = 960;
  const H = 580;
  const NODE_RADIUS = 34;

  // Compute dependents for Impact Mode
  const { directDependents, indirectDependents } = React.useMemo(() => {
    if (!selectedNodeId || graphMode !== 'impact') {
      return { directDependents: new Set(), indirectDependents: new Set() };
    }
    const direct = new Set();
    const indirect = new Set();

    edges.forEach((e) => {
      if (e.target === selectedNodeId) direct.add(e.source);
    });

    direct.forEach((dId) => {
      edges.forEach((e) => {
        if (e.target === dId && e.source !== selectedNodeId && !direct.has(e.source)) {
          indirect.add(e.source);
        }
      });
    });

    return { directDependents: direct, indirectDependents: indirect };
  }, [selectedNodeId, edges, graphMode]);

  // Compute node vulnerability mapping
  const nodeVulnMap = React.useMemo(() => {
    const map = {};
    nodes.forEach((n) => {
      const nFiles = new Set(n.locations?.map((l) => l.file) || []);
      const matched = (vulnerabilities || []).filter((v) => nFiles.has(v.file));
      if (matched.length > 0) map[n.id] = matched;
    });
    return map;
  }, [nodes, vulnerabilities]);

  // Compute node test mapping
  const nodeTestMap = React.useMemo(() => {
    const map = {};
    nodes.forEach((n) => {
      const nFiles = n.locations?.map((l) => l.file) || [];
      let hasTest = false;
      edges.forEach((e) => {
        if (e.target === n.id && (e.relationship || '').toUpperCase() === 'TESTS') hasTest = true;
      });
      if (!hasTest) {
        nFiles.forEach((f) => {
          const base = f.split('/').pop().split('\\').pop();
          const name = base.split('.')[0];
          nodes.forEach((n2) => {
            (n2.locations || []).forEach((loc) => {
              if (loc.file && (loc.file.includes(`test_${name}`) || loc.file.includes(`${name}.test`))) {
                hasTest = true;
              }
            });
          });
        });
      }
      map[n.id] = hasTest;
    });
    return map;
  }, [nodes, edges]);

  // Filter nodes based on category and search
  const visibleNodes = nodes.filter((node) => {
    const matchCat = categoryFilter === 'ALL' || node.category === categoryFilter;
    const matchQuery = !searchQuery ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  // Initialize circular positions
  useEffect(() => {
    if (!nodes.length) return;
    const n = nodes.length;
    const newPos = {};
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n;
      const r = Math.min(230, 90 + n * 22);
      newPos[node.id] = {
        x: W / 2 + r * Math.cos(angle),
        y: H / 2 + r * Math.sin(angle),
      };
    });
    setPositions(newPos);
  }, [nodes.map((n) => n.id).join(',')]);

  // Force relaxation
  useEffect(() => {
    if (!nodes.length) return;
    let frameId;
    let iteration = 0;

    const relax = () => {
      if (iteration > 60) return;
      setPositions((prev) => {
        const next = { ...prev };
        nodes.forEach((n1) => {
          let fx = 0, fy = 0;
          const p1 = next[n1.id];
          if (!p1) return;

          nodes.forEach((n2) => {
            if (n1.id === n2.id) return;
            const p2 = next[n2.id];
            if (!p2) return;
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 3600 / (dist * dist);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          });

          edges.forEach((e) => {
            let otherId = null;
            if (e.source === n1.id) otherId = e.target;
            else if (e.target === n1.id) otherId = e.source;
            if (!otherId) return;
            const p2 = next[otherId];
            if (!p2) return;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - 140) * 0.015;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          });

          fx += (W / 2 - p1.x) * 0.005;
          fy += (H / 2 - p1.y) * 0.005;

          next[n1.id] = {
            x: Math.max(NODE_RADIUS + 24, Math.min(W - NODE_RADIUS - 24, p1.x + fx * 0.5)),
            y: Math.max(NODE_RADIUS + 24, Math.min(H - NODE_RADIUS - 24, p1.y + fy * 0.5)),
          };
        });
        return next;
      });
      iteration++;
      frameId = requestAnimationFrame(relax);
    };

    frameId = requestAnimationFrame(relax);
    return () => cancelAnimationFrame(frameId);
  }, [nodes.length, edges.length]);

  const handleMouseDownNode = (e, id) => {
    e.stopPropagation();
    setDragging(id);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setPositions((prev) => ({
        ...prev,
        [dragging]: {
          x: (prev[dragging]?.x || 0) + dx,
          y: (prev[dragging]?.y || 0) + dy,
        },
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => setDragging(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#FFFFFF',
        userSelect: 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Zoom / Pan Controls */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          gap: 4,
          zIndex: 10,
          background: '#FFFFFF',
          border: '1px solid #E5E5E5',
          borderRadius: 8,
          padding: '4px 6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
        }}
      >
        <button
          onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
          style={{ padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#111111' }}
          title="Zoom In"
        >
          +
        </button>
        <span style={{ fontSize: 11, color: '#666666', alignSelf: 'center', minWidth: 34, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
          style={{ padding: '4px 8px', fontSize: 13, fontWeight: 600, color: '#111111' }}
          title="Zoom Out"
        >
          –
        </button>
        <div style={{ width: 1, background: '#E5E5E5', margin: '2px 2px' }} />
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          style={{ padding: '4px 8px', fontSize: 11, fontWeight: 500, color: '#555555' }}
        >
          Reset View
        </button>
      </div>

      {/* Main SVG Graph */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', transform: `scale(${zoom})`, transformOrigin: 'center' }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#888888" />
          </marker>
          <marker id="arrowSelected" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#111111" />
          </marker>
          <marker id="arrowImpact" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* Directed Edges */}
        {edges.map((edge, i) => {
          const p1 = positions[edge.source];
          const p2 = positions[edge.target];
          if (!p1 || !p2) return null;
          if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return null;

          const isConnected = selectedNodeId === edge.source || selectedNodeId === edge.target;
          let strokeColor = isConnected ? '#111111' : '#CCCCCC';
          let strokeWidth = isConnected ? 2 : 1;
          let markerId = isConnected ? 'url(#arrowSelected)' : 'url(#arrow)';
          let edgeOpacity = 1;

          if (graphMode === 'impact' && selectedNodeId) {
            const isImpactEdge = (edge.target === selectedNodeId && directDependents.has(edge.source)) ||
                                 (directDependents.has(edge.target) && indirectDependents.has(edge.source));
            if (isImpactEdge) {
              strokeColor = '#ef4444';
              strokeWidth = 2.5;
              markerId = 'url(#arrowImpact)';
            } else if (!isConnected) {
              edgeOpacity = 0.15;
            }
          }

          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          return (
            <g key={i} style={{ opacity: edgeOpacity }}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                markerEnd={markerId}
              />
              <text
                x={midX}
                y={midY - 4}
                textAnchor="middle"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                fill={isConnected ? '#111111' : '#888888'}
                fontWeight={isConnected ? 600 : 400}
                style={{ background: '#FFFFFF' }}
              >
                {edge.relationship}
              </text>
            </g>
          );
        })}

        {/* Functional Nodes */}
        {visibleNodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const isSelected = selectedNodeId === node.id;
          const cat = getCategoryStyle(node.category);

          // Mode-specific Styling & Muting
          let nodeBg = cat.bg;
          let nodeBorder = isSelected ? '#111111' : cat.border;
          let nodeOpacity = 1;
          let badgeText = cat.tag;
          let badgeColor = cat.text;
          let badgeBg = '#FFFFFF';
          let badgeBorder = cat.border;
          let extraRing = null;

          // 1. IMPACT MODE
          if (graphMode === 'impact') {
            if (selectedNodeId) {
              if (node.id === selectedNodeId) {
                nodeBorder = '#111111';
                badgeText = 'FOCUS';
                badgeColor = '#FFFFFF';
                badgeBg = '#111111';
                badgeBorder = '#111111';
              } else if (directDependents.has(node.id)) {
                nodeBg = '#fffbeb';
                nodeBorder = '#d97706';
                badgeText = 'DIRECT';
                badgeColor = '#b45309';
                badgeBg = '#fef3c7';
                badgeBorder = '#f59e0b';
                extraRing = '#f59e0b';
              } else if (indirectDependents.has(node.id)) {
                nodeBg = '#fef2f2';
                nodeBorder = '#dc2626';
                badgeText = 'INDIRECT';
                badgeColor = '#b91c1c';
                badgeBg = '#fee2e2';
                badgeBorder = '#ef4444';
                extraRing = '#ef4444';
              } else {
                nodeOpacity = 0.22;
              }
            }
          }

          // 2. SECURITY MODE
          else if (graphMode === 'security') {
            const nodeVulns = nodeVulnMap[node.id];
            if (nodeVulns && nodeVulns.length > 0) {
              const hasCrit = nodeVulns.some((v) => v.severity === 'CRITICAL');
              nodeBg = hasCrit ? '#fef2f2' : '#fff7ed';
              nodeBorder = hasCrit ? '#dc2626' : '#ea580c';
              badgeText = `${nodeVulns.length} VULN`;
              badgeColor = hasCrit ? '#dc2626' : '#ea580c';
              badgeBg = '#FFFFFF';
              badgeBorder = nodeBorder;
              extraRing = hasCrit ? '#dc2626' : '#ea580c';
            } else {
              nodeOpacity = 0.35;
            }
          }

          // 3. TESTS MODE
          else if (graphMode === 'tests') {
            const hasTest = nodeTestMap[node.id];
            if (hasTest) {
              nodeBg = '#ecfdf5';
              nodeBorder = '#059669';
              badgeText = 'TESTED';
              badgeColor = '#047857';
              badgeBg = '#d1fae5';
              badgeBorder = '#10b981';
            } else {
              nodeBg = '#fff7ed';
              nodeBorder = '#f97316';
              badgeText = 'GAP';
              badgeColor = '#c2410c';
              badgeBg = '#ffedd5';
              badgeBorder = '#f97316';
            }
          }

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: 'pointer', opacity: nodeOpacity, transition: 'opacity 0.2s ease' }}
              onClick={() => onSelectNode(isSelected ? null : node.id)}
              onMouseDown={(e) => handleMouseDownNode(e, node.id)}
            >
              {/* Extra Mode Highlight Ring */}
              {extraRing && (
                <circle
                  r={NODE_RADIUS + 7}
                  fill="none"
                  stroke={extraRing}
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                />
              )}

              {/* Outer selection ring */}
              {isSelected && (
                <circle
                  r={NODE_RADIUS + 6}
                  fill="none"
                  stroke="#111111"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
              )}

              {/* Node Body */}
              <circle
                r={NODE_RADIUS}
                fill={nodeBg}
                stroke={isSelected ? '#111111' : nodeBorder}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />

              {/* Category / Mode Badge */}
              <rect
                x="-22"
                y="-26"
                width="44"
                height="13"
                rx="3"
                fill={badgeBg}
                stroke={badgeBorder}
                strokeWidth="1"
              />
              <text
                x="0"
                y="-17"
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill={badgeColor}
                letterSpacing="0.4"
              >
                {badgeText}
              </text>

              {/* Node Label */}
              <text
                x="0"
                y="5"
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="#111111"
                fontFamily="Inter, sans-serif"
              >
                {node.name.length > 14 ? node.name.slice(0, 13) + '…' : node.name}
              </text>

              {/* Locations / Status Count */}
              <text
                x="0"
                y="18"
                textAnchor="middle"
                fontSize="9"
                fill="#666666"
                fontFamily="JetBrains Mono, monospace"
              >
                {graphMode === 'security' && nodeVulnMap[node.id]
                  ? `${nodeVulnMap[node.id].length} issues`
                  : graphMode === 'tests'
                  ? nodeTestMap[node.id] ? 'verified' : 'no tests'
                  : `${node.locations?.length || 0} locs`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Selected Node Detail Card */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            width: 330,
            background: '#FFFFFF',
            border: '1px solid #111111',
            borderRadius: 10,
            padding: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 15,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: getCategoryStyle(selectedNode.category).bg,
                  color: getCategoryStyle(selectedNode.category).text,
                  border: `1px solid ${getCategoryStyle(selectedNode.category).border}`,
                }}
              >
                {selectedNode.category}
              </span>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginTop: 4 }}>
                {selectedNode.name}
              </h3>
            </div>
            <button
              onClick={() => onSelectNode(null)}
              style={{ fontSize: 13, color: '#888888', padding: '2px 6px' }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: 12, color: '#555555', marginBottom: 10, lineHeight: 1.4 }}>
            {selectedNode.summary}
          </p>

          <div style={{ fontSize: 10, fontWeight: 700, color: '#888888', textTransform: 'uppercase', marginBottom: 4 }}>
            Source Locations
          </div>
          <div style={{ maxHeight: 75, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
            {selectedNode.locations?.map((loc, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: '#F5F5F5',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <span style={{ color: '#111111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc.file}
                </span>
                <span style={{ color: '#666666', flexShrink: 0, marginLeft: 8 }}>
                  L{loc.start_line}–{loc.end_line}
                </span>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => onAskAboutNode(selectedNode)}
              style={{
                flex: 1,
                background: '#111111',
                color: '#FFFFFF',
                padding: '6px 10px',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              Ask Qwen →
            </button>
            <button
              onClick={() => onInspectNode(selectedNode, 'impact')}
              style={{
                padding: '6px 8px',
                background: '#F5F5F5',
                border: '1px solid #E5E5E5',
                borderRadius: 5,
                fontSize: 10.5,
                fontWeight: 600,
                color: '#111111',
              }}
              title="Focus Impact & Blast Radius"
            >
              Blast Radius
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App Component ───────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('login'); // 'login' | 'connect' | 'analyzing' | 'workspace'
  const [user, setUser] = useState({ name: 'Developer', email: 'dev@local' });
  const [repoPathInput, setRepoPathInput] = useState('.');
  const [repoZipFile, setRepoZipFile] = useState(null);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [analysisError, setAnalysisError] = useState(null);
  const [repoData, setRepoData] = useState(null);

  // Workspace Navigation & Controls
  const [activeTab, setActiveTab] = useState('graph'); // 'graph' | 'findings' | 'files' | 'change-safety'
  const [graphMode, setGraphMode] = useState('architecture'); // 'architecture' | 'impact' | 'security' | 'tests'
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedFindingId, setSelectedFindingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Wispr Flow & Depth Controls
  const [depth, setDepth] = useState('normal'); // 'quick' | 'normal' | 'detailed' | 'expert'
  const [showWisprModal, setShowWisprModal] = useState(false);
  const [diffInput, setDiffInput] = useState('');
  const [safetyReport, setSafetyReport] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // AI Chat State
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Welcome to GraphOps. Ask me anything about the codebase architecture, dataflow, or security posture.',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [qwenHealth, setQwenHealth] = useState({ status: 'checking', configured_model: 'qwen3:8b' });

  const chatScrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Check Qwen status on mount
  useEffect(() => {
    fetch(`${API_BASE}/v1/ai/status`)
      .then((r) => r.json())
      .then((data) => setQwenHealth(data))
      .catch(() => setQwenHealth({ status: 'offline', configured_model: 'qwen3:8b' }));
  }, []);

  // Auto-resize textarea for Wispr dictation
  const handleInputChange = (e) => {
    setInputQuery(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  };

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isAiStreaming]);

  // Stage-based analysis trigger
  const runAnalysis = async () => {
    setScreen('analyzing');
    setAnalysisError(null);
    setAnalysisStage(1);

    try {
      await new Promise((r) => setTimeout(r, 400));
      setAnalysisStage(2);

      let data;
      if (repoZipFile) {
        const formData = new FormData();
        formData.append('file', repoZipFile);
        const resp = await fetch(`${API_BASE}/v1/repo/upload-zip`, {
          method: 'POST',
          body: formData,
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Failed to analyze ZIP repository.');
        }
        data = await resp.json();
      } else {
        const resp = await fetch(`${API_BASE}/v1/repo/analyze-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: repoPathInput }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Failed to scan local repository path.');
        }
        data = await resp.json();
      }

      setAnalysisStage(3);
      await new Promise((r) => setTimeout(r, 300));
      setAnalysisStage(4);
      await new Promise((r) => setTimeout(r, 300));
      setAnalysisStage(5);
      await new Promise((r) => setTimeout(r, 200));

      setRepoData(data);
      setScreen('workspace');
    } catch (err) {
      setAnalysisError(err.message);
    }
  };

  // AI Query Handler
  const handleSendQuery = async (customQuery) => {
    const q = (customQuery || inputQuery).trim();
    if (!q || isAiStreaming) return;

    setInputQuery('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setIsAiStreaming(true);

    try {
      const resp = await fetch(`${API_BASE}/v1/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          repo_name: repoData?.repo_name || 'Repository',
          nodes: repoData?.functional_nodes || [],
          edges: repoData?.functional_edges || [],
          vulnerabilities: repoData?.vulnerabilities || [],
          selected_node_id: selectedNodeId,
          selected_finding_id: selectedFindingId,
          depth: depth,
        }),
      });

      if (!resp.ok) throw new Error('Failed to get answer from AI agent.');
      const result = await resp.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.answer,
          mode: result.mode,
          model: result.model_used,
          scope: result.context_scope,
          evidence: result.evidence,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Error communicating with AI analyst: ${err.message}`,
          mode: 'error',
        },
      ]);
    } finally {
      setIsAiStreaming(false);
    }
  };

  // Change Safety Report Handler
  const handleGenerateSafetyReport = async () => {
    if (!repoData) return;
    setIsGeneratingReport(true);
    try {
      const changedFiles = diffInput
        .split('\n')
        .map((l) => l.trim().replace(/^[\+\-\*\#\s]+/, ''))
        .filter((l) => l.includes('.') && !l.startsWith('diff'));

      const resp = await fetch(`${API_BASE}/v1/analysis/change-safety`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changed_files: changedFiles,
          diff_text: diffInput,
          nodes: repoData.functional_nodes || [],
          edges: repoData.functional_edges || [],
          vulnerabilities: repoData.vulnerabilities || [],
        }),
      });

      if (!resp.ok) throw new Error('Failed to compute safety report.');
      const data = await resp.json();
      setSafetyReport(data);
    } catch (err) {
      alert(`Report error: ${err.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Calculate unique files from nodes and findings
  const scannedFilesList = repoData
    ? Array.from(
        new Set([
          ...(repoData.functional_nodes?.flatMap((n) => n.locations?.map((l) => l.file) || []) || []),
          ...(repoData.vulnerabilities?.map((v) => v.file) || []),
        ])
      ).filter(Boolean)
    : [];

  const filteredVulns = repoData?.vulnerabilities?.filter((v) => {
    const matchSev = severityFilter === 'ALL' || v.severity === severityFilter;
    const matchQuery = !searchQuery ||
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.file.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSev && matchQuery;
  }) || [];

  // Active Context String
  const activeContextIndicator = selectedNodeId
    ? `Node: ${repoData?.functional_nodes?.find((n) => n.id === selectedNodeId)?.name || selectedNodeId}`
    : selectedFindingId
    ? `Finding: ${repoData?.vulnerabilities?.find((v) => v.id === selectedFindingId)?.title?.slice(0, 24) || selectedFindingId}`
    : 'Entire repository';

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 1: LOGIN SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === 'login') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        <div style={{ width: 390, padding: 32, border: '1px solid #E5E5E5', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, background: '#111111', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, fontSize: 14 }}>
              A
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111111' }}>GraphOps</h1>
          </div>
          <p style={{ fontSize: 13, color: '#666666', marginBottom: 24, lineHeight: 1.5 }}>
            Evidence-Backed Code Intelligence, 4-Mode Interactive Graph, Wispr Flow Dictation & Local Qwen 3 Agent.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555555', display: 'block', marginBottom: 6 }}>
              Developer Identity
            </label>
            <input
              type="text"
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #E5E5E5', borderRadius: 6, fontSize: 13 }}
            />
          </div>
          <button
            onClick={() => setScreen('connect')}
            style={{ width: '100%', background: '#111111', color: '#FFFFFF', padding: '10px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}
          >
            Continue as Developer →
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 2: CONNECT LOCAL REPOSITORY
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === 'connect') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF' }}>
        <header style={{ height: 52, borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, background: '#111111', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, fontSize: 11 }}>
              A
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111111' }}>GraphOps</span>
          </div>
          <span style={{ fontSize: 12, color: '#666666' }}>Logged in as <strong>{user.name}</strong></span>
        </header>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 520, border: '1px solid #E5E5E5', borderRadius: 12, padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111111', marginBottom: 6 }}>
              Connect Local Repository
            </h2>
            <p style={{ fontSize: 13, color: '#666666', marginBottom: 24, lineHeight: 1.5 }}>
              Provide the directory path of any local Git repository or upload a repository ZIP.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#555555', display: 'block', marginBottom: 6 }}>
                Local Folder Path
              </label>
              <input
                type="text"
                value={repoPathInput}
                onChange={(e) => { setRepoPathInput(e.target.value); setRepoZipFile(null); }}
                placeholder="e.g. . (Current Workspace)"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #CCCCCC', borderRadius: 6, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#888888' }}>
                  Workspace default: <code>. (Current Workspace)</code>
                </span>
                <button
                  type="button"
                  onClick={() => { setRepoPathInput('.'); setRepoZipFile(null); }}
                  style={{ fontSize: 10, padding: '2px 8px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                >
                  ⚡ Auto-Fill Current Workspace
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#555555', display: 'block', marginBottom: 6 }}>
                Or Upload Repository ZIP
              </label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => { setRepoZipFile(e.target.files[0]); }}
                style={{ fontSize: 12, color: '#555555' }}
              />
              {repoZipFile && (
                <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
                  Selected: <strong>{repoZipFile.name}</strong> ({(repoZipFile.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
              <div>🛡️ <strong>Passive Read-Only Mode:</strong> Source files are parsed into AST and regex tokens; no code is run or modified.</div>
              <div style={{ marginTop: 4 }}>📁 <strong>Automatically excluded:</strong> <code>.git</code>, <code>node_modules</code>, <code>.venv</code>, <code>dist</code>, <code>build</code>.</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={runAnalysis}
                style={{ width: '100%', background: '#111111', color: '#FFFFFF', padding: '11px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Start Repository Analysis →
              </button>
              <button
                onClick={() => {
                  setRepoData({ repo_name: 'GraphOps-SOC', functional_nodes: [], functional_edges: [], vulnerabilities: [] });
                  setActiveTab('soc-hunter');
                  setScreen('workspace');
                }}
                style={{ width: '100%', background: '#0284c7', color: '#FFFFFF', padding: '11px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                🎯 Direct Launch: SOC Threat Hunting Workbench (500 Nodes / AuraDB) →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 3: ANALYSIS PROGRESS SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (screen === 'analyzing') {
    const stages = [
      'Scanning local files & verifying directory structure',
      'Parsing source tree with AST and language lexers',
      'Synthesizing Functional Knowledge Graph',
      'Executing static vulnerability priority engine',
      'Preparing local Qwen 3 AI grounding context',
    ];

    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        <div style={{ width: 500, border: '1px solid #E5E5E5', borderRadius: 12, padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111111', marginBottom: 8 }}>
            Analyzing Repository…
          </h2>
          <p style={{ fontSize: 12.5, color: '#666666', marginBottom: 24 }}>
            Building high-level functional concepts and detecting security vulnerabilities.
          </p>

          {analysisError ? (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: 16, borderRadius: 8, fontSize: 12, marginBottom: 20 }}>
              <strong>Analysis Error:</strong> {analysisError}
              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setRepoPathInput('.'); setTimeout(() => runAnalysis(), 50); }}
                  style={{ background: '#0284c7', color: '#FFFFFF', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  ⚡ Scan Current Workspace (.)
                </button>
                <button
                  onClick={() => {
                    setRepoData({ repo_name: 'GraphOps-SOC', functional_nodes: [], functional_edges: [], vulnerabilities: [] });
                    setActiveTab('soc-hunter');
                    setScreen('workspace');
                  }}
                  style={{ background: '#7c3aed', color: '#FFFFFF', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  🎯 Open SOC Threat Hunter
                </button>
                <button
                  onClick={() => setScreen('connect')}
                  style={{ background: '#DC2626', color: '#FFFFFF', padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  ← Return & Change Path
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {stages.map((stageName, idx) => {
                const stageNumber = idx + 1;
                const isDone = analysisStage > stageNumber;
                const isCurrent = analysisStage === stageNumber;

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 12.5,
                      color: isDone ? '#111111' : isCurrent ? '#111111' : '#AAAAAA',
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: isDone ? 'none' : isCurrent ? '2px solid #111111' : '1px solid #CCCCCC',
                        background: isDone ? '#111111' : isCurrent ? '#FFFFFF' : '#FFFFFF',
                        color: isDone ? '#FFFFFF' : '#111111',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {isDone ? '✓' : stageNumber}
                    </div>
                    <span>{stageName}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!analysisError && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setScreen('connect')}
                style={{ fontSize: 12, color: '#888888', padding: '4px 8px' }}
              >
                Cancel Analysis
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 4: WORKSPACE (GRAPH-FIRST WITH 4 MODES & WISPR FLOW)
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF', overflow: 'hidden' }}>
      
      {/* ─── Top Navigation Header ─────────────────────────────────────── */}
      <header
        style={{
          height: 48,
          borderBottom: '1px solid #E5E5E5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: '#FFFFFF',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 22, background: '#111111', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, fontSize: 11 }}>
              A
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111111', letterSpacing: '-0.2px' }}>
              GraphOps
            </span>
          </div>

          <div style={{ width: 1, height: 16, background: '#E5E5E5' }} />

          {/* Repo Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#111111', fontFamily: 'JetBrains Mono, monospace' }}>
              {repoData?.repo_name || 'my-repository'}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
          </div>

          <div style={{ width: 1, height: 16, background: '#E5E5E5' }} />

          {/* Navigation Tabs */}
          <nav style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'graph', label: 'Graph', count: repoData?.functional_nodes?.length },
              { id: 'findings', label: 'Findings', count: repoData?.vulnerabilities?.length },
              { id: 'files', label: 'Files', count: scannedFilesList.length },
              { id: 'change-safety', label: '🛡️ Change Safety', count: null },
              { id: 'soc-hunter', label: '🎯 SOC Threat Hunter (500 Nodes)', count: '500' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  color: activeTab === tab.id ? '#111111' : '#666666',
                  background: activeTab === tab.id ? '#F5F5F5' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 10,
                      background: activeTab === tab.id ? '#E5E5E5' : '#F5F5F5',
                      color: '#444444',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Right Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Quick Search */}
          <input
            type="text"
            placeholder="Search graph, findings, files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '4px 10px',
              fontSize: 11.5,
              border: '1px solid #E5E5E5',
              borderRadius: 6,
              width: 180,
              background: '#FAFAFA',
            }}
          />

          {/* Wispr Flow Custom Dictionary Modal Trigger */}
          <button
            onClick={() => setShowWisprModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #E5E5E5',
              background: '#FFFFFF',
              fontSize: 11,
              fontWeight: 600,
              color: '#333333',
            }}
            title="Open Wispr Flow developer vocabulary"
          >
            <span>🎙️ Wispr Dict</span>
          </button>

          {/* Qwen 3 Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid #E5E5E5',
              background: '#FAFAFA',
              color: '#333333',
            }}
            title={qwenHealth.ollama_online ? 'Local Qwen 3 is connected via Ollama' : 'Ollama is offline; graph-grounded fallback active'}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: qwenHealth.ollama_online ? '#059669' : '#d97706',
              }}
            />
            <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
              {qwenHealth.configured_model || 'qwen3:8b'}
            </span>
          </div>

          <button
            onClick={() => setScreen('connect')}
            style={{ padding: '4px 8px', fontSize: 11, color: '#666666', border: '1px solid #E5E5E5', borderRadius: 6 }}
          >
            Change Repo
          </button>
        </div>
      </header>

      {/* ─── Main Content Split Layout ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Center Content Area ── */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* TAB 1: GRAPH VIEW (4 MODES) */}
          {activeTab === 'graph' && (
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {/* Graph Toolbar with 4 Modes */}
              <div
                style={{
                  height: 42,
                  borderBottom: '1px solid #E5E5E5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                  background: '#FFFFFF',
                  zIndex: 5,
                }}
              >
                {/* 4 Graph Modes */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#888888', textTransform: 'uppercase', marginRight: 4 }}>
                    Graph Mode:
                  </span>
                  {[
                    { id: 'architecture', label: 'Architecture', desc: 'Component structure & modules' },
                    { id: 'impact', label: 'Impact', desc: 'Blast radius & direct/indirect dependents' },
                    { id: 'security', label: 'Security', desc: 'Vulnerabilities & critical sink paths' },
                    { id: 'tests', label: 'Tests', desc: 'Code coverage & identified test gaps' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setGraphMode(mode.id)}
                      title={mode.desc}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: graphMode === mode.id ? 700 : 500,
                        color: graphMode === mode.id ? '#FFFFFF' : '#444444',
                        background: graphMode === mode.id ? '#111111' : '#F5F5F5',
                        border: '1px solid ' + (graphMode === mode.id ? '#111111' : '#E5E5E5'),
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {/* Sub-Filters / Instructions */}
                {graphMode === 'architecture' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#888888', textTransform: 'uppercase' }}>
                      Category:
                    </span>
                    {['ALL', 'UI', 'API / Routing', 'Authentication', 'Storage / DB', 'Service'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        style={{
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: categoryFilter === cat ? 700 : 500,
                          color: categoryFilter === cat ? '#111111' : '#666666',
                          background: categoryFilter === cat ? '#E5E5E5' : 'transparent',
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#666666', fontStyle: 'italic' }}>
                    {graphMode === 'impact' && (selectedNodeId ? 'Showing blast radius & dependents' : 'Click any node to calculate blast radius')}
                    {graphMode === 'security' && 'Nodes with vulnerabilities highlighted in red'}
                    {graphMode === 'tests' && 'Green = verified test coverage · Orange = test gap'}
                  </div>
                )}
              </div>

              {/* Canvas */}
              <div style={{ flex: 1, position: 'relative' }}>
                <MinimalGraphCanvas
                  nodes={repoData?.functional_nodes || []}
                  edges={repoData?.functional_edges || []}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={(id) => {
                    setSelectedNodeId(id);
                    setSelectedFindingId(null);
                  }}
                  searchQuery={searchQuery}
                  categoryFilter={categoryFilter}
                  graphMode={graphMode}
                  vulnerabilities={repoData?.vulnerabilities || []}
                  onAskAboutNode={(node) => {
                    handleSendQuery(`Explain what the '${node.name}' (${node.category}) component does in this project.`);
                  }}
                  onInspectNode={(node, mode) => {
                    setSelectedNodeId(node.id);
                    setGraphMode(mode);
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 2: FINDINGS VIEW */}
          {activeTab === 'findings' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#FAFAFA' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => {
                  const count = sev === 'ALL'
                    ? repoData?.vulnerabilities?.length || 0
                    : repoData?.vulnerabilities?.filter((v) => v.severity === sev).length || 0;
                  const active = severityFilter === sev;
                  const cfg = SEVERITY_CONFIG[sev];

                  return (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(sev)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: active ? '1px solid #111111' : '1px solid #E5E5E5',
                        background: '#FFFFFF',
                        color: active ? '#111111' : '#666666',
                        fontSize: 11.5,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {cfg && <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />}
                      <span>{sev}</span>
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: '#F5F5F5' }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredVulns.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#888888', fontSize: 13, background: '#FFFFFF', borderRadius: 8, border: '1px solid #E5E5E5' }}>
                    No security vulnerabilities found matching the current criteria.
                  </div>
                ) : (
                  filteredVulns.map((v) => {
                    const cfg = SEVERITY_CONFIG[v.severity] || SEVERITY_CONFIG.LOW;
                    const isSelected = selectedFindingId === v.id;

                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedFindingId(isSelected ? null : v.id);
                          setSelectedNodeId(null);
                        }}
                        style={{
                          background: '#FFFFFF',
                          border: isSelected ? '1.5px solid #111111' : '1px solid #E5E5E5',
                          borderRadius: 8,
                          padding: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                color: cfg.color,
                                background: cfg.bg,
                                border: `1px solid ${cfg.border}`,
                              }}
                            >
                              {v.severity}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#111111' }}>
                              {v.title}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#666666' }}>
                            {v.file}:{v.line}
                          </span>
                        </div>

                        {v.code_snippet && (
                          <div style={{ background: '#F8FAFC', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#334155', border: '1px solid #E2E8F0', marginBottom: 8, overflowX: 'auto', whiteSpace: 'pre' }}>
                            {v.code_snippet}
                          </div>
                        )}

                        <p style={{ fontSize: 12, color: '#555555', marginBottom: 8, lineHeight: 1.45 }}>
                          {v.description}
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 11.5, color: '#047857', background: '#ecfdf5', padding: '4px 8px', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                            💡 <strong>Fix:</strong> {v.fix}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFindingId(v.id);
                              handleSendQuery(`Explain this security finding: ${v.title} in ${v.file}:${v.line} and suggest remediation.`);
                            }}
                            style={{
                              background: '#111111',
                              color: '#FFFFFF',
                              padding: '4px 10px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            Ask Qwen to Fix →
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FILES VIEW */}
          {activeTab === 'files' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#FFFFFF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111111', marginBottom: 12 }}>
                Scanned Repository Files ({scannedFilesList.length})
              </div>
              <div style={{ border: '1px solid #E5E5E5', borderRadius: 8, overflow: 'hidden' }}>
                {scannedFilesList.map((filePath, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 14px',
                      borderBottom: i < scannedFilesList.length - 1 ? '1px solid #F0F0F0' : 'none',
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#111111',
                    }}
                  >
                    <span>📄 {filePath}</span>
                    <button
                      onClick={() => handleSendQuery(`What is the purpose of the file ${filePath} in this project?`)}
                      style={{ fontSize: 11, color: '#555555', textDecoration: 'underline' }}
                    >
                      Ask Qwen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SOC THREAT HUNTER */}
          {activeTab === 'soc-hunter' && (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0b1120', display: 'flex', flexDirection: 'column' }}>
              <GraphCanvas graphData={{ nodes: [], edges: [] }} />
            </div>
          )}

          {/* TAB 4: CHANGE SAFETY REPORT & DIFF */}
          {activeTab === 'change-safety' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#FAFAFA' }}>
              <div style={{ maxWidth: 840, margin: '0 auto' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111111', marginBottom: 6 }}>
                  🛡️ Change Safety & Blast Radius Report
                </h2>
                <p style={{ fontSize: 12.5, color: '#666666', marginBottom: 18 }}>
                  Deterministic impact assessment: maps changed files/diff to functional nodes, traces dependent routes, checks security implications, and flags test gaps.
                </p>

                {/* Diff Input Area */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#555555', display: 'block', marginBottom: 6 }}>
                    Changed Files or Git Diff (Paste file paths or git diff)
                  </label>
                  <textarea
                    rows={4}
                    value={diffInput}
                    onChange={(e) => setDiffInput(e.target.value)}
                    placeholder={`e.g.\nsrc/auth/middleware.py\nsrc/api/router.py`}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #CCCCCC', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                    <span style={{ fontSize: 11, color: '#888888' }}>
                      Enter relative file paths or paste a unified diff.
                    </span>
                    <button
                      onClick={handleGenerateSafetyReport}
                      disabled={isGeneratingReport || !diffInput.trim()}
                      style={{
                        background: '#111111',
                        color: '#FFFFFF',
                        padding: '8px 16px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        opacity: isGeneratingReport || !diffInput.trim() ? 0.5 : 1,
                      }}
                    >
                      {isGeneratingReport ? 'Analyzing Safety…' : 'Generate Safety Report →'}
                    </button>
                  </div>
                </div>

                {/* Report Display */}
                {safetyReport && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Risk Banner */}
                    <div
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #111111',
                        borderRadius: 8,
                        padding: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#888888', textTransform: 'uppercase' }}>
                          Overall Risk Level
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: safetyReport.risk_level === 'CRITICAL' ? '#dc2626' : safetyReport.risk_level === 'HIGH' ? '#ea580c' : '#111111', marginTop: 2 }}>
                          {safetyReport.risk_level}
                        </div>
                        <div style={{ fontSize: 12, color: '#555555', marginTop: 4 }}>
                          {safetyReport.risk_rationale}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('graph');
                          setGraphMode('impact');
                        }}
                        style={{ padding: '8px 14px', background: '#F5F5F5', border: '1px solid #E5E5E5', borderRadius: 6, fontSize: 12, fontWeight: 600 }}
                      >
                        Visualize on Graph →
                      </button>
                    </div>

                    {/* Blast Radius Section */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 8, padding: 16 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 10 }}>
                        Blast Radius ({safetyReport.blast_radius?.total_components_affected || 0} Components)
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#666666', marginBottom: 6 }}>Directly Impacted:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {safetyReport.blast_radius?.directly_impacted_nodes?.map((n) => (
                              <span
                                key={n.id}
                                onClick={() => { setSelectedNodeId(n.id); setActiveTab('graph'); }}
                                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309', cursor: 'pointer' }}
                              >
                                {n.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#666666', marginBottom: 6 }}>Downstream Dependents:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {safetyReport.blast_radius?.indirectly_impacted_nodes?.map((n) => (
                              <span
                                key={n.id}
                                onClick={() => { setSelectedNodeId(n.id); setActiveTab('graph'); }}
                                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', cursor: 'pointer' }}
                              >
                                {n.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Test Impact */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 8, padding: 16 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 6 }}>
                        Test Coverage & Impact
                      </h3>
                      <p style={{ fontSize: 12, color: '#555555' }}>
                        {safetyReport.test_impact?.coverage_note}
                      </p>
                    </div>

                    {/* Verification Checklist */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 8, padding: 16 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111111', marginBottom: 8 }}>
                        Recommended Verification Steps
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {safetyReport.recommended_verification_steps?.map((step, i) => (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#333333' }}>
                            <input type="checkbox" />
                            <span>{step}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SOC THREAT HUNTER */}
          {activeTab === 'soc-hunter' && (
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0b1120', display: 'flex', flexDirection: 'column' }}>
              <GraphCanvas graphData={{ nodes: [], edges: [] }} />
            </div>
          )}

        </main>

        {/* ── Right Panel: AI Analyst (Qwen 3 with Wispr Flow Input) ── */}
        <aside
          style={{
            width: 380,
            borderLeft: '1px solid #E5E5E5',
            display: 'flex',
            flexDirection: 'column',
            background: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          {/* Panel Header */}
          <div style={{ height: 48, borderBottom: '1px solid #E5E5E5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#111111' }}>AI Analyst</span>
              <span style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: '#F5F5F5', color: '#666666', fontFamily: 'JetBrains Mono, monospace' }}>
                Qwen 3
              </span>
            </div>
            {/* Depth Selector Pills */}
            <div style={{ display: 'flex', gap: 2, background: '#F5F5F5', padding: 2, borderRadius: 6 }}>
              {['quick', 'normal', 'detailed', 'expert'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  style={{
                    padding: '2px 6px',
                    fontSize: 9.5,
                    fontWeight: depth === d ? 700 : 500,
                    borderRadius: 4,
                    background: depth === d ? '#FFFFFF' : 'transparent',
                    color: depth === d ? '#111111' : '#666666',
                    boxShadow: depth === d ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    textTransform: 'capitalize',
                  }}
                  title={`Depth: ${d}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Active Context Indicator Bar */}
          <div
            style={{
              padding: '6px 12px',
              background: '#F9F9F9',
              borderBottom: '1px solid #E5E5E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: selectedNodeId || selectedFindingId ? '#2563eb' : '#64748b' }} />
              <span style={{ color: '#666666' }}>Context:</span>
              <strong style={{ color: '#111111', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {activeContextIndicator}
              </strong>
            </div>
            {(selectedNodeId || selectedFindingId) && (
              <button
                onClick={() => { setSelectedNodeId(null); setSelectedFindingId(null); }}
                style={{ fontSize: 10, color: '#888888', fontWeight: 600 }}
                title="Reset context to entire repository"
              >
                Reset ✕
              </button>
            )}
          </div>

          {/* Prompt Templates Quick Bar */}
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #E5E5E5', background: '#FFFFFF', display: 'flex', gap: 4, overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {[
              'Explain component',
              'Trace execution path',
              'What depends on this?',
              'Analyze blast radius',
              'Find security implications',
              'Which tests to run?',
              'Change Safety Report',
            ].map((tmpl, i) => (
              <button
                key={i}
                onClick={() => {
                  const targetPrefix = selectedNodeId
                    ? `For ${repoData?.functional_nodes?.find((n) => n.id === selectedNodeId)?.name || 'this component'}, `
                    : '';
                  handleSendQuery(`${targetPrefix}${tmpl}`);
                }}
                style={{
                  fontSize: 10,
                  color: '#333333',
                  background: '#F5F5F5',
                  border: '1px solid #E5E5E5',
                  borderRadius: 4,
                  padding: '2px 6px',
                  flexShrink: 0,
                }}
              >
                {tmpl}
              </button>
            ))}
          </div>

          {/* Chat Messages Log */}
          <div
            ref={chatScrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: '#FFFFFF',
            }}
          >
            {messages.map((m, idx) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={idx}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '94%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      background: isUser ? '#111111' : '#F9F9F9',
                      color: isUser ? '#FFFFFF' : '#111111',
                      border: isUser ? 'none' : '1px solid #E5E5E5',
                      borderRadius: 8,
                      padding: '9px 12px',
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.content}
                  </div>

                  {!isUser && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: '#888888', paddingLeft: 2 }}>
                      <span>{m.mode === 'ollama_qwen3_live' ? '⚡ Live Qwen 3' : '📘 Grounded Analysis'}</span>
                      {m.scope && <span>· {m.scope}</span>}
                    </div>
                  )}
                </div>
              );
            })}

            {isAiStreaming && (
              <div style={{ alignSelf: 'flex-start', color: '#666666', fontSize: 11, fontStyle: 'italic' }}>
                Qwen 3 is evaluating evidence…
              </div>
            )}
          </div>

          {/* Wispr Flow Compatible Multi-line Input Bar */}
          <div style={{ padding: 10, borderTop: '1px solid #E5E5E5', background: '#FFFFFF' }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputQuery}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuery();
                  }
                }}
                placeholder="Ask or dictate with Wispr Flow... (Enter to send, Shift+Enter for newline)"
                disabled={isAiStreaming}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 12,
                  border: '1px solid #CCCCCC',
                  borderRadius: 6,
                  background: '#FFFFFF',
                  color: '#111111',
                  resize: 'none',
                  maxHeight: 140,
                  lineHeight: 1.4,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#888888' }}>
                  🎙️ Compatible with Wispr Flow Desktop dictation
                </span>
                <button
                  type="submit"
                  disabled={isAiStreaming || !inputQuery.trim()}
                  style={{
                    background: isAiStreaming || !inputQuery.trim() ? '#E5E5E5' : '#111111',
                    color: isAiStreaming || !inputQuery.trim() ? '#888888' : '#FFFFFF',
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </aside>

      </div>

      {/* ─── Bottom Status Bar ─────────────────────────────────────────── */}
      <footer
        style={{
          height: 24,
          borderTop: '1px solid #E5E5E5',
          background: '#FAFAFA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          fontSize: 10.5,
          color: '#666666',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        <div>
          {repoData ? (
            <span>
              {repoData.files_scanned} files · {repoData.functional_nodes?.length || 0} nodes · {repoData.functional_edges?.length || 0} relationships · {repoData.vulnerabilities?.length || 0} findings · Analysis complete
            </span>
          ) : (
            <span>Ready to connect repository</span>
          )}
        </div>
        <div>
          <span>GraphOps · Qwen 3 + Wispr Flow Intelligence</span>
        </div>
      </footer>

      {/* ─── Wispr Flow Developer Vocabulary Modal ─────────────────────── */}
      {showWisprModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowWisprModal(false)}
        >
          <div
            style={{
              width: 480,
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 24,
              border: '1px solid #E5E5E5',
              boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111111' }}>
                🎙️ Wispr Flow Developer Vocabulary
              </h3>
              <button
                onClick={() => setShowWisprModal(false)}
                style={{ fontSize: 14, color: '#888888' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 12.5, color: '#666666', marginBottom: 14, lineHeight: 1.5 }}>
              Add these domain-specific keywords into your <strong>Wispr Flow Desktop App</strong> (Settings → Custom Dictionary) for 100% accurate code and graph dictation:
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18, maxHeight: 180, overflowY: 'auto' }}>
              {WISPR_VOCABULARY.map((term, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 4,
                    background: '#F5F5F5',
                    border: '1px solid #E5E5E5',
                    color: '#111111',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {term}
                </span>
              ))}
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(WISPR_VOCABULARY.join(', '));
                alert('Copied vocabulary to clipboard!');
              }}
              style={{
                width: '100%',
                background: '#111111',
                color: '#FFFFFF',
                padding: '9px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Copy All Keywords to Clipboard
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
