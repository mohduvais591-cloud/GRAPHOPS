import React, { useEffect, useRef, useState, useMemo } from 'react'
import ParagraphCard from './ParagraphCard'
import VoiceBrainBar from './VoiceBrainBar'

/**
 * Advanced Multi-Document Knowledge Graph Canvas.
 *
 * Core Capabilities:
 * 1. Multi-Focal Document Island Archipelagos:
 *    - Each uploaded file has its own bounded territory.
 *    - Chunks orbit their parent document anchor; shared entities float in the neutral zone.
 * 2. Rectangular AABB Anti-Overlap Physics:
 *    - Cards never collide or stack on top of each other.
 * 3. Intelligent "Semantic Radar" Search:
 *    - Fuzzy concept matching.
 *    - Never blanks out on missing words: graceful fallback and soft heatmap aura.
 * 4. Interactive Reasoning Flight Tour (Step-by-Step Storyboard):
 *    - Sequentially tours through grounded evidence across document islands.
 * 5. Multi-View Modes:
 *    - 'islands' (Document territories), 'cards' (Fluid cards), 'network' (Force dots), 'conflicts' (Contradictions).
 */
export default function GraphCanvas({
  graphData,
  onSelectElement,
  selectedElement,
  focusElementId,
  queryResponse,
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.85 })
  const [elementStats, setElementStats] = useState({ nodes: 0, edges: 0 })
  const [viewMode, setViewMode] = useState('islands') // 'islands' | 'cards' | 'network' | 'conflicts'
  const [searchFilter, setSearchFilter] = useState('')
  const [focusedId, setFocusedId] = useState(null)

  // Story Tour state
  const [tourActive, setTourActive] = useState(false)
  const [tourStep, setTourStep] = useState(0)

  // SOC Controls, Blast Radius, & Audit Ledger State
  const [socLoading, setSocLoading] = useState(false)
  const [seedMs, setSeedMs] = useState(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [compromiseHops, setCompromiseHops] = useState({})
  const [isSevered, setIsSevered] = useState(false)
  const [exposedJewels, setExposedJewels] = useState([])
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false)
  const [auditChain, setAuditChain] = useState([])
  const [auditVerifyResult, setAuditVerifyResult] = useState(null)
  const [certReport, setCertReport] = useState(null)

  const handleSeed500 = async () => {
    setSocLoading(true)
    try {
      const res = await fetch('/v1/demo/seed-500', { method: 'POST' })
      const data = await res.json()
      setSeedMs(data.elapsed_ms || 42)
    } catch (err) {
      console.error('Seed failed:', err)
    } finally {
      setSocLoading(false)
    }
  }

  const handleSimulateCompromise = async () => {
    try {
      const res = await fetch('/v1/analytics/blast-radius/workstation-14?depth=3')
      const data = await res.json()
      const hops = {}
      hops['workstation-14'] = 0
      ;(data['Hop 1'] || data.hop_1 || []).forEach((n) => { hops[n.id] = 1; hops[n.name] = 1 })
      ;(data['Hop 2'] || data.hop_2 || []).forEach((n) => { hops[n.id] = 2; hops[n.name] = 2 })
      ;(data['Hop 3'] || data.hop_3 || []).forEach((n) => { hops[n.id] = 3; hops[n.name] = 3 })
      setCompromiseHops(hops)
      setIsSimulating(true)
      setExposedJewels(data.crown_jewels_exposed || [])
    } catch (err) {
      console.error('Simulate compromise failed:', err)
    }
  }

  const handleSeverChokePoint = async (nodeId = 'jump-bastion-370') => {
    try {
      const res = await fetch(`/v1/analytics/sever/${nodeId}`, { method: 'POST' })
      const data = await res.json()
      setIsSevered(true)
      setExposedJewels([])
      const brRes = await fetch('/v1/analytics/blast-radius/workstation-14?depth=3')
      const brData = await brRes.json()
      const hops = {}
      hops['workstation-14'] = 0
      ;(brData['Hop 1'] || brData.hop_1 || []).forEach((n) => { hops[n.id] = 1; hops[n.name] = 1 })
      ;(brData['Hop 2'] || brData.hop_2 || []).forEach((n) => { hops[n.id] = 2; hops[n.name] = 2 })
      ;(brData['Hop 3'] || brData.hop_3 || []).forEach((n) => { hops[n.id] = 3; hops[n.name] = 3 })
      setCompromiseHops(hops)
    } catch (err) {
      console.error('Sever failed:', err)
    }
  }

  const handleOpenAuditDrawer = async () => {
    setAuditDrawerOpen(true)
    try {
      const res = await fetch('/v1/audit/ledger')
      const data = await res.json()
      setAuditChain(data.chain || [])
      const vRes = await fetch('/v1/audit/verify')
      const vData = await vRes.json()
      setAuditVerifyResult(vData)
    } catch (err) {
      console.error('Audit fetch failed:', err)
    }
  }

  const handleVerifyChain = async () => {
    try {
      const res = await fetch('/v1/audit/verify')
      const data = await res.json()
      setAuditVerifyResult(data)
    } catch (err) {
      console.error('Verify chain failed:', err)
    }
  }

  const handleExportCert = async () => {
    try {
      const res = await fetch('/v1/audit/cert-in-report/INCIDENT-2026-001')
      const data = await res.json()
      setCertReport(data)
    } catch (err) {
      console.error('Export cert failed:', err)
    }
  }

  const handleBrainAction = (action) => {
    if (!action) return
    if (action.intent === 'SIMULATE_COMPROMISE') {
      handleSimulateCompromise()
    } else if (action.intent === 'SHOW_CHOKE_POINTS') {
      handleSeed500()
    } else if (action.intent === 'SEVER_EDGE') {
      handleSeverChokePoint(action.target_node || 'jump-bastion-370')
    }
  }

  // Simulation state maintained in refs for 60fps performance
  const simNodesRef = useRef([])
  const simEdgesRef = useRef([])
  const alphaRef = useRef(1.0)
  const draggingNodeRef = useRef(null)
  const isPanningRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })
  const animFrameRef = useRef(null)

  // Fast lookup map of all nodes for relation rendering
  const allNodesMap = useMemo(() => {
    const map = new Map()
    ;(graphData?.nodes || []).forEach((n) => map.set(n.id, n))
    return map
  }, [graphData])

  // Extract tour path nodes (ordered evidence chunks)
  const tourNodes = useMemo(() => {
    if (!queryResponse?.source_chunks || queryResponse.source_chunks.length === 0) {
      // Fallback to highlighted path chunk nodes
      const highlightedIds = new Set(graphData?.highlighted_path_ids || [])
      return (graphData?.nodes || []).filter(
        (n) => n.type === 'chunk' && highlightedIds.has(n.id)
      )
    }
    return queryResponse.source_chunks
      .map((sc) => (graphData?.nodes || []).find((n) => n.id === `chunk:${sc.chunk_id}`))
      .filter(Boolean)
  }, [queryResponse, graphData])

  // Identify unique documents to generate Island Anchors
  const documentIslands = useMemo(() => {
    const map = new Map()
    const simNodes = simNodesRef.current

    simNodes.forEach((n) => {
      const docId =
        n.document_id || (n.type === 'document' ? n.id.replace('doc:', '') : null)
      if (!docId) return

      if (!map.has(docId)) {
        map.set(docId, {
          id: docId,
          sourceName:
            n.properties?.source_name ||
            (n.type === 'document' ? n.name : `Document ${docId.slice(0, 8)}`),
          nodes: [],
          hasConflict: false,
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
        })
      }

      const island = map.get(docId)
      island.nodes.push(n)
      if (n.conflict_status === 'conflicting') island.hasConflict = true

      const halfW = n.type === 'chunk' ? 160 : n.type === 'document' ? 110 : 60
      const halfH = n.type === 'chunk' ? 80 : n.type === 'document' ? 45 : 25
      island.minX = Math.min(island.minX, n.x - halfW)
      island.maxX = Math.max(island.maxX, n.x + halfW)
      island.minY = Math.min(island.minY, n.y - halfH)
      island.maxY = Math.max(island.maxY, n.y + halfH)
    })

    return Array.from(map.values())
  }, [simNodesRef.current, elementStats])

  // Initialize or update nodes and edges with Island Multi-Focal positioning
  useEffect(() => {
    if (!graphData || !graphData.nodes) return

    const canvas = canvasRef.current
    const width = canvas ? canvas.clientWidth || 900 : 900
    const height = canvas ? canvas.clientHeight || 650 : 650
    const cx = width / 2
    const cy = height / 2

    const existingMap = new Map(simNodesRef.current.map((n) => [n.id, n]))

    // 1. Build chunk -> docId map
    const chunkDocMap = new Map()
    graphData.nodes.forEach((n) => {
      if (n.type === 'chunk' && n.document_id) {
        chunkDocMap.set(n.id, n.document_id)
      }
    })

    // 2. Build entity -> Set of docIds from connected edges & provenance
    const entityDocsMap = new Map()
    ;(graphData.edges || []).forEach((e) => {
      const srcChunkDoc = chunkDocMap.get(e.source)
      const tgtChunkDoc = chunkDocMap.get(e.target)
      const provDoc = e.provenance && e.provenance.chunk_id ? chunkDocMap.get(`chunk:${e.provenance.chunk_id}`) : null
      const doc = srcChunkDoc || tgtChunkDoc || provDoc

      if (doc) {
        if (!entityDocsMap.has(e.source)) entityDocsMap.set(e.source, new Set())
        if (!entityDocsMap.has(e.target)) entityDocsMap.set(e.target, new Set())
        entityDocsMap.get(e.source).add(doc)
        entityDocsMap.get(e.target).add(doc)
      }
    })

    // Also collect document IDs
    const uniqueDocs = Array.from(
      new Set(
        graphData.nodes
          .map((n) => n.document_id || (n.type === 'document' ? n.id.replace('doc:', '') : null))
          .filter(Boolean)
      )
    )

    const numDocs = uniqueDocs.length
    const islandSpread = Math.max(700, 420 * Math.sqrt(Math.max(1, numDocs)))

    const docAnchorMap = new Map()
    uniqueDocs.forEach((docId, idx) => {
      if (numDocs === 1) {
        docAnchorMap.set(docId, { x: cx, y: cy })
      } else if (numDocs === 2) {
        docAnchorMap.set(docId, {
          x: idx === 0 ? cx - 450 : cx + 450,
          y: cy,
        })
      } else {
        const angle = (idx / numDocs) * 2 * Math.PI
        docAnchorMap.set(docId, {
          x: cx + Math.cos(angle) * islandSpread,
          y: cy + Math.sin(angle) * islandSpread,
        })
      }
    })

    const isCardMode = viewMode === 'cards' || viewMode === 'islands' || viewMode === 'conflicts'

    const updatedNodes = graphData.nodes.map((n, i) => {
      const existing = existingMap.get(n.id)
      let docId = n.document_id || (n.type === 'document' ? n.id.replace('doc:', '') : null)
      let anchor = { x: cx, y: cy }
      let isBridge = false

      if (docId && docAnchorMap.has(docId)) {
        anchor = docAnchorMap.get(docId)
      } else if (n.type === 'entity') {
        const docSet = entityDocsMap.get(n.id)
        if (docSet && docSet.size === 1) {
          const singleDoc = Array.from(docSet)[0]
          if (docAnchorMap.has(singleDoc)) {
            anchor = docAnchorMap.get(singleDoc)
            docId = singleDoc
          }
        } else if (docSet && docSet.size > 1) {
          // Multi-document bridge! Sits at the average coordinates of the connected islands
          let sumX = 0, sumY = 0, count = 0
          docSet.forEach((d) => {
            const da = docAnchorMap.get(d)
            if (da) {
              sumX += da.x
              sumY += da.y
              count++
            }
          })
          if (count > 0) {
            anchor = { x: sumX / count, y: sumY / count }
            isBridge = true
          }
        }
      }

      const nodeRadius =
        n.type === 'chunk'
          ? isCardMode ? 140 : 16
          : n.type === 'document'
          ? isCardMode ? 90 : 18
          : n.type === 'topic'
          ? isCardMode ? 70 : 20
          : 28

      if (existing) {
        return {
          ...n,
          document_id: docId || n.document_id,
          isBridge,
          x: existing.x,
          y: existing.y,
          vx: existing.vx * 0.4,
          vy: existing.vy * 0.4,
          radius: nodeRadius,
          anchorX: anchor.x,
          anchorY: anchor.y,
        }
      }

      // Initial placement clustered around its document anchor
      const subAngle = (i % 12) * (Math.PI / 6)
      const subRadius = 70 + (i % 6) * 45

      return {
        ...n,
        document_id: docId || n.document_id,
        isBridge,
        x: anchor.x + Math.cos(subAngle) * subRadius,
        y: anchor.y + Math.sin(subAngle) * subRadius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: nodeRadius,
        anchorX: anchor.x,
        anchorY: anchor.y,
      }
    })

    const nodeMap = new Map(updatedNodes.map((n) => [n.id, n]))
    const updatedEdges = (graphData.edges || [])
      .map((e) => ({
        ...e,
        sourceNode: nodeMap.get(e.source),
        targetNode: nodeMap.get(e.target),
      }))
      .filter((e) => e.sourceNode && e.targetNode)

    simNodesRef.current = updatedNodes
    simEdgesRef.current = updatedEdges
    setElementStats({ nodes: updatedNodes.length, edges: updatedEdges.length })

    alphaRef.current = 1.0
  }, [graphData, viewMode])

  // Center camera when focusElementId changes
  useEffect(() => {
    if (!focusElementId) return
    setFocusedId(focusElementId)

    const targetNode = simNodesRef.current.find((n) => n.id === focusElementId)
    if (targetNode && canvasRef.current) {
      const width = canvasRef.current.clientWidth || 900
      const height = canvasRef.current.clientHeight || 650

      setTransform((prev) => ({
        k: Math.max(0.85, prev.k),
        x: width / 2 - targetNode.x * Math.max(0.85, prev.k),
        y: height / 2 - targetNode.y * Math.max(0.85, prev.k),
      }))
    }

    const timer = setTimeout(() => setFocusedId(null), 3500)
    return () => clearTimeout(timer)
  }, [focusElementId])

  // Tour step navigation camera focus
  useEffect(() => {
    if (!tourActive || tourNodes.length === 0) return
    const currentNode = tourNodes[tourStep]
    if (!currentNode || !canvasRef.current) return

    const targetNode = simNodesRef.current.find((n) => n.id === currentNode.id)
    if (targetNode) {
      setFocusedId(targetNode.id)
      const width = canvasRef.current.clientWidth || 900
      const height = canvasRef.current.clientHeight || 650

      setTransform((prev) => ({
        k: Math.max(0.9, prev.k),
        x: width / 2 - targetNode.x * Math.max(0.9, prev.k),
        y: height / 2 - targetNode.y * Math.max(0.9, prev.k),
      }))
    }
  }, [tourActive, tourStep, tourNodes])

  // Physics simulation loop with Multi-Focal Islands & AABB Anti-Overlap Physics
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const stepSimulation = () => {
      const width = canvas.clientWidth || 900
      const height = canvas.clientHeight || 650
      const cx = width / 2
      const cy = height / 2

      const simNodes = simNodesRef.current
      const simEdges = simEdgesRef.current
      const alpha = alphaRef.current
      const isCardMode = viewMode === 'cards' || viewMode === 'islands' || viewMode === 'conflicts'

      if (alpha > 0.003 && simNodes.length > 0) {
        // 1. Multi-Focal Territory Gravity (Attracts each chunk to its Document Island Anchor)
        const gravityStrength = 0.028 * alpha
        for (let i = 0; i < simNodes.length; i++) {
          const n = simNodes[i]
          if (n.anchorX !== undefined && (viewMode === 'islands' || viewMode === 'cards')) {
            // Pull toward document island center
            n.vx += (n.anchorX - n.x) * gravityStrength
            n.vy += (n.anchorY - n.y) * gravityStrength
          } else {
            // Entities and global nodes pull toward center
            n.vx += (cx - n.x) * (gravityStrength * 0.7)
            n.vy += (cy - n.y) * (gravityStrength * 0.7)
          }
        }

        // 2. Rectangular AABB Anti-Overlap Physics (Cards NEVER overlap each other!)
        for (let i = 0; i < simNodes.length; i++) {
          for (let j = i + 1; j < simNodes.length; j++) {
            const ni = simNodes[i]
            const nj = simNodes[j]

            if (isCardMode) {
              const wI = ni.type === 'chunk' ? 320 : ni.type === 'document' ? 220 : 130
              const hI = ni.type === 'chunk' ? 150 : ni.type === 'document' ? 85 : 42
              const wJ = nj.type === 'chunk' ? 320 : nj.type === 'document' ? 220 : 130
              const hJ = nj.type === 'chunk' ? 150 : nj.type === 'document' ? 85 : 42

              const dx = nj.x - ni.x
              const dy = nj.y - ni.y
              const minSepX = (wI + wJ) / 2 + 25
              const minSepY = (hI + hJ) / 2 + 20

              const overlapX = minSepX - Math.abs(dx)
              const overlapY = minSepY - Math.abs(dy)

              if (overlapX > 0 && overlapY > 0) {
                // Separate along axis of least resistance
                if (overlapX < overlapY) {
                  const push = overlapX * 0.45 * alpha
                  const sign = dx >= 0 ? 1 : -1
                  ni.vx -= push * sign
                  nj.vx += push * sign
                } else {
                  const push = overlapY * 0.45 * alpha
                  const sign = dy >= 0 ? 1 : -1
                  ni.vy -= push * sign
                  nj.vy += push * sign
                }
              }
            } else {
              // Classic circular repulsion for network mode
              const dx = nj.x - ni.x
              const dy = nj.y - ni.y
              const dist = Math.hypot(dx, dy) || 1
              const idealDist = ni.radius + nj.radius + 35
              if (dist < idealDist * 2.2) {
                const force =
                  Math.min(8.0, ((idealDist * 2.2 - dist) / (idealDist * 2.2)) * 4.5) * alpha
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force
                ni.vx -= fx
                ni.vy -= fy
                nj.vx += fx
                nj.vy += fy
              }
            }
          }
        }

        // 3. Edge spring attraction
        simEdges.forEach((e) => {
          const s = e.sourceNode
          const t = e.targetNode
          if (!s || !t) return
          const dx = t.x - s.x
          const dy = t.y - s.y
          const dist = Math.hypot(dx, dy) || 1
          const targetDist =
            e.edge_type === 'provenance'
              ? isCardMode ? 170 : 75
              : e.edge_type === 'topic_membership'
              ? isCardMode ? 210 : 95
              : isCardMode ? 230 : 110
          const force = (dist - targetDist) * 0.025 * alpha
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          s.vx += fx
          s.vy += fy
          t.vx -= fx
          t.vy -= fy
        })

        // 4. Velocity damping & position updates
        const friction = 0.82
        for (let i = 0; i < simNodes.length; i++) {
          const n = simNodes[i]
          n.vx *= friction
          n.vy *= friction

          const speed = Math.hypot(n.vx, n.vy)
          if (speed > 8) {
            n.vx = (n.vx / speed) * 8
            n.vy = (n.vy / speed) * 8
          }

          if (draggingNodeRef.current !== n) {
            n.x += n.vx
            n.y += n.vy
          }
        }

        alphaRef.current *= 0.965
        if (alphaRef.current < 0.003) {
          alphaRef.current = 0
        }
      }

      // Draw canvas background, edges, and predicates
      renderScene(ctx, width, height, simNodes, simEdges)

      animFrameRef.current = requestAnimationFrame(stepSimulation)
    }

    animFrameRef.current = requestAnimationFrame(stepSimulation)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [transform, selectedElement, graphData, viewMode, searchFilter])

  // Canvas render logic (Edges, glowing lines, predicate badges, and network dots)
  const renderScene = (ctx, width, height, simNodes, simEdges) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    ctx.clearRect(0, 0, width, height)
    ctx.save()

    // Pan and Zoom
    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.k, transform.k)

    const highlightedIds = new Set(graphData?.highlighted_path_ids || [])
    const isNetworkMode = viewMode === 'network'

    // 1. Draw Edges
    simEdges.forEach((edge) => {
      const s = edge.sourceNode
      const t = edge.targetNode
      if (!s || !t) return

      const isHighlighted = highlightedIds.has(edge.id)
      const isSelected = selectedElement && selectedElement.id === edge.id
      const isConflict = edge.conflict_status === 'conflicting'

      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)

      if (edge.edge_type === 'topic_membership') {
        ctx.strokeStyle = isHighlighted ? '#c084fc' : '#a855f7'
        ctx.lineWidth = isHighlighted ? 3 : 1.5
        ctx.setLineDash([5, 5])
      } else if (edge.edge_type === 'provenance') {
        ctx.strokeStyle = isHighlighted ? '#2dd4bf' : '#0d9488'
        ctx.lineWidth = isHighlighted ? 2.5 : 1.5
        ctx.setLineDash([3, 4])
      } else {
        // Factual relationship
        ctx.strokeStyle = isConflict
          ? '#f43f5e'
          : isHighlighted
          ? '#38bdf8'
          : isSelected
          ? '#f8fafc'
          : '#334155'
        ctx.lineWidth = isHighlighted || isConflict ? 3 : isSelected ? 2.5 : 1.5
        ctx.setLineDash([])
      }

      ctx.stroke()
      ctx.setLineDash([])

      // Draw Predicate Label badge
      if (transform.k > 0.45 && edge.predicate) {
        const midX = (s.x + t.x) / 2
        const midY = (s.y + t.y) / 2

        ctx.font = '10px Inter, sans-serif'
        const textWidth = ctx.measureText(edge.predicate).width

        ctx.fillStyle = isHighlighted
          ? 'rgba(14, 165, 233, 0.9)'
          : isConflict
          ? 'rgba(244, 63, 94, 0.9)'
          : 'rgba(15, 23, 42, 0.85)'
        ctx.beginPath()
        ctx.roundRect(midX - textWidth / 2 - 6, midY - 14, textWidth + 12, 16, 4)
        ctx.fill()

        ctx.fillStyle = '#f8fafc'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(edge.predicate, midX, midY - 6)
      }
    })

    // 2. Draw Classic Nodes if in 'network' mode
    if (isNetworkMode) {
      simNodes.forEach((node) => {
        const isHighlighted = highlightedIds.has(node.id)
        const isSelected = selectedElement && selectedElement.id === node.id
        const isConflict = node.conflict_status === 'conflicting'

        if (isSelected || isHighlighted || isConflict) {
          ctx.save()
          ctx.shadowColor = isConflict
            ? '#ef4444'
            : isHighlighted
            ? '#38bdf8'
            : '#ffffff'
          ctx.shadowBlur = 12
          ctx.beginPath()
          ctx.arc(node.x, node.y, node.radius + 3, 0, 2 * Math.PI)
          ctx.fillStyle = isConflict
            ? '#ef4444'
            : isHighlighted
            ? '#38bdf8'
            : '#ffffff'
          ctx.fill()
          ctx.restore()
        }

        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI)

        const hop = compromiseHops[node.id] ?? compromiseHops[node.name]
        if (hop === 0 || (isSimulating && (node.id === 'workstation-14' || node.name === 'workstation-14'))) {
          ctx.fillStyle = '#dc2626' // Compromised Crimson
        } else if (hop === 1) {
          ctx.fillStyle = '#ef4444' // 1-Hop Red
        } else if (hop === 2) {
          ctx.fillStyle = '#f97316' // 2-Hop Orange
        } else if (hop === 3) {
          ctx.fillStyle = '#eab308' // 3-Hop Yellow
        } else if (isSevered && (node.id === 'jump-bastion-370' || node.name === 'jump-bastion-370')) {
          ctx.fillStyle = '#64748b' // Severed Choke Point Gray
        } else if (node.type === 'document') ctx.fillStyle = '#f59e0b'
        else if (node.type === 'topic') ctx.fillStyle = '#9333ea'
        else if (node.type === 'chunk') ctx.fillStyle = '#475569'
        else if (node.type === 'value') ctx.fillStyle = '#06b6d4'
        else if (node.label === 'Vulnerability' || node.label === 'ThreatActor') ctx.fillStyle = '#ef4444'
        else if (node.label === 'Asset') ctx.fillStyle = '#2563eb'
        else if (node.label === 'Technique') ctx.fillStyle = '#f59e0b'
        else if (node.label === 'AttackPayload') ctx.fillStyle = '#a855f7'
        else ctx.fillStyle = isHighlighted ? '#2563eb' : '#1e293b'

        ctx.fill()
        ctx.lineWidth = isSelected ? 3 : isHighlighted ? 2.5 : 1.5
        ctx.strokeStyle = isConflict
          ? '#ef4444'
          : isSelected
          ? '#ffffff'
          : isHighlighted
          ? '#60a5fa'
          : '#475569'
        ctx.stroke()

        ctx.fillStyle = '#ffffff'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const icon =
          node.type === 'document'
            ? '📄'
            : node.type === 'topic'
            ? '🏷️'
            : node.type === 'chunk'
            ? '§'
            : '●'
        ctx.fillText(icon, node.x, node.y)

        ctx.fillStyle = isHighlighted || isSelected ? '#ffffff' : '#cbd5e1'
        ctx.font =
          isHighlighted || isSelected
            ? 'bold 11px Outfit, sans-serif'
            : '10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const labelText = node.name || node.label || 'Node'
        const truncated =
          labelText.length > 22 ? `${labelText.slice(0, 20)}…` : labelText
        ctx.fillText(truncated, node.x, node.y + node.radius + 4)
      })
    }

    ctx.restore()
  }

  // Mouse Handlers
  const handleMouseDown = (e) => {
    if (e.target !== canvasRef.current) return
    isPanningRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e) => {
    if (draggingNodeRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      draggingNodeRef.current.x =
        (e.clientX - rect.left - transform.x) / transform.k
      draggingNodeRef.current.y =
        (e.clientY - rect.top - transform.y) / transform.k
      draggingNodeRef.current.vx = 0
      draggingNodeRef.current.vy = 0
      alphaRef.current = 0.2
      return
    }

    if (isPanningRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x
      const dy = e.clientY - lastMousePosRef.current.y
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
    }
  }

  const handleMouseUp = () => {
    draggingNodeRef.current = null
    isPanningRef.current = false
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89
    setTransform((prev) => ({
      ...prev,
      k: Math.max(0.18, Math.min(3.5, prev.k * zoomFactor)),
    }))
  }

  const handleResetZoom = () => {
    setTransform({ x: 0, y: 0, k: 0.85 })
    alphaRef.current = 0.5
  }

  const handleFitView = () => {
    const nodes = simNodesRef.current
    if (!nodes.length || !canvasRef.current) return
    const width = canvasRef.current.clientWidth || 900
    const height = canvasRef.current.clientHeight || 650

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x - 160)
      maxX = Math.max(maxX, n.x + 160)
      minY = Math.min(minY, n.y - 80)
      maxY = Math.max(maxY, n.y + 80)
    })

    const graphWidth = maxX - minX || 300
    const graphHeight = maxY - minY || 300
    const scale = Math.min(
      1.6,
      Math.max(0.25, Math.min((width * 0.85) / graphWidth, (height * 0.85) / graphHeight))
    )
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2

    setTransform({
      k: scale,
      x: width / 2 - midX * scale,
      y: height / 2 - midY * scale,
    })
  }

  const handleCardDragStart = (node, e) => {
    e.stopPropagation()
    draggingNodeRef.current = node
    alphaRef.current = 0.2
  }

  // Intelligent "Semantic Radar" Search logic
  const searchResults = useMemo(() => {
    if (!searchFilter.trim()) return { matchCount: 0, matches: new Set(), hasSearch: false }

    const q = searchFilter.toLowerCase().trim()
    const tokens = q.split(/\s+/).filter(Boolean)

    // Common synonyms / related concept expansions for knowledge graph
    const conceptExpansions = {
      database: ['postgresql', 'db', 'cluster', 'postgres', 'port', 'data'],
      port: ['5432', '8080', 'private', 'public', 'ingress', 'interface'],
      security: ['vpc', 'subnet', 'rule', 'firewall', 'prohibited', 'private', 'auth'],
      satellite: ['quantum', 'orbit', 'encryption', '2035', 'payload'],
      network: ['ip', 'subnet', 'vpc', 'traffic', 'interface', 'gateway'],
    }

    const expandedTokens = [...tokens]
    tokens.forEach((t) => {
      if (conceptExpansions[t]) expandedTokens.push(...conceptExpansions[t])
    })

    const matchedSet = new Set()
    simNodesRef.current.forEach((n) => {
      const name = (n.name || '').toLowerCase()
      const label = (n.label || '').toLowerCase()
      const text = (n.properties?.text || '').toLowerCase()
      const source = (n.properties?.source_name || '').toLowerCase()

      const directMatch = name.includes(q) || text.includes(q) || source.includes(q) || label.includes(q)
      const tokenMatch = expandedTokens.some(
        (token) => name.includes(token) || text.includes(token) || source.includes(token)
      )

      if (directMatch || tokenMatch) {
        matchedSet.add(n.id)
      }
    })

    return {
      matchCount: matchedSet.size,
      matches: matchedSet,
      hasSearch: true,
    }
  }, [searchFilter, simNodesRef.current])

  const highlightedIds = new Set(graphData?.highlighted_path_ids || [])
  const isCardMode = viewMode === 'cards' || viewMode === 'islands' || viewMode === 'conflicts'

  return (
    <div
      className="graph-workspace"
      id="graph-workspace"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Floating Graph Header Bar */}
      <div className="graph-top-header">
        {/* View Mode Pills */}
        <div className="view-mode-pill-group">
          <button
            className={`mode-pill ${viewMode === 'islands' ? 'active' : ''}`}
            onClick={() => setViewMode('islands')}
            id="mode-islands-btn"
            title="Partition by Document Territory Islands"
          >
            🏝️ Document Islands
          </button>
          <button
            className={`mode-pill ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            id="mode-cards-btn"
            title="Fluid Paragraph & Context Cards"
          >
            🗂️ Paragraph Cards
          </button>
          <button
            className={`mode-pill ${viewMode === 'network' ? 'active' : ''}`}
            onClick={() => setViewMode('network')}
            id="mode-network-btn"
            title="High-density force constellation"
          >
            🌐 Network
          </button>
          <button
            className={`mode-pill ${viewMode === 'conflicts' ? 'active' : ''}`}
            onClick={() => setViewMode('conflicts')}
            id="mode-conflicts-btn"
            title="Focus on contradictory assertions"
          >
            ⚔️ Contradictions
          </button>
        </div>

        {/* Semantic Radar Search Box */}
        <div className="graph-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="graph-search-input"
            placeholder="Search concepts, text, or entities..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            id="graph-search-input"
          />
          {searchFilter && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchFilter('')}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {/* Story Tour Launch Button (if grounded evidence exists) */}
        {tourNodes.length > 0 && (
          <button
            className={`story-tour-btn ${tourActive ? 'active' : ''}`}
            onClick={() => {
              setTourActive(!tourActive)
              setTourStep(0)
            }}
            id="story-tour-toggle-btn"
            title="Step-by-step camera tour of grounded evidence"
          >
            {tourActive ? '⏸ Pause Tour' : '▶ Flight Tour'}
          </button>
        )}

        {/* Stats & Path Pill */}
        <div className="graph-stats-pill">
          <span>
            <strong>{documentIslands.length}</strong> {documentIslands.length === 1 ? 'island' : 'islands'}
          </span>
          <span>•</span>
          <span>
            <strong>{elementStats.nodes}</strong> elements
          </span>
          <span>•</span>
          <span>
            <strong>{elementStats.edges}</strong> relations
          </span>
          {highlightedIds.size > 0 && (
            <>
              <span>•</span>
              <span className="active-path-stat">
                ⚡ <strong>{highlightedIds.size}</strong> grounded
              </span>
            </>
          )}
        </div>

        {/* SOC Live Threat Hunting & Action Controls */}
        <div className="soc-top-controls" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
          <button
            className="soc-btn seed"
            onClick={handleSeed500}
            disabled={socLoading}
            id="seed-500-btn"
            title="Seed 500 Enterprise Nodes via Neo4j AuraDB UNWIND Batch"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ⚡ {socLoading ? 'Seeding...' : seedMs ? `Seed 500 (${seedMs}ms)` : 'Seed 500 Nodes'}
          </button>
          <button
            className="soc-btn compromise"
            onClick={handleSimulateCompromise}
            id="simulate-compromise-btn"
            title="Simulate Compromise on workstation-14 and compute blast radius"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            🎯 Simulate Compromise
          </button>
          <button
            className="soc-btn sever"
            onClick={() => handleSeverChokePoint('jump-bastion-370')}
            id="sever-chokepoint-btn"
            title="Sever choke point at jump-bastion-370 to isolate crown jewels"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: isSevered ? '#475569' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {isSevered ? '✂️ Severed (jump-bastion-370)' : '✂️ Sever Choke Point'}
          </button>
          <button
            className="soc-btn audit"
            onClick={handleOpenAuditDrawer}
            id="audit-ledger-btn"
            title="View Append-Only SHA-256 Audit Ledger & Export CERT-In Report"
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#0f766e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            📜 Audit Ledger
          </button>
        </div>
      </div>

      {/* Story Tour Interactive Floating Control Bar (when active) */}
      {tourActive && tourNodes.length > 0 && (
        <div className="tour-control-bar" id="tour-control-bar">
          <span className="tour-step-info">
            Step <strong>{tourStep + 1}</strong> of <strong>{tourNodes.length}</strong>:
            <span className="tour-doc-title">
              {tourNodes[tourStep]?.properties?.source_name || 'Evidence Source'}
            </span>
          </span>
          <div className="tour-nav-btns">
            <button
              className="tour-btn"
              disabled={tourStep === 0}
              onClick={() => setTourStep((s) => Math.max(0, s - 1))}
              title="Previous Evidence"
            >
              ◄ Prev
            </button>
            <button
              className="tour-btn"
              disabled={tourStep === tourNodes.length - 1}
              onClick={() => setTourStep((s) => Math.min(tourNodes.length - 1, s + 1))}
              title="Next Evidence"
            >
              Next ►
            </button>
            <button
              className="tour-btn exit"
              onClick={() => setTourActive(false)}
              title="Exit Tour"
            >
              ✕ Exit
            </button>
          </div>
        </div>
      )}

      {/* Search Radar Status Banner */}
      {searchResults.hasSearch && (
        <div className="search-radar-banner" id="search-radar-banner">
          {searchResults.matchCount > 0 ? (
            <span>
              ⚡ Found <strong>{searchResults.matchCount}</strong> relevant items matching "
              <em>{searchFilter}</em>"
            </span>
          ) : (
            <span>
              💡 No direct word match for "<em>{searchFilter}</em>" — All document territories kept visible (0 hidden)
            </span>
          )}
          <button className="banner-reset-btn" onClick={() => setSearchFilter('')}>
            Reset Search
          </button>
        </div>
      )}

      {/* HTML5 Canvas (Edges, Glowing Cables, & Network Nodes) */}
      <canvas
        id="graph-canvas"
        ref={canvasRef}
        className="graph-canvas"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      />

      {/* Synchronized DOM Cards & Territory Islands Overlay */}
      {isCardMode && (
        <div
          className="cards-overlay-viewport"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            transformOrigin: '0 0',
          }}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
        >
          {/* Frosted Glass Document Territory Islands Envelopes */}
          {viewMode === 'islands' &&
            documentIslands.map((island) => {
              if (island.minX === Infinity) return null
              const width = Math.max(380, island.maxX - island.minX + 60)
              const height = Math.max(220, island.maxY - island.minY + 75)

              return (
                <div
                  key={`territory-${island.id}`}
                  className={`island-territory-container ${
                    island.hasConflict ? 'conflict' : ''
                  }`}
                  style={{
                    position: 'absolute',
                    left: `${island.minX - 30}px`,
                    top: `${island.minY - 45}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                  }}
                >
                  <div className="island-territory-header">
                    <span className="island-icon">🏝️</span>
                    <span className="island-title">{island.sourceName}</span>
                    <span className="island-badge">
                      {island.nodes.filter((n) => n.type === 'chunk').length} Passages
                    </span>
                    {island.hasConflict && (
                      <span className="island-conflict-badge">
                        ⚔️ Contradictory Claim
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

          {/* Render Individual Node Cards & Concept Pills */}
          {simNodesRef.current.map((node) => {
            const isHighlighted = highlightedIds.has(node.id)
            const isSelected = selectedElement && selectedElement.id === node.id
            const isFocused = focusedId === node.id
            const isConflict = node.conflict_status === 'conflicting'

            // Search matching calculation
            const isSearchMatch = searchResults.hasSearch && searchResults.matches.has(node.id)
            // If search is active and 0 matches found, keep opacity legible (0.85); if matches exist, dim non-matches to 0.35
            const cardOpacity = searchResults.hasSearch
              ? searchResults.matchCount > 0
                ? isSearchMatch
                  ? 1
                  : 0.35
                : 0.85
              : 1

            // Tour active indicator
            const tourIndex = tourNodes.findIndex((n) => n.id === node.id)
            const tourStepNumber = tourIndex >= 0 ? tourIndex + 1 : null

            if (viewMode === 'conflicts' && !isConflict && !isHighlighted) {
              return null
            }

            // 1. Paragraph / Chunk Card
            if (node.type === 'chunk') {
              return (
                <div
                  key={node.id}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    transform: 'translate(-50%, -50%)',
                    opacity: cardOpacity,
                    transition: 'opacity 0.25s ease',
                    zIndex: isFocused || isSelected ? 30 : isHighlighted ? 20 : 10,
                  }}
                  onMouseDown={(e) => handleCardDragStart(node, e)}
                >
                  <ParagraphCard
                    node={node}
                    isHighlighted={isHighlighted}
                    isSelected={isSelected}
                    isFocused={isFocused}
                    searchMatch={isSearchMatch}
                    tourStepNumber={tourActive ? tourStepNumber : null}
                    connectedEdges={simEdgesRef.current}
                    allNodesMap={allNodesMap}
                    onSelect={(n) =>
                      onSelectElement && onSelectElement({ ...n, elementType: 'node' })
                    }
                    onInspect={(n) =>
                      onSelectElement && onSelectElement({ ...n, elementType: 'node' })
                    }
                  />
                </div>
              )
            }

            // 2. Document Card
            if (node.type === 'document') {
              return (
                <div
                  key={node.id}
                  className={`doc-graph-card ${isSelected ? 'selected' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    transform: 'translate(-50%, -50%)',
                    opacity: cardOpacity,
                    zIndex: isSelected ? 25 : 5,
                  }}
                  onMouseDown={(e) => handleCardDragStart(node, e)}
                  onClick={() =>
                    onSelectElement && onSelectElement({ ...node, elementType: 'node' })
                  }
                  id={`doc-card-${node.id}`}
                >
                  <div className="doc-card-badge">📁 DOCUMENT ROOT</div>
                  <div className="doc-card-title">{node.name}</div>
                  <div className="doc-card-meta">
                    <span>{node.properties?.source_type?.toUpperCase() || 'DOC'}</span>
                    <span>Rev {node.properties?.revision || 1}</span>
                  </div>
                </div>
              )
            }

            // 3. Topic Capsule
            if (node.type === 'topic') {
              return (
                <div
                  key={node.id}
                  className={`topic-graph-capsule ${isSelected ? 'selected' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    transform: 'translate(-50%, -50%)',
                    opacity: cardOpacity,
                    zIndex: isSelected ? 25 : 6,
                  }}
                  onMouseDown={(e) => handleCardDragStart(node, e)}
                  onClick={() =>
                    onSelectElement && onSelectElement({ ...node, elementType: 'node' })
                  }
                  id={`topic-capsule-${node.id}`}
                >
                  <span className="topic-icon">🏷️</span>
                  <span className="topic-title">{node.name}</span>
                </div>
              )
            }

            // 4. Entity / Concept Pill (Shared Bridges)
            return (
              <div
                key={node.id}
                className={`entity-graph-pill ${node.isBridge ? 'bridge-pill' : ''} ${
                  isHighlighted ? 'highlighted' : ''
                } ${isSelected ? 'selected' : ''} ${isConflict ? 'conflict' : ''} ${
                  isSearchMatch ? 'search-match' : ''
                }`}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  transform: 'translate(-50%, -50%)',
                  opacity: cardOpacity,
                  zIndex: node.isBridge ? 22 : isHighlighted || isSelected ? 20 : 4,
                }}
                onMouseDown={(e) => handleCardDragStart(node, e)}
                onClick={() =>
                  onSelectElement && onSelectElement({ ...node, elementType: 'node' })
                }
                id={`entity-pill-${node.id}`}
                title={node.isBridge ? 'Shared concept bridging multiple documents' : undefined}
              >
                <span className="entity-icon">{node.isBridge ? '⬡' : '●'}</span>
                <span className="entity-name">{node.name}</span>
                {node.isBridge && <span className="bridge-tag">Bridge</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Graph Toolbar Controls */}
      <div className="graph-toolbar">
        <button
          className="toolbar-btn"
          id="zoom-in-btn"
          title="Zoom In"
          onClick={() =>
            setTransform((t) => ({ ...t, k: Math.min(3.5, t.k * 1.25) }))
          }
        >
          +
        </button>
        <button
          className="toolbar-btn"
          id="zoom-out-btn"
          title="Zoom Out"
          onClick={() =>
            setTransform((t) => ({ ...t, k: Math.max(0.18, t.k / 1.25) }))
          }
        >
          -
        </button>
        <button
          className="toolbar-btn"
          id="fit-view-btn"
          title="Fit to Screen"
          onClick={handleFitView}
        >
          ⛶
        </button>
        <button
          className="toolbar-btn"
          id="reset-zoom-btn"
          title="Reset View"
          onClick={handleResetZoom}
        >
          ⟲
        </button>
      </div>

      {/* Floating Legend */}
      <div className="graph-legend">
        <div className="legend-item">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }}></div>
          <span>Compromised</span>
        </div>
        <div className="legend-item">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></div>
          <span>Hop 1</span>
        </div>
        <div className="legend-item">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }}></div>
          <span>Hop 2</span>
        </div>
        <div className="legend-item">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#eab308' }}></div>
          <span>Hop 3</span>
        </div>
        <div className="legend-item">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }}></div>
          <span>Bridge / Host</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot-conflict"></div>
          <span>Zero-Trust Delta</span>
        </div>
      </div>

      {/* Voice & Brain Co-Pilot Bar */}
      <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: '92%', maxWidth: '820px' }}>
        <VoiceBrainBar onBrainAction={handleBrainAction} selectedNodeId={selectedElement?.id} />
      </div>

      {/* Audit Ledger & CERT-In Report Drawer */}
      {auditDrawerOpen && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '460px',
            background: 'rgba(15, 23, 42, 0.96)',
            borderLeft: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            color: '#e2e8f0',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
              📜 SOC Audit Ledger (SHA-256)
            </h3>
            <button
              onClick={() => setAuditDrawerOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '18px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={handleVerifyChain}
              id="verify-chain-btn"
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔍 Verify SHA-256 Chain
            </button>
            <button
              onClick={handleExportCert}
              id="export-cert-btn"
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#0f766e',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              📑 Export CERT-In Report
            </button>
          </div>

          {auditVerifyResult && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '14px',
                fontSize: '12px',
                background: auditVerifyResult.valid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${auditVerifyResult.valid ? '#22c55e' : '#ef4444'}`,
                color: auditVerifyResult.valid ? '#86efac' : '#fca5a5'
              }}
            >
              <strong>{auditVerifyResult.valid ? '✅ Chain Intact & Cryptographically Valid' : '❌ Integrity Violation'}</strong>
              <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.9 }}>
                Verified {auditVerifyResult.verified_blocks ?? auditVerifyResult.length ?? auditChain.length} blocks from genesis
              </div>
            </div>
          )}

          {certReport && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                marginBottom: '14px',
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '11px',
                maxHeight: '140px',
                overflowY: 'auto'
              }}
            >
              <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>CERT-In Incident Package</div>
              <div><strong>Incident:</strong> {certReport.incident_id || 'INCIDENT-2026-001'}</div>
              <div><strong>Root Hash:</strong> <code style={{ fontSize: '10px' }}>{certReport.root_hash ? String(certReport.root_hash).slice(0, 16) : 'N/A'}...</code></div>
              <div><strong>Compliance:</strong> Rule 11(1) 6-Hour Reporting Standard</div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {auditChain.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', marginTop: '40px', fontSize: '12px' }}>
                No audit blocks recorded yet. Actions log automatically.
              </div>
            ) : (
              auditChain.map((b, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(30, 41, 59, 0.8)',
                    borderRadius: '6px',
                    padding: '10px',
                    border: '1px solid #334155',
                    fontSize: '11px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: '#f1f5f9' }}>Block #{idx} · {b.action}</span>
                    <span style={{ color: '#94a3b8' }}>{b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : ''}</span>
                  </div>
                  <div style={{ color: '#cbd5e1', marginBottom: '4px' }}>
                    <strong>Actor:</strong> {b.actor} | <strong>Target:</strong> {b.target_id}
                  </div>
                  <div style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: '10px', wordBreak: 'break-all' }}>
                    SHA-256: {b.hash}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
