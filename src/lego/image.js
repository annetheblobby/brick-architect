import { COLORS, OPAQUE } from './palette.js'
import { legalDepths, lengthsFor } from './parts.js'
import { buildSculpture } from './volume.js'

function rgbToLab(r, g, b) {
  const lin = (c) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function nearest(r, g, b) {
  const [L, A, B] = rgbToLab(r, g, b)
  let best = OPAQUE[0]
  let bestD = Infinity
  for (const color of OPAQUE) {
    const d = (L - color.L) ** 2 + (A - color.A) ** 2 + (B - color.B) ** 2
    if (d < bestD) {
      bestD = d
      best = color
    }
  }
  return { color: best, lab: [L, A, B], dist: bestD }
}

function keyOf(color) {
  return Object.keys(COLORS).find((name) => COLORS[name].id === color.id)
}

function sample(data, width, height, cols, rows) {
  const cells = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const x0 = Math.floor((x * width) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / cols))
      const y0 = Math.floor((y * height) / rows)
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / rows))
      const stepX = Math.max(1, Math.floor((x1 - x0) / 6))
      const stepY = Math.max(1, Math.floor((y1 - y0) / 6))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let py = y0; py < y1; py += stepY) {
        for (let px = x0; px < x1; px += stepX) {
          const i = (py * width + px) * 4
          if (data[i + 3] < 24) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
      }
      cells.push(n ? [r / n, g / n, b / n] : null)
    }
  }
  return cells
}

function dither(samples, cols, rows) {
  const buf = samples.map((sample) => (sample ? [sample[0], sample[1], sample[2]] : null))
  const out = new Array(samples.length)
  const spread = (x, y, er, eg, eb, factor) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    const cell = buf[y * cols + x]
    if (!cell) return
    cell[0] = Math.min(255, Math.max(0, cell[0] + er * factor))
    cell[1] = Math.min(255, Math.max(0, cell[1] + eg * factor))
    cell[2] = Math.min(255, Math.max(0, cell[2] + eb * factor))
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (!buf[i]) {
        out[i] = null
        continue
      }
      const match = nearest(buf[i][0], buf[i][1], buf[i][2])
      out[i] = match.color
      const hex = parseInt(match.color.hex.slice(1), 16)
      const er = buf[i][0] - ((hex >> 16) & 255)
      const eg = buf[i][1] - ((hex >> 8) & 255)
      const eb = buf[i][2] - (hex & 255)
      spread(x + 1, y, er, eg, eb, 7 / 16)
      spread(x - 1, y + 1, er, eg, eb, 3 / 16)
      spread(x, y + 1, er, eg, eb, 5 / 16)
      spread(x + 1, y + 1, er, eg, eb, 1 / 16)
    }
  }
  return out
}

function labDist(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

function pictureMode(mode) {
  if (mode === 'mosaic' || mode === 'solid') return mode
  return 'relief'
}

function backgroundOf(present, cols, rows) {
  const corners = [present[0], present[cols - 1], present[(rows - 1) * cols], present[rows * cols - 1]].filter(Boolean)
  if (corners.length < 4) return null
  const agree = corners.every((corner) => labDist(corner.lab, corners[0].lab) < 18 ** 2)
  return agree ? corners[0] : null
}

function isBackdrop(sample, hit, background) {
  if (!sample || !hit) return true
  if (!background) return false
  return hit.dist < 16 ** 2 && labDist(hit.lab, background.lab) < 18 ** 2
}

/** Drop lone specks so a sculpture is built from color regions, not photo noise. */
function despeckle(colors, mask, cols, rows) {
  const next = colors.slice()
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (!mask[i] || !colors[i]) continue
      const counts = new Map()
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          const j = ny * cols + nx
          if (!mask[j] || !colors[j]) continue
          const id = colors[j].id
          const row = counts.get(id) || { n: 0, color: colors[j] }
          row.n += 1
          counts.set(id, row)
        }
      }
      let best = colors[i]
      let bestN = 0
      for (const row of counts.values()) {
        if (row.n > bestN) {
          bestN = row.n
          best = row.color
        }
      }
      const own = counts.get(colors[i].id)?.n || 0
      if (best !== colors[i] && bestN >= 5 && own <= 2) next[i] = best
    }
  }
  return next
}

function coalesce(colors, mask, cols, rows) {
  const next = colors.slice()
  const seen = new Uint8Array(colors.length)
  for (let i = 0; i < colors.length; i++) {
    if (!mask[i] || !next[i] || seen[i]) continue
    const id = next[i].id
    const stack = [i]
    const comp = []
    seen[i] = 1
    while (stack.length) {
      const cur = stack.pop()
      comp.push(cur)
      const x = cur % cols
      const y = (cur - x) / cols
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const j = ny * cols + nx
        if (seen[j] || !mask[j] || !next[j] || next[j].id !== id) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    if (comp.length >= 6) continue
    const votes = new Map()
    for (const cur of comp) {
      const x = cur % cols
      const y = (cur - x) / cols
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const j = ny * cols + nx
        if (!mask[j] || !colors[j] || colors[j].id === id) continue
        const row = votes.get(colors[j].id) || { n: 0, color: colors[j] }
        row.n += 1
        votes.set(colors[j].id, row)
      }
    }
    let best = null
    let bestN = 0
    for (const row of votes.values()) {
      if (row.n > bestN) {
        bestN = row.n
        best = row.color
      }
    }
    if (best) for (const cur of comp) next[cur] = best
  }
  return next
}

function cutLengths(n, y, cap = 6) {
  const lengths = lengthsFor('plate').filter((len) => len <= cap)
  const usable = lengths.length ? lengths : [1]
  const out = []
  let i = 0
  if (y % 2 === 1 && n >= 6 && usable.includes(2)) {
    out.push(2)
    i = 2
  }
  while (i < n) {
    let len = 1
    for (const candidate of usable) {
      if (candidate <= n - i) {
        len = candidate
        break
      }
    }
    out.push(len)
    i += len
  }
  return out
}

function splitRun(xs, colorOf) {
  const segs = []
  for (const x of xs.slice().sort((a, b) => a - b)) {
    const seg = segs[segs.length - 1]
    const color = colorOf(x)
    if (seg && x === seg[seg.length - 1] + 1 && color.id === colorOf(seg[0]).id) seg.push(x)
    else segs.push([x])
  }
  return segs
}

function segmentLegal(xs, y, support) {
  const cuts = cutLengths(xs.length, y)
  let i = 0
  for (const len of cuts) {
    let held = 0
    for (let k = 0; k < len; k++) if (support.has(xs[i + k])) held++
    if (held / len < 0.5 - 1e-6) return false
    i += len
  }
  return true
}

function frontLegal(xs, byX, y, support) {
  return splitRun(xs, (x) => byX.get(x).color).every((seg) => segmentLegal(seg, y, support))
}

function growFront(core, byX, y, support) {
  const chosen = new Set(core)
  for (const comp of splitRun(core, (x) => byX.get(x).color)) {
    const min = comp[0]
    const max = comp[comp.length - 1]
    const left = min - 1
    const right = max + 1
    const can = (x, neighbor) =>
      byX.has(x) && !chosen.has(x) && byX.get(x).color.id === byX.get(neighbor).color.id
    const options = []
    if (can(left, min) && can(right, max)) options.push([left, right])
    if (can(left, min)) options.push([left])
    if (can(right, max)) options.push([right])
    for (const extra of options) {
      for (const x of extra) chosen.add(x)
      if (frontLegal([...chosen], byX, y, support)) break
      for (const x of extra) chosen.delete(x)
    }
  }
  return [...chosen].sort((a, b) => a - b)
}

function pieceSpans(xs, y) {
  const spans = []
  for (const seg of splitRun(xs, () => ({ id: 1 }))) {
    const cuts = cutLengths(seg.length, y)
    let i = 0
    for (const len of cuts) {
      spans.push(seg.slice(i, i + len))
      i += len
    }
  }
  return spans
}

/**
 * The photo is turned into a Three.js solid, flat on the picture and round
 * behind it. Plates then fill that mesh, and a course only keeps studs that clutch.
 */
function sculptSolid(samples, quantized, present, cols, rows, background) {
  const mask = new Array(samples.length).fill(false)
  for (let i = 0; i < samples.length; i++) mask[i] = !isBackdrop(samples[i], present[i], background)
  let count = mask.filter(Boolean).length
  if (count < 8) {
    for (let i = 0; i < samples.length; i++) mask[i] = Boolean(samples[i])
    count = mask.filter(Boolean).length
  }
  if (!count) return null
  const colors = coalesce(coalesce(despeckle(quantized, mask, cols, rows), mask, cols, rows), mask, cols, rows)
  const sculpture = buildSculpture(mask, cols, rows, (x, row) => {
    const xi = Math.min(cols - 1, Math.max(0, Math.floor(x)))
    const yi = Math.min(rows - 1, Math.max(0, row))
    return samples[yi * cols + xi]
  })
  const depthAt = sculpture.depth
  // The lowest pixels are often a claw. Sit the sculpture on the first course that is actually thick.
  let seatRow = rows - 1
  for (let y = rows - 1; y >= 0; y--) {
    let thick = 0
    for (let x = 0; x < cols; x++) thick = Math.max(thick, depthAt[y * cols + x])
    if (thick >= 8) {
      seatRow = y
      break
    }
  }

  const tally = new Map()
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !colors[i]) continue
    const row = tally.get(colors[i].id) || { n: 0, color: colors[i] }
    row.n += 1
    tally.set(colors[i].id, row)
  }
  let body = null
  let bodyN = 0
  for (const row of tally.values()) {
    if (row.n > bodyN) {
      bodyN = row.n
      body = row.color
    }
  }

  const voxels = []
  let prev = new Map()
  let worldY = 1
  for (let row = seatRow; row >= 0; row--) {
    const want = new Map()
    for (let x = 0; x < cols; x++) {
      const i = row * cols + x
      if (!depthAt[i] || !colors[i]) continue
      want.set(x, { color: colors[i], depth: depthAt[i] })
    }
    if (!want.size) continue
    const layer = new Map()
    const paint = (x, z, color) => layer.set(`${x}|${z}`, color)
    if (!prev.size) {
      for (const [x, cell] of want) {
        for (let z = 0; z < cell.depth; z++) paint(x, z, z === 0 ? cell.color : body)
      }
    } else {
      const support = new Set()
      for (const key of prev.keys()) {
        const [x, z] = key.split('|').map(Number)
        if (z === 0) support.add(x)
      }
      const core = [...want.keys()].filter((x) => support.has(x))
      if (!core.length) continue
      const chosen = growFront(core, want, worldY, support)
      for (const x of chosen) {
        const cell = want.get(x)
        paint(x, 0, cell.color)
        let z = 1
        while (z < cell.depth && prev.has(`${x}|${z}`)) {
          paint(x, z, body)
          z += 1
        }
      }
      widenBody(layer, chosen, want, worldY, prev, body)
      swellBody(layer, want, worldY, prev, body)
    }
    if (!layer.size) continue
    for (const [key, color] of layer) {
      const [x, z] = key.split('|').map(Number)
      voxels.push({ x, y: worldY, z, color })
    }
    prev = layer
    worldY += 1
  }
  if (!voxels.length) return null
  const seen = new Set()
  for (const voxel of voxels) {
    if (voxel.z !== 0) continue
    seen.add(`${voxel.x}|${seatRow - (voxel.y - 1)}`)
  }
  let above = 0
  for (let row = 0; row <= seatRow; row++) {
    for (let x = 0; x < cols; x++) if (mask[row * cols + x]) above += 1
  }
  return {
    voxels,
    courses: worldY - 1,
    mesh: {
      positions: sculpture.positions,
      colors: sculpture.colors,
      indices: sculpture.indices,
    },
    fit: {
      silhouette: count,
      front: seen.size,
      above,
      seatRow,
      rows,
      cols,
    },
  }
}

function xsAt(layer, z) {
  const xs = []
  for (const key of layer.keys()) {
    const [x, zz] = key.split('|').map(Number)
    if (zz === z) xs.push(x)
  }
  return xs
}

function isPiece(xs, span, y) {
  return pieceSpans(xs, y).some((piece) => piece.length === span.length && piece.every((x, i) => x === span[i]))
}

function depthGroups(width, zs) {
  const depths = legalDepths(width, 'plate')
  const sorted = zs.slice().sort((a, b) => a - b)
  const groups = []
  let i = 0
  while (i < sorted.length) {
    let best = 1
    for (const depth of depths) {
      if (depth === 1) break
      if (i + depth > sorted.length) continue
      let run = true
      for (let step = 1; step < depth; step++) {
        if (sorted[i + step] !== sorted[i] + step) {
          run = false
          break
        }
      }
      if (run) {
        best = depth
        break
      }
    }
    groups.push(sorted.slice(i, i + best))
    i += best
  }
  return groups
}

function spansAt(layer, z, y) {
  const spans = []
  for (const seg of splitRun(xsAt(layer, z), (x) => layer.get(`${x}|${z}`))) {
    const cuts = cutLengths(seg.length, y)
    let i = 0
    for (const len of cuts) {
      spans.push(seg.slice(i, i + len))
      i += len
    }
  }
  return spans
}

function swellHolds(layer, span, y, prev, top, add) {
  const zs = []
  let maxZ = 0
  for (const key of layer.keys()) maxZ = Math.max(maxZ, Number(key.split('|')[1]))
  const paint = layer.get(`${span[0]}|${top}`)
  for (let z = 0; z <= maxZ; z++) {
    const match = spansAt(layer, z, y).some((piece) => {
      if (piece.length !== span.length || !piece.every((x, i) => x === span[i])) return false
      const color = layer.get(`${piece[0]}|${z}`)
      return color && paint && color.id === paint.id
    })
    if (match) zs.push(z)
  }
  for (let step = 1; step <= add; step++) zs.push(top + step)
  const fresh = new Set()
  for (let step = 1; step <= add; step++) fresh.add(top + step)
  for (const group of depthGroups(span.length, zs)) {
    if (!group.some((z) => fresh.has(z))) continue
    let held = 0
    for (const z of group) {
      if (fresh.has(z)) continue
      for (const x of span) if (prev.has(`${x}|${z}`)) held++
    }
    if (held / (group.length * span.length) < 0.5 - 1e-6) return false
  }
  return true
}

function swellBody(layer, want, y, prev, body) {
  let top = 0
  for (const key of layer.keys()) top = Math.max(top, Number(key.split('|')[1]))
  if (top < 1) return
  const spans = pieceSpans(xsAt(layer, top), y)
  const used = new Set()
  const ranked = spans.map((span, index) => ({ span, index })).sort((a, b) => b.span.length - a.span.length)
  for (const { span, index } of ranked) {
    if (used.has(index)) continue
    // An odd course re-cuts an isolated 6 as 2+4, so that plate would miss the one under it.
    if (y % 2 === 1 && span.length >= 6) continue
    if (!span.every((x) => prev.has(`${x}|${top}`))) continue
    const left = spans[index - 1]
    const right = spans[index + 1]
    const touches =
      (left && used.has(index - 1) && span[0] === left[left.length - 1] + 1) ||
      (right && used.has(index + 1) && right[0] === span[span.length - 1] + 1)
    if (touches) continue
    let have = 0
    for (let z = top; z >= 1; z--) {
      if (!span.every((x) => prev.has(`${x}|${z}`))) break
      if (!isPiece(xsAt(layer, z), span, y)) break
      have += 1
    }
    if (!have) continue
    const depths = span.map((x) => want.get(x)?.depth || 0).sort((a, b) => a - b)
    const middle = depths[Math.floor(depths.length / 2)] || 0
    let add = 0
    for (let k = 1; k <= 8; k++) {
      if (middle < top + k + 1) break
      if (!swellHolds(layer, span, y, prev, top, k)) continue
      add = k
    }
    if (!add) continue
    for (let step = 1; step <= add; step++) {
      for (const x of span) layer.set(`${x}|${top + step}`, body)
    }
    used.add(index)
    if (spans[index + 1] && span[span.length - 1] + 1 === spans[index + 1][0]) used.add(index + 1)
  }
}

function widenBody(layer, chosen, want, y, prev, body) {
  let top = 0
  for (const key of layer.keys()) top = Math.max(top, Number(key.split('|')[1]))
  for (let z = 1; z <= top; z++) {
    const support = new Set()
    let supported = false
    for (const key of prev.keys()) {
      const [x, zz] = key.split('|').map(Number)
      if (zz === z) {
        support.add(x)
        supported = true
      }
    }
    if (!supported) continue
    let xs = xsAt(layer, z)
    for (let guard = 0; guard < chosen.length; guard++) {
      const have = new Set(xs)
      const next = chosen
        .filter((x) => !have.has(x) && want.get(x).depth > z && (have.has(x - 1) || have.has(x + 1)))
        .sort((a, b) => want.get(b).depth - want.get(a).depth)
      let placed = false
      for (const x of next) {
        const trial = [...xs, x].sort((a, b) => a - b)
        const legal = splitRun(trial, () => body).every((seg) => segmentLegal(seg, y, support))
        if (!legal) continue
        xs = trial
        layer.set(`${x}|${z}`, body)
        placed = true
        break
      }
      if (!placed) break
    }
  }
}

export function draftFromPixels(data, width, height, options = {}) {
  const studs = Math.max(8, Math.min(48, options.studs || 32))
  const mode = pictureMode(options.mode)
  const ditherOn = options.dither !== false && mode === 'mosaic'
  const cols = studs
  const rows = Math.max(8, Math.round((studs * height) / width))
  const samples = sample(data, width, height, cols, rows)
  const quantized = ditherOn
    ? dither(samples, cols, rows)
    : samples.map((sample) => (sample ? nearest(sample[0], sample[1], sample[2]).color : null))

  const present = samples.map((sample, i) => (sample ? nearest(sample[0], sample[1], sample[2]) : null))
  const background = mode === 'mosaic' ? null : backgroundOf(present, cols, rows)

  const cells = new Map()
  const put = (x, y, z, color) => {
    const name = keyOf(color)
    cells.set(`${x}|${y}|${z}`, { x, y, z, color: name, kind: 'plate', direct: true, deep: mode === 'solid' })
  }

  const frame = COLORS.black
  const W = cols + 2
  const D = rows + 2
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) put(x, 0, z, frame)
  }

  if (mode === 'solid') {
    cells.clear()
    const solid = sculptSolid(samples, quantized, present, cols, rows, background)
    if (!solid) throw new Error('That image has no visible subject.')
    let minX = Infinity
    let maxZ = -Infinity
    let footMin = Infinity
    let footMax = -Infinity
    let footZ = 0
    for (const voxel of solid.voxels) {
      minX = Math.min(minX, voxel.x)
      maxZ = Math.max(maxZ, voxel.z)
      if (voxel.y !== 1) continue
      footMin = Math.min(footMin, voxel.x)
      footMax = Math.max(footMax, voxel.x)
      footZ = Math.max(footZ, voxel.z)
    }
    const x0 = 1 - minX
    for (let z = 0; z <= footZ + 2; z++) {
      for (let x = footMin + x0 - 1; x <= footMax + x0 + 1; x++) put(x, 0, z, frame)
    }
    for (const voxel of solid.voxels) put(voxel.x + x0, voxel.y, voxel.z + 1, voxel.color)
    const depth = maxZ + 1
    return {
      cells,
      ...(options.captureMesh ? { mesh: solid.mesh, fit: solid.fit } : {}),
      name: options.name || 'Photo sculpture',
      prompt: options.prompt || '',
      summary: `A solid sculpture, ${cols} studs wide and ${depth} studs deep. The photo becomes a 3D model — the picture stays on the front, the body rounds out behind it — and plates fill that shape.`,
      stages: [
        { name: 'Plinth', from: 0, to: 0, blurb: 'The plinth is one stud larger than the feet. Everything above it sits on this course.' },
        {
          name: 'Body',
          from: 1,
          to: solid.courses,
          blurb: 'Work from the feet up. A course may swell by one stud, which is as far as a plate can reach and still clutch.',
        },
      ],
      palette: {},
      main: 'wall',
    }
  }

  if (mode === 'mosaic') {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const inside = x > 0 && z > 0 && x < W - 1 && z < D - 1
        const color = inside ? quantized[(z - 1) * cols + (x - 1)] : null
        put(x, 1, z, color || frame)
      }
    }
    const filled = quantized.filter(Boolean).length
    if (!filled) throw new Error('That image has no visible pixels.')
    return {
      cells,
      name: options.name || 'Photo mosaic',
      prompt: options.prompt || '',
      summary:
        'A one-course mosaic on a black backing. Each photo block is matched to the nearest opaque LEGO color in Lab, then runs of one color are merged into real plates. Floyd–Steinberg dithering is on, which is why the picture holds gradients and the parts list leans on smaller plates.',
      stages: [
        { name: 'Backing', from: 0, to: 0, blurb: 'The black course is the frame. Build it as whole plates before you lay the picture.' },
        { name: 'Picture', from: 1, to: 1, blurb: 'Work from the top-left of the picture. Large areas of one color are already merged, so trust the big plates.' },
      ],
      palette: {},
      main: 'wall',
    }
  }

  const maxH = studs >= 40 ? 8 : 10
  const invert = options.invert ? !background || background.lab[0] > 65 : background && background.lab[0] > 65
  const heights = samples.map((sample, i) => {
    if (!sample || !present[i]) return 0
    if (isBackdrop(sample, present[i], background)) return 0
    const luma = (0.2126 * sample[0] + 0.7152 * sample[1] + 0.0722 * sample[2]) / 255
    const rise = invert ? 1 - luma : luma
    return Math.max(0, Math.min(maxH, Math.round(rise * maxH)))
  })
  const rising = heights.filter((h) => h > 0).length
  if (rising < 8) {
    // Knockout ate the subject. Keep the full relief.
    for (let i = 0; i < heights.length; i++) {
      if (!samples[i]) continue
      const luma = (0.2126 * samples[i][0] + 0.7152 * samples[i][1] + 0.0722 * samples[i][2]) / 255
      heights[i] = Math.max(1, Math.round((invert ? 1 - luma : luma) * maxH))
    }
  }

  let peak = 1
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const h = heights[z * cols + x]
      const color = quantized[z * cols + x]
      if (!color || h <= 0) continue
      peak = Math.max(peak, h)
      for (let y = 1; y <= h; y++) put(x + 1, y, z + 1, color)
    }
  }

  return {
    cells,
    name: options.name || 'Photo relief',
    prompt: options.prompt || '',
    summary: `A photo relief, ${cols} studs across and ${peak} courses tall. Brightness becomes height, color is snapped to the nearest opaque LEGO color, and a light background stays flat so the subject is what rises. Every column sits on the black plinth.`,
    stages: [
      { name: 'Plinth', from: 0, to: 0, blurb: 'The plinth is one stud larger than the picture so the relief has a border to sit inside.' },
      { name: 'Relief', from: 1, to: peak, blurb: 'Build the tallest columns as you go. Each stud has the stud under it, so nothing on this relief cantilevers.' },
    ],
    palette: {},
    main: 'wall',
  }
}

/** Photo → colored solid, plus the plate fill of that same solid. */
export function studyFromPixels(data, width, height, options = {}) {
  const draft = draftFromPixels(data, width, height, { ...options, mode: 'solid', captureMesh: true })
  if (!draft.mesh?.positions?.length) throw new Error('That image did not produce a 3D model.')
  return { draft, mesh: draft.mesh, fit: draft.fit }
}
