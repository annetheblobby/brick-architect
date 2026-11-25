/** Appearance checks and section splits for a plate fill. */

function studsOf(piece, into) {
  for (let dz = 0; dz < piece.d; dz++) {
    for (let dx = 0; dx < piece.w; dx++) into.add(`${piece.x + dx}|${piece.z + dz}`)
  }
  return into
}

function courseStuds(course) {
  const set = new Set()
  for (const piece of course.pieces) studsOf(piece, set)
  return set
}

function isSpine(set, key) {
  const [x, z] = key.split('|').map(Number)
  return (
    !set.has(`${x + 1}|${z}`) &&
    !set.has(`${x - 1}|${z}`) &&
    !set.has(`${x}|${z + 1}`) &&
    !set.has(`${x}|${z - 1}`)
  )
}

/**
 * Warnings a person can see that a connected plate stack still hides:
 * a one-stud spine, two parts on the same stud, and a clear piece covered by an opaque one.
 */
export function reviewBuild(courses) {
  const warnings = []
  const grids = courses.map(courseStuds)
  const seen = new Set()
  for (let i = 0; i < courses.length; i++) {
    const grid = grids[i]
    const counts = new Map()
    for (const piece of courses[i].pieces) {
      for (let dz = 0; dz < piece.d; dz++) {
        for (let dx = 0; dx < piece.w; dx++) {
          const key = `${piece.x + dx}|${piece.z + dz}`
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      }
    }
    for (const [key, count] of counts) {
      if (count < 2) continue
      warnings.push({
        code: 'overlap',
        course: i,
        text: 'Two parts occupy the same stud on this course. One of them has to move.',
      })
      break
    }
    for (const key of grid) {
      if (!isSpine(grid, key) || seen.has(key)) continue
      let run = 1
      let top = i
      for (let j = i + 1; j < courses.length; j++) {
        if (!grids[j].has(key) || !isSpine(grids[j], key)) break
        run += 1
        top = j
      }
      if (run >= 4) {
        seen.add(key)
        const at = Math.floor((i + top) / 2)
        warnings.push({
          code: 'spine',
          course: at,
          text: 'This connection is a single stud wide for several courses. It will snap. Widen it where it meets the body.',
        })
      }
    }
    for (const piece of courses[i].pieces) {
      const clear = piece.kind === 'glass' || (piece.alpha != null && piece.alpha < 0.95)
      if (!clear || i + 1 >= courses.length) continue
      const above = grids[i + 1]
      let covered = 0
      const total = piece.w * piece.d
      for (let dz = 0; dz < piece.d; dz++) {
        for (let dx = 0; dx < piece.w; dx++) {
          if (above.has(`${piece.x + dx}|${piece.z + dz}`)) covered += 1
        }
      }
      if (covered * 2 >= total) {
        warnings.push({
          code: 'glass',
          course: i,
          text: 'An opaque part covers this clear piece. Move it, or leave the face open.',
        })
        break
      }
    }
    if (courses[i].pieces.some((piece) => piece.mount === 'side' && piece.kind !== 'tile')) {
      warnings.push({
        code: 'side-studs',
        course: i,
        text: 'A plate turned on its side still shows a stud. Cap that face with a tile.',
      })
    }
  }
  const fins = courses.reduce(
    (sum, course) => sum + course.pieces.filter((piece) => piece.mount === 'side').length,
    0,
  )
  const construction = warnings.some((item) => item.code === 'spine' || item.code === 'overlap')
    ? 2
    : courses.some((course) => course.minSupport < 0.5)
      ? 3
      : 5
  const finish = warnings.some((item) => item.code === 'glass' || item.code === 'side-studs') ? 3 : 5
  return { warnings, construction, finish, fins }
}

/** Base, body, and head from the width of each course. A flat fill stays one section. */
export function sectionStages(cells) {
  const body = { name: 'Body', from: 0, to: 999, blurb: 'Plates fill the model from the ground up.' }
  let height = 0
  const counts = new Map()
  for (const cell of cells.values()) {
    counts.set(cell.y, (counts.get(cell.y) || 0) + 1)
    height = Math.max(height, cell.y + 1)
  }
  if (height < 8) return [body]
  let max = 0
  for (const count of counts.values()) max = Math.max(max, count)
  const wide = (y) => (counts.get(y) || 0) >= max * 0.55
  let bodyLow = 0
  while (bodyLow < height && !wide(bodyLow)) bodyLow += 1
  let bodyHigh = height - 1
  while (bodyHigh > bodyLow && !wide(bodyHigh)) bodyHigh -= 1
  if (bodyLow >= height) return [body]
  const stages = []
  if (bodyLow >= 3) {
    stages.push({
      name: 'Base',
      from: 0,
      to: bodyLow - 1,
      blurb: 'The narrow courses under the body. Keep each one clutched to the course below.',
    })
  }
  stages.push({
    name: 'Body',
    from: bodyLow,
    to: bodyHigh,
    blurb: 'The widest part of the build. Lay the large plates first.',
  })
  if (height - 1 - bodyHigh >= 3) {
    stages.push({
      name: 'Head',
      from: bodyHigh + 1,
      to: 999,
      blurb: 'The courses above the body. A one-stud neck will not hold this section.',
    })
  }
  if (stages.length === 1) return [body]
  return stages
}

function hasCell(cells, x, y, z) {
  return cells.has(`${x}|${y}|${z}`)
}

function isCore(cells, x, y, z) {
  const nx = hasCell(cells, x - 1, y, z) || hasCell(cells, x + 1, y, z)
  const nz = hasCell(cells, x, y, z - 1) || hasCell(cells, x, y, z + 1)
  return nx && nz
}

function reachesCore(cells, x, y, z, axis) {
  const stepX = axis === 'x' ? 0 : 1
  const stepZ = axis === 'x' ? 1 : 0
  for (const sign of [1, -1]) {
    for (let i = 1; i <= 8; i++) {
      const nx = x + stepX * sign * i
      const nz = z + stepZ * sign * i
      if (!hasCell(cells, nx, y, nz)) break
      if (isCore(cells, nx, y, nz)) return true
    }
  }
  return false
}

/**
 * A short one-stud protrusion becomes one tile turned on its side.
 * Tall columns, and studs that are thin in both directions, stay stacked plates.
 */
export function mountFins(cells) {
  const marked = []
  for (const cell of cells.values()) {
    const nx = hasCell(cells, cell.x - 1, cell.y, cell.z) || hasCell(cells, cell.x + 1, cell.y, cell.z)
    const nz = hasCell(cells, cell.x, cell.y, cell.z - 1) || hasCell(cells, cell.x, cell.y, cell.z + 1)
    if (nx === nz) continue
    const axis = nx ? 'z' : 'x'
    if (!reachesCore(cells, cell.x, cell.y, cell.z, axis)) continue
    marked.push(cell)
  }
  const columns = new Map()
  for (const cell of marked) {
    const key = `${cell.x}|${cell.z}`
    const list = columns.get(key)
    if (list) list.push(cell)
    else columns.set(key, [cell])
  }
  let fins = 0
  for (const list of columns.values()) {
    const ys = list.map((cell) => cell.y).sort((a, b) => a - b)
    if (ys[ys.length - 1] - ys[0] + 1 > 3) continue
    const mid = ys[Math.floor(ys.length / 2)]
    const keep = list.find((cell) => cell.y === mid) || list[0]
    const nx = hasCell(cells, keep.x - 1, keep.y, keep.z) || hasCell(cells, keep.x + 1, keep.y, keep.z)
    keep.kind = 'tile'
    keep.mount = 'side'
    keep.axis = nx ? 'z' : 'x'
    for (const cell of list) {
      if (cell === keep) continue
      cells.delete(`${cell.x}|${cell.y}|${cell.z}`)
    }
    fins += 1
  }
  return fins
}

/** Parts added and removed between two bills. */
export function diffBill(before, after) {
  const keyOf = (line) => `${line.number}|${line.colorId}`
  const prev = new Map((before || []).map((line) => [keyOf(line), line]))
  const next = new Map((after || []).map((line) => [keyOf(line), line]))
  const added = []
  const removed = []
  for (const [key, line] of next) {
    const delta = line.qty - (prev.get(key)?.qty || 0)
    if (delta > 0) added.push({ ...line, qty: delta })
  }
  for (const [key, line] of prev) {
    const delta = line.qty - (next.get(key)?.qty || 0)
    if (delta > 0) removed.push({ ...line, qty: delta })
  }
  return { added, removed }
}

/**
 * Automatic stand-in for the five-part visual rubric.
 * Identity follows the silhouette score. The other four follow the plate checks.
 */
export function rubricFor(model, silhouette) {
  const review = model?.review || { warnings: [], construction: 3, finish: 3, fins: 0 }
  const identity = silhouette >= 0.64 ? 5 : silhouette >= 0.5 ? 3 : silhouette >= 0.35 ? 2 : 1
  const features = review.fins > 0 ? 4 : 3
  const construction = review.construction || 3
  const finish = review.finish || 3
  const character = Math.max(1, Math.min(5, Math.round((identity + features + construction + finish) / 4)))
  const mean = (identity + features + construction + finish + character) / 5
  return { identity, features, construction, finish, character, mean }
}
