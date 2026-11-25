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

function localVerb(text) {
  const line = (text || '').toLowerCase()
  if (/\b(remove|delete|erase|cut)\b/.test(line)) return 'remove'
  if (/\b(taller|higher|raise|thicker|add)\b/.test(line)) return 'taller'
  if (/\b(shorter|lower|thinner)\b/.test(line)) return 'shorter'
  if (/\b(fill|solid|close|join)\b/.test(line)) return 'fill'
  return ''
}

/**
 * Repack only the drawn columns for a simple change. Anything else returns null
 * so the caller can send the sentence on.
 */
export function localRevision(model, mask, text) {
  const verb = localVerb(text)
  if (!verb || !model || !hasMask(mask)) return null
  const columns = new Set([...unlockPainted(mask).keys(), ...spaceSet(mask)])
  if (!columns.size) return null
  const cells = []
  for (const course of model.courses) {
    for (const piece of course.pieces) {
      for (let dz = 0; dz < piece.d; dz++) {
        for (let dx = 0; dx < piece.w; dx++) {
          cells.push({
            x: piece.x + dx,
            y: piece.plateY,
            z: piece.z + dz,
            color: piece.color,
            kind: piece.mount === 'side' ? 'tile' : cellKind(piece.kind),
            mount: piece.mount || '',
            axis: piece.axis || '',
          })
        }
      }
    }
  }
  const idOf = (cell) => `${cell.x}|${cell.y}|${cell.z}`
  const occupied = new Set(cells.map(idOf))
  const byColumn = new Map()
  for (const cell of cells) {
    const id = `${cell.x}|${cell.z}`
    const list = byColumn.get(id)
    if (list) list.push(cell)
    else byColumn.set(id, [cell])
  }
  let changed = false
  if (verb === 'remove') {
    const drop = new Set()
    for (const mark of mask.pieces || []) {
      if (![mark.x, mark.z, mark.w, mark.d, mark.plateY].every((n) => Number.isFinite(n))) continue
      for (let dz = 0; dz < mark.d; dz++) {
        for (let dx = 0; dx < mark.w; dx++) drop.add(`${mark.x + dx}|${mark.plateY}|${mark.z + dz}`)
      }
    }
    for (const column of spaceSet(mask)) {
      for (const cell of byColumn.get(column) || []) drop.add(idOf(cell))
    }
    for (let i = cells.length - 1; i >= 0; i--) {
      if (!drop.has(idOf(cells[i]))) continue
      cells.splice(i, 1)
      changed = true
    }
  }
  for (const column of columns) {
    const stack = (byColumn.get(column) || []).slice().sort((a, b) => a.y - b.y)
    if (!stack.length) continue
    if (verb === 'taller') {
      const top = stack[stack.length - 1]
      const next = { x: top.x, y: top.y + 1, z: top.z, color: top.color, kind: 'plate', mount: '', axis: '' }
      if (!occupied.has(idOf(next))) {
        cells.push(next)
        occupied.add(idOf(next))
        changed = true
      }
    } else if (verb === 'shorter' && stack.length > 1) {
      const top = stack[stack.length - 1]
      const index = cells.findIndex((cell) => cell.x === top.x && cell.y === top.y && cell.z === top.z)
      if (index >= 0) {
        cells.splice(index, 1)
        changed = true
      }
    } else if (verb === 'fill') {
      const present = new Set(stack.map((cell) => cell.y))
      for (let y = stack[0].y + 1; y < stack[stack.length - 1].y; y++) {
        if (present.has(y)) continue
        const below = [...stack].reverse().find((cell) => cell.y < y)
        if (!below || y - below.y > 3) continue
        const next = { x: below.x, y, z: below.z, color: below.color, kind: 'plate', mount: '', axis: '' }
        if (occupied.has(idOf(next))) continue
        cells.push(next)
        occupied.add(idOf(next))
        changed = true
      }
    }
  }
  if (!changed) return { model, changed: false }
  const packed = packModel(cells)
  const drafts = packed.courses.map((course) => ({
    plateY: course.y,
    section: sectionFor(model, course.y),
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
  const next = retouch(model, drafts)
  next.origin = model.origin
  next.sentence = model.sentence
  next.prompt = model.prompt
  next.grid = model.grid
  next.spec = model.spec
  next.tweaks = model.tweaks
  next.name = model.name
  next.summary = verb === 'remove' ? 'Removed the bricks in the drawn area.' : 'Revised the drawn area on the current build.'
  return { model: next, changed: true }
}

