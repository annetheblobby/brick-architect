import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { markPoints } from './draw.js'

function paint(canvas, strokes) {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(rect.width * dpr))
  const height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    if (!stroke.points.length) continue
    trace(ctx, stroke.points, 26, 'rgba(59, 108, 240, 0.18)')
    trace(ctx, stroke.points, 14, 'rgba(59, 108, 240, 0.4)')
  }
}

function trace(ctx, stroke, width, color) {
  ctx.beginPath()
  ctx.lineWidth = width
  ctx.strokeStyle = color
  ctx.moveTo(stroke[0].x, stroke[0].y)
  if (stroke.length === 1) {
    ctx.lineTo(stroke[0].x + 0.01, stroke[0].y)
  } else {
    for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i].x, stroke[i].y)
  }
  ctx.stroke()
}

const DrawMask = forwardRef(function DrawMask(
  { active, viewRef, model, course, view, ghost, nonce, frame, onPreview, onCommit },
  ref,
) {
  const canvasRef = useRef(null)
  const strokes = useRef([])
  const current = useRef(null)
  const props = useRef({})
  props.current = { active, viewRef, model, course, view, ghost, onPreview, onCommit }

  useImperativeHandle(ref, () => ({
    cancelLive() {
      const stroke = current.current
      if (!stroke) return false
      current.current = null
      strokes.current = strokes.current.filter((item) => item !== stroke)
      repaint()
      return true
    },
    dropLast() {
      if (current.current) return false
      if (!strokes.current.length) return false
      strokes.current = strokes.current.slice(0, -1)
      repaint()
      return true
    },
  }))

  function repaint() {
    const canvas = canvasRef.current
    if (canvas) paint(canvas, strokes.current)
  }

  function wipe() {
    strokes.current = []
    current.current = null
    repaint()
  }

  useEffect(() => {
    wipe()
  }, [nonce, frame])

  useEffect(() => {
    if (!active) wipe()
  }, [active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const observer = new ResizeObserver(() => repaint())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !active) return undefined
    const block = (event) => event.preventDefault()
    canvas.addEventListener('wheel', block, { passive: false })
    return () => canvas.removeEventListener('wheel', block)
  }, [active])

  function localPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }

  function absorb(stroke, points) {
    const { viewRef: glance, model: build, course: layer, view: mode, ghost: showGhost, onPreview: report } = props.current
    const camera = glance.current?.camera
    const source = glance.current?.canvas
    if (!camera || !source) return
    const found = markPoints(points, {
      camera,
      rect: source.getBoundingClientRect(),
      model: build,
      course: layer,
      view: mode,
      ghost: showGhost,
    })
    if (found.pieces.length || found.cells.length) {
      const seenPieces = new Set(stroke.pieces.map((piece) => piece.key))
      const seenCells = new Set(stroke.cells.map((cell) => `${cell.x}|${cell.z}`))
      for (const piece of found.pieces) {
        if (seenPieces.has(piece.key)) continue
        seenPieces.add(piece.key)
        stroke.pieces.push(piece)
      }
      for (const cell of found.cells) {
        const key = `${cell.x}|${cell.z}`
        if (seenCells.has(key)) continue
        seenCells.add(key)
        stroke.cells.push(cell)
      }
    }
    report({ pieces: stroke.pieces, cells: stroke.cells })
  }

  function onDown(event) {
    if (!props.current.active || event.button !== 0) return
    event.preventDefault()
    try {
      canvasRef.current.setPointerCapture(event.pointerId)
    } catch {
      // A real drag captures the pointer. A missed capture still follows move events on the mask.
    }
    const point = localPoint(event)
    const stroke = { points: [point], pieces: [], cells: [] }
    current.current = stroke
    strokes.current = [...strokes.current, stroke]
    repaint()
    absorb(stroke, [point])
  }

  function onMove(event) {
    const stroke = current.current
    if (!stroke) return
    const point = localPoint(event)
    const last = stroke.points[stroke.points.length - 1]
    const dist = Math.hypot(point.x - last.x, point.y - last.y)
    if (dist < 3) return
    const steps = Math.max(1, Math.round(dist / 8))
    const added = []
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      const next = {
        x: last.x + (point.x - last.x) * t,
        y: last.y + (point.y - last.y) * t,
        clientX: last.clientX + (point.clientX - last.clientX) * t,
        clientY: last.clientY + (point.clientY - last.clientY) * t,
      }
      stroke.points.push(next)
      added.push(next)
    }
    repaint()
    absorb(stroke, added)
  }

  function onUp() {
    const stroke = current.current
    current.current = null
    if (!stroke) return
    if (!stroke.pieces.length && !stroke.cells.length) {
      strokes.current = strokes.current.filter((item) => item !== stroke)
      repaint()
      props.current.onPreview(null)
      return
    }
    props.current.onCommit({ pieces: stroke.pieces, cells: stroke.cells })
  }

  return (
    <canvas
      ref={canvasRef}
      className={`draw-mask ${active ? 'is-active' : ''}`}
      aria-hidden="true"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(event) => event.preventDefault()}
    />
  )
})

export default DrawMask
