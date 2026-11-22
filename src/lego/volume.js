import * as THREE from 'three'

const ARC = 8
const FRONT = 4
const RING = ARC + FRONT

/**
 * A photo becomes a closed solid: the front is the silhouette, and the back
 * is a rounded D so the body has real depth. Plates are filled from this mesh.
 * `sampleAt(x, row)` paints the shell from the photo (front full strength, back shaded).
 */
export function buildSculpture(mask, cols, rows, sampleAt) {
  const positions = []
  const colors = []
  const indices = []
  for (let row = 0; row < rows; row++) {
    const y = rows - row
    for (const run of runsOnRow(mask, cols, row)) {
      const thick = thickFor(run.x1 - run.x0 + 1)
      const low = pushRing(positions, colors, ringPoints(run.x0, run.x1, y, thick, row, sampleAt))
      const high = pushRing(positions, colors, ringPoints(run.x0, run.x1, y + 0.84, thick, row, sampleAt))
      linkRings(indices, low, high, RING)
      cap(positions, colors, indices, low, RING, true)
      cap(positions, colors, indices, high, RING, false)
    }
  }

  const depth = new Int16Array(cols * rows)
  if (!indices.length) {
    return {
      positions: new Float32Array(0),
      colors: new Float32Array(0),
      indices: new Uint32Array(0),
      depth,
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  mesh.updateMatrixWorld(true)

  const raycaster = new THREE.Raycaster()
  raycaster.far = 64
  const origin = new THREE.Vector3()
  const dir = new THREE.Vector3(0, 0, 1)

  for (let row = 0; row < rows; row++) {
    const y = rows - row + 0.42
    for (let x = 0; x < cols; x++) {
      const i = row * cols + x
      if (!mask[i]) continue
      origin.set(x + 0.5, y, -2)
      raycaster.set(origin, dir)
      const hits = raycaster.intersectObject(mesh, false)
      const walls = []
      for (const hit of hits) {
        const z = hit.point.z
        if (!walls.length || z - walls[walls.length - 1] > 0.05) walls.push(z)
      }
      let filled = 0
      for (let z = 0; z < 16; z++) {
        const cz = z + 0.5
        let inside = false
        for (let p = 0; p + 1 < walls.length; p += 2) {
          if (cz >= walls[p] - 0.02 && cz <= walls[p + 1] + 0.02) inside = true
        }
        if (!inside) break
        filled += 1
      }
      depth[i] = filled || chordDepth(x, row, mask, cols)
    }
  }

  geometry.dispose()
  mesh.material.dispose()
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    depth,
  }
}

export function sculptureDepths(mask, cols, rows) {
  return buildSculpture(mask, cols, rows, null).depth
}

function runsOnRow(mask, cols, row) {
  const runs = []
  let start = -1
  for (let x = 0; x <= cols; x++) {
    const on = x < cols && mask[row * cols + x]
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      runs.push({ x0: start, x1: x - 1 })
      start = -1
    }
  }
  return runs
}

function thickFor(span) {
  if (span <= 1) return 1
  if (span === 2) return 2
  return Math.max(3, Math.min(18, Math.round(span * 0.8)))
}

function ringPoints(x0, x1, y, thick, row, sampleAt) {
  const span = x1 - x0 + 1
  const cx = (x0 + x1 + 1) / 2
  const rx = span / 2 + 0.35
  const tint = (x, z) => {
    const rgb = sampleAt ? sampleAt(x, row) : null
    const base = rgb || [214, 218, 224]
    const front = Math.max(0, 1 - z / Math.max(thick, 0.25))
    const k = 0.42 + 0.58 * front
    return [(base[0] / 255) * k, (base[1] / 255) * k, (base[2] / 255) * k]
  }
  const pts = []
  for (let i = 0; i <= ARC; i++) {
    const t = Math.PI - (Math.PI * i) / ARC
    const x = cx + rx * Math.cos(t)
    const z = thick * Math.sin(t)
    const c = tint(x, z)
    pts.push([x, y, z, c[0], c[1], c[2]])
  }
  const left = pts[0]
  const right = pts[pts.length - 1]
  for (let i = 1; i < FRONT; i++) {
    const u = i / FRONT
    const x = right[0] + (left[0] - right[0]) * u
    const c = tint(x, 0)
    pts.push([x, y, 0, c[0], c[1], c[2]])
  }
  return pts
}

function pushRing(positions, colors, pts) {
  const start = positions.length / 3
  for (const p of pts) {
    positions.push(p[0], p[1], p[2])
    colors.push(p[3], p[4], p[5])
  }
  return start
}

function linkRings(indices, a, b, count) {
  for (let i = 0; i < count; i++) {
    const a0 = a + i
    const a1 = a + ((i + 1) % count)
    const b0 = b + i
    const b1 = b + ((i + 1) % count)
    indices.push(a0, b0, a1, a1, b0, b1)
  }
}

function cap(positions, colors, indices, ring, count, flip) {
  let sx = 0
  let sy = 0
  let sz = 0
  let cr = 0
  let cg = 0
  let cb = 0
  for (let i = 0; i < count; i++) {
    sx += positions[(ring + i) * 3]
    sy += positions[(ring + i) * 3 + 1]
    sz += positions[(ring + i) * 3 + 2]
    cr += colors[(ring + i) * 3]
    cg += colors[(ring + i) * 3 + 1]
    cb += colors[(ring + i) * 3 + 2]
  }
  const c = positions.length / 3
  positions.push(sx / count, sy / count, sz / count)
  colors.push(cr / count, cg / count, cb / count)
  for (let i = 0; i < count; i++) {
    const a = ring + i
    const b = ring + ((i + 1) % count)
    if (flip) indices.push(c, b, a)
    else indices.push(c, a, b)
  }
}

function chordDepth(x, row, mask, cols) {
  const runs = runsOnRow(mask, cols, row)
  const run = runs.find((item) => x >= item.x0 && x <= item.x1)
  if (!run) return 1
  const span = run.x1 - run.x0 + 1
  const thick = thickFor(span)
  const cx = (run.x0 + run.x1 + 1) / 2
  const rx = span / 2 + 0.35
  const u = (x + 0.5 - cx) / rx
  if (u * u >= 1) return 1
  return Math.max(1, Math.round(thick * Math.sqrt(1 - u * u)))
}
