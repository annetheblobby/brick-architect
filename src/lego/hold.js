import { retouch } from './design.js'
import { packModel } from './pack.js'

function hasMask(mask) {
  return Boolean(mask && ((mask.pieces && mask.pieces.length) || (mask.cells && mask.cells.length)))
}

/** Columns unlocked by painted parts: stud key → lowest plateY that may change. */
function unlockPainted(mask) {
  const columns = new Map()
  for (const mark of mask.pieces || []) {
    const x0 = mark.x
    const z0 = mark.z
    const w = mark.w
    const d = mark.d
    const plateY = mark.plateY
    if (![x0, z0, w, d, plateY].every((n) => Number.isFinite(n))) continue
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const key = `${x0 + dx}|${z0 + dz}`
        const prev = columns.get(key)
        columns.set(key, prev == null ? plateY : Math.min(prev, plateY))
      }
    }
  }
  return columns
}

/** Stud columns covered by the drawn mask stroke. */
function spaceSet(mask) {
  const set = new Set()
  for (const cell of mask.cells || []) {
    if (!Number.isFinite(cell.x) || !Number.isFinite(cell.z)) continue
    set.add(`${cell.x}|${cell.z}`)
  }
  return set
}

function isEditable(space, painted, plateY, x, z) {
  if (space.has(`${x}|${z}`)) return true
  const minY = painted.get(`${x}|${z}`)
  return minY != null && plateY >= minY
}

function walkStuds(piece, visit) {
  for (let dz = 0; dz < piece.d; dz++) {
    for (let dx = 0; dx < piece.w; dx++) {
      visit(piece.x + dx, piece.z + dz)
    }
  }
}

function sectionFor(prev, plateY) {
  const course = prev.courses.find((row) => row.plateY === plateY)
  return course?.section || prev.sections?.[0]?.name || 'Custom'
}

function cellKind(kind) {
  return kind === 'round2' ? 'plate' : kind
}

function bboxOfKeys(keys) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const key of keys) {
    const [x, z] = key.split('|').map(Number)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ }
}

function collectStuds(model, dx, dz) {
  const studs = []
  for (const course of model.courses) {
    for (const piece of course.pieces) {
      walkStuds(piece, (x, z) => {
        studs.push({
          x: Math.round(x + dx),
          y: piece.plateY,
          z: Math.round(z + dz),
          color: piece.color,
          kind: cellKind(piece.kind),
        })
      })
    }
  }
  return studs
}

function dominantColor(studs, fallback) {
  const counts = new Map()
  for (const stud of studs) {
    counts.set(stud.color, (counts.get(stud.color) || 0) + 1)
  }
  let best = fallback
  let bestN = -1
  for (const [color, n] of counts) {
    if (n > bestN) {
      best = color
      bestN = n
    }
  }
  return best || 'light-bluish-gray'
}

function fallbackColor(prev, nextStuds) {
  if (nextStuds.length) return dominantColor(nextStuds, null)
  const prevStuds = []
  for (const course of prev.courses) {
    for (const piece of course.pieces) {
      prevStuds.push({ color: piece.color })
    }
  }
  return dominantColor(prevStuds, 'light-bluish-gray')
}

function occupiedColumns(prev) {
  const set = new Set()
  for (const course of prev.courses) {
    for (const piece of course.pieces) {
      walkStuds(piece, (x, z) => set.add(`${x}|${z}`))
    }
  }
  return set
}

/**
 * Place new bricks into drawn studs that had no plates before.
 * Tripo recenters every mesh, so remap the new footprint onto that open space.
 */
function fillOpenSpace(open, nextStuds, claimed, loose, fillColor) {
  if (!open.size) return

  const openKeys = [...open]
  const openBox = bboxOfKeys(openKeys)
  const openCenterX = (openBox.minX + openBox.maxX) / 2
  const openCenterZ = (openBox.minZ + openBox.maxZ) / 2
  if (nextStuds.length) {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const stud of nextStuds) {
      minX = Math.min(minX, stud.x)
      maxX = Math.max(maxX, stud.x)
      minZ = Math.min(minZ, stud.z)
      maxZ = Math.max(maxZ, stud.z)
    }
    const offX = Math.round(openCenterX - (minX + maxX) / 2)
    const offZ = Math.round(openCenterZ - (minZ + maxZ) / 2)
    for (const stud of nextStuds) {
      const x = stud.x + offX
      const z = stud.z + offZ
      if (!open.has(`${x}|${z}`)) continue
      const key = `${stud.y}|${x}|${z}`
      if (claimed.has(key)) continue
      claimed.add(key)
      loose.push({ x, y: stud.y, z, color: stud.color, kind: stud.kind })
    }
  }

  for (const col of openKeys) {
    const [x, z] = col.split('|').map(Number)
    const cellKey = `0|${x}|${z}`
    if (claimed.has(cellKey)) continue
    claimed.add(cellKey)
    loose.push({ x, y: 0, z, color: fillColor, kind: 'plate' })
  }
}

/**
 * Keep every stud outside the drawn mask identical to `prev`.
 * Drawn space (mask cells) and painted parts are editable; empty drawn studs get new plates.
 */
export function holdOutside(prev, next, mask) {
  if (!prev || !next || !hasMask(mask)) return next

  const painted = unlockPainted(mask)
  const space = spaceSet(mask)
  if (!painted.size && !space.size) return next

  const occupied = occupiedColumns(prev)
  const open = new Set()
  for (const col of space) {
    if (!occupied.has(col)) open.add(col)
  }

  const kept = []
  const loose = []

  for (const course of prev.courses) {
    for (const piece of course.pieces) {
      let inside = 0
      let outside = 0
      walkStuds(piece, (x, z) => {
        if (isEditable(space, painted, piece.plateY, x, z)) inside += 1
        else outside += 1
      })
      if (!inside) {
        kept.push({
          plateY: piece.plateY,
          x: piece.x,
          z: piece.z,
          w: piece.w,
          d: piece.d,
          color: piece.color,
          kind: piece.kind,
        })
        continue
      }
      if (!outside) continue
      walkStuds(piece, (x, z) => {
        if (isEditable(space, painted, piece.plateY, x, z)) return
        loose.push({
          x,
          y: piece.plateY,
          z,
          color: piece.color,
          kind: cellKind(piece.kind),
        })
      })
    }
  }

  const dx = (next.shiftX || 0) - (prev.shiftX || 0)
  const dz = (next.shiftZ || 0) - (prev.shiftZ || 0)
  const nextStuds = collectStuds(next, dx, dz)
  const claimed = new Set(loose.map((cell) => `${cell.y}|${cell.x}|${cell.z}`))
  for (const piece of kept) {
    walkStuds(piece, (x, z) => claimed.add(`${piece.plateY}|${x}|${z}`))
  }

  // In-place edits inside drawn / painted columns (not the empty open fill set).
  for (const stud of nextStuds) {
    if (!isEditable(space, painted, stud.y, stud.x, stud.z)) continue
    if (open.has(`${stud.x}|${stud.z}`)) continue
    const key = `${stud.y}|${stud.x}|${stud.z}`
    if (claimed.has(key)) continue
    claimed.add(key)
    loose.push({ x: stud.x, y: stud.y, z: stud.z, color: stud.color, kind: stud.kind })
  }

  fillOpenSpace(open, nextStuds, claimed, loose, fallbackColor(prev, nextStuds))

  const packed = loose.length ? packModel(loose).courses : []
  const byY = new Map()

  for (const piece of kept) {
    if (!byY.has(piece.plateY)) byY.set(piece.plateY, [])
    byY.get(piece.plateY).push({
      x: piece.x,
      z: piece.z,
      w: piece.w,
      d: piece.d,
      color: piece.color,
      kind: piece.kind,
    })
  }

  for (const course of packed) {
    if (!byY.has(course.y)) byY.set(course.y, [])
    const bucket = byY.get(course.y)
    for (const piece of course.pieces) {
      bucket.push({
        x: piece.x,
        z: piece.z,
        w: piece.w,
        d: piece.d,
        color: piece.color,
        kind: piece.kind,
      })
    }
  }

  const plateYs = [...byY.keys()].sort((a, b) => a - b)
  if (!plateYs.length) {
    throw new Error('That change emptied the build. Draw a smaller area or keep at least one plate.')
  }

  const drafts = plateYs.map((plateY) => ({
    plateY,
    section: sectionFor(prev, plateY),
    pieces: byY.get(plateY),
  }))

  const held = retouch(prev, drafts)
  return {
    ...held,
    name: next.name || prev.name,
    prompt: next.prompt || prev.prompt,
    sentence: prev.sentence || next.sentence || prev.prompt || '',
    origin: 'model',
    grid: prev.grid ?? next.grid,
    tweaks: next.tweaks || prev.tweaks || [],
    summary: open.size
      ? 'Revised the drawn space and added plates where it was open. Everything outside stayed as it was.'
      : 'Revised inside the drawn space. Everything outside stayed as it was.',
  }
}
