import { retouch } from './design.js'
import { colorByKey } from './palette.js'
import { isLegal } from './parts.js'

function snapshot(model) {
  return model.courses.map((course) => ({
    plateY: course.plateY,
    section: course.section,
    pieces: course.pieces.map((piece) => ({
      x: piece.x,
      z: piece.z,
      w: piece.w,
      d: piece.d,
      color: piece.color,
      kind: piece.kind,
      mount: piece.mount || '',
      axis: piece.axis || '',
    })),
  }))
}

export function overlaps(pieces, x, z, w, d, ignore = -1) {
  return pieces.some(
    (piece, index) =>
      index !== ignore && x < piece.x + piece.w - 1e-6 && x + w > piece.x + 1e-6 && z < piece.z + piece.d - 1e-6 && z + d > piece.z + 1e-6,
  )
}

/** Round onto a stud grid. 1 is a stud, 0.5 is half, 0.25 is the fine grid. */
export function quantize(value, step) {
  const safe = step > 0 ? step : 1
  return Math.round(Math.round(value / safe) * safe * 1000) / 1000
}

/**
 * Land a part on the grid. With snap on, its edges also jump to a neighboring
 * part when the pointer is close, so plates meet instead of sitting a gap apart.
 */
export function snapOrigin(x, z, w, d, pieces, ignore, step, magnet) {
  const grid = magnet ? step : 0.05
  const sx = quantize(x, grid)
  const sz = quantize(z, grid)
  if (!magnet) return { x: sx, z: sz }
  const reach = Math.max(step, 0.5)
  let bestX = sx
  let bestDx = reach
  let bestZ = sz
  let bestDz = reach
  pieces.forEach((piece, index) => {
    if (index === ignore) return
    for (const edge of [piece.x, piece.x + piece.w]) {
      for (const own of [0, w]) {
        const next = quantize(edge - own, grid)
        const dist = Math.abs(next - sx)
        if (dist && dist <= bestDx) {
          bestDx = dist
          bestX = next
        }
      }
    }
    for (const edge of [piece.z, piece.z + piece.d]) {
      for (const own of [0, d]) {
        const next = quantize(edge - own, grid)
        const dist = Math.abs(next - sz)
        if (dist && dist <= bestDz) {
          bestDz = dist
          bestZ = next
        }
      }
    }
  })
  return { x: bestX, z: bestZ }
}

export function placePiece(model, courseIndex, spec) {
  const course = model?.courses[courseIndex]
  if (!course) return model
  const w = spec.w
  const d = spec.d
  let kind = spec.kind || 'plate'
  if (kind === 'tile' && colorByKey(spec.color).alpha && isLegal('glass', w, d)) kind = 'glass'
  if (!isLegal(kind, w, d)) return model
  if (overlaps(course.pieces, spec.x, spec.z, w, d)) return model
  const drafts = snapshot(model)
  drafts[courseIndex].pieces.push({
    x: spec.x,
    z: spec.z,
    w,
    d,
    color: spec.color,
    kind,
  })
  return retouch(model, drafts)
}

export function removePiece(model, courseIndex, pieceIndex) {
  const course = model?.courses[courseIndex]
  if (!course?.pieces[pieceIndex]) return model
  const total = model.courses.reduce((sum, item) => sum + item.pieces.length, 0)
  if (total <= 1) return model
  const drafts = snapshot(model)
  const nextPieces = drafts[courseIndex].pieces.filter((_, index) => index !== pieceIndex)
  if (!nextPieces.length && courseIndex === drafts.length - 1) drafts.pop()
  else drafts[courseIndex].pieces = nextPieces
  return retouch(model, drafts)
}

export function movePiece(model, courseIndex, pieceIndex, x, z) {
  const course = model?.courses[courseIndex]
  const piece = course?.pieces[pieceIndex]
  if (!piece) return model
  if (piece.x === x && piece.z === z) return model
  if (overlaps(course.pieces, x, z, piece.w, piece.d, pieceIndex)) return model
  const drafts = snapshot(model)
  drafts[courseIndex].pieces[pieceIndex].x = x
  drafts[courseIndex].pieces[pieceIndex].z = z
  return retouch(model, drafts)
}

export function clonePiece(model, courseIndex, pieceIndex, x, z) {
  const piece = model?.courses[courseIndex]?.pieces[pieceIndex]
  if (!piece) return model
  return placePiece(model, courseIndex, {
    x,
    z,
    w: piece.w,
    d: piece.d,
    color: piece.color,
    kind: piece.kind,
  })
}

/** Turn the part 90° around its center, staying on the same studs. */
export function hingePiece(model, courseIndex, pieceIndex) {
  const course = model?.courses[courseIndex]
  const piece = course?.pieces[pieceIndex]
  if (!piece) return model
  const cx = piece.x + (piece.w - 1) / 2
  const cz = piece.z + (piece.d - 1) / 2
  const w = piece.d
  const d = piece.w
  const x = quantize(cx - (w - 1) / 2, 0.05)
  const z = quantize(cz - (d - 1) / 2, 0.05)
  if (x === piece.x && z === piece.z && w === piece.w && d === piece.d) return model
  if (overlaps(course.pieces, x, z, w, d, pieceIndex)) return model
  const drafts = snapshot(model)
  const target = drafts[courseIndex].pieces[pieceIndex]
  target.x = x
  target.z = z
  target.w = w
  target.d = d
  return retouch(model, drafts)
}

export function addCourse(model) {
  if (!model?.courses.length) return model
  const drafts = snapshot(model)
  const top = drafts[drafts.length - 1]
  if (!top.pieces.length) return model
  drafts.push({
    plateY: top.plateY + 1,
    section: 'Custom',
    pieces: [],
  })
  return retouch(model, drafts)
}

/** Empty course directly above this one. Courses above it move up a plate. */
export function insertCourse(model, courseIndex) {
  const current = model?.courses[courseIndex]
  if (!current?.pieces.length) return model
  const drafts = snapshot(model)
  const plateY = current.plateY + 1
  for (const draft of drafts) {
    if (draft.plateY >= plateY) draft.plateY += 1
  }
  drafts.splice(courseIndex + 1, 0, {
    plateY,
    section: 'Custom',
    pieces: [],
  })
  return retouch(model, drafts)
}
