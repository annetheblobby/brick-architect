import * as THREE from 'three'
import { BODY_H, PLATE } from '../lego/scale.js'

const STUD_H = 0.18
const MAX_PIECES = 240
const MAX_CELLS = 480

export function emptyMask() {
  return { pieces: [], cells: [] }
}

/** Same visibility rule as the viewport: built courses, one course, or everything. */
export function isShown(courseIndex, current, view, ghost) {
  if (view === 'model') return false
  if (view === 'all') return true
  if (view === 'one') return courseIndex === current
  return courseIndex <= current || Boolean(ghost)
}

function visiblePieces(model, course, view, ghost) {
  const list = []
  for (const layer of model.courses) {
    if (!isShown(layer.index, course, view, ghost)) continue
    for (const piece of layer.pieces) list.push(piece)
  }
  return list
}

function spanOf(model) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let any = false
  for (const course of model.courses) {
    for (const piece of course.pieces) {
      any = true
      minX = Math.min(minX, piece.x)
      maxX = Math.max(maxX, piece.x + piece.w - 1)
      minZ = Math.min(minZ, piece.z)
      maxZ = Math.max(maxZ, piece.z + piece.d - 1)
    }
  }
  if (!any) return { minX: -16, maxX: 16, minZ: -16, maxZ: 16 }
  return { minX: minX - 16, maxX: maxX + 16, minZ: minZ - 16, maxZ: maxZ + 16 }
}

function pieceKey(piece) {
  return `${piece.course}|${piece.plateY}|${piece.x}|${piece.z}|${piece.w}|${piece.d}|${piece.color}`
}

function pieceMark(piece) {
  return {
    key: pieceKey(piece),
    course: piece.course,
    plateY: piece.plateY,
    x: piece.x,
    z: piece.z,
    w: piece.w,
    d: piece.d,
    color: piece.color,
    name: piece.part?.name || 'part',
    colorName: piece.colorName || 'Unknown',
    wx: piece.wx,
    wy: piece.wy ?? piece.plateY * PLATE + PLATE / 2,
    wz: piece.wz,
  }
}

function closestPiece(ray, pieces) {
  let best = null
  let bestDist = Infinity
  const scratch = new THREE.Vector3()
  for (const piece of pieces) {
    const box = new THREE.Box3(
      new THREE.Vector3(piece.wx - piece.w / 2, piece.wy - BODY_H / 2, piece.wz - piece.d / 2),
      new THREE.Vector3(piece.wx + piece.w / 2, piece.wy + BODY_H / 2 + STUD_H, piece.wz + piece.d / 2),
    )
    const point = ray.intersectBox(box, scratch)
    if (!point) continue
    const dist = point.distanceToSquared(ray.origin)
    if (dist < bestDist) {
      bestDist = dist
      best = piece
    }
  }
  return best
}

/** Project screen points onto stud space and any bricks under the stroke. */
export function markPoints(points, { camera, rect, model, course, view, ghost }) {
  const pieces = []
  const cells = []
  if (!camera || !rect?.width || !rect?.height || view === 'model') return { pieces, cells }
  const visible = visiblePieces(model, course, view, ghost)
  const span = spanOf(model)
  const shiftX = model.shiftX || 0
  const shiftZ = model.shiftZ || 0
  const raycaster = new THREE.Raycaster()
  const groundHit = new THREE.Vector3()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const seenPieces = new Set()
  const seenCells = new Set()

  const rememberPiece = (piece) => {
    const key = pieceKey(piece)
    if (seenPieces.has(key)) return
    seenPieces.add(key)
    pieces.push(pieceMark(piece))
  }

  const rememberCell = (x, z) => {
    const stud = `${x}|${z}`
    if (seenCells.has(stud) || cells.length >= MAX_CELLS) return
    seenCells.add(stud)
    cells.push({ x, z })
  }

  for (const point of points) {
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((point.clientX - rect.left) / rect.width) * 2 - 1,
        -((point.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    )
    const hit = closestPiece(raycaster.ray, visible)
    if (hit) {
      rememberPiece(hit)
      continue
    }

    // Open baseplate only. A brick hit must not also keep the stud where the ray meets the floor.
    if (!raycaster.ray.intersectPlane(ground, groundHit)) continue
    const travel = groundHit.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction)
    if (travel <= 0 || travel > 80) continue
    const x = Math.round(groundHit.x - shiftX)
    const z = Math.round(groundHit.z - shiftZ)
    if (x < span.minX || x > span.maxX || z < span.minZ || z > span.maxZ) continue
    rememberCell(x, z)
  }
  return { pieces, cells }
}

export function maskFromStrokes(strokes) {
  return (strokes || []).reduce((mask, stroke) => mergeMask(mask, stroke), emptyMask())
}

export function mergeMask(prev, found) {
  const pieceKeys = new Set(prev.pieces.map((piece) => piece.key))
  const cellKeys = new Set(prev.cells.map((cell) => `${cell.x}|${cell.z}`))
  const pieces = []
  const cells = []
  for (const piece of found.pieces) {
    if (pieceKeys.has(piece.key) || prev.pieces.length + pieces.length >= MAX_PIECES) continue
    pieceKeys.add(piece.key)
    pieces.push(piece)
  }
  for (const cell of found.cells) {
    const key = `${cell.x}|${cell.z}`
    if (cellKeys.has(key) || prev.cells.length + cells.length >= MAX_CELLS) continue
    cellKeys.add(key)
    cells.push(cell)
  }
  if (!pieces.length && !cells.length) return prev
  return {
    pieces: pieces.length ? [...prev.pieces, ...pieces] : prev.pieces,
    cells: cells.length ? [...prev.cells, ...cells] : prev.cells,
  }
}

function pieceList(pieces) {
  const groups = new Map()
  for (const piece of pieces) {
    const key = `${piece.course}|${piece.colorName}|${piece.name}`
    const row = groups.get(key)
    if (row) row.qty += 1
    else groups.set(key, { qty: 1, colorName: piece.colorName, name: piece.name, course: piece.course })
  }
  const rows = [...groups.values()]
  const shown = rows.slice(0, 5)
  const text = shown
    .map((row) => `${row.qty}× ${row.colorName} ${row.name} on course ${row.course + 1}`)
    .join('; ')
  const rest = pieces.length - shown.reduce((sum, row) => sum + row.qty, 0)
  return rest > 0 ? `${text}; ${rest} more parts` : text
}

function cellList(cells) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const cell of cells) {
    minX = Math.min(minX, cell.x)
    maxX = Math.max(maxX, cell.x)
    minZ = Math.min(minZ, cell.z)
    maxZ = Math.max(maxZ, cell.z)
  }
  const across = maxX - minX + 1
  const deep = maxZ - minZ + 1
  const count = cells.length === 1 ? '1 stud' : `${cells.length} studs`
  return `${count}, ${across} by ${deep}, from stud ${minX}, ${minZ} to ${maxX}, ${maxZ}`
}

/** Short instruction carried with the chat message and sent with the revision. */
export function boundaryText(mask) {
  const pieces = mask?.pieces || []
  const cells = mask?.cells || []
  if (!pieces.length && !cells.length) return ''
  const lines = []
  if (cells.length) {
    lines.push(`Change this drawn space: ${cellList(cells)}`)
  }
  if (pieces.length) {
    lines.push(`Parts touching this space: ${pieceList(pieces)}`)
  } else if (cells.length) {
    lines.push('Add new LEGO plates in this open space')
  }
  lines.push('Leave everything outside this boundary as it is.')
  const text = lines.join('. ')
  return text.length > 420 ? `${text.slice(0, 417)}...` : text
}
