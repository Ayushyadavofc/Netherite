import { memo, useEffect, useRef } from 'react'
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

export const GraphView = memo(function GraphView({ nodes, edges, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return

    const width = containerRef.current.clientWidth || 300
    const height = containerRef.current.clientHeight || 300
    const theme = getComputedStyle(document.documentElement)
    const primary = theme.getPropertyValue('--nv-primary').trim() || '#ff5625'
    const secondary = theme.getPropertyValue('--nv-secondary').trim() || '#ffb77d'
    const muted = theme.getPropertyValue('--nv-muted').trim() || '#a8a0a0'
    const border = theme.getPropertyValue('--nv-border').trim() || '#2a2422'
    const foreground = theme.getPropertyValue('--nv-foreground').trim() || '#ffffff'
    const surfaceStrong = theme.getPropertyValue('--nv-surface-strong').trim() || '#141212'
    const primarySoft = theme.getPropertyValue('--nv-primary-soft').trim() || 'rgba(255, 86, 37, 0.14)'
    const secondarySoft = theme.getPropertyValue('--nv-secondary-soft').trim() || 'rgba(255, 183, 125, 0.14)'

    d3.select(containerRef.current).selectAll('*').remove()

    const svg = d3
      .select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height])
      .style('cursor', 'grab')

    const g = svg.append('g')
    let label: d3.Selection<SVGTextElement, any, SVGGElement, unknown> | null = null
    const getLabelOpacity = (scale: number) => {
      if (scale <= 0.5) {
        return 0
      }

      if (scale >= 0.8) {
        return 1
      }

      return (scale - 0.5) / 0.3
    }

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        if (label) {
          label
            .transition()
            .duration(200)
            .attr('opacity', getLabelOpacity(event.transform.k))
        }
      })

    const domNodes = nodes.map((node) => ({ ...node }))
    const domEdges = edges.map((edge) => ({ ...edge, source: edge.from, target: edge.to }))

    const adjacencyMap = new Map<string, Set<string>>()
    for (const node of domNodes) {
      adjacencyMap.set(node.id, new Set())
    }
    for (const edge of edges) {
      adjacencyMap.get(edge.from)?.add(edge.to)
      adjacencyMap.get(edge.to)?.add(edge.from)
    }

    const simulation = d3
      .forceSimulation(domNodes as any)
      .force('link', d3.forceLink(domEdges).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('collide', d3.forceCollide().radius(30))
      .force('x', d3.forceX())
      .force('y', d3.forceY())
      .alphaDecay(0.05)
      .velocityDecay(0.4)

    const link = g
      .append('g')
      .selectAll('line')
      .data(domEdges)
      .join('line')
      .attr('stroke', border)
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.5)
      .style('transition', 'stroke-opacity 0.3s, stroke 0.3s')

    const node = g
      .append('g')
      .selectAll('g')
      .data(domNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d: any) => {
        event.stopPropagation()
        onNodeClick(d.id)
      })
      .call(
        d3
          .drag<any, any>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as any
      )

    node
      .append('circle')
      .attr('r', 10)
      .attr('fill', primarySoft)
      .attr('stroke', primary)
      .attr('stroke-width', 2)
      .style('transition', 'fill 0.2s, stroke 0.2s, r 0.2s')

    label = node
      .append('text')
      .text((d: any) => d.label)
      .attr('x', 14)
      .attr('y', 4)
      .attr('opacity', 1)
      .attr('fill', primary)
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('font-family', 'sans-serif')
      .style('pointer-events', 'none')
      .style('transition', 'fill 0.2s')

    svg
      .call(zoom as any)
      .call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(1))

    node
      .on('mouseover', function (_event, d: any) {
        const hoveredId = d.id
        const connectedIds = adjacencyMap.get(hoveredId) || new Set()

        d3.select(this).select('circle').attr('fill', secondarySoft).attr('stroke', secondary).attr('r', 13)

        d3.select(this)
          .select('text')
          .transition()
          .duration(200)
          .attr('x', 24)
          .attr('fill', foreground)

        node.each(function (nd: any) {
          if (nd.id === hoveredId) return

          const isConnected = connectedIds.has(nd.id)
          d3.select(this)
            .select('circle')
            .attr('fill', isConnected ? secondarySoft : primarySoft)
            .attr('stroke', isConnected ? secondary : border)
            .attr('r', 10)

          d3.select(this)
            .select('text')
            .attr('fill', isConnected ? secondary : muted)

          d3.select(this)
            .style('transition', 'opacity 0.2s')
            .style('opacity', isConnected ? 1 : 0.18)
        })

        link.each(function (ld: any) {
          const isConnectedEdge = ld.source.id === hoveredId || ld.target.id === hoveredId
          d3.select(this)
            .attr('stroke', isConnectedEdge ? secondary : border)
            .attr('stroke-opacity', isConnectedEdge ? 0.95 : 0.08)
            .attr('stroke-width', isConnectedEdge ? 2.5 : 1)
        })
      })
      .on('mouseout', function () {
        node.each(function () {
          d3.select(this).select('circle').attr('fill', primarySoft).attr('stroke', primary).attr('r', 10)
          d3.select(this)
            .select('text')
            .transition()
            .duration(200)
            .attr('x', 14)
            .attr('fill', primary)
          d3.select(this).style('opacity', 1)
        })

        link.attr('stroke', border).attr('stroke-opacity', 0.55).attr('stroke-width', 1.5)
      })

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
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
})
