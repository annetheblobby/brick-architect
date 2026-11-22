import * as THREE from 'three'

const INK = '#1C2830'
const WHITE = '#F4F4F4'
const GRAY = '#6C6E68'
const TAN = '#E4CD9E'
const BROWN = '#582A12'
const RED = '#C91A09'
const BLUE = '#0055BF'

const COLORS = {
  black: INK,
  white: WHITE,
  gray: GRAY,
  grey: GRAY,
  brown: BROWN,
  red: RED,
  orange: '#FE8A18',
  yellow: '#F2CD37',
  gold: '#AA7F2E',
  green: '#237841',
  blue: BLUE,
  pink: '#E4ADC8',
  purple: '#923978',
  tan: TAN,
  stone: GRAY,
  seaside: '#9ed6f0',
}

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 })
}

function add(group, mesh, x, y, z) {
  mesh.position.set(x, y, z)
  group.add(mesh)
  return mesh
}

function box(w, h, d, color, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color))
  mesh.name = name
  return mesh
}

function cylinder(radius, height, color, name, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material(color))
  mesh.name = name
  return mesh
}

function cone(radius, height, color, name, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material(color))
  mesh.name = name
  return mesh
}

function ellipsoid(rx, ry, rz, color, name) {
  const geo = new THREE.SphereGeometry(1, 22, 16)
  geo.scale(rx, ry, rz)
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = name
  return mesh
}

function pyramid(rx, height, rz, color, name) {
  const geo = new THREE.ConeGeometry(1, height, 4)
  geo.rotateY(Math.PI / 4)
  geo.scale(rx, 1, rz)
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = name
  return mesh
}

function lathe(points, color, name, segments = 32) {
  const geo = new THREE.LatheGeometry(
    points.map(([radius, y]) => new THREE.Vector2(Math.max(0.001, radius), y)),
    segments,
  )
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = name
  return mesh
}

function tube(points, radius, color, name) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  const geo = new THREE.TubeGeometry(curve, 28, radius, 8, false)
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = name
  return mesh
}

function gableRoof(width, depth, height, overhang, color) {
  const hw = width / 2 + overhang
  const hd = depth / 2 + overhang
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
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = 'roof'
  return mesh
}

function roundedSlab(width, height, depth, radius, color, name) {
  const shape = new THREE.Shape()
  const hx = width / 2
  const hy = depth / 2
  const r = Math.min(radius, hx * 0.46, hy * 0.46)
  shape.moveTo(-hx + r, -hy)
  shape.lineTo(hx - r, -hy)
  shape.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(hx, hy - r)
  shape.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-hx + r, hy)
  shape.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-hx, -hy + r)
  shape.absarc(-hx + r, -hy + r, r, Math.PI, Math.PI * 1.5, false)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 10 })
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = name
  return mesh
}

function seat(group) {
  group.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(group)
  group.position.y -= bounds.min.y
  group.updateMatrixWorld(true)
  return group
}

const PART_NOUN = /^(porch|roof|door|doors|window|windows|chimney|chimneys|lid|handle|spout|wheel|wheels|wing|wings|flag|fence|candle|candles|center|petal|band|stripe|stripes|step|steps|stairs|balcony|deck|antenna|knob|cap)$/

function paint(text, bodyFallback, roofFallback) {
  const roofWord = text.match(/\b(black|white|gray|grey|brown|red|orange|yellow|green|blue|pink|tan|stone)\s+roof\b/)
  let body = null
  for (const [word, hex] of Object.entries(COLORS)) {
    const usedAsRoof = roofWord && roofWord[1] === word
    if (usedAsRoof) continue
    const at = text.search(new RegExp(`\\b${word}\\b`))
    if (at < 0) continue
    const after = text.slice(at).match(new RegExp(`^${word}\\s+(?:a\\s+|an\\s+|the\\s+)?([a-z]+)`))
    if (after && PART_NOUN.test(after[1])) continue
    body = hex
    break
  }
  return {
    body: body || bodyFallback,
    roof: roofWord ? COLORS[roofWord[1]] : roofFallback,
    trim: INK,
    glass: '#9ed6f0',
  }
}

function chimneyCount(text) {
  if (!/\bchimneys?\b/.test(text)) return 0
  if (/\b(three|3)\b/.test(text)) return 3
  if (/\b(two|2)\b/.test(text)) return 2
  return 1
}

function chimneys(group, count, x, y, z, span, color = BROWN) {
  for (let i = 0; i < count; i++) {
    const stack = box(0.16, 0.42, 0.16, color, 'chimney')
    add(group, stack, x + (i - (count - 1) / 2) * Math.min(0.36, span), y, z)
  }
}

function cottage(text, colors) {
  const group = new THREE.Group()
  const width = 1.7
  const depth = 1.25
  const wall = 0.95
  const roofH = 0.58
  add(group, box(width, wall, depth, colors.body, 'walls'), 0, wall / 2, 0)
  add(group, gableRoof(width, depth, roofH, 0.08, colors.roof), 0, wall, 0)
  add(group, box(0.32, 0.55, 0.06, colors.trim, 'door'), 0, 0.3, depth / 2 + 0.02)
  add(group, box(0.28, 0.24, 0.05, colors.glass, 'window'), -0.48, 0.62, depth / 2 + 0.02)
  add(group, box(0.28, 0.24, 0.05, colors.glass, 'window'), 0.48, 0.62, depth / 2 + 0.02)
  chimneys(group, Math.max(1, chimneyCount(text) || (/\bcottage\b/.test(text) ? 1 : 0)), 0.2, wall + roofH * 0.62, 0.02, 0.4)
  return group
}

function castle(colors) {
  const group = new THREE.Group()
  const width = 2.2
  const depth = 1.5
  const wall = 0.85
  add(group, box(width, wall, depth, colors.body, 'walls'), 0, wall / 2, 0)
  const towers = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ]
  for (const [x, z] of towers) {
    add(group, cylinder(0.22, 1.25, colors.body, 'tower'), x, 0.62, z)
    add(group, cone(0.28, 0.38, colors.roof, 'cap'), x, 1.4, z)
  }
  for (let i = 0; i < 6; i++) {
    add(group, box(0.16, 0.18, 0.16, colors.body, 'merlon'), -0.7 + i * 0.28, wall + 0.08, depth / 2)
  }
  add(group, box(0.42, 0.55, 0.1, colors.trim, 'gate'), 0, 0.28, depth / 2)
  return group
}

function barn(text, colors) {
  const group = new THREE.Group()
  const wall = 0.9
  add(group, box(2.1, wall, 1.15, colors.body, 'walls'), 0, wall / 2, 0)
  add(group, gableRoof(2.1, 1.15, 0.62, 0.08, colors.roof), 0, wall, 0)
  add(group, box(0.7, 0.62, 0.06, colors.trim, 'door'), 0, 0.32, 0.62)
  chimneys(group, chimneyCount(text), 0.4, wall + 0.4, 0, 0.5)
  return group
}

function car(colors) {
  const group = new THREE.Group()
  add(group, roundedSlab(1.7, 0.32, 0.72, 0.18, colors.body, 'body'), 0, 0.28, 0)
  add(group, roundedSlab(0.78, 0.28, 0.64, 0.12, colors.glass, 'cabin'), -0.12, 0.58, 0)
  add(group, box(0.08, 0.08, 0.7, colors.roof, 'bumper'), 0.86, 0.32, 0)
  for (const x of [-0.52, 0.52]) {
    for (const z of [-0.34, 0.34]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 16), material(INK))
      wheel.name = 'wheel'
      add(group, wheel, x, 0.15, z)
    }
  }
  return group
}

function shuttle(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.22, 1.15, colors.body, 'body'), 0, 0.75, 0)
  add(group, cone(0.22, 0.48, colors.roof, 'nose'), 0, 1.5, 0)
  for (const z of [-0.2, 0.2]) {
    const fin = box(0.5, 0.28, 0.06, colors.roof, 'fin')
    add(group, fin, 0, 0.28, z)
  }
  add(group, box(0.06, 0.28, 0.5, colors.roof, 'fin'), 0, 0.28, 0)
  add(group, cylinder(0.1, 0.08, colors.glass, 'window', 12), 0, 1.05, 0.2)
  return group
}

function lighthouse(text, colors) {
  const group = new THREE.Group()
  const shaft = colors.body
  add(group, cylinder(0.28, 1.55, shaft, 'shaft'), 0, 0.78, 0)
  if (/\bstripe/.test(text)) {
    for (let i = 0; i < 4; i++) {
      add(group, cylinder(0.3, 0.1, i % 2 ? WHITE : colors.roof, 'band'), 0, 0.35 + i * 0.28, 0)
    }
  }
  add(group, cylinder(0.36, 0.08, GRAY, 'gallery'), 0, 1.58, 0)
  add(group, cylinder(0.18, 0.28, colors.glass, 'lantern', 12), 0, 1.76, 0)
  add(group, cone(0.22, 0.28, colors.roof, 'cap'), 0, 2.02, 0)
  return group
}

function tree(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.12, 0.7, BROWN, 'trunk', 10), 0, 0.35, 0)
  add(group, ellipsoid(0.55, 0.42, 0.55, colors.body, 'canopy'), 0, 0.95, 0)
  add(group, ellipsoid(0.38, 0.32, 0.38, colors.body, 'canopy'), 0.2, 1.25, 0.05)
  add(group, ellipsoid(0.32, 0.28, 0.32, colors.body, 'canopy'), -0.16, 1.3, -0.05)
  return group
}

function cake(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.55, 0.28, colors.body, 'layer'), 0, 0.14, 0)
  add(group, cylinder(0.4, 0.24, colors.roof, 'layer'), 0, 0.38, 0)
  add(group, cylinder(0.26, 0.2, WHITE, 'icing'), 0, 0.58, 0)
  for (const x of [-0.12, 0.12]) {
    add(group, cylinder(0.03, 0.22, colors.trim, 'candle', 8), x, 0.78, 0)
    add(group, cone(0.04, 0.08, '#F2CD37', 'flame', 8), x, 0.92, 0)
  }
  return group
}

function bridge(colors) {
  const group = new THREE.Group()
  add(group, box(2.4, 0.16, 0.7, colors.body, 'deck'), 0, 0.55, 0)
  add(group, box(0.28, 0.55, 0.7, colors.roof, 'pier'), -0.7, 0.28, 0)
  add(group, box(0.28, 0.55, 0.7, colors.roof, 'pier'), 0.7, 0.28, 0)
  add(group, box(2.2, 0.1, 0.08, colors.trim, 'rail'), 0, 0.7, 0.28)
  add(group, box(2.2, 0.1, 0.08, colors.trim, 'rail'), 0, 0.7, -0.28)
  return group
}

function robot(colors) {
  const group = new THREE.Group()
  add(group, box(0.55, 0.6, 0.35, colors.body, 'torso'), 0, 0.7, 0)
  add(group, box(0.4, 0.32, 0.32, colors.roof, 'head'), 0, 1.18, 0)
  add(group, box(0.08, 0.08, 0.04, colors.glass, 'eye'), -0.1, 1.22, 0.16)
  add(group, box(0.08, 0.08, 0.04, colors.glass, 'eye'), 0.1, 1.22, 0.16)
  for (const x of [-0.42, 0.42]) {
    add(group, box(0.14, 0.5, 0.14, colors.body, 'arm'), x, 0.68, 0)
    add(group, box(0.16, 0.48, 0.16, colors.body, 'leg'), x * 0.45, 0.24, 0)
  }
  return group
}

function tower(text, colors) {
  const group = new THREE.Group()
  add(group, box(0.7, 1.7, 0.7, colors.body, 'shaft'), 0, 0.85, 0)
  add(group, pyramid(0.5, 0.55, 0.5, colors.roof, 'roof'), 0, 1.9, 0)
  add(group, cylinder(0.16, 0.06, WHITE, 'clock', 16), 0, 1.15, 0.36)
  add(group, box(0.28, 0.42, 0.06, colors.trim, 'door'), 0, 0.22, 0.36)
  if (/\bclock\b/.test(text)) {
    add(group, cylinder(0.05, 0.04, INK, 'hand', 8), 0, 1.15, 0.4)
  }
  return group
}

function treehouse(text, colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.14, 1.3, BROWN, 'trunk', 10), 0, 0.65, 0)
  add(group, ellipsoid(0.7, 0.45, 0.7, '#237841', 'canopy'), 0, 1.35, 0)
  add(group, box(0.7, 0.4, 0.55, colors.body, 'house'), 0.15, 1.15, 0.1)
  add(group, pyramid(0.48, 0.32, 0.4, colors.roof, 'roof'), 0.15, 1.48, 0.1)
  return group
}

function violin(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.28, 0.08, 0.42, colors.body, 'body'), 0, 0.2, -0.1)
  add(group, box(0.08, 0.08, 0.7, colors.body, 'neck'), 0, 0.28, 0.55)
  add(group, ellipsoid(0.1, 0.08, 0.1, colors.roof, 'scroll'), 0, 0.36, 0.95)
  return group
}

function mug(colors) {
  const group = new THREE.Group()
  add(group, lathe([
    [0.06, 0],
    [0.26, 0.02],
    [0.28, 0.12],
    [0.28, 0.46],
    [0.33, 0.52],
    [0.27, 0.56],
  ], colors.body, 'cup'), 0, 0, 0)
  add(group, tube([
    [0.26, 0.16, 0],
    [0.46, 0.2, 0],
    [0.5, 0.36, 0],
    [0.26, 0.44, 0],
  ], 0.04, colors.body, 'handle'), 0, 0, 0)
  return group
}

function planform(length, width, nose, tail) {
  const shape = new THREE.Shape()
  const hy = length / 2
  const hx = width / 2
  shape.moveTo(0, hy)
  shape.bezierCurveTo(hx * nose, hy * 0.9, hx, hy * 0.42, hx, 0)
  shape.bezierCurveTo(hx * 0.96, -hy * 0.42, hx * tail, -hy * 0.88, hx * tail * 0.28, -hy)
  shape.lineTo(-hx * tail * 0.28, -hy)
  shape.bezierCurveTo(-hx * tail, -hy * 0.88, -hx * 0.96, -hy * 0.42, -hx, 0)
  shape.bezierCurveTo(-hx, hy * 0.42, -hx * nose, hy * 0.9, 0, hy)
  return shape
}

function deck(length, width, thick, nose, tail, color, name) {
  const geo = new THREE.ExtrudeGeometry(planform(length, width, nose, tail), {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: thick * 0.28,
    bevelSize: Math.min(0.02, width * 0.05),
    bevelSegments: 2,
    curveSegments: 14,
  })
  geo.rotateX(-Math.PI / 2)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material(color))
  mesh.name = name
  return mesh
}

function surfboard(colors) {
  const group = new THREE.Group()
  add(group, deck(1.95, 0.4, 0.07, 0.12, 0.7, colors.body, 'body'), 0, 0.12, 0)
  add(group, box(0.035, 0.012, 1.25, colors.roof, 'stripe'), 0, 0.19, 0.06)
  add(group, box(0.026, 0.15, 0.11, colors.roof, 'fin'), 0, 0.02, -0.55)
  return group
}

function skateboard(colors) {
  const group = new THREE.Group()
  add(group, deck(1.15, 0.3, 0.055, 0.82, 0.82, colors.body, 'body'), 0, 0.16, 0)
  for (const z of [-0.32, 0.32]) {
    add(group, box(0.2, 0.035, 0.05, GRAY, 'truck'), 0, 0.1, z)
    for (const x of [-0.11, 0.11]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.02, 6, 10), material(INK))
      wheel.name = 'wheel'
      wheel.rotation.y = Math.PI / 2
      add(group, wheel, x, 0.05, z)
    }
  }
  return group
}

function snowboard(colors) {
  const group = new THREE.Group()
  add(group, deck(1.7, 0.34, 0.06, 0.45, 0.45, colors.body, 'body'), 0, 0.08, 0)
  for (const z of [-0.16, 0.24]) {
    add(group, box(0.14, 0.04, 0.12, colors.roof, 'binding'), 0, 0.14, z)
  }
  return group
}

function boat(colors) {
  const group = new THREE.Group()
  const hull = ellipsoid(0.9, 0.22, 0.32, colors.body, 'hull')
  hull.scale.y = 0.7
  add(group, hull, 0, 0.2, 0)
  add(group, box(0.4, 0.28, 0.28, colors.roof, 'cabin'), -0.1, 0.42, 0)
  add(group, cylinder(0.04, 0.7, BROWN, 'mast', 8), 0.25, 0.7, 0)
  return group
}

const COLOR_WORD = 'black|white|gray|grey|brown|red|orange|yellow|gold|green|blue|pink|purple|tan|stone|seaside'

function colorOf(text, noun, fallback) {
  const match = text.match(new RegExp(`\\b(${COLOR_WORD})\\s+(?:a\\s+|an\\s+|the\\s+)?(?:\\w+\\s+){0,2}${noun}`))
  return match ? COLORS[match[1]] : fallback
}

function countWord(text, noun) {
  const match = text.match(new RegExp(`\\b(one|two|three|four|1|2|3|4)\\s+(?:\\w+\\s+){0,2}${noun}`))
  const map = { one: 1, two: 2, three: 3, four: 4, 1: 1, 2: 2, 3: 3, 4: 4 }
  return match ? map[match[1]] : null
}

function countNamed(group, name) {
  let count = 0
  group.traverse((obj) => {
    if (obj.name === name) count += 1
  })
  return count
}

function recolor(group, name, color) {
  if (!color) return
  group.traverse((obj) => {
    if (obj.isMesh && obj.name === name && obj.material?.color) obj.material.color.set(color)
  })
}

function worldBox(group) {
  group.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(group)
}

function teapot(colors) {
  const group = new THREE.Group()
  add(group, lathe([
    [0.04, 0],
    [0.3, 0.03],
    [0.42, 0.16],
    [0.44, 0.32],
    [0.34, 0.46],
    [0.18, 0.54],
    [0.15, 0.58],
  ], colors.body, 'body'), 0, 0, 0)
  add(group, lathe([
    [0.02, 0],
    [0.17, 0.015],
    [0.16, 0.06],
    [0.07, 0.09],
    [0.035, 0.15],
  ], colors.roof, 'lid'), 0, 0.56, 0)
  add(group, tube([
    [0.3, 0.24, 0],
    [0.48, 0.32, 0],
    [0.6, 0.48, 0],
    [0.52, 0.6, 0],
  ], 0.042, colors.body, 'spout'), 0, 0, 0)
  add(group, tube([
    [-0.26, 0.2, 0],
    [-0.48, 0.28, 0],
    [-0.5, 0.46, 0],
    [-0.28, 0.52, 0],
  ], 0.038, colors.body, 'handle'), 0, 0, 0)
  return group
}

function bus(colors) {
  const group = new THREE.Group()
  add(group, box(1.9, 0.64, 0.72, colors.body, 'body'), 0, 0.56, 0)
  for (let i = 0; i < 4; i++) {
    add(group, box(0.22, 0.16, 0.04, colors.glass, 'window'), -0.58 + i * 0.32, 0.7, 0.36)
  }
  add(group, box(0.26, 0.4, 0.05, colors.trim, 'door'), 0.72, 0.48, 0.36)
  for (const x of [-0.58, 0.55]) {
    for (const z of [-0.34, 0.34]) {
      const wheel = cylinder(0.16, 0.08, INK, 'wheel', 14)
      wheel.rotation.z = Math.PI / 2
      add(group, wheel, x, 0.16, z)
    }
  }
  return group
}

function plane(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.85, 0.16, 0.16, colors.body, 'body'), 0, 0.28, 0)
  add(group, box(0.28, 0.05, 1.15, colors.roof, 'wing'), 0.05, 0.3, 0)
  add(group, box(0.22, 0.28, 0.05, colors.roof, 'wing'), -0.62, 0.42, 0)
  add(group, cone(0.1, 0.28, colors.roof, 'nose'), 0.95, 0.28, 0)
  const nose = group.children[group.children.length - 1]
  nose.rotation.z = -Math.PI / 2
  return group
}

function bicycle(colors) {
  const group = new THREE.Group()
  for (const x of [-0.42, 0.42]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 16), material(INK))
    wheel.name = 'wheel'
    add(group, wheel, x, 0.22, 0)
  }
  add(group, box(0.7, 0.05, 0.05, colors.body, 'frame'), 0, 0.28, 0)
  add(group, box(0.05, 0.32, 0.05, colors.body, 'frame'), 0.28, 0.4, 0)
  add(group, box(0.16, 0.06, 0.1, colors.roof, 'seat'), -0.12, 0.42, 0)
  return group
}

function flower(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.04, 0.7, '#237841', 'stem', 8), 0, 0.35, 0)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    add(group, ellipsoid(0.16, 0.05, 0.1, colors.body, 'petal'), Math.cos(angle) * 0.18, 0.78, Math.sin(angle) * 0.18)
  }
  add(group, ellipsoid(0.1, 0.08, 0.1, colors.roof, 'center'), 0, 0.8, 0)
  return group
}

function chair(colors) {
  const group = new THREE.Group()
  add(group, box(0.5, 0.08, 0.5, colors.body, 'seat'), 0, 0.42, 0)
  add(group, box(0.5, 0.5, 0.08, colors.body, 'back'), 0, 0.7, -0.21)
  for (const x of [-0.18, 0.18]) {
    for (const z of [-0.18, 0.18]) add(group, box(0.06, 0.4, 0.06, colors.roof, 'leg'), x, 0.2, z)
  }
  return group
}

function table(colors) {
  const group = new THREE.Group()
  add(group, box(1.1, 0.08, 0.65, colors.body, 'top'), 0, 0.62, 0)
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.22, 0.22]) add(group, box(0.07, 0.58, 0.07, colors.roof, 'leg'), x, 0.29, z)
  }
  return group
}

function lamp(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.18, 0.06, colors.roof, 'base'), 0, 0.03, 0)
  add(group, cylinder(0.04, 0.7, colors.body, 'stem', 8), 0, 0.4, 0)
  add(group, cone(0.28, 0.32, colors.roof, 'shade'), 0, 0.85, 0)
  return group
}

function hat(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.46, 0.06, colors.body, 'brim'), 0, 0.04, 0)
  add(group, cylinder(0.24, 0.32, colors.body, 'crown'), 0, 0.22, 0)
  add(group, cylinder(0.26, 0.06, colors.roof, 'band'), 0, 0.12, 0)
  return group
}

function umbrella(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.03, 0.85, colors.roof, 'shaft', 8), 0, 0.42, 0)
  add(group, cone(0.5, 0.22, colors.body, 'canopy'), 0, 0.78, 0)
  return group
}

function tent(colors) {
  const group = new THREE.Group()
  add(group, pyramid(0.7, 0.85, 0.7, colors.body, 'canopy'), 0, 0.42, 0)
  add(group, box(0.22, 0.36, 0.04, colors.trim, 'door'), 0, 0.2, 0.28)
  return group
}

function clock(colors) {
  const group = new THREE.Group()
  add(group, box(0.16, 0.55, 0.16, colors.roof, 'stand'), 0, 0.28, 0)
  add(group, cylinder(0.36, 0.1, colors.body, 'face', 20), 0, 0.72, 0)
  const face = group.children[group.children.length - 1]
  face.rotation.x = Math.PI / 2
  add(group, box(0.04, 0.16, 0.03, colors.trim, 'hand'), 0, 0.78, 0.06)
  add(group, box(0.12, 0.04, 0.03, colors.trim, 'hand'), 0.04, 0.72, 0.06)
  return group
}

function bottle(colors) {
  const group = new THREE.Group()
  add(group, lathe([
    [0.06, 0],
    [0.22, 0.03],
    [0.24, 0.22],
    [0.2, 0.46],
    [0.09, 0.58],
    [0.07, 0.74],
  ], colors.body, 'body'), 0, 0, 0)
  add(group, lathe([
    [0.02, 0],
    [0.09, 0.01],
    [0.09, 0.07],
    [0.04, 0.09],
  ], colors.roof, 'lid'), 0, 0.72, 0)
  return group
}

function present(colors) {
  const group = new THREE.Group()
  add(group, box(0.7, 0.5, 0.7, colors.body, 'body'), 0, 0.25, 0)
  add(group, box(0.08, 0.52, 0.72, colors.roof, 'ribbon'), 0, 0.26, 0)
  add(group, box(0.72, 0.52, 0.08, colors.roof, 'ribbon'), 0, 0.26, 0)
  add(group, ellipsoid(0.12, 0.08, 0.12, colors.roof, 'bow'), 0, 0.56, 0)
  return group
}

function windmill(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.22, 1.15, colors.body, 'tower'), 0, 0.58, 0)
  add(group, cone(0.34, 0.28, colors.roof, 'cap'), 0, 1.28, 0)
  for (let i = 0; i < 4; i++) {
    const blade = box(0.1, 0.72, 0.04, colors.roof, 'blade')
    blade.rotation.z = (i * Math.PI) / 2
    add(group, blade, 0, 1.12, 0.22)
  }
  add(group, box(0.16, 0.28, 0.05, colors.trim, 'door'), 0, 0.16, 0.2)
  return group
}

function cactus(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.12, 0.9, colors.body, 'stem', 10), 0, 0.45, 0)
  add(group, cylinder(0.08, 0.36, colors.body, 'arm', 8), -0.22, 0.55, 0)
  add(group, cylinder(0.08, 0.28, colors.body, 'arm', 8), 0.22, 0.48, 0)
  return group
}

function church(colors) {
  const group = new THREE.Group()
  add(group, box(1.3, 0.7, 0.8, colors.body, 'walls'), 0, 0.35, 0)
  add(group, pyramid(0.75, 0.45, 0.5, colors.roof, 'roof'), 0, 0.88, 0)
  add(group, box(0.28, 0.9, 0.28, colors.body, 'tower'), 0.72, 0.45, 0)
  add(group, pyramid(0.22, 0.4, 0.22, colors.roof, 'spire'), 0.72, 1.1, 0)
  add(group, box(0.22, 0.36, 0.05, colors.trim, 'door'), 0, 0.18, 0.4)
  return group
}

function fountain(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.55, 0.16, colors.body, 'basin'), 0, 0.08, 0)
  add(group, cylinder(0.1, 0.45, colors.roof, 'stem', 8), 0, 0.32, 0)
  add(group, cylinder(0.22, 0.08, colors.glass, 'water'), 0, 0.55, 0)
  return group
}

function train(colors) {
  const group = new THREE.Group()
  const boiler = cylinder(0.22, 1.15, colors.body, 'boiler', 16)
  boiler.rotation.z = Math.PI / 2
  add(group, boiler, -0.1, 0.38, 0)
  add(group, box(0.4, 0.42, 0.4, colors.roof, 'cab'), 0.55, 0.48, 0)
  add(group, cone(0.1, 0.22, INK, 'stack'), -0.35, 0.68, 0)
  for (const x of [-0.45, -0.1, 0.35, 0.62]) {
    const wheel = cylinder(0.14, 0.08, INK, 'wheel', 14)
    wheel.rotation.z = Math.PI / 2
    add(group, wheel, x, 0.14, 0.22)
    const wheel2 = cylinder(0.14, 0.08, INK, 'wheel', 14)
    wheel2.rotation.z = Math.PI / 2
    add(group, wheel2, x, 0.14, -0.22)
  }
  return group
}

function burger(colors) {
  const group = new THREE.Group()
  const bun = colors.body
  add(group, lathe([
    [0.001, 0],
    [0.22, 0.02],
    [0.4, 0.07],
    [0.42, 0.13],
    [0.3, 0.16],
    [0.001, 0.17],
  ], bun, 'bun'), 0, 0, 0)
  add(group, cylinder(0.36, 0.06, BROWN, 'patty', 28), 0, 0.2, 0)
  add(group, cylinder(0.4, 0.03, '#F2CD37', 'cheese', 28), 0, 0.245, 0)
  add(group, lathe([
    [0.001, 0],
    [0.4, 0.02],
    [0.42, 0.07],
    [0.28, 0.13],
    [0.1, 0.17],
    [0.001, 0.19],
  ], bun, 'bun'), 0, 0.25, 0)
  return group
}

function pizza(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.55, 0.08, colors.roof, 'crust'), 0, 0.05, 0)
  add(group, cylinder(0.46, 0.04, colors.body, 'sauce'), 0, 0.1, 0)
  for (const [x, z] of [[0.15, 0.1], [-0.16, 0.08], [0.02, -0.18], [-0.08, -0.02]]) {
    add(group, ellipsoid(0.06, 0.03, 0.06, BROWN, 'topping'), x, 0.14, z)
  }
  return group
}

function icecream(colors) {
  const group = new THREE.Group()
  const coneMesh = cone(0.16, 0.4, colors.roof, 'cone')
  coneMesh.rotation.z = Math.PI
  add(group, coneMesh, 0, 0.22, 0)
  add(group, ellipsoid(0.2, 0.16, 0.2, colors.body, 'scoop'), 0, 0.48, 0)
  add(group, ellipsoid(0.14, 0.12, 0.14, WHITE, 'scoop'), 0.08, 0.68, 0)
  return group
}

function donut(colors) {
  const group = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 10, 20), material(colors.body))
  ring.name = 'ring'
  ring.rotation.x = Math.PI / 2
  add(group, ring, 0, 0.14, 0)
  return group
}

function mushroom(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.1, 0.4, colors.roof, 'stem', 10), 0, 0.2, 0)
  add(group, ellipsoid(0.32, 0.16, 0.32, colors.body, 'cap'), 0, 0.48, 0)
  return group
}

function mountain(colors) {
  const group = new THREE.Group()
  add(group, cone(0.7, 0.95, colors.body, 'peak'), 0, 0.48, 0)
  add(group, cone(0.22, 0.28, WHITE, 'snow'), 0, 0.95, 0)
  return group
}

function sword(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.05, 0.28, colors.roof, 'grip', 8), 0, 0.16, 0)
  add(group, box(0.28, 0.05, 0.06, colors.trim, 'guard'), 0, 0.32, 0)
  add(group, box(0.08, 0.85, 0.03, colors.body, 'blade'), 0, 0.76, 0)
  return group
}

function hammer(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.045, 0.7, colors.roof, 'handle', 8), 0, 0.35, 0)
  add(group, box(0.36, 0.16, 0.14, colors.body, 'head'), 0, 0.72, 0)
  return group
}

function heart(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.22, 0.2, 0.16, colors.body, 'lobe'), -0.14, 0.55, 0)
  add(group, ellipsoid(0.22, 0.2, 0.16, colors.body, 'lobe'), 0.14, 0.55, 0)
  const point = cone(0.32, 0.48, colors.body, 'point')
  point.rotation.z = Math.PI
  add(group, point, 0, 0.28, 0)
  return group
}

function star(colors) {
  const group = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const arm = box(0.12, 0.55, 0.08, colors.body, 'point')
    arm.geometry.translate(0, 0.22, 0)
    arm.rotation.z = (i / 5) * Math.PI * 2
    add(group, arm, 0, 0.45, 0)
  }
  add(group, ellipsoid(0.12, 0.12, 0.08, colors.roof, 'center'), 0, 0.45, 0)
  return group
}

function monitor(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.22, 0.05, colors.roof, 'foot'), 0, 0.03, 0)
  add(group, box(0.08, 0.28, 0.08, colors.roof, 'stand'), 0, 0.18, 0)
  add(group, box(0.9, 0.55, 0.06, colors.body, 'panel'), 0, 0.55, 0)
  add(group, box(0.74, 0.4, 0.02, colors.glass, 'screen'), 0, 0.56, 0.035)
  return group
}

function laptop(colors) {
  const group = new THREE.Group()
  add(group, box(0.9, 0.05, 0.6, colors.body, 'base'), 0, 0.04, 0.05)
  const lid = box(0.9, 0.5, 0.04, colors.body, 'panel')
  lid.geometry.translate(0, 0.22, 0)
  lid.rotation.x = -0.7
  add(group, lid, 0, 0.06, -0.22)
  add(group, box(0.7, 0.32, 0.02, colors.glass, 'screen'), 0, 0.28, -0.12)
  return group
}

function phone(colors) {
  const group = new THREE.Group()
  add(group, box(0.38, 0.7, 0.05, colors.body, 'body'), 0, 0.36, 0)
  add(group, box(0.3, 0.52, 0.02, colors.glass, 'screen'), 0, 0.38, 0.03)
  return group
}

function camera(colors) {
  const group = new THREE.Group()
  add(group, box(0.55, 0.36, 0.28, colors.body, 'body'), 0, 0.28, 0)
  add(group, cylinder(0.12, 0.18, colors.roof, 'lens', 16), 0, 0.3, 0.2)
  add(group, box(0.22, 0.1, 0.16, colors.trim, 'viewfinder'), 0, 0.5, -0.02)
  return group
}

function piano(colors) {
  const group = new THREE.Group()
  add(group, box(1.3, 0.28, 0.5, colors.body, 'body'), 0, 0.42, 0)
  add(group, box(1.15, 0.06, 0.12, WHITE, 'keys'), 0, 0.58, 0.22)
  for (let i = 0; i < 8; i++) add(group, box(0.05, 0.05, 0.07, INK, 'key'), -0.42 + i * 0.12, 0.63, 0.2)
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.16, 0.16]) add(group, cylinder(0.04, 0.28, colors.roof, 'leg', 8), x, 0.14, z)
  }
  return group
}

function sofa(colors) {
  const group = new THREE.Group()
  add(group, box(1.2, 0.22, 0.5, colors.body, 'seat'), 0, 0.28, 0)
  add(group, box(1.2, 0.4, 0.12, colors.body, 'back'), 0, 0.52, -0.19)
  add(group, box(0.12, 0.32, 0.5, colors.roof, 'arm'), -0.6, 0.36, 0)
  add(group, box(0.12, 0.32, 0.5, colors.roof, 'arm'), 0.6, 0.36, 0)
  return group
}

function bowl(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.4, 0.2, 0.4, colors.body, 'body'), 0, 0.2, 0)
  add(group, cylinder(0.38, 0.06, colors.roof, 'rim'), 0, 0.36, 0)
  return group
}

function bush(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.06, 0.45, BROWN, 'stem', 8), 0, 0.22, 0)
  add(group, ellipsoid(0.36, 0.28, 0.36, colors.body, 'crown'), 0, 0.62, 0)
  add(group, ellipsoid(0.22, 0.18, 0.22, colors.body, 'crown'), 0.18, 0.78, 0.05)
  return group
}

function crown(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.28, 0.16, colors.body, 'band'), 0, 0.12, 0)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    add(group, cone(0.06, 0.16, colors.roof, 'point'), Math.cos(angle) * 0.22, 0.26, Math.sin(angle) * 0.22)
  }
  return group
}

function shoe(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.42, 0.12, 0.16, colors.roof, 'sole'), 0, 0.08, 0)
  add(group, ellipsoid(0.28, 0.14, 0.15, colors.body, 'upper'), -0.05, 0.2, 0)
  add(group, ellipsoid(0.12, 0.1, 0.12, colors.body, 'toe'), 0.28, 0.16, 0)
  return group
}

function book(colors) {
  const group = new THREE.Group()
  add(group, box(0.7, 0.12, 0.5, colors.roof, 'pages'), 0, 0.08, 0)
  add(group, box(0.74, 0.04, 0.52, colors.body, 'cover'), 0, 0.15, 0)
  add(group, box(0.06, 0.16, 0.52, colors.body, 'spine'), -0.34, 0.08, 0)
  return group
}

function bell(colors) {
  const group = new THREE.Group()
  const skirt = cone(0.32, 0.45, colors.body, 'skirt')
  skirt.rotation.z = Math.PI
  add(group, skirt, 0, 0.32, 0)
  add(group, ellipsoid(0.06, 0.06, 0.06, colors.roof, 'clapper'), 0, 0.16, 0)
  add(group, cylinder(0.04, 0.1, colors.trim, 'crown', 8), 0, 0.58, 0)
  return group
}

function drum(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.36, 0.28, colors.body, 'shell', 20), 0, 0.2, 0)
  add(group, cylinder(0.37, 0.04, WHITE, 'head', 20), 0, 0.36, 0)
  return group
}

function cloud(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.4, 0.22, 0.28, colors.body, 'puff'), 0, 0.4, 0)
  add(group, ellipsoid(0.28, 0.2, 0.22, colors.body, 'puff'), -0.32, 0.36, 0)
  add(group, ellipsoid(0.26, 0.18, 0.2, colors.body, 'puff'), 0.32, 0.34, 0.04)
  return group
}

function sun(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.28, 0.28, 0.28, colors.body, 'disc'), 0, 0.45, 0)
  for (let i = 0; i < 8; i++) {
    const ray = box(0.06, 0.22, 0.04, colors.body, 'ray')
    ray.geometry.translate(0, 0.42, 0)
    ray.rotation.z = (i / 8) * Math.PI * 2
    add(group, ray, 0, 0.45, 0)
  }
  return group
}

function ghost(colors) {
  const group = new THREE.Group()
  add(group, ellipsoid(0.28, 0.36, 0.22, colors.body, 'body'), 0, 0.48, 0)
  add(group, cone(0.28, 0.28, colors.body, 'hem'), 0, 0.16, 0)
  add(group, ellipsoid(0.06, 0.07, 0.04, INK, 'eye'), -0.08, 0.55, 0.16)
  add(group, ellipsoid(0.06, 0.07, 0.04, INK, 'eye'), 0.08, 0.55, 0.16)
  return group
}

function blender(colors) {
  const group = new THREE.Group()
  add(group, cylinder(0.22, 0.16, colors.roof, 'base'), 0, 0.08, 0)
  add(group, cylinder(0.16, 0.48, colors.body, 'jar', 12), 0, 0.4, 0)
  add(group, cylinder(0.17, 0.06, colors.trim, 'lid'), 0, 0.66, 0)
  return group
}

function toaster(colors) {
  const group = new THREE.Group()
  add(group, box(0.55, 0.32, 0.32, colors.body, 'body'), 0, 0.2, 0)
  add(group, box(0.12, 0.05, 0.16, INK, 'slot'), -0.1, 0.38, 0)
  add(group, box(0.12, 0.05, 0.16, INK, 'slot'), 0.1, 0.38, 0)
  add(group, box(0.05, 0.16, 0.04, colors.roof, 'lever'), 0.32, 0.24, 0)
  return group
}

const RECIPES = [
  { name: 'Surfboard', test: /\b(surfboard|surf\s+board|paddleboard|longboard)\b/, build: surfboard },
  { name: 'Skateboard', test: /\bskateboard\b/, build: skateboard },
  { name: 'Snowboard', test: /\bsnowboard\b/, build: snowboard },
  { name: 'Teapot', test: /\b(teapot|kettle)\b/, build: teapot },
  { name: 'Bus', test: /\b(bus|van)\b/, build: bus },
  { name: 'Plane', test: /\b(plane|airplane|jet)\b/, build: plane },
  { name: 'Bicycle', test: /\b(bicycle|bike)\b/, build: bicycle },
  { name: 'Flower', test: /\b(flower|tulip|sunflower|daisy|rose)\b/, build: flower },
  { name: 'Chair', test: /\bchair\b/, build: chair },
  { name: 'Table', test: /\b(table|desk)\b/, build: table },
  { name: 'Lamp', test: /\b(lamp|lantern)\b/, build: lamp },
  { name: 'Hat', test: /\bhat\b/, build: hat },
  { name: 'Umbrella', test: /\bumbrella\b/, build: umbrella },
  { name: 'Tent', test: /\btent\b/, build: tent },
  { name: 'Clock', test: /\bclock\b/, build: clock },
  { name: 'Bottle', test: /\b(bottle|vase|jar)\b/, build: bottle },
  { name: 'Present', test: /\b(present|gift)\b/, build: present },
  { name: 'Windmill', test: /\bwindmill\b/, build: windmill },
  { name: 'Cactus', test: /\bcactus\b/, build: cactus },
  { name: 'Church', test: /\bchurch\b/, build: church },
  { name: 'Fountain', test: /\bfountain\b/, build: fountain },
  { name: 'Train', test: /\b(train|locomotive|tram)\b/, build: train },
  { name: 'Burger', test: /\b(burger|hamburger|sandwich)\b/, build: burger },
  { name: 'Pizza', test: /\bpizza\b/, build: pizza },
  { name: 'Ice cream', test: /\b(ice\s*cream|sundae)\b/, build: icecream },
  { name: 'Donut', test: /\b(donut|doughnut|bagel)\b/, build: donut },
  { name: 'Mushroom', test: /\bmushroom\b/, build: mushroom },
  { name: 'Mountain', test: /\b(mountain|volcano|pyramid)\b/, build: mountain },
  { name: 'Sword', test: /\b(sword|knife|dagger)\b/, build: sword },
  { name: 'Hammer', test: /\b(hammer|axe|mallet|shovel|wrench)\b/, build: hammer },
  { name: 'Heart', test: /\bheart\b/, build: heart },
  { name: 'Star', test: /\bstar\b/, build: star },
  { name: 'Monitor', test: /\b(monitor|television|tv|computer)\b/, build: monitor },
  { name: 'Laptop', test: /\blaptop\b/, build: laptop },
  { name: 'Phone', test: /\b(phone|tablet)\b/, build: phone },
  { name: 'Camera', test: /\bcamera\b/, build: camera },
  { name: 'Piano', test: /\b(piano|keyboard)\b/, build: piano },
  { name: 'Sofa', test: /\b(sofa|couch|bench|bed|stool)\b/, build: sofa },
  { name: 'Bowl', test: /\b(bowl|bucket|barrel|goblet|pan)\b/, build: bowl },
  { name: 'Bush', test: /\b(bush|shrub|palm|pine)\b/, build: bush },
  { name: 'Crown', test: /\b(crown|helmet)\b/, build: crown },
  { name: 'Shoe', test: /\b(shoe|boot|sneaker)\b/, build: shoe },
  { name: 'Book', test: /\bbook\b/, build: book },
  { name: 'Bell', test: /\bbell\b/, build: bell },
  { name: 'Drum', test: /\b(drum|bongo)\b/, build: drum },
  { name: 'Cloud', test: /\bcloud\b/, build: cloud },
  { name: 'Sun', test: /\b(sun|moon)\b/, build: sun },
  { name: 'Ghost', test: /\bghost\b/, build: ghost },
  { name: 'Toaster', test: /\btoaster\b/, build: toaster },
  { name: 'Blender', test: /\bblender\b/, build: blender },
]

function generic(text, colors) {
  const group = new THREE.Group()
  const tall = /\b(tall|high|towering|spire|pillar|obelisk)\b/.test(text)
  const long = /\b(long|wide|flat)\b/.test(text)
  const round = /\b(round|ball|sphere|orb|dome|circular)\b/.test(text)
  if (long && !tall) {
    add(group, lathe([
      [0.02, 0],
      [0.16, 0.04],
      [0.22, 0.16],
      [0.18, 0.28],
      [0.06, 0.34],
    ], colors.body, 'body'), 0, 0.12, 0)
    const body = group.children[0]
    body.scale.set(2.4, 0.7, 1)
    return group
  }
  const points = round
    ? [[0.02, 0], [0.22, 0.08], [0.48, 0.4], [0.48, 0.62], [0.2, 0.92], [0.02, 1]]
    : tall
      ? [[0.04, 0], [0.26, 0.04], [0.2, 0.28], [0.14, 0.78], [0.06, 1.12], [0.02, 1.24]]
      : [[0.03, 0], [0.28, 0.05], [0.4, 0.28], [0.32, 0.52], [0.14, 0.68], [0.03, 0.76]]
  add(group, lathe(points, colors.body, 'body'), 0, 0, 0)
  return group
}

function embellish(group, text, colors) {
  const mentioned = new Set()
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.name || mentioned.has(obj.name)) return
    mentioned.add(obj.name)
    recolor(group, obj.name, colorOf(text, obj.name, null))
  })
  recolor(group, 'door', colorOf(text, 'doors?', null))
  recolor(group, 'window', colorOf(text, 'windows?', null))
  recolor(group, 'chimney', colorOf(text, 'chimneys?', null))
  recolor(group, 'roof', colorOf(text, 'roof', null))
  const box3 = worldBox(group)
  const size = box3.getSize(new THREE.Vector3())
  const center = box3.getCenter(new THREE.Vector3())
  if (/\bporch\b/.test(text) && !countNamed(group, 'porch')) {
    const depth = Math.max(0.2, size.z * 0.28)
    const height = Math.max(0.08, size.y * 0.07)
    const color = colorOf(text, 'porch', colors.trim)
    add(group, box(size.x * 0.62, height, depth, color, 'porch'), center.x, height / 2, box3.max.z + depth * 0.35)
  }
  if (/\b(steps|stairs)\b/.test(text) && !countNamed(group, 'step')) {
    const color = colorOf(text, 'steps|stairs', colors.roof)
    for (let i = 0; i < 3; i++) {
      const depth = 0.12
      add(group, box(size.x * 0.28, 0.06, depth, color, 'step'), center.x, 0.03 + i * 0.06, box3.max.z + 0.08 + i * 0.12)
    }
  }
  if (/\bfence\b/.test(text) && !countNamed(group, 'fence')) {
    const color = colorOf(text, 'fence', colors.trim)
    add(group, box(size.x * 1.1, 0.16, 0.06, color, 'fence'), center.x, 0.08, box3.max.z + 0.28)
  }
  if (/\b(balcony|deck)\b/.test(text) && !countNamed(group, 'balcony')) {
    const color = colorOf(text, 'balcony|deck', colors.roof)
    add(group, box(size.x * 0.7, 0.06, 0.22, color, 'balcony'), center.x, box3.min.y + size.y * 0.55, box3.max.z + 0.08)
  }
  if (/\bflag\b/.test(text) && !countNamed(group, 'flag')) {
    const color = colorOf(text, 'flag', colors.roof)
    add(group, cylinder(0.03, size.y * 0.45, colors.trim, 'pole', 6), box3.max.x - 0.05, box3.max.y + size.y * 0.15, center.z)
    add(group, box(0.22, 0.14, 0.03, color, 'flag'), box3.max.x + 0.12, box3.max.y + size.y * 0.28, center.z)
  }
  if (/\bchimneys?\b/.test(text) && !countNamed(group, 'chimney')) {
    const count = countWord(text, 'chimneys?') || 1
    const color = colorOf(text, 'chimneys?', BROWN)
    chimneys(group, count, center.x, box3.max.y + 0.16, center.z, size.x * 0.35, color)
  }
  if (/\bwheels?\b/.test(text) && !countNamed(group, 'wheel')) {
    const color = colorOf(text, 'wheels?', INK)
    for (const x of [-size.x * 0.32, size.x * 0.32]) {
      for (const z of [-size.z * 0.42, size.z * 0.42]) {
        const wheel = cylinder(Math.max(0.1, size.y * 0.16), 0.08, color, 'wheel', 12)
        wheel.rotation.z = Math.PI / 2
        add(group, wheel, center.x + x, Math.max(0.1, size.y * 0.16), center.z + z)
      }
    }
  }
  if (/\bwings?\b/.test(text) && !countNamed(group, 'wing')) {
    const color = colorOf(text, 'wings?', colors.roof)
    add(group, box(size.x * 0.35, 0.06, size.z * 1.3, color, 'wing'), center.x, center.y, center.z)
  }
  if (/\blid\b/.test(text) && !countNamed(group, 'lid')) {
    const color = colorOf(text, 'lid', colors.roof)
    add(group, cylinder(size.x * 0.22, 0.08, color, 'lid'), center.x, box3.max.y + 0.04, center.z)
  }
  if (/\bhandle\b/.test(text) && !countNamed(group, 'handle')) {
    const color = colorOf(text, 'handle', colors.body)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(size.y * 0.16, 0.04, 8, 12), material(color))
    handle.name = 'handle'
    handle.rotation.y = Math.PI / 2
    add(group, handle, box3.max.x + size.y * 0.12, center.y, center.z)
  }
  if (/\bspout\b/.test(text) && !countNamed(group, 'spout')) {
    const color = colorOf(text, 'spout', colors.body)
    add(group, box(size.x * 0.28, 0.08, 0.08, color, 'spout'), box3.max.x + size.x * 0.1, center.y + size.y * 0.1, center.z)
  }
  if (/\bcandles?\b/.test(text) && !countNamed(group, 'candle')) {
    const count = countWord(text, 'candles?') || 2
    for (let i = 0; i < count; i++) {
      const x = center.x + (i - (count - 1) / 2) * 0.16
      add(group, cylinder(0.03, 0.2, colors.trim, 'candle', 8), x, box3.max.y + 0.1, center.z)
      add(group, cone(0.04, 0.08, '#F2CD37', 'flame', 8), x, box3.max.y + 0.24, center.z)
    }
  }
  if (/\bantenna\b/.test(text) && !countNamed(group, 'antenna')) {
    add(group, cylinder(0.02, size.y * 0.35, colors.trim, 'antenna', 6), center.x, box3.max.y + size.y * 0.16, center.z)
  }
  if (/\bstripes?\b/.test(text) && !countNamed(group, 'band')) {
    const stripe = colors.roof
    for (let i = 0; i < 3; i++) {
      add(
        group,
        box(size.x * 1.04, Math.max(0.06, size.y * 0.08), size.z * 1.04, i % 2 ? stripe : WHITE, 'band'),
        center.x,
        box3.min.y + size.y * (0.28 + i * 0.22),
        center.z,
      )
    }
  }
  if (/\bdoors?\b/.test(text) && !countNamed(group, 'door')) {
    const color = colorOf(text, 'doors?', colors.trim)
    add(group, box(size.x * 0.22, size.y * 0.45, 0.05, color, 'door'), center.x, box3.min.y + size.y * 0.24, box3.max.z)
  }
  if (/\bwindows?\b/.test(text) && !countNamed(group, 'window')) {
    const color = colorOf(text, 'windows?', colors.glass)
    const count = countWord(text, 'windows?') || 2
    for (let i = 0; i < count; i++) {
      const x = center.x + (i - (count - 1) / 2) * size.x * 0.28
      add(group, box(size.x * 0.14, size.y * 0.16, 0.04, color, 'window'), x, box3.min.y + size.y * 0.55, box3.max.z)
    }
  }
}

const FIXTURES = [
  { name: 'Tree house', test: /\btree\s*house\b|\btreehouse\b/, build: treehouse },
  { name: 'Lighthouse', test: /\blighthouse\b/, build: lighthouse },
  { name: 'Clock tower', test: /\btower\b/, build: tower },
  { name: 'Castle', test: /\bcastle\b|\bgate\b/, build: (text, colors) => castle(colors, text) },
  { name: 'Barn', test: /\bbarn\b/, build: barn },
  { name: 'Cottage', test: /\b(cottage|cabin|house)\b/, build: cottage },
  { name: 'Coupe', test: /\b(coupe|car|truck|auto)\b/, build: (text, colors) => car(colors) },
  { name: 'Shuttle', test: /\b(shuttle|rocket|spaceship)\b/, build: (text, colors) => shuttle(colors) },
  { name: 'Oak', test: /\b(oak|tree)\b/, build: (text, colors) => tree(colors) },
  { name: 'Cake', test: /\bcake\b/, build: (text, colors) => cake(colors) },
  { name: 'Bridge', test: /\bbridge\b/, build: (text, colors) => bridge(colors) },
  { name: 'Robot', test: /\brobot\b/, build: (text, colors) => robot(colors) },
  { name: 'Violin', test: /\b(violin|guitar)\b/, build: (text, colors) => violin(colors) },
  { name: 'Mug', test: /\b(mug|cup)\b/, build: (text, colors) => mug(colors) },
  { name: 'Boat', test: /\b(boat|ship)\b/, build: (text, colors) => boat(colors) },
]

const PINKISH = '#E4ADC8'

const DEFAULTS = {
  Cottage: [WHITE, RED],
  Castle: [GRAY, BROWN],
  Barn: [RED, BROWN],
  Coupe: [RED, INK],
  Shuttle: [WHITE, RED],
  Lighthouse: [WHITE, RED],
  Oak: ['#237841', BROWN],
  Cake: [PINKISH, WHITE],
  Bridge: [GRAY, BROWN],
  Robot: [GRAY, WHITE],
  'Tree house': [TAN, RED],
  'Clock tower': [TAN, BROWN],
  Violin: [BROWN, TAN],
  Mug: [WHITE, INK],
  Boat: [BLUE, WHITE],
  Surfboard: [WHITE, BLUE],
  Skateboard: [RED, INK],
  Snowboard: [WHITE, BLUE],
  Teapot: [WHITE, BROWN],
  Bus: ['#F2CD37', INK],
  Plane: [WHITE, BLUE],
  Bicycle: [RED, INK],
  Flower: [PINKISH, '#F2CD37'],
  Chair: [BROWN, TAN],
  Table: [BROWN, TAN],
  Lamp: [WHITE, '#F2CD37'],
  Hat: [RED, INK],
  Umbrella: [RED, BROWN],
  Tent: ['#FE8A18', BROWN],
  Clock: [WHITE, BROWN],
  Bottle: ['#237841', INK],
  Present: [RED, '#F2CD37'],
  Windmill: [WHITE, RED],
  Cactus: ['#237841', BROWN],
  Church: [GRAY, BROWN],
  Fountain: [GRAY, BLUE],
  Train: [RED, INK],
  Burger: [TAN, BROWN],
  Pizza: ['#C91A09', TAN],
  'Ice cream': [PINKISH, TAN],
  Donut: [PINKISH, WHITE],
  Mushroom: [RED, TAN],
  Mountain: [GRAY, WHITE],
  Sword: [GRAY, BROWN],
  Hammer: [GRAY, BROWN],
  Heart: [RED, PINKISH],
  Star: ['#F2CD37', '#FE8A18'],
  Monitor: [INK, GRAY],
  Laptop: [GRAY, INK],
  Phone: [INK, GRAY],
  Camera: [INK, GRAY],
  Piano: [INK, BROWN],
  Sofa: [BLUE, BROWN],
  Bowl: [WHITE, BLUE],
  Bush: ['#237841', BROWN],
  Crown: ['#F2CD37', '#FE8A18'],
  Shoe: [BROWN, INK],
  Book: [RED, WHITE],
  Bell: ['#F2CD37', BROWN],
  Drum: [RED, WHITE],
  Cloud: [WHITE, GRAY],
  Sun: ['#F2CD37', '#FE8A18'],
  Ghost: [WHITE, INK],
  Blender: [WHITE, GRAY],
  Toaster: [GRAY, RED],
}

function titleFrom(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .slice(0, 48)
}

/** A closed solid for a prompt that is not an animal scan. */
export function sculptScene(text, variant = 0) {
  const q = text.toLowerCase()
  const fixture = FIXTURES.find((item) => item.test.test(q))
  const recipe = fixture ? null : RECIPES.find((item) => item.test.test(q))
  const name = fixture ? fixture.name : recipe ? recipe.name : titleFrom(text)
  const [bodyFallback, roofFallback] = DEFAULTS[name] || [TAN, BROWN]
  const colors = paint(q, bodyFallback, roofFallback)
  const group = fixture ? fixture.build(q, colors) : recipe ? recipe.build(colors, q) : generic(q, colors)
  embellish(group, q, colors)
  let scale = 1 + ((variant % 5) - 2) * 0.05
  if (/\b(tiny|small|little)\b/.test(q)) scale *= 0.78
  if (/\b(huge|giant|large|big)\b/.test(q)) scale *= 1.22
  group.scale.setScalar(scale)
  return { name, group: seat(group) }
}
