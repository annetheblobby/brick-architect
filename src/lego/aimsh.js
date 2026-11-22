import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

function num(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function span(value, fallback = 0.2) {
  return Math.min(4, Math.max(0.05, Math.abs(num(value, fallback))))
}

function material(color) {
  const hex = typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#6C6E68'
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide })
}

function named(mesh, part) {
  mesh.name = (part.name || 'part').slice(0, 40)
  const [x, y, z] = part.position || []
  mesh.position.set(num(x), num(y), num(z))
  return mesh
}

function spin(mesh, axis) {
  if (axis === 'x') mesh.rotateZ(Math.PI / 2)
  else if (axis === 'z') mesh.rotateX(Math.PI / 2)
}

function sizeOf(part) {
  const s = part.size || []
  return [span(s[0]), span(s[1]), span(s[2])]
}

function lathe(part) {
  const raw = (part.profile || [])
    .map((point) => [Math.min(2, Math.max(0.001, Math.abs(num(point?.[0])))), num(point?.[1])])
    .slice(0, 12)
  if (raw.length < 2) return null
  const ys = raw.map((point) => point[1])
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2
  const geo = new THREE.LatheGeometry(
    raw.map(([radius, y]) => new THREE.Vector2(radius, y - mid)),
    28,
  )
  geo.computeVertexNormals()
  return named(new THREE.Mesh(geo, material(part.color)), part)
}

function capDisk(point, direction, radius) {
  const geo = new THREE.CircleGeometry(radius, 12)
  const outward = direction.clone().normalize()
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward))
  geo.translate(point.x, point.y, point.z)
  return geo
}

function tube(part) {
  const points = (part.path || [])
    .map((point) => new THREE.Vector3(num(point?.[0]), num(point?.[1]), num(point?.[2])))
    .slice(0, 8)
  if (points.length < 2) return null
  const radius = Math.min(0.35, Math.max(0.02, Math.abs(num(part.radius, 0.05))))
  const curve = new THREE.CatmullRomCurve3(points)
  const skin = new THREE.TubeGeometry(curve, 28, radius, 12, false)
  const start = curve.getPointAt(0)
  const end = curve.getPointAt(1)
  const caps = [
    capDisk(start, curve.getTangentAt(0).negate(), radius),
    capDisk(end, curve.getTangentAt(1), radius),
  ]
  const geo = mergeGeometries([skin, ...caps])
  skin.dispose()
  for (const cap of caps) cap.dispose()
  if (!geo) return null
  return named(new THREE.Mesh(geo, material(part.color)), part)
}

function gable(part) {
  const [width, depth, height] = sizeOf(part)
  const hw = width / 2
  const hd = depth / 2
  const data = new Float32Array([
    -hw, 0, hd, hw, 0, hd, 0, height, hd,
    hw, 0, -hd, -hw, 0, -hd, 0, height, -hd,
    -hw, 0, -hd, -hw, 0, hd, 0, height, hd,
    -hw, 0, -hd, 0, height, hd, 0, height, -hd,
    hw, 0, hd, hw, 0, -hd, 0, height, -hd,
    hw, 0, hd, 0, height, -hd, 0, height, hd,
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd,
    -hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data, 3))
  geo.computeVertexNormals()
  const mesh = named(new THREE.Mesh(geo, material(part.color)), part)
  mesh.position.y -= height / 2
  return mesh
}

function rounded(part) {
  const [width, height, depth] = sizeOf(part)
  const shape = new THREE.Shape()
  const hx = width / 2
  const hy = depth / 2
  const r = Math.min(Math.max(0.02, Math.abs(num(part.radius, Math.min(hx, hy) * 0.3))), hx * 0.46, hy * 0.46)
  shape.moveTo(-hx + r, -hy)
  shape.lineTo(hx - r, -hy)
  shape.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(hx, hy - r)
  shape.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-hx + r, hy)
  shape.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-hx, -hy + r)
  shape.absarc(-hx + r, -hy + r, r, Math.PI, Math.PI * 1.5, false)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 8 })
  geo.rotateX(-Math.PI / 2)
  const mesh = named(new THREE.Mesh(geo, material(part.color)), part)
  mesh.position.y -= height / 2
  return mesh
}

function solid(part) {
  const [w, h, d] = sizeOf(part)
  let geo
  if (part.shape === 'cylinder') geo = new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, h, 20)
  else if (part.shape === 'cone') geo = new THREE.ConeGeometry(Math.min(w, d) / 2, h, 16)
  else if (part.shape === 'ellipsoid') {
    geo = new THREE.SphereGeometry(1, 20, 14)
    geo.scale(w / 2, h / 2, d / 2)
  } else geo = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geo, material(part.color))
  spin(mesh, part.axis)
  return named(mesh, part)
}

function partMesh(part) {
  if (!part || typeof part !== 'object') return null
  if (part.shape === 'lathe') return lathe(part)
  if (part.shape === 'tube') return tube(part)
  if (part.shape === 'gable') return gable(part)
  if (part.shape === 'rounded') return rounded(part)
  if (part.shape === 'box' || part.shape === 'cylinder' || part.shape === 'cone' || part.shape === 'ellipsoid') return solid(part)
  return null
}

function seat(group) {
  group.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(group)
  if (bounds.isEmpty()) return group
  group.position.y -= bounds.min.y
  group.updateMatrixWorld(true)
  return group
}

/** Turn the model's part list into a closed group sitting on the ground. */
export function groupFromSpec(spec) {
  const group = new THREE.Group()
  group.name = (spec?.name || 'Model').slice(0, 60)
  for (const part of (spec?.parts || []).slice(0, 16)) {
    const mesh = partMesh(part)
    if (mesh) group.add(mesh)
  }
  if (!group.children.length) throw new Error('The model returned no solid parts.')
  return seat(group)
}

/** Ask the local server for a Tripo mesh, or a new mesh that applies one change. */
export async function requestMesh(prompt, image, variant = 0, tweak = '', studs = 32) {
  const response = await fetch('/api/mesh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: (prompt || '').trim(),
      image: tweak ? '' : image || '',
      tweak: (tweak || '').trim(),
      variant: tweak ? 0 : variant,
      studs,
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'The model did not return a mesh.')
  if (!body.glb) throw new Error('The model returned no mesh.')
  return body.glb
}
