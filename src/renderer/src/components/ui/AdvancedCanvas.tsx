import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  Eraser,
  Minus,
  Move,
  Pen,
  Plus,
  Scissors,
  Square,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'

interface AdvancedCanvasProps {
  onInsert: (pages: string[]) => Promise<void> | void
  onClose: () => void
}

type Tool = 'pen' | 'rect' | 'circle' | 'line' | 'text' | 'eraser' | 'pan'

const BG_COLOR = '#0a0808'
const PAGE_WIDTH = 1120
const PAGE_HEIGHT = 1584
const INITIAL_PAGE_COUNT = 3
const MIN_PAGE_HEIGHT = 420
const COLOR_PRESETS = ['#ff5625', '#ffffff', '#ff4444', '#4a9eff', '#44cc44', '#ffcc00', '#cc66ff', '#ff88aa', '#66ffcc']

function paintBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, width, height)
}

function buildDefaultPageBreaks(height: number) {
  const breaks: number[] = []
  const count = Math.ceil(height / PAGE_HEIGHT)
  for (let index = 1; index <= count; index += 1) {
    breaks.push(index * PAGE_HEIGHT)
  }
  return breaks
}

function ensureBreakCoverage(existingBreaks: number[], requiredHeight: number) {
  const normalized = [...existingBreaks].sort((a, b) => a - b)
  let current = normalized[normalized.length - 1] ?? 0
  while (current < requiredHeight) {
    current += PAGE_HEIGHT
    normalized.push(current)
  }
  return normalized
}

function nextPageMultiple(height: number) {
  return Math.ceil(height / PAGE_HEIGHT) * PAGE_HEIGHT
}

function dataUrlToImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}

export function AdvancedCanvas({ onInsert, onClose }: AdvancedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const panRef = useRef({ x: 48, y: 40 })
  const zoomRef = useRef(0.72)
  const canvasHeightRef = useRef(PAGE_HEIGHT * INITIAL_PAGE_COUNT)
  const pageBreaksRef = useRef(buildDefaultPageBreaks(PAGE_HEIGHT * INITIAL_PAGE_COUNT))
  const historyRef = useRef<string[]>([])
  const isDrawing = useRef(false)
  const drawingModeRef = useRef<'draw' | 'pan'>('draw')
  const startPos = useRef({ x: 0, y: 0 })
  const lastPos = useRef({ x: 0, y: 0 })
  const dirtyBoundsRef = useRef({ minY: Number.POSITIVE_INFINITY, maxY: 0 })

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#ff5625')
  const [lineWidth, setLineWidth] = useState(4)
  const [zoom, setZoom] = useState(0.72)
  const [pan, setPan] = useState({ x: 48, y: 40 })
  const [history, setHistory] = useState<string[]>([])
  const [worldHeight, setWorldHeight] = useState(PAGE_HEIGHT * INITIAL_PAGE_COUNT)
  const [pageBreaks, setPageBreaks] = useState<number[]>(buildDefaultPageBreaks(PAGE_HEIGHT * INITIAL_PAGE_COUNT))
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)
  const [draggingBreakIndex, setDraggingBreakIndex] = useState<number | null>(null)

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    pageBreaksRef.current = pageBreaks
  }, [pageBreaks])

  useEffect(() => {
    canvasHeightRef.current = worldHeight
  }, [worldHeight])

  const saveHistoryState = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    historyRef.current = [...historyRef.current, dataUrl].slice(-10)
    setHistory(historyRef.current)
  }, [])

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = PAGE_WIDTH
    canvas.height = canvasHeightRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    paintBackground(ctx, canvas.width, canvas.height)
    dirtyBoundsRef.current = { minY: Number.POSITIVE_INFINITY, maxY: 0 }
    historyRef.current = []
    saveHistoryState()
  }, [saveHistoryState])

  useEffect(() => {
    initializeCanvas()
  }, [initializeCanvas])

  const restoreFromDataUrl = useCallback(async (dataUrl: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const image = await dataUrlToImage(dataUrl)
    paintBackground(ctx, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
  }, [])

  const handleUndo = useCallback(async () => {
    if (historyRef.current.length <= 1) return
    historyRef.current = historyRef.current.slice(0, -1)
    setHistory(historyRef.current)
    await restoreFromDataUrl(historyRef.current[historyRef.current.length - 1])
  }, [restoreFromDataUrl])

  const ensureCanvasHeight = useCallback(
    (requiredHeight: number) => {
      const targetHeight = Math.max(nextPageMultiple(requiredHeight), canvasHeightRef.current)
      if (targetHeight <= canvasHeightRef.current) return

      const canvas = canvasRef.current
      if (!canvas) return
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) return
      tempCtx.drawImage(canvas, 0, 0)

      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      paintBackground(ctx, canvas.width, canvas.height)
      ctx.drawImage(tempCanvas, 0, 0)

      const nextBreaks = ensureBreakCoverage(pageBreaksRef.current, targetHeight)
      canvasHeightRef.current = targetHeight
      pageBreaksRef.current = nextBreaks
      setWorldHeight(targetHeight)
      setPageBreaks(nextBreaks)
    },
    []
  )

  const getWorldPoint = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }

    const rect = container.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current
    }
  }, [])

  const updateBounds = useCallback((startY: number, endY = startY) => {
    const padding = lineWidth * 6
    const nextMin = Math.max(0, Math.min(startY, endY) - padding)
    const nextMax = Math.max(startY, endY) + padding
    dirtyBoundsRef.current.minY = Math.min(dirtyBoundsRef.current.minY, nextMin)
    dirtyBoundsRef.current.maxY = Math.max(dirtyBoundsRef.current.maxY, nextMax)
  }, [lineWidth])

  const beginShapeSnapshot = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const snapshot = snapshotCanvasRef.current || document.createElement('canvas')
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    const snapshotCtx = snapshot.getContext('2d')
    if (!snapshotCtx) return
    snapshotCtx.clearRect(0, 0, snapshot.width, snapshot.height)
    snapshotCtx.drawImage(canvas, 0, 0)
    snapshotCanvasRef.current = snapshot
  }, [])

  const restoreSnapshot = useCallback(() => {
    const canvas = canvasRef.current
    const snapshot = snapshotCanvasRef.current
    if (!canvas || !snapshot) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    paintBackground(ctx, canvas.width, canvas.height)
    ctx.drawImage(snapshot, 0, 0)
    return ctx
  }, [])

  const commitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null)
      return
    }

    ensureCanvasHeight(textInput.y + PAGE_HEIGHT)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    ctx.font = `${lineWidth * 4}px sans-serif`
    ctx.fillStyle = color
    const baselineY = textInput.y + lineWidth * 4
    ctx.fillText(textInput.value, textInput.x, baselineY)
    updateBounds(textInput.y - lineWidth * 2, baselineY + lineWidth * 2)
    saveHistoryState()
    setTextInput(null)
  }, [color, ensureCanvasHeight, lineWidth, saveHistoryState, textInput, updateBounds])

  const startInteraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (textInput && tool !== 'text') {
      commitText()
    }

    if (event.button === 1 || tool === 'pan') {
      isDrawing.current = true
      drawingModeRef.current = 'pan'
      startPos.current = { x: event.clientX, y: event.clientY }
      return
    }

    if (event.button !== 0) return

    const point = getWorldPoint(event.clientX, event.clientY)
    ensureCanvasHeight(point.y + PAGE_HEIGHT)
    isDrawing.current = true
    drawingModeRef.current = 'draw'
    startPos.current = point
    lastPos.current = point

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    if (tool === 'text') {
      setTextInput({ x: point.x, y: point.y, value: '' })
      isDrawing.current = false
      return
    }

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
      return
    }

    beginShapeSnapshot()
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return

    if (drawingModeRef.current === 'pan') {
      const dx = event.clientX - startPos.current.x
      const dy = event.clientY - startPos.current.y
      const nextPan = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      setPan(nextPan)
      startPos.current = { x: event.clientX, y: event.clientY }

      const container = containerRef.current
      if (container) {
        const visibleBottom = (container.clientHeight - nextPan.y) / zoomRef.current
        ensureCanvasHeight(visibleBottom + PAGE_HEIGHT)
      }
      return
    }

    const point = getWorldPoint(event.clientX, event.clientY)
    ensureCanvasHeight(point.y + PAGE_HEIGHT / 2)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = tool === 'eraser' ? BG_COLOR : color
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      updateBounds(lastPos.current.y, point.y)
    } else {
      const restoredCtx = restoreSnapshot()
      if (!restoredCtx) return

      restoredCtx.lineWidth = lineWidth
      restoredCtx.strokeStyle = color
      restoredCtx.beginPath()

      if (tool === 'rect') {
        restoredCtx.strokeRect(
          startPos.current.x,
          startPos.current.y,
          point.x - startPos.current.x,
          point.y - startPos.current.y
        )
      } else if (tool === 'circle') {
        const radius = Math.sqrt(
          (point.x - startPos.current.x) ** 2 + (point.y - startPos.current.y) ** 2
        )
        restoredCtx.arc(startPos.current.x, startPos.current.y, radius, 0, 2 * Math.PI)
        restoredCtx.stroke()
      } else if (tool === 'line') {
        restoredCtx.moveTo(startPos.current.x, startPos.current.y)
        restoredCtx.lineTo(point.x, point.y)
        restoredCtx.stroke()
      }
    }

    lastPos.current = point
  }

  const endInteraction = () => {
    if (!isDrawing.current) return
    isDrawing.current = false

    if (drawingModeRef.current === 'pan') return

    updateBounds(startPos.current.y, lastPos.current.y)
    saveHistoryState()
  }

  const startBreakDrag = useCallback((event: React.PointerEvent<HTMLElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    setDraggingBreakIndex(index)
  }, [])

  useEffect(() => {
    if (draggingBreakIndex == null) return

    const handlePointerMove = (event: PointerEvent) => {
      const point = getWorldPoint(event.clientX, event.clientY)
      ensureCanvasHeight(point.y + PAGE_HEIGHT)
      setPageBreaks((current) => {
        const next = [...current]
        const prevBreak = draggingBreakIndex === 0 ? MIN_PAGE_HEIGHT : next[draggingBreakIndex - 1] + MIN_PAGE_HEIGHT
        const nextBreak = next[draggingBreakIndex + 1] ? next[draggingBreakIndex + 1] - MIN_PAGE_HEIGHT : Math.max(point.y + PAGE_HEIGHT, canvasHeightRef.current)
        next[draggingBreakIndex] = Math.max(prevBreak, Math.min(point.y, nextBreak))
        pageBreaksRef.current = next
        return next
      })
    }

    const handlePointerUp = () => setDraggingBreakIndex(null)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingBreakIndex, ensureCanvasHeight, getWorldPoint])

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const nextZoom = event.deltaY > 0 ? zoomRef.current * 0.92 : zoomRef.current * 1.08
      setZoom(Math.min(Math.max(0.3, nextZoom), 2.2))
      return
    }

    const nextPan = {
      x: panRef.current.x - event.deltaX,
      y: panRef.current.y - event.deltaY
    }
    setPan(nextPan)

    const container = containerRef.current
    if (container) {
      const visibleBottom = (container.clientHeight - nextPan.y) / zoomRef.current
      ensureCanvasHeight(visibleBottom + PAGE_HEIGHT)
    }
  }

  const handleInsert = useCallback(async () => {
    if (textInput) commitText()

    const canvas = canvasRef.current
    if (!canvas) return

    if (!Number.isFinite(dirtyBoundsRef.current.minY) || dirtyBoundsRef.current.maxY <= 0) {
      onClose()
      return
    }

    const contentTop = Math.max(0, dirtyBoundsRef.current.minY)
    const contentBottom = Math.max(contentTop + 1, dirtyBoundsRef.current.maxY + 32)
    const sortedBreaks = ensureBreakCoverage(pageBreaksRef.current, contentBottom + PAGE_HEIGHT / 2).sort((a, b) => a - b)
    const pages: string[] = []
    let startY = 0

    for (const breakY of sortedBreaks) {
      const sliceStart = startY
      const sliceEnd = breakY
      startY = breakY

      if (sliceEnd <= contentTop) continue
      if (sliceStart >= contentBottom) break
      if (sliceEnd <= sliceStart) continue

      const sliceHeight = sliceEnd - sliceStart
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      const pageCtx = pageCanvas.getContext('2d')
      if (!pageCtx) continue

      paintBackground(pageCtx, pageCanvas.width, pageCanvas.height)
      pageCtx.drawImage(
        canvas,
        0,
        sliceStart,
        canvas.width,
        sliceHeight,
        0,
        0,
        pageCanvas.width,
        pageCanvas.height
      )

      pages.push(pageCanvas.toDataURL('image/png'))
    }

    if (pages.length === 0) {
      onClose()
      return
    }

    await onInsert(pages)
    onClose()
  }, [commitText, onClose, onInsert, textInput])

  const helperText = useMemo(() => {
    if (tool === 'pan') return 'Drag to move around the infinite page stack'
    return 'Wheel to scroll, Ctrl/Cmd + Wheel to zoom, drag scissor lines to change page cuts'
  }, [tool])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#2a2422] bg-[#0a0808] shadow-2xl">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#2a2422] bg-[#111111] p-2">
        <div className="flex rounded-md border border-[#2a2422] bg-[#1a1818] p-1">
          <button type="button" onClick={() => setTool('pen')} className={`p-1.5 rounded ${tool === 'pen' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Pen className="w-4 h-4" /></button>
          <button type="button" onClick={() => setTool('rect')} className={`p-1.5 rounded ${tool === 'rect' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Square className="w-4 h-4" /></button>
          <button type="button" onClick={() => setTool('circle')} className={`p-1.5 rounded ${tool === 'circle' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Circle className="w-4 h-4" /></button>
          <button type="button" onClick={() => setTool('line')} className={`p-1.5 rounded ${tool === 'line' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Minus className="w-4 h-4" /></button>
          <button type="button" onClick={() => setTool('text')} className={`p-1.5 rounded ${tool === 'text' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Type className="w-4 h-4" /></button>
          <button type="button" onClick={() => setTool('eraser')} className={`p-1.5 rounded ${tool === 'eraser' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Eraser className="w-4 h-4" /></button>
          <button type="button" onClick={() => setTool('pan')} className={`p-1.5 rounded ${tool === 'pan' ? 'bg-[rgba(255,86,37,0.2)] text-[#ff5625]' : 'text-[#a8a0a0] hover:text-white'}`}><Move className="w-4 h-4" /></button>
        </div>

        <div className="mx-1 h-6 w-px bg-[#2a2422]" />

        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
        />

        <div className="flex items-center gap-1">
          {COLOR_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset}
              onClick={() => setColor(preset)}
              className={`h-5 w-5 rounded-full border-2 transition-all hover:scale-110 ${color === preset ? 'scale-110 border-white' : 'border-[#2a2422]'}`}
              style={{ backgroundColor: preset }}
              title={preset}
            />
          ))}
        </div>

        <input
          type="range"
          min="1"
          max="20"
          value={lineWidth}
          onChange={(event) => setLineWidth(parseInt(event.target.value, 10))}
          className="w-24 accent-[#ff5625]"
        />

        <div className="mx-1 h-6 w-px bg-[#2a2422]" />

        <button type="button" onClick={() => void handleUndo()} disabled={history.length <= 1} className="p-1.5 text-[#a8a0a0] hover:text-white disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
        <button type="button" onClick={() => setZoom((current) => Math.min(current * 1.15, 2.2))} className="p-1.5 text-[#a8a0a0] hover:text-white"><ZoomIn className="w-4 h-4" /></button>
        <button type="button" onClick={() => setZoom((current) => Math.max(current / 1.15, 0.3))} className="p-1.5 text-[#a8a0a0] hover:text-white"><ZoomOut className="w-4 h-4" /></button>
        <button type="button" onClick={() => setPan((current) => ({ ...current, y: current.y + PAGE_HEIGHT * 0.3 * zoom }))} className="p-1.5 text-[#a8a0a0] hover:text-white"><Plus className="w-4 h-4" /></button>
        <button type="button" onClick={() => setPan((current) => ({ ...current, y: current.y - PAGE_HEIGHT * 0.3 * zoom }))} className="p-1.5 text-[#a8a0a0] hover:text-white"><Minus className="w-4 h-4" /></button>
        <button type="button" onClick={() => { setZoom(0.72); setPan({ x: 48, y: 40 }) }} className="px-2 text-xs font-mono text-[#a8a0a0] hover:text-white">{Math.round(zoom * 100)}%</button>

        <div className="flex-1" />

        <button type="button" onClick={onClose} className="p-1.5 text-[#a8a0a0] hover:text-[#ff5449]"><X className="w-4 h-4" /></button>
        <button type="button" onClick={() => void handleInsert()} className="ml-2 rounded bg-[#ff5625] px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#ff7043]">Insert Pages</button>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[#151212]"
        onWheel={handleWheel}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: PAGE_WIDTH,
            height: worldHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
          }}
        >
          <canvas
            ref={canvasRef}
            className="h-full w-full bg-[#0a0808] shadow-[0_0_0_1px_#2a2422,0_24px_80px_rgba(0,0,0,0.45)]"
            onPointerDown={startInteraction}
            onPointerMove={draw}
            onPointerUp={endInteraction}
            onPointerLeave={endInteraction}
          />

          {pageBreaks.map((breakY, index) => (
            <div key={`${breakY}-${index}`} className="pointer-events-none absolute left-0 right-0" style={{ top: breakY }}>
              <div className="relative border-t-2 border-dashed border-[#ffb77d]/45">
                <div
                  className="pointer-events-auto absolute inset-x-0 top-[-14px] h-7 cursor-row-resize"
                  style={{ touchAction: 'none' }}
                  onPointerDown={(event) => startBreakDrag(event, index)}
                />
                <button
                  type="button"
                  className="pointer-events-auto absolute right-3 top-[-15px] inline-flex items-center gap-1 rounded-full border border-[#ffb77d]/30 bg-[#141212] px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-[#ffb77d]"
                  onPointerDown={(event) => startBreakDrag(event, index)}
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Page {index + 1}
                </button>
              </div>
            </div>
          ))}

          {textInput && (
            <input
              autoFocus
              type="text"
              value={textInput.value}
              onChange={(event) => setTextInput({ ...textInput, value: event.target.value })}
              onBlur={commitText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitText()
                if (event.key === 'Escape') setTextInput(null)
              }}
              className="absolute bg-transparent outline-none"
              style={{
                left: textInput.x,
                top: textInput.y,
                color,
                fontSize: `${lineWidth * 4}px`,
                minWidth: '140px',
                borderBottom: '1px dashed rgba(255, 183, 125, 0.55)'
              }}
            />
          )}
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-[#2a2422] bg-[#0a0808]/85 px-3 py-1.5 text-[0.6rem] uppercase tracking-[0.18em] text-[#8c8079]">
          {helperText}
        </div>
      </div>
    </div>
  )
}
