import * as THREE from 'three'
import { COLORS, OPAQUE } from './palette.js'
import { PLATE } from './scale.js'

const SWATCHES = OPAQUE.map((color) => {
  const n = parseInt(color.hex.slice(1), 16)
  const key = Object.keys(COLORS).find((name) => COLORS[name] === color)
  return { key, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
})

const up = new THREE.Vector3(0, 1, 0)
const raycaster = new THREE.Raycaster()

function nearestKey(r, g, b) {
  let best = SWATCHES[0]
  let bestD = Infinity
  for (const swatch of SWATCHES) {
    const d = (r - swatch.r) ** 2 + (g - swatch.g) ** 2 + (b - swatch.b) ** 2
    if (d < bestD) {
      bestD = d
      best = swatch
    }
  }
  return best.key
}

function srgbBytes(color) {
  const sample = color.clone().convertLinearToSRGB()
  return [Math.round(sample.r * 255), Math.round(sample.g * 255), Math.round(sample.b * 255)]
}

function cloneMap(map) {
  if (!map) return null
  const copy = map.clone()
  copy.colorSpace = map.colorSpace
  copy.flipY = map.flipY
  copy.wrapS = map.wrapS
  copy.wrapT = map.wrapT
  copy.needsUpdate = true
  return copy
}

function bakedMaterial(src, geometry) {
  const color = src?.color ? src.color.clone() : new THREE.Color('#c8c8c8')
  return new THREE.MeshStandardMaterial({
    color,
    map: cloneMap(src?.map),
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
    vertexColors: Boolean(geometry.getAttribute('color')),
  })
}

function sliceGeometry(geo, start, count) {
  const index = geo.getIndex()
  const ids = []
  if (index) {
    for (let i = start; i < start + count; i++) ids.push(index.getX(i))
  } else {
    for (let i = start; i < start + count; i++) ids.push(i)
  }
  if (ids.length < 3) return null
  const remap = new Map()
  const order = []
  for (const id of ids) {
    if (!remap.has(id)) {
      remap.set(id, order.length)
      order.push(id)
    }
  }
  const part = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const attr = geo.getAttribute(name)
    if (!attr) continue
    const item = attr.itemSize
    const array = new attr.array.constructor(order.length * item)
    for (let i = 0; i < order.length; i++) {
      for (let k = 0; k < item; k++) array[i * item + k] = attr.getComponent(order[i], k)
    }
    part.setAttribute(name, new THREE.BufferAttribute(array, item))
  }
  part.setIndex(ids.map((id) => remap.get(id)))
  return part
}

function addBaked(group, geo, src, name) {
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  const mesh = new THREE.Mesh(geo, bakedMaterial(src, geo))
  mesh.name = name || 'part'
  group.add(mesh)
}

/** Static meshes in world space. The bind pose is the sculpted animal; the skeleton is for clips. */
export function bakeModel(root) {
  root.updateMatrixWorld(true)
  const group = new THREE.Group()
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.getAttribute('position')) return
    const geo = obj.geometry.clone()
    geo.applyMatrix4(obj.matrixWorld)
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    const groups = geo.groups?.length > 1 && materials.length > 1 ? geo.groups : null
    if (!groups) {
      addBaked(group, geo, materials[0], obj.name)
      return
    }
    for (const item of groups) {
      const part = sliceGeometry(geo, item.start, item.count)
      if (part) addBaked(group, part, materials[item.materialIndex] || materials[0], obj.name)
    }
    geo.dispose()
  })
  return group
}

/**
 * A rendered plate is 0.4 studs tall, so a square voxel becomes a flat bar.
 * Sample height in plate courses and keep the stud pitch for width and depth.
 */
const FACE = 16
const LONG_CAP = 128

function pitches(size, studs, exact) {
  const span = Math.max(size.x, size.y, size.z)
  let pitch = span / studs
  if (exact) return { pitch, pitchY: pitch * PLATE }
  // The stud budget used to follow the long axis, so a fox face was about
  // nine studs wide and the front view was the weak angle. Square studs
  // mean a wider face also lengthens the body. Stop at 16 studs across,
  // and don't let the long side pass 128.
  const short = Math.min(size.x, size.z)
  const long = Math.max(size.x, size.z)
  const shortCells = short / pitch
  // The floor grows with the slider, so Fewer still builds a smaller animal.
  const face = Math.min(FACE, Math.max(8, Math.round(studs * 0.3)))
  if (short > 0 && shortCells < face) {
    const want = Math.min(LONG_CAP, studs * (face / shortCells))
    if (want > studs) pitch = long / want
  }
  return { pitch, pitchY: pitch * PLATE }
}

function columnKey(x, z) {
  return `${x}|${z}`
}

const NECK_GAP = 14
const NECK_REACH = 2
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

function stamp(voxels, voxel) {
  const key = `${voxel.x}|${voxel.y}|${voxel.z}`
  if (!voxels.has(key)) voxels.set(key, voxel)
}

/**
 * Close a short crack in one column and seat a foot that is already within a
 * course of the ground. A longer opening, such as the space under a belly, stays open.
 */
function solidify(voxels) {
  const columns = new Map()
  for (const voxel of voxels.values()) {
    const key = columnKey(voxel.x, voxel.z)
    const column = columns.get(key)
    if (column) column.push(voxel)
    else columns.set(key, [voxel])
  }

  for (const column of columns.values()) {
    column.sort((a, b) => a.y - b.y)
    const low = column[0]
    if (low.y > 0 && low.y <= 1) {
      for (let y = 0; y < low.y; y++) stamp(voxels, { ...low, y })
    }
    for (let i = 0; i < column.length - 1; i++) {
      const gap = column[i + 1].y - column[i].y - 1
      if (gap < 1 || gap > 3) continue
      for (let y = column[i].y + 1; y < column[i + 1].y; y++) {
        stamp(voxels, { ...column[i], y })
      }
    }
  }
  return voxels
}

function components(voxels) {
  const index = new Map([...voxels.values()].map((voxel) => [`${voxel.x}|${voxel.y}|${voxel.z}`, voxel]))
  const seen = new Set()
  const groups = []
  for (const voxel of voxels.values()) {
    const start = `${voxel.x}|${voxel.y}|${voxel.z}`
    if (seen.has(start)) continue
    const stack = [voxel]
    const group = []
    seen.add(start)
    while (stack.length) {
      const current = stack.pop()
      group.push(current)
      for (const [dx, dy, dz] of FACES) {
        const key = `${current.x + dx}|${current.y + dy}|${current.z + dz}`
        if (seen.has(key) || !index.has(key)) continue
        seen.add(key)
        stack.push(index.get(key))
      }
    }
    groups.push(group)
  }
  return groups
}

/**
 * A neck often misses the body by a stud or two, so the head is its own island.
 * Join each floating piece to the body beneath it, then give a one-stud spine
 * a second stud so the plates have something to clutch.
 */
function brace(voxels) {
  for (let pass = 0; pass < 4; pass++) {
    const groups = components(voxels)
    if (groups.length < 2) break
    const main = groups.reduce((best, group) => (group.length > best.length ? group : best))
    let joined = false
    for (const group of groups) {
      if (group === main || group.some((voxel) => voxel.y <= 1)) continue
      let anchor = group[0]
      for (const voxel of group) if (voxel.y < anchor.y) anchor = voxel
      let landing = null
      for (const voxel of main) {
        const dx = Math.abs(voxel.x - anchor.x)
        const dz = Math.abs(voxel.z - anchor.z)
        const dy = anchor.y - voxel.y
        if (dy < 1 || dy > NECK_GAP || dx > NECK_REACH || dz > NECK_REACH) continue
        const score = dy + dx + dz
        if (!landing || score < landing.score) landing = { voxel, score }
      }
      if (!landing) continue
      const x0 = Math.min(anchor.x, landing.voxel.x)
      const x1 = Math.max(anchor.x, landing.voxel.x)
      const z0 = Math.min(anchor.z, landing.voxel.z)
      const z1 = Math.max(anchor.z, landing.voxel.z)
      for (let y = landing.voxel.y; y < anchor.y; y++) {
        for (let x = x0; x <= x1; x++) {
          for (let z = z0; z <= z1; z++) stamp(voxels, { x, y, z, color: anchor.color })
        }
      }
      joined = true
    }
    if (!joined) break
  }

  const filled = new Map([...voxels.values()].map((voxel) => [`${voxel.x}|${voxel.y}|${voxel.z}`, voxel]))
  for (const voxel of [...voxels.values()]) {
    if (!filled.has(`${voxel.x}|${voxel.y - 1}|${voxel.z}`) || !filled.has(`${voxel.x}|${voxel.y + 1}|${voxel.z}`)) continue
    let beside = 0
    const open = []
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (filled.has(`${voxel.x + dx}|${voxel.y}|${voxel.z + dz}`)) beside += 1
      else open.push([dx, dz])
    }
    if (beside > 0 || !open.length) continue
    const [dx, dz] = open[0]
    stamp(voxels, { ...voxel, x: voxel.x + dx, z: voxel.z + dz })
  }
  // Fill a one-stud slot, such as the hollow between two neck posts.
  const grown = new Map([...voxels.values()].map((voxel) => [`${voxel.x}|${voxel.y}|${voxel.z}`, voxel]))
  for (const voxel of voxels.values()) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${voxel.x + dx}|${voxel.y + dy}|${voxel.z + dz}`
          if (!grown.has(key)) grown.set(key, { ...voxel, x: voxel.x + dx, y: voxel.y + dy, z: voxel.z + dz })
        }
      }
    }
  }
  for (const [key, voxel] of grown) {
    if (voxels.has(key)) continue
    let enclosed = true
    for (let dx = -1; dx <= 1 && enclosed; dx++) {
      for (let dy = -1; dy <= 1 && enclosed; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!grown.has(`${voxel.x + dx}|${voxel.y + dy}|${voxel.z + dz}`)) {
            enclosed = false
            break
          }
        }
      }
    }
    if (enclosed) stamp(voxels, voxel)
  }
  return voxels
}

/**
 * Fill the baked mesh with studs. The longest side is `studs` long, unless the
 * face would be thinner than the slider allows. Then the grid widens until
 * the face catches up or the long side reaches 128. Fewer studs still builds
 * a smaller animal.
 * A ray is cast through every mesh at once. These animals split one closed skin
 * across materials, so pairing hits per material only stamps the shell.
 * `parts: true` fills each closed solid on its own and unions them. Use that
 * for a sculpted animal made of separate volumes.
 */
const texturePixels = new WeakMap()
const white = new THREE.Color('#ffffff')

function textureRecord(map) {
  if (!map?.image) return null
  if (texturePixels.has(map)) return texturePixels.get(map)
  const image = map.image
  let record = null
  try {
    if (image.data && image.width && image.height) {
      record = { data: image.data, width: image.width, height: image.height }
    } else if (typeof image.getContext === 'function' && image.width && image.height) {
      const ctx = image.getContext('2d', { willReadFrequently: true })
      record = { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height }
    } else if (typeof document !== 'undefined' && image.width && image.height) {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(image, 0, 0)
      record = { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height }
    }
  } catch {
    record = null
  }
  texturePixels.set(map, record)
  return record
}

function sampleMap(map, u, v) {
  const record = textureRecord(map)
  if (!record) return null
  let uu = u - Math.floor(u)
  let vv = v - Math.floor(v)
  if (uu < 0) uu += 1
  if (vv < 0) vv += 1
  const x = Math.min(record.width - 1, Math.floor(uu * record.width))
  const y = Math.min(record.height - 1, Math.floor((map.flipY ? 1 - vv : vv) * record.height))
  const i = (y * record.width + x) * 4
  return [record.data[i], record.data[i + 1], record.data[i + 2]]
}

function tinted(rgb, tint) {
  return nearestKey((rgb[0] * tint[0]) / 255, (rgb[1] * tint[1]) / 255, (rgb[2] * tint[2]) / 255)
}

function surfaceColor(hit, fallback) {
  const material = hit.object.material
  const tint = srgbBytes(material?.color || white)
  if (material?.map && hit.uv) {
    const rgb = sampleMap(material.map, hit.uv.x, hit.uv.y)
    if (rgb) return tinted(rgb, tint)
  }
  const attr = hit.object.geometry.getAttribute('color')
  if (attr && hit.face && hit.barycoord) {
    const mixed = new THREE.Vector3()
    THREE.Triangle.getInterpolatedAttribute(attr, hit.face.a, hit.face.b, hit.face.c, hit.barycoord, mixed)
    return tinted(srgbBytes(new THREE.Color(mixed.x, mixed.y, mixed.z)), tint)
  }
  return fallback
}

function hasRegionColor(meshes, colorOf) {
  if (meshes.some((mesh) => mesh.material?.map || mesh.geometry.getAttribute('color'))) return true
  const keys = new Set()
  for (const mesh of meshes) keys.add(colorOf.get(mesh.uuid))
  return keys.size > 1
}

/**
 * A vertical fill paints a whole column with the color it entered through.
 * Fur, eyes, and a snout share that column, so each stud takes the color of
 * the surface closest to it.
 */
function paintRegions(voxels, meshes, colorOf, box, pitch, pitchY) {
  if (!hasRegionColor(meshes, colorOf)) return
  const buckets = new Map()
  const margin = Math.max(pitch, pitchY) * 2
  raycaster.near = 0
  function store(hit) {
    const point = hit.point
    const ix = Math.floor((point.x - box.min.x) / pitch)
    const iy = Math.floor((point.y - box.min.y) / pitchY)
    const iz = Math.floor((point.z - box.min.z) / pitch)
    const key = `${ix}|${iy}|${iz}`
    const item = { x: point.x, y: point.y, z: point.z, color: surfaceColor(hit, colorOf.get(hit.object.uuid)) }
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }
  function shoot(origin, direction, far) {
    raycaster.far = far
    raycaster.set(origin, direction)
    for (const hit of raycaster.intersectObjects(meshes, false)) store(hit)
  }
  const upDir = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3(1, 0, 0)
  const forward = new THREE.Vector3(0, 0, 1)
  const nx = Math.max(1, Math.ceil((box.max.x - box.min.x) / pitch - 1e-6))
  const ny = Math.max(1, Math.ceil((box.max.y - box.min.y) / pitchY - 1e-6))
  const nz = Math.max(1, Math.ceil((box.max.z - box.min.z) / pitch - 1e-6))
  for (let iz = 0; iz < nz; iz++) {
    const z = box.min.z + (iz + 0.5) * pitch
    for (let ix = 0; ix < nx; ix++) {
      shoot(new THREE.Vector3(box.min.x + (ix + 0.5) * pitch, box.min.y - margin, z), upDir, box.max.y - box.min.y + margin * 2)
    }
  }
  for (let iy = 0; iy < ny; iy++) {
    const y = box.min.y + (iy + 0.5) * pitchY
    for (let ix = 0; ix < nx; ix++) {
      shoot(new THREE.Vector3(box.min.x + (ix + 0.5) * pitch, y, box.min.z - margin), forward, box.max.z - box.min.z + margin * 2)
    }
  }
  for (let iy = 0; iy < ny; iy++) {
    const y = box.min.y + (iy + 0.5) * pitchY
    for (let iz = 0; iz < nz; iz++) {
      shoot(new THREE.Vector3(box.min.x - margin, y, box.min.z + (iz + 0.5) * pitch), right, box.max.x - box.min.x + margin * 2)
    }
  }
  const limit = (Math.max(pitch, pitchY) * 1.6) ** 2
  for (const voxel of voxels.values()) {
    const cx = box.min.x + (voxel.x + 0.5) * pitch
    const cy = box.min.y + (voxel.y + 0.5) * pitchY
    const cz = box.min.z + (voxel.z + 0.5) * pitch
    let best = null
    let bestD = Infinity
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(`${voxel.x + dx}|${voxel.y + dy}|${voxel.z + dz}`)
          if (!list) continue
          for (const hit of list) {
            const d = (hit.x - cx) ** 2 + (hit.y - cy) ** 2 + (hit.z - cz) ** 2
            if (d < bestD) {
              bestD = d
              best = hit.color
            }
          }
        }
      }
    }
    if (best && bestD <= limit) voxel.color = best
  }
}

export function voxelize(group, studs = 30, options = {}) {
  const meshes = group.children.filter((child) => child.isMesh)
  if (!meshes.length) throw new Error('That model has no mesh.')
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.y, size.z)
  if (!(span > 0)) throw new Error('That model has no volume.')
  const { pitch, pitchY } = pitches(size, studs, options.exact)
  const nx = Math.max(1, Math.ceil(size.x / pitch - 1e-6))
  const ny = Math.max(1, Math.ceil(size.y / pitchY - 1e-6))
  const nz = Math.max(1, Math.ceil(size.z / pitch - 1e-6))
  const voxels = new Map()

  const colorOf = new Map()
  for (const mesh of meshes) {
    const [r, g, b] = srgbBytes(mesh.material.color)
    colorOf.set(mesh.uuid, nearestKey(r, g, b))
  }

  function spansAt(pass, x, z) {
    raycaster.far = size.y + pitch * 4
    raycaster.set(new THREE.Vector3(x, box.min.y - pitch * 2, z), up)
    const hits = raycaster.intersectObjects(pass, false)
    const events = []
    for (const hit of hits) {
      const y = (hit.point.y - box.min.y) / pitchY
      if (y < -0.2 || y > ny + 0.2) continue
      if (events.length && y - events[events.length - 1].y <= 0.08) continue
      events.push({ y, color: surfaceColor(hit, colorOf.get(hit.object.uuid)) })
    }
    const ranges = []
    for (let p = 0; p + 1 < events.length; p += 2) {
      ranges.push({
        low: Math.min(events[p].y, events[p + 1].y),
        high: Math.max(events[p].y, events[p + 1].y),
        color: events[p].color,
      })
    }
    return ranges
  }

  const passes = options.parts ? meshes.map((mesh) => [mesh]) : [meshes]
  for (const pass of passes) {
    for (let iz = 0; iz < nz; iz++) {
      const z = box.min.z + (iz + 0.5) * pitch
      for (let ix = 0; ix < nx; ix++) {
        const ranges = spansAt(pass, box.min.x + (ix + 0.5) * pitch, z)
        for (const range of ranges) {
          const y0 = Math.max(0, Math.ceil(range.low - 0.5))
          const y1 = Math.min(ny - 1, Math.floor(range.high - 0.5))
          for (let iy = y0; iy <= y1; iy++) {
            voxels.set(`${ix}|${iy}|${iz}`, { x: ix, y: iy, z: iz, color: range.color })
          }
        }
      }
    }
  }

  if (!voxels.size) throw new Error('The mesh did not fill any studs.')
  const seated = brace(solidify(voxels))
  if (!seated.size) throw new Error('The mesh did not fill any studs.')
  paintRegions(seated, meshes, colorOf, box, pitch, pitchY)
  let minY = Infinity
  for (const voxel of seated.values()) minY = Math.min(minY, voxel.y)
  const cells = new Map()
  let height = 0
  for (const voxel of seated.values()) {
    const y = voxel.y - minY
    height = Math.max(height, y + 1)
    cells.set(`${voxel.x}|${y}|${voxel.z}`, {
      x: voxel.x,
      y,
      z: voxel.z,
      color: voxel.color,
      kind: 'plate',
      direct: true,
      deep: true,
    })
  }
  return {
    cells,
    fit: { width: nx, height, depth: nz, studs: cells.size, pitch },
  }
}
