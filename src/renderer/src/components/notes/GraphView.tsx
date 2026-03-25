import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export interface GraphNode {
  id: string
  label: string
}

export interface GraphEdge {
  from: string
  to: string
}

interface GraphViewProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick: (id: string) => void
}

export function GraphView({ nodes, edges, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return

    const width = containerRef.current.clientWidth || 300
    const height = containerRef.current.clientHeight || 300

    // Clear previous graph
    d3.select(containerRef.current).selectAll('*').remove()

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height])
      .style('cursor', 'grab')

    const g = svg.append('g')

    // Zoom and Pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom as any)
       .call(zoom.transform as any, d3.zoomIdentity.translate(width/2, height/2).scale(1))

    // Setup force simulation
    const domNodes = nodes.map(d => ({ ...d }))
    const domEdges = edges.map(d => ({ ...d, source: d.from, target: d.to }))

    // Build adjacency map for hover highlighting
    const adjacencyMap = new Map<string, Set<string>>()
    for (const node of domNodes) {
      adjacencyMap.set(node.id, new Set())
    }
    for (const edge of edges) {
      adjacencyMap.get(edge.from)?.add(edge.to)
      adjacencyMap.get(edge.to)?.add(edge.from)
    }

    const simulation = d3.forceSimulation(domNodes as any)
      .force('link', d3.forceLink(domEdges).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('collide', d3.forceCollide().radius(30))
      .force('x', d3.forceX())
      .force('y', d3.forceY())
      .alphaDecay(0.05)  // settle faster (default 0.0228)
      .velocityDecay(0.4)

    // Render edges
    const link = g.append('g')
      .selectAll('line')
      .data(domEdges)
      .join('line')
      .attr('stroke', '#e0dcd8')
      .attr('stroke-opacity', 0.15)
      .attr('stroke-width', 1.5)
      .style('transition', 'stroke-opacity 0.3s, stroke 0.3s')

    // Render nodes
    const node = g.append('g')
      .selectAll('g')
      .data(domNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d: any) => {
        event.stopPropagation()
        onNodeClick(d.id)
      })
      .call(d3.drag<any, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any)

    // Hover effect
    node.on('mouseover', function (event, d: any) {
      const hoveredId = d.id
      const connectedIds = adjacencyMap.get(hoveredId) || new Set()

      // Highlight hovered node and push text away
      d3.select(this).select('circle')
        .attr('fill', '#ff5625')
        .attr('stroke', '#ff5625')
        .attr('r', 13)

      d3.select(this).select('text')
        .transition()
        .duration(200)
        .attr('x', 24)
        .attr('fill', '#ffffff')

      // Dim/highlight other nodes
      node.each(function (nd: any) {
        if (nd.id === hoveredId) return
        const isConnected = connectedIds.has(nd.id)
        
        // Don't turn connected nodes orange, keep them default color but un-dimmed
        d3.select(this).select('circle')
          .attr('fill', '#141212')
          .attr('stroke', '#2a2422')
          .attr('r', 10)
          
        d3.select(this).select('text')
          .attr('fill', isConnected ? '#ffffff' : '#666666')
          
        d3.select(this)
          .style('transition', 'opacity 0.2s')
          .style('opacity', isConnected ? 1 : 0.15)
      })

      // Highlight connected edges
      link.each(function (ld: any) {
        const isConnectedEdge = (
          (ld.source.id === hoveredId || ld.target.id === hoveredId)
        )
        d3.select(this)
          .attr('stroke', isConnectedEdge ? '#ff5625' : '#e0dcd8')
          .attr('stroke-opacity', isConnectedEdge ? 0.8 : 0.05)
          .attr('stroke-width', isConnectedEdge ? 2.5 : 1)
      })

    }).on('mouseout', function () {
      // Reset all nodes
      node.each(function (nd: any) {
        d3.select(this).select('circle')
          .attr('fill', '#141212')
          .attr('stroke', '#2a2422')
          .attr('r', 10)
        d3.select(this).select('text')
          .transition()
          .duration(200)
          .attr('x', 14)
          .attr('fill', '#ffb77d')
        d3.select(this)
          .style('opacity', 1)
      })

      // Reset all edges
      link
        .attr('stroke', '#e0dcd8')
        .attr('stroke-opacity', 0.15)
        .attr('stroke-width', 1.5)
    })

    node.append('circle')
      .attr('r', 10)
      .attr('fill', '#141212')
      .attr('stroke', '#2a2422')
      .attr('stroke-width', 2)
      .style('transition', 'fill 0.2s, stroke 0.2s, r 0.2s')

    node.append('text')
      .text((d: any) => d.label)
      .attr('x', 14)
      .attr('y', 4)
      .attr('fill', '#ffb77d')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('font-family', 'sans-serif')
      .style('pointer-events', 'none')
      .style('transition', 'fill 0.2s')

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
      svg.style('cursor', 'grabbing')
    }

    function dragged(event: any, d: any) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
      svg.style('cursor', 'grab')
    }

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, onNodeClick])

  return <div ref={containerRef} className="w-full h-full min-h-[300px]" />
}
