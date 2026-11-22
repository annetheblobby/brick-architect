import { retouch } from './design.js'
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
    })),
  }))
}

export function overlaps(pieces, x, z, w, d) {
  return pieces.some(
    (piece) => x < piece.x + piece.w && x + w > piece.x && z < piece.z + piece.d && z + d > piece.z,
  )
}

export function placePiece(model, courseIndex, spec) {
  const course = model?.courses[courseIndex]
  if (!course) return model
  const w = spec.w
  const d = spec.d
  if (!isLegal('plate', w, d)) return model
  if (overlaps(course.pieces, spec.x, spec.z, w, d)) return model
  const drafts = snapshot(model)
  drafts[courseIndex].pieces.push({
    x: spec.x,
    z: spec.z,
    w,
    d,
    color: spec.color,
    kind: 'plate',
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
