import { isLegal, legalDepths, lengthsFor } from './parts.js'

/**
 * Pack each course into real plates.
 * Odd courses start two studs in from the corner so seams don't stack on the
 * course below (a running bond). A plate may hang past the course under it
 * only while half its studs stay clutched.
 */

function supportRatio(piece, below) {
  if (!below) return 1
  let held = 0
  const total = piece.w * piece.d
  for (let dz = 0; dz < piece.d; dz++) {
    for (let dx = 0; dx < piece.w; dx++) {
      if (below.has(`${piece.x + dx}|${piece.z + dz}`)) held++
    }
  }
  return held / total
}

function coverageOf(pieces) {
  const set = new Set()
  for (const piece of pieces) {
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) set.add(`${piece.x + dx}|${piece.z + dz}`)
    }
  }
  return set
}

function cutSegment(seg, y) {
  const kind = seg[0].kind
  const color = seg[0].color
  const lengths = lengthsFor(kind)
  const out = []
  let i = 0
  const offset = y % 2 === 1 && seg.length >= 6 && lengths.includes(2)
  if (offset) {
    out.push({ x: seg[0].x, y, z: seg[0].z, w: 2, d: 1, color, kind })
    i = 2
  }
  while (i < seg.length) {
    let len = 1
    for (const candidate of lengths) {
      if (candidate <= seg.length - i) {
        len = candidate
        break
      }
    }
    out.push({ x: seg[i].x, y, z: seg[i].z, w: len, d: 1, color, kind })
    i += len
  }
  return out
}

function growDepth(strips) {
  const map = new Map()
  for (const strip of strips) map.set(`${strip.x}|${strip.z}|${strip.w}|${strip.color}|${strip.kind}`, strip)
  const used = new Set()
  const out = []
  const sorted = strips.slice().sort((a, b) => a.z - b.z || a.x - b.x || b.w - a.w)
  for (const strip of sorted) {
    if (used.has(strip)) continue
    const depths = legalDepths(strip.w, strip.kind)
    let group = [strip]
    for (const depth of depths) {
      if (depth === 1) break
      const next = [strip]
      let ok = true
      for (let step = 1; step < depth; step++) {
        const found = map.get(`${strip.x}|${strip.z + step}|${strip.w}|${strip.color}|${strip.kind}`)
        if (!found || used.has(found)) {
          ok = false
          break
        }
        next.push(found)
      }
      if (ok) {
        group = next
        break
      }
    }
    for (const item of group) used.add(item)
    out.push({
      x: strip.x,
      y: strip.y,
      z: strip.z,
      w: strip.w,
      d: group.length,
      color: strip.color,
      kind: strip.kind,
    })
  }
  return out
}

function tryMerge(a, b) {
  if (a.kind !== b.kind || a.color !== b.color || a.y !== b.y) return null
  if (a.kind === 'round1' || a.kind === 'round2') return null
  if (a.z === b.z && a.d === b.d && a.x + a.w === b.x) {
    return { x: a.x, y: a.y, z: a.z, w: a.w + b.w, d: a.d, color: a.color, kind: a.kind }
  }
  if (b.z === a.z && b.d === a.d && b.x + b.w === a.x) {
    return { x: b.x, y: a.y, z: a.z, w: a.w + b.w, d: a.d, color: a.color, kind: a.kind }
  }
  if (a.x === b.x && a.w === b.w && a.z + a.d === b.z) {
    return { x: a.x, y: a.y, z: a.z, w: a.w, d: a.d + b.d, color: a.color, kind: a.kind }
  }
  if (b.x === a.x && b.w === a.w && b.z + b.d === a.z) {
    return { x: a.x, y: a.y, z: b.z, w: a.w, d: a.d + b.d, color: a.color, kind: a.kind }
  }
  return null
}

function repair(pieces, below) {
  const list = pieces.slice()
  for (let guard = 0; guard < 48; guard++) {
    let weak = null
    let weakRatio = 1
    for (const piece of list) {
      const ratio = supportRatio(piece, below)
      if (ratio < weakRatio - 1e-6) {
        weakRatio = ratio
        weak = piece
      }
    }
    if (!weak || weakRatio >= 0.5 - 1e-6) break
    let best = null
    let bestRatio = weakRatio
    let bestIndex = -1
    for (let i = 0; i < list.length; i++) {
      const other = list[i]
      if (other === weak) continue
      const merged = tryMerge(weak, other)
      if (!merged || !isLegal(merged.kind, merged.w, merged.d)) continue
      const ratio = supportRatio(merged, below)
      if (ratio > bestRatio + 1e-6) {
        bestRatio = ratio
        best = merged
        bestIndex = i
      }
    }
    if (!best) break
    const other = list[bestIndex]
    const next = list.filter((piece) => piece !== weak && piece !== other)
    next.push(best)
    list.length = 0
    list.push(...next)
  }
  return list
}

function packCourse(cells, y) {
  const pieces = []
  const rows = new Map()
  for (const cell of cells) {
    if (cell.kind === 'round1' || cell.kind === 'round2') {
      const size = cell.kind === 'round2' ? 2 : 1
      pieces.push({ x: cell.x, y, z: cell.z, w: size, d: size, color: cell.color, kind: cell.kind })
      continue
    }
    if (!rows.has(cell.z)) rows.set(cell.z, [])
    rows.get(cell.z).push(cell)
  }
  const strips = []
  for (const z of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(z).sort((a, b) => a.x - b.x)
    let seg = []
    const flush = () => {
      if (!seg.length) return
      strips.push(...cutSegment(seg, y))
      seg = []
    }
    for (const cell of row) {
      const prev = seg[seg.length - 1]
      if (prev && (cell.x !== prev.x + 1 || cell.color !== prev.color || cell.kind !== prev.kind)) flush()
      seg.push(cell)
    }
    flush()
  }
  return [...pieces, ...growDepth(strips)]
}

function footprintCount(cell) {
  return cell.kind === 'round2' ? 4 : 1
}

function assertCover(cells, pieces, y) {
  const got = new Map()
  for (const piece of pieces) {
    if (!isLegal(piece.kind, piece.w, piece.d)) {
      throw new Error(`No catalog part for ${piece.kind} ${piece.w}x${piece.d} on course ${y}`)
    }
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) {
        const key = `${piece.x + dx}|${piece.z + dz}`
        if (got.has(key)) throw new Error(`Overlapping plates at ${key} on course ${y}`)
        got.set(key, piece.kind)
      }
    }
  }
  let expected = 0
  for (const cell of cells) {
    const w = cell.kind === 'round2' ? 2 : 1
    const d = w
    expected += footprintCount(cell)
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const key = `${cell.x + dx}|${cell.z + dz}`
        if (!got.has(key)) throw new Error(`Uncovered stud ${key} on course ${y}`)
      }
    }
  }
  if (got.size !== expected) {
    throw new Error(`Course ${y} covers ${got.size} studs, expected ${expected}`)
  }
}

function pieceGrid(pieces) {
  const grid = new Map()
  pieces.forEach((piece, index) => {
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) grid.set(`${piece.x + dx}|${piece.z + dz}`, index)
    }
  })
  return grid
}

function staggerAgainst(pieces, belowPieces) {
  if (!belowPieces) return { score: 1, seams: 0, stacked: 0 }
  const above = pieceGrid(pieces)
  const below = pieceGrid(belowPieces)
  let seams = 0
  let stacked = 0
  for (const key of above.keys()) {
    const [x, z] = key.split('|').map(Number)
    for (const [nx, nz] of [[x + 1, z], [x, z + 1]]) {
      const next = `${nx}|${nz}`
      if (!above.has(next) || !below.has(key) || !below.has(next)) continue
      const seamHere = above.get(key) !== above.get(next)
      if (!seamHere) continue
      seams++
      if (below.get(key) !== below.get(next)) stacked++
    }
  }
  return { score: seams === 0 ? 1 : 1 - stacked / seams, seams, stacked }
}

export function packModel(cells) {
  const byY = new Map()
  for (const cell of cells) {
    if (!byY.has(cell.y)) byY.set(cell.y, [])
    byY.get(cell.y).push(cell)
  }
  const ys = [...byY.keys()].sort((a, b) => a - b)
  const courses = []
  let below = null
  let belowPieces = null
  let prevY = null
  for (const y of ys) {
    if (prevY != null && y !== prevY + 1) below = new Set()
    let pieces = packCourse(byY.get(y), y)
    const base = prevY == null
    if (!base) pieces = repair(pieces, below)
    assertCover(byY.get(y), pieces, y)
    for (const piece of pieces) piece.support = base ? 1 : supportRatio(piece, below)
    const bond = staggerAgainst(pieces, belowPieces)
    const minSupport = Math.min(...pieces.map((piece) => piece.support))
    courses.push({
      y,
      pieces,
      stagger: bond.score,
      seamCount: bond.seams,
      stackedSeams: bond.stacked,
      minSupport,
    })
    below = coverageOf(pieces)
    belowPieces = pieces
    prevY = y
  }
  return {
    courses,
    minSupport: courses.length ? Math.min(...courses.map((course) => course.minSupport)) : 1,
  }
}
