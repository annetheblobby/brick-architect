import { applyLanguage } from './palette.js'

function hashString(value) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function titleFrom(prompt, fallback) {
  let text = prompt.trim().replace(/\s+/g, ' ')
  text = text.replace(/^(please\s+)?(build|make|design|create|give me|i want|i'd like|id like)\s+(me\s+)?/i, '')
  text = text.replace(/^(a|an|the)\s+/i, '')
  if (!text) return fallback
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function createBoard() {
  const cells = new Map()
  const key = (x, y, z) => `${x}|${y}|${z}`
  function anchorCovering(x, y, z) {
    for (const dx of [0, -1]) {
      for (const dz of [0, -1]) {
        const cell = cells.get(key(x + dx, y, z + dz))
        if (!cell || cell.kind !== 'round2') continue
        if (x >= cell.x && x < cell.x + 2 && z >= cell.z && z < cell.z + 2) return cell
      }
    }
    return null
  }
  function put(x, y, z, role, kind = 'plate') {
    x = Math.round(x)
    y = Math.round(y)
    z = Math.round(z)
    const cover = anchorCovering(x, y, z)
    if (cover) cells.delete(key(cover.x, cover.y, cover.z))
    cells.set(key(x, y, z), { x, y, z, role, kind })
  }
  function fill(x0, y0, z0, x1, y1, z1, role, kind = 'plate') {
    const xa = Math.min(x0, x1)
    const xb = Math.max(x0, x1)
    const ya = Math.min(y0, y1)
    const yb = Math.max(y0, y1)
    const za = Math.min(z0, z1)
    const zb = Math.max(z0, z1)
    for (let y = ya; y <= yb; y++) {
      for (let z = za; z <= zb; z++) {
        for (let x = xa; x <= xb; x++) put(x, y, z, role, kind)
      }
    }
  }
  function paintSide(rows, x0, y0, z0, depth, legend) {
    const width = Math.max(...rows.map((row) => row.length))
    const grid = rows.map((row) => [...row.padEnd(width, '.')])
    for (let row = 0; row < grid.length - 1; row++) {
      for (let x = 0; x < width; x++) {
        const filled = grid[row][x] !== '.' && grid[row][x] !== ' '
        const under = grid[row + 1][x]
        if (filled && (under === '.' || under === ' ')) grid[row + 1][x] = '#'
      }
    }
    for (let row = 0; row < grid.length; row++) {
      const y = y0 + (grid.length - 1 - row)
      for (let x = 0; x < width; x++) {
        const ch = grid[row][x]
        if (ch === '.' || ch === ' ') continue
        const spec = legend[ch] || legend['#']
        if (!spec) continue
        for (let d = 0; d < depth; d++) {
          const outer = d === 0 || d === depth - 1
          let kind = spec.kind || 'plate'
          let role = spec.role
          if (outer && spec.outerKind) kind = spec.outerKind
          if (!outer && spec.innerKind) kind = spec.innerKind
          if (!outer && spec.innerRole) role = spec.innerRole
          put(x0 + x, y, z0 + d, role, kind)
        }
      }
    }
  }
  return { cells, put, fill, paintSide }
}

function rect(board, x, z, y, w, d, role, kind = 'plate') {
  board.fill(x, y, z, x + w - 1, y, z + d - 1, role, kind)
}

function box(board, x, z, y0, y1, w, d, role, kind = 'plate') {
  for (let y = y0; y <= y1; y++) rect(board, x, z, y, w, d, role, kind)
}

function maxY(board) {
  let top = 0
  for (const cell of board.cells.values()) top = Math.max(top, cell.y)
  return top
}

function groundUnder(board, role, margin = 1) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let minY = Infinity
  for (const cell of board.cells.values()) {
    const w = cell.kind === 'round2' ? 2 : 1
    minX = Math.min(minX, cell.x)
    maxX = Math.max(maxX, cell.x + w - 1)
    minZ = Math.min(minZ, cell.z)
    maxZ = Math.max(maxZ, cell.z + w - 1)
    minY = Math.min(minY, cell.y)
  }
  board.fill(minX - margin, minY - 1, minZ - margin, maxX + margin, minY - 1, maxZ + margin, role)
}

function paintPlan(board, rows, x0, y, z0, legend, courses = 2) {
  for (let z = 0; z < rows.length; z++) {
    const row = rows[z]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.' || ch === ' ') continue
      const spec = legend[ch] || legend['#']
      for (let level = 0; level < courses; level++) {
        const top = level === courses - 1
        const kind = top && spec.topKind ? spec.topKind : spec.kind || 'plate'
        const role = top && spec.topRole ? spec.topRole : spec.role
        board.put(x0 + x, y + level, z0 + z, role, kind)
      }
    }
  }
}

function sapling(board, x, z) {
  box(board, x, z, 1, 3, 2, 2, 'trunk')
  rect(board, x, z - 1, 4, 2, 4, 'leaf')
  rect(board, x - 1, z - 1, 5, 4, 4, 'leaf')
  rect(board, x - 1, z - 2, 6, 4, 6, 'canopy')
  rect(board, x, z - 1, 7, 2, 4, 'leaf2')
  rect(board, x, z, 8, 2, 2, 'leaf')
}

const EYE = { role: 'eye', kind: 'plate', outerKind: 'round1', innerRole: 'body', innerKind: 'plate' }

function creature(rows, legend, depth = 4) {
  const board = createBoard()
  board.paintSide(rows, 0, 1, 0, depth, legend)
  groundUnder(board, 'stand', 1)
  return board
}

function cottage(ctx) {
  const barn = /\bbarn\b/i.test(ctx.prompt)
  const board = createBoard()
  rect(board, 0, 0, 0, 20, 16, 'ground')
  rect(board, 8, 0, 0, 4, 5, 'path')
  const hx = 4
  const hz = 4
  const hw = barn ? 14 : 12
  const hd = barn ? 10 : 8
  box(board, hx, hz, 1, 6, hw, hd, 'wall')
  rect(board, hx, hz, 7, hw, hd, 'trim')
  const dw = barn ? 5 : 4
  const dx = hx + Math.floor((hw - dw) / 2)
  box(board, dx, hz, 1, 5, dw, 1, 'door')
  board.put(dx + dw - 1, 3, hz, 'knob', 'round1')
  rect(board, hx + 1, hz, 3, 2, 1, 'glass')
  rect(board, hx + hw - 3, hz, 3, 2, 1, 'glass')
  rect(board, hx + 1, hz, 2, 2, 1, 'trim')
  rect(board, hx + hw - 3, hz, 2, 2, 1, 'trim')
  rect(board, hx, hz + 3, 4, 1, 2, 'glass')
  rect(board, hx + hw - 1, hz + Math.max(3, hd - 5), 4, 1, 2, 'glass')
  let rx = hx
  let rz = hz
  let rw = hw
  let rd = hd
  let y = 8
  while (rw >= 4 && rd >= 2 && y < 16) {
    rect(board, rx, rz, y, rw, rd, 'roof')
    rx += 1
    rz += 1
    rw -= 2
    rd -= 2
    y += 1
  }
  const cx = hx + hw - 4
  const cz = hz + Math.floor(hd / 2) - 1
  box(board, cx, cz, 6, y, 2, 2, 'chimney')
  board.put(cx, y + 1, cz, 'knob', 'round1')
  board.put(1, 1, 2, 'flower', 'round1')
  board.put(2, 1, 13, 'flower2', 'round1')
  board.put(18, 1, 3, 'flower', 'round1')
  if (/\btree\b/i.test(ctx.prompt)) sapling(board, 1, 11)
  const top = maxY(board)
  return {
    cells: board.cells,
    summary: barn
      ? 'A solid barn. The big door is one stud deep on the face, and each roof course steps in so it sits fully on the course under it.'
      : 'A solid microscale cottage. Door and windows are one stud deep, the roof steps in one stud at a time, and the chimney is a column tied through the roof.',
    stages: [
      { name: 'Yard', from: 0, to: 0, blurb: 'The ground is ordinary plates, not a baseplate, so every course in the set is the same 3.2 mm.' },
      { name: 'Walls', from: 1, to: 7, blurb: 'The house is solid. At this scale a door only needs to be one stud deep to read from the front.' },
      { name: 'Roof', from: 8, to: top, blurb: 'Each roof course steps in. Nothing cantilevers, so you can press the whole course down before starting the next.' },
    ],
  }
}

function castle() {
  const board = createBoard()
  rect(board, 0, 0, 0, 22, 18, 'ground')
  box(board, 4, 3, 1, 8, 14, 12, 'wall')
  const towers = [
    [3, 2],
    [15, 2],
    [3, 12],
    [15, 12],
  ]
  for (const [x, z] of towers) box(board, x, z, 1, 12, 4, 4, 'wall')
  for (let x = 4; x <= 17; x++) {
    if ((x + 3) % 2 === 0) board.put(x, 9, 3, 'battlement')
    if ((x + 14) % 2 === 0) board.put(x, 9, 14, 'battlement')
  }
  for (let z = 4; z <= 13; z++) {
    if ((4 + z) % 2 === 0) board.put(4, 9, z, 'battlement')
    if ((17 + z) % 2 === 0) board.put(17, 9, z, 'battlement')
  }
  box(board, 9, 3, 1, 5, 4, 1, 'door')
  board.put(12, 3, 3, 'knob', 'round1')
  rect(board, 6, 3, 5, 1, 1, 'slit')
  rect(board, 15, 3, 5, 1, 1, 'slit')
  rect(board, 10, 3, 6, 2, 1, 'flag')
  for (const [x, z] of towers) {
    rect(board, x, z, 13, 4, 4, 'roof')
    rect(board, x + 1, z + 1, 14, 2, 2, 'roof')
    board.put(x + 1, 15, z + 1, 'flag', 'round1')
  }
  return {
    cells: board.cells,
    summary: 'A gatehouse with four towers. Battlements are every other stud on the wall top, each one clutched to the solid course under it.',
    stages: [
      { name: 'Bailey', from: 0, to: 0, blurb: 'Lay the ground as large plates. The towers and the keep all start on this course.' },
      { name: 'Walls', from: 1, to: 9, blurb: 'The gate is a color on the face, not a hole, so the course above it does not have to span an opening.' },
      { name: 'Towers', from: 10, to: 15, blurb: 'Cap each tower and finish with a round plate. That round is the banner pole.' },
    ],
  }
}

function lighthouse() {
  const board = createBoard()
  rect(board, 0, 0, 0, 14, 14, 'rock')
  rect(board, 1, 1, 1, 12, 12, 'rock')
  const specks = [
    [2, 2],
    [10, 3],
    [4, 11],
    [11, 10],
    [7, 1],
  ]
  for (const [x, z] of specks) board.put(x, 1, z, 'rock2')
  for (let y = 2; y <= 13; y++) {
    const band = Math.floor((y - 2) / 2) % 2 === 0 ? 'stripe' : 'stripe2'
    rect(board, 4, 4, y, 6, 6, band)
  }
  box(board, 6, 4, 2, 5, 2, 1, 'door')
  for (let i = 0; i < 6; i++) {
    board.put(4 + i, 13, 4, 'rail')
    board.put(4 + i, 13, 9, 'rail')
    board.put(4, 13, 4 + i, 'rail')
    board.put(9, 13, 4 + i, 'rail')
  }
  rect(board, 5, 5, 14, 4, 4, 'lamp')
  rect(board, 6, 6, 15, 2, 2, 'roof')
  board.put(6, 16, 6, 'light', 'round1')
  board.put(7, 16, 7, 'light', 'round1')
  return {
    cells: board.cells,
    summary: 'A square tower, which is how a microscale lighthouse is usually built. The stripes are full courses, so the bond stays locked. The gallery is a recolored ring, not a cantilever.',
    stages: [
      { name: 'Rock', from: 0, to: 1, blurb: 'The rock is wider than the tower so the first white course is fully supported.' },
      { name: 'Tower', from: 2, to: 13, blurb: 'Alternate the bands every two courses. Recolor the top ring as the gallery rail after the stripe is down.' },
      { name: 'Lamp', from: 14, to: 16, blurb: 'The lamp room steps in, then two round plates are the light. Rounds clutch, so they can finish a column.' },
    ],
  }
}

function wheel(board, x, z, y, role) {
  board.put(x, y, z, role, 'round1')
  board.put(x + 1, y, z, role, 'round1')
  board.put(x, y, z + 1, role, 'round1')
  board.put(x + 1, y, z + 1, role, 'round1')
}

function car(ctx) {
  const truck = /\b(truck|pickup|lorry)\b/i.test(ctx.prompt)
  const board = createBoard()
  rect(board, 0, 2, 0, 16, 3, 'chassis')
  rect(board, 2, 1, 0, 12, 1, 'chassis')
  rect(board, 2, 5, 0, 12, 1, 'chassis')
  rect(board, 0, 2, 1, 16, 3, 'body')
  rect(board, 2, 1, 1, 12, 1, 'body')
  rect(board, 2, 5, 1, 12, 1, 'body')
  rect(board, 1, 2, 2, 14, 3, 'body')
  if (truck) {
    rect(board, 7, 1, 2, 7, 5, 'cargo')
    box(board, 7, 1, 3, 5, 7, 5, 'cargo')
    rect(board, 1, 2, 3, 5, 3, 'glass')
    rect(board, 2, 2, 4, 3, 3, 'trim')
  } else {
    rect(board, 6, 2, 3, 6, 3, 'glass')
    rect(board, 7, 2, 4, 4, 3, 'trim')
    rect(board, 12, 2, 3, 2, 3, 'spoiler')
  }
  board.put(0, 1, 2, 'lamp', 'round1')
  board.put(0, 1, 4, 'lamp', 'round1')
  board.put(0, 1, 3, 'grille', 'tile')
  board.put(15, 1, 2, 'tail', 'round1')
  board.put(15, 1, 4, 'tail', 'round1')
  for (const [x, z] of [
    [0, 0],
    [0, 5],
    [14, 0],
    [14, 5],
  ]) {
    wheel(board, x, z, 0, 'tire')
    wheel(board, x, z, 1, 'rim')
  }
  return {
    cells: board.cells,
    summary: truck
      ? 'A microscale pickup. Wheels are stacks of round 1×1 plates, which have studs, so the rim can clutch to the tire. A 2×2 round with an axle hole cannot take that second course.'
      : 'A microscale coupe. The cabin glass is trans plate, not tile, because the roof has to clutch onto it. Tiles have no studs.',
    stages: [
      { name: 'Chassis', from: 0, to: 1, blurb: 'Tires first, then the chassis plates between them, then the rims on the tires.' },
      { name: truck ? 'Cab and bed' : 'Body', from: 2, to: maxY(board), blurb: truck ? 'The bed is a box on the chassis. The cab glass is plate, so the roof locks down.' : 'The windshield is a plate course. Press the roof tiles on last; nothing stacks on a tile.' },
    ],
  }
}

function rocket() {
  const board = createBoard()
  rect(board, 0, 0, 0, 10, 10, 'pad')
  for (const y of [1, 2]) {
    rect(board, 3, 3, y, 4, 4, 'fin')
    rect(board, 2, 4, y, 6, 2, 'fin')
    rect(board, 4, 2, y, 2, 6, 'fin')
  }
  box(board, 3, 3, 3, 10, 4, 4, 'body')
  rect(board, 4, 3, 6, 2, 1, 'glass')
  rect(board, 4, 4, 11, 2, 2, 'nose')
  board.put(4, 12, 4, 'nose', 'round1')
  board.put(5, 12, 5, 'flame', 'round1')
  return {
    cells: board.cells,
    summary: 'A standing rocket. The fins are a plus shape on the pad, two courses tall, so they never cantilever. The body is a constant 4×4, which is the strongest bond you can lay.',
    stages: [
      { name: 'Pad', from: 0, to: 2, blurb: 'The plus is the fins. Both courses are fully on the pad, so the color split does not weaken them.' },
      { name: 'Body', from: 3, to: 10, blurb: 'Stack the 4×4. The window is only a recolor, still a plate, still locked to the course below.' },
      { name: 'Nose', from: 11, to: 12, blurb: 'Step in, then finish with round plates.' },
    ],
  }
}

function shuttle() {
  const board = createBoard()
  rect(board, 0, 0, 0, 16, 12, 'pad')
  rect(board, 2, 4, 1, 12, 4, 'wing')
  rect(board, 3, 4, 2, 10, 4, 'wing')
  box(board, 5, 4, 3, 8, 6, 4, 'body')
  rect(board, 6, 4, 6, 3, 1, 'glass')
  rect(board, 6, 5, 9, 4, 2, 'nose')
  board.put(7, 10, 5, 'light', 'round1')
  board.put(8, 10, 6, 'light', 'round1')
  wheel(board, 5, 5, 3, 'engine')
  wheel(board, 9, 5, 3, 'engine')
  return {
    cells: board.cells,
    summary: 'A lander rather than a winged jet. Wide wings at this scale have to sit on a pad: a plate can only hang past the course below while half its studs stay clutched, and a long wing fails that.',
    stages: [
      { name: 'Wings', from: 0, to: 2, blurb: 'Wings are full courses on the pad. That is the legal way to get the span without a bracket.' },
      { name: 'Fuselage', from: 3, to: 8, blurb: 'Engines are round 1×1 plates in the base of the body, clutched to the wing course.' },
      { name: 'Nose', from: 9, to: 10, blurb: 'Step the nose in and cap it with rounds.' },
    ],
  }
}

function tree(ctx) {
  const board = createBoard()
  rect(board, 0, 0, 0, 16, 16, 'ground')
  box(board, 7, 7, 1, 4, 2, 2, 'trunk')
  rect(board, 7, 6, 5, 2, 4, 'leaf')
  rect(board, 6, 6, 6, 4, 4, 'leaf')
  rect(board, 6, 5, 7, 4, 6, 'leaf')
  rect(board, 5, 5, 8, 6, 6, 'canopy')
  rect(board, 6, 5, 9, 4, 6, 'leaf')
  rect(board, 6, 6, 10, 4, 4, 'leaf2')
  rect(board, 7, 6, 11, 2, 4, 'leaf')
  rect(board, 7, 7, 12, 2, 2, 'leaf2')
  const spots = [
    [6, 10, 6],
    [9, 10, 8],
    [7, 9, 5],
    [8, 11, 7],
  ]
  const extra = ctx.variant % 2 === 1
  for (const [x, y, z] of spots) {
    if (!extra && y === 9) continue
    board.put(x, y, z, 'fruit', 'round1')
  }
  board.put(3, 1, 3, 'flower', 'round1')
  board.put(12, 1, 5, 'flower2', 'round1')
  return {
    cells: board.cells,
    summary: 'The canopy flares one step at a time: 2×2, 2×4, 4×4, 4×6, 6×6. Each of those plates keeps at least half its studs on the course below. Apples are only on the way back in, where every stud is supported.',
    stages: [
      { name: 'Ground', from: 0, to: 0, blurb: 'Leave the trunk footprint clear of flowers so the trunk clutches to grass plates.' },
      { name: 'Trunk', from: 1, to: 4, blurb: 'A 2×2 column. Don\'t substitute a brick unless you want a smooth trunk with no seam to lock the canopy.' },
      { name: 'Canopy', from: 5, to: 12, blurb: 'Follow the flare. A 4×4 dropped straight onto the 2×2 trunk would be held by only a quarter of its studs.' },
    ],
  }
}

function robot() {
  const board = createBoard()
  rect(board, 0, 0, 0, 12, 8, 'stand')
  rect(board, 2, 2, 1, 3, 4, 'shoe')
  rect(board, 7, 2, 1, 3, 4, 'shoe')
  box(board, 2, 3, 2, 3, 2, 2, 'limb')
  box(board, 8, 3, 2, 3, 2, 2, 'limb')
  rect(board, 2, 3, 4, 8, 2, 'body')
  rect(board, 2, 3, 5, 8, 2, 'body')
  rect(board, 2, 2, 6, 8, 4, 'body')
  rect(board, 2, 2, 7, 8, 4, 'body')
  for (const y of [6, 7]) {
    for (const z of [2, 3, 4, 5]) {
      board.put(2, y, z, 'limb')
      board.put(9, y, z, 'limb')
    }
  }
  rect(board, 4, 3, 7, 2, 2, 'chest')
  box(board, 4, 2, 8, 10, 4, 4, 'head')
  board.put(5, 10, 2, 'eye', 'round1')
  board.put(7, 10, 2, 'eye', 'round1')
  box(board, 5, 3, 11, 12, 1, 1, 'antenna')
  board.put(5, 13, 3, 'lamp', 'round1')
  return {
    cells: board.cells,
    summary: 'The hip is one 2×8 bridging the legs, held by half its studs, which is the limit. Arms are the outer columns of the torso recolored, because a real arm stuck on the side would have nothing under it.',
    stages: [
      { name: 'Legs', from: 0, to: 3, blurb: 'Feet, then the two leg columns. Keep the gap between them clear.' },
      { name: 'Torso', from: 4, to: 7, blurb: 'The bridging plate at the hips is the one cantilever. Press the middle down even though it hangs between the legs.' },
      { name: 'Head', from: 8, to: 13, blurb: 'Eyes are round plates on the face. The antenna is a 1×1 column with a round on top.' },
    ],
  }
}

function duck() {
  const board = creature(
    [
      '......####......',
      '.....######.....',
      '....###ee###....',
      '....########bb..',
      '...##########...',
      '..############..',
      '..wwww########..',
      '.wwwwww########.',
      '.##############.',
      'ff############ff',
    ],
    {
      '#': { role: 'body', kind: 'plate' },
      w: { role: 'belly', kind: 'plate' },
      b: { role: 'beak', kind: 'plate' },
      e: EYE,
      f: { role: 'foot', kind: 'plate' },
    },
  )
  return {
    cells: board.cells,
    summary: 'A side-on duck, four studs deep. The silhouette only narrows as it goes up, so every plate has a plate under it. Where the beak sticks out, a column of body color runs down to the feet to hold it.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'The stand is wider than the feet. Build it first.' },
      { name: 'Duck', from: 1, to: maxY(board), blurb: 'Work from the feet up. Eyes are round plates on the outer faces only.' },
    ],
  }
}

function penguin() {
  const board = creature(
    [
      '....#####....',
      '...##eee##...',
      '...#######b..',
      '..#########..',
      '..wwwwwww##..',
      '.wwwwwwwww##.',
      '.wwwwwwwww##.',
      '..#########..',
      '...#######...',
      'ff#########ff',
    ],
    {
      '#': { role: 'body', kind: 'plate' },
      w: { role: 'belly', kind: 'plate' },
      b: { role: 'beak', kind: 'plate' },
      e: EYE,
      f: { role: 'foot', kind: 'plate' },
    },
  )
  return {
    cells: board.cells,
    summary: 'A standing penguin. White belly plates are the same bond as the black back; only the color changes, so the seams can still stagger.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'Feet and stand first.' },
      { name: 'Penguin', from: 1, to: maxY(board), blurb: 'The beak is orange plate. Keep it in the course it is drawn in so the head stays tied to the body.' },
    ],
  }
}

function cat() {
  const board = creature(
    [
      '..#.....#..',
      '..#######..',
      '.###eee###.',
      '.#########.',
      '.####w####.',
      '###########',
      '###########',
      'ff#######ff',
    ],
    {
      '#': { role: 'body', kind: 'plate' },
      w: { role: 'belly', kind: 'plate' },
      e: EYE,
      f: { role: 'foot', kind: 'plate' },
    },
  )
  return {
    cells: board.cells,
    summary: 'A sitting cat. Ears are the top course, narrower than the head, so they clutch. A sideways tail would need a clip; this one stays inside the body width.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'The stand gives the paws something to lock to.' },
      { name: 'Cat', from: 1, to: maxY(board), blurb: 'Stack the body, then the head, then the two ear studs.' },
    ],
  }
}

function dog() {
  const board = creature(
    [
      '....#####....',
      '...##eee##...',
      '...#######b..',
      '..#########..',
      '..#########..',
      '.###########.',
      '.###########.',
      'ff#########ff',
    ],
    {
      '#': { role: 'body', kind: 'plate' },
      b: { role: 'nose', kind: 'plate' },
      e: EYE,
      f: { role: 'foot', kind: 'plate' },
    },
  )
  return {
    cells: board.cells,
    summary: 'A blocky dog in profile. The muzzle is a color change on a course that is already supported, not a plate stuck out in midair.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'Stand first, then the paws.' },
      { name: 'Dog', from: 1, to: maxY(board), blurb: 'Nose and eyes go in as you reach those courses, not after the whole body is done.' },
    ],
  }
}

function ghost() {
  const board = creature(
    [
      '....#####....',
      '..#########..',
      '.###########.',
      '.##e#####e##.',
      '.###########.',
      '.###########.',
      '#############',
    ],
    {
      '#': { role: 'body', kind: 'plate' },
      e: EYE,
    },
    3,
  )
  return {
    cells: board.cells,
    summary: 'A ghost on a stand. The hem is solid so the courses above have something to clutch; a wavy hem with holes would drop the plates over the gaps.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'Even a ghost needs a foundation.' },
      { name: 'Ghost', from: 1, to: maxY(board), blurb: 'Eyes are round plates set into the face course.' },
    ],
  }
}

function cake() {
  const board = createBoard()
  rect(board, 0, 0, 0, 10, 10, 'stand')
  rect(board, 2, 2, 1, 6, 6, 'sponge')
  rect(board, 2, 2, 2, 6, 6, 'filling')
  rect(board, 2, 2, 3, 6, 6, 'sponge')
  rect(board, 2, 2, 4, 6, 6, 'icing')
  for (let i = 0; i < 6; i++) {
    board.put(2 + i, 4, 2, 'drip')
    board.put(2 + i, 4, 7, 'drip')
    board.put(2, 4, 2 + i, 'drip')
    board.put(7, 4, 2 + i, 'drip')
  }
  rect(board, 3, 3, 5, 4, 4, 'icing')
  const candles = [
    [3, 3],
    [6, 3],
    [3, 6],
    [6, 6],
    [4, 4],
  ]
  for (const [x, z] of candles) {
    board.put(x, 6, z, 'candle')
    board.put(x, 7, z, 'flame', 'round1')
  }
  return {
    cells: board.cells,
    summary: 'Square, because a round cake at this size is just a worse bond. Drips are the edge studs of the icing course. Candles are 1×1 plates on the icing, and the flames are rounds, so they are the last parts you place.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'A plate stand, slightly larger than the cake.' },
      { name: 'Sponge', from: 1, to: 4, blurb: 'Alternate the layers. The drip color is only the outer studs.' },
      { name: 'Candles', from: 5, to: 7, blurb: 'Icing plates, then candles. The flames are rounds, so nothing stacks on them.' },
    ],
  }
}

function heart() {
  const board = createBoard()
  paintPlan(board, ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'], 1, 1, 1, { '#': { role: 'body', kind: 'plate' } }, 3)
  groundUnder(board, 'stand', 1)
  return {
    cells: board.cells,
    summary: 'The heart lies in plan and is three courses thick, so every stud has the same stud under it. Standing a heart up makes the lobes cantilever.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'The stand is one stud larger than the heart.' },
      { name: 'Heart', from: 1, to: 3, blurb: 'Three identical courses. Stagger still matters if the packer splits a course into more than one plate.' },
    ],
  }
}

function bridge() {
  const board = createBoard()
  rect(board, 0, 0, 0, 18, 8, 'water')
  box(board, 0, 2, 1, 5, 6, 4, 'stone')
  box(board, 10, 2, 1, 5, 6, 4, 'stone')
  rect(board, 4, 2, 6, 8, 4, 'deck')
  rect(board, 4, 2, 7, 8, 1, 'rail')
  rect(board, 4, 5, 7, 8, 1, 'rail')
  return {
    cells: board.cells,
    summary: 'The deck is one 4×8, eight studs long, with two studs clutched at each abutment. That is exactly half, which is the most span a plate should bridge. The arch is the open course under it.',
    stages: [
      { name: 'Water', from: 0, to: 0, blurb: 'The water course runs under the abutments so they have a full clutch.' },
      { name: 'Abutments', from: 1, to: 5, blurb: 'Build both piers before the deck. The gap between them is the arch.' },
      { name: 'Deck', from: 6, to: 7, blurb: 'One plate spans the gap. Rails sit on the deck, fully supported, on the next course.' },
    ],
  }
}

function boat() {
  const board = createBoard()
  rect(board, 0, 0, 0, 18, 12, 'water')
  rect(board, 3, 3, 1, 12, 6, 'hull')
  rect(board, 4, 4, 2, 10, 4, 'hull')
  rect(board, 5, 5, 3, 8, 2, 'deck')
  box(board, 8, 5, 4, 9, 1, 1, 'mast')
  rect(board, 9, 5, 4, 4, 1, 'sail')
  rect(board, 9, 5, 5, 3, 1, 'sail')
  rect(board, 9, 5, 6, 2, 1, 'sail')
  rect(board, 9, 5, 7, 1, 1, 'sail')
  rect(board, 5, 5, 4, 2, 2, 'cabin')
  rect(board, 5, 5, 5, 2, 2, 'cabin')
  return {
    cells: board.cells,
    summary: 'The hull gets narrower as it rises, so every course is fully held. The sail steps in toward the mast the same way. A sail sticking out beside the mast, with no plate under it, would fall off.',
    stages: [
      { name: 'Water', from: 0, to: 0, blurb: 'Blue plates, larger than the hull.' },
      { name: 'Hull', from: 1, to: 3, blurb: 'Three courses, each one stepped in.' },
      { name: 'Sail', from: 4, to: 9, blurb: 'Mast and sail together. The cabin is the small block at the stern.' },
    ],
  }
}

function flower() {
  const board = createBoard()
  rect(board, 0, 0, 0, 7, 7, 'ground')
  box(board, 3, 3, 1, 6, 1, 1, 'stem')
  rect(board, 3, 2, 3, 1, 2, 'leaf')
  rect(board, 2, 3, 5, 2, 1, 'leaf')
  rect(board, 3, 2, 7, 1, 2, 'petal')
  rect(board, 2, 2, 8, 2, 2, 'petal')
  board.put(2, 9, 2, 'petal', 'round1')
  board.put(3, 9, 2, 'petal2', 'round1')
  board.put(2, 9, 3, 'center', 'round1')
  board.put(3, 9, 3, 'petal', 'round1')
  return {
    cells: board.cells,
    summary: 'Leaves are a 1×2 with one stud on the stem, which is the half-stud limit. The bloom flares the same way, one step per course, and the petals on top are rounds because that course is fully supported.',
    stages: [
      { name: 'Stem', from: 0, to: 6, blurb: 'One leaf per course. Two leaves on the same course, sticking out both ways, would leave the center stud holding a 1×3.' },
      { name: 'Bloom', from: 7, to: 9, blurb: 'A 1×2, then a 2×2, then four round plates. Each step stays half clutched.' },
    ],
  }
}

function mushroom() {
  const board = createBoard()
  rect(board, 0, 0, 0, 10, 10, 'ground')
  box(board, 4, 4, 1, 3, 2, 2, 'stalk')
  rect(board, 4, 4, 4, 2, 2, 'cap')
  rect(board, 4, 3, 5, 2, 4, 'cap')
  rect(board, 3, 3, 6, 4, 4, 'cap')
  rect(board, 3, 3, 7, 4, 4, 'cap')
  for (const [x, z] of [
    [3, 3],
    [6, 4],
    [4, 6],
    [5, 3],
  ]) {
    board.put(x, 7, z, 'spot', 'round1')
  }
  rect(board, 4, 4, 8, 2, 2, 'cap')
  return {
    cells: board.cells,
    summary: 'The cap flares with the same legal steps as the tree, then the white spots are round plates on a course that no longer overhangs.',
    stages: [
      { name: 'Stalk', from: 0, to: 3, blurb: 'A 2×2 stalk on the grass.' },
      { name: 'Cap', from: 4, to: 8, blurb: 'Follow the flare. Spots go on near the top, not on a course that is still stepping out.' },
    ],
  }
}

function sword() {
  const board = createBoard()
  rect(board, 0, 0, 0, 8, 6, 'stand')
  box(board, 3, 2, 1, 4, 2, 2, 'grip')
  rect(board, 2, 2, 5, 4, 2, 'guard')
  box(board, 3, 2, 6, 14, 2, 1, 'blade')
  board.put(3, 15, 2, 'blade', 'round1')
  return {
    cells: board.cells,
    summary: 'The grip is 2×2. The crossguard is a 2×4 on that grip, overhanging one stud each side, which is half its studs. The blade steps back to 2 wide and runs straight up.',
    stages: [
      { name: 'Hilt', from: 0, to: 5, blurb: 'Grip, then the guard. The guard is the only overhang in the build.' },
      { name: 'Blade', from: 6, to: 15, blurb: 'A straight 2×1 column. The tip is a round plate.' },
    ],
  }
}

function train() {
  const board = createBoard()
  rect(board, 0, 2, 0, 20, 4, 'chassis')
  for (const x of [1, 8, 15]) wheel(board, x, 0, 0, 'tire')
  for (const x of [1, 8, 15]) wheel(board, x, 5, 0, 'tire')
  for (const x of [1, 8, 15]) wheel(board, x, 0, 1, 'rim')
  for (const x of [1, 8, 15]) wheel(board, x, 5, 1, 'rim')
  rect(board, 2, 2, 1, 16, 4, 'body')
  rect(board, 2, 2, 2, 16, 4, 'body')
  box(board, 3, 2, 3, 6, 6, 4, 'cab')
  rect(board, 4, 2, 4, 4, 1, 'glass')
  rect(board, 4, 5, 4, 4, 1, 'glass')
  rect(board, 4, 3, 6, 4, 2, 'roof')
  box(board, 12, 3, 3, 5, 1, 2, 'stack')
  board.put(12, 6, 3, 'smoke', 'round1')
  board.put(12, 6, 4, 'smoke', 'round1')
  board.put(16, 2, 3, 'lamp', 'round1')
  return {
    cells: board.cells,
    summary: 'Three axles of round 1×1 wheels, a cab, and a stack. The lamp is a round on the boiler face. Glass is plate because the roof sits on the cab.',
    stages: [
      { name: 'Wheels', from: 0, to: 1, blurb: 'Six wheel clusters. Rims on the second course.' },
      { name: 'Boiler', from: 2, to: 2, blurb: 'The body runs between the wheels.' },
      { name: 'Cab', from: 3, to: 6, blurb: 'Cab, roof, then the stack and its smoke rounds.' },
    ],
  }
}

function windmill() {
  const board = createBoard()
  rect(board, 0, 0, 0, 12, 12, 'ground')
  box(board, 4, 4, 1, 9, 4, 4, 'wall')
  box(board, 5, 4, 1, 4, 2, 1, 'door')
  rect(board, 4, 4, 10, 4, 4, 'cap')
  rect(board, 4, 4, 11, 4, 4, 'cap')
  rect(board, 2, 5, 12, 8, 2, 'sail')
  return {
    cells: board.cells,
    summary: 'The sails are one 2×8 on an even course, so the packer keeps them as a single plate. One stud hangs past the cap on each side, and the middle six studs are clutched. A vertical pair would need a clip: plates only lock upward.',
    stages: [
      { name: 'Tower', from: 0, to: 9, blurb: 'A 4×4 tower with a door on the face.' },
      { name: 'Cap', from: 10, to: 11, blurb: 'Two cap courses so the sail course lands on an even number and stays one plate.' },
      { name: 'Sails', from: 12, to: 12, blurb: 'Press the 2×8 across the cap. The ends hang by one stud. That is the whole sail; the other axis wants a clip or a bracket.' },
    ],
  }
}

function mountain() {
  const board = createBoard()
  const sizes = [16, 14, 12, 10, 8, 6, 4, 2]
  const roles = ['ground', 'ground', 'slope', 'slope', 'rock', 'rock', 'snow', 'snow']
  sizes.forEach((size, index) => {
    const inset = (16 - size) / 2
    rect(board, inset, inset, index, size, size, roles[index])
  })
  board.put(7, 8, 7, 'snow', 'round1')
  board.put(8, 8, 8, 'flag', 'round1')
  return {
    cells: board.cells,
    summary: 'Each course steps in by one stud on every side, so the peak never overhangs. Snow is just the top colors. A round plate finishes the summit.',
    stages: [
      { name: 'Foothills', from: 0, to: 3, blurb: 'Wide courses. Use the biggest plates the bond allows.' },
      { name: 'Peak', from: 4, to: 8, blurb: 'Keep stepping in. The last two rounds are the summit.' },
    ],
  }
}

function tower() {
  const board = createBoard()
  rect(board, 0, 0, 0, 10, 10, 'plaza')
  for (let y = 1; y <= 16; y++) {
    const floor = y % 4 === 0
    rect(board, 1, 1, y, 8, 8, floor ? 'floor' : 'glass')
    if (!floor) {
      for (let i = 0; i < 8; i++) {
        board.put(1 + i, y, 1, 'frame')
        board.put(1 + i, y, 8, 'frame')
        board.put(1, y, 1 + i, 'frame')
        board.put(8, y, 1 + i, 'frame')
      }
    }
  }
  rect(board, 2, 2, 17, 6, 6, 'roof')
  rect(board, 3, 3, 18, 4, 4, 'roof')
  box(board, 4, 4, 19, 21, 1, 1, 'antenna')
  board.put(4, 22, 4, 'light', 'round1')
  return {
    cells: board.cells,
    summary: 'A curtain-wall tower. Glass is trans plate, not tile, because twenty courses have to clutch. Every fourth course is a solid floor plate, which is what actually stiffens a tall model.',
    stages: [
      { name: 'Plaza', from: 0, to: 0, blurb: 'The plaza is wider than the tower.' },
      { name: 'Shaft', from: 1, to: 16, blurb: 'Frame, glass, and a solid gray course every four. Those floor courses are the diaphragms.' },
      { name: 'Roof', from: 17, to: 22, blurb: 'Step the roof in and run the antenna up as a 1×1.' },
    ],
  }
}

function mug() {
  const board = createBoard()
  rect(board, 0, 0, 0, 11, 9, 'stand')
  box(board, 2, 1, 1, 5, 6, 6, 'body')
  rect(board, 8, 3, 1, 1, 2, 'body')
  box(board, 8, 3, 2, 4, 1, 2, 'body')
  rect(board, 2, 1, 6, 6, 6, 'body')
  rect(board, 3, 2, 6, 4, 4, 'coffee', 'tile')
  return {
    cells: board.cells,
    summary: 'The handle is its own column with a foot on the stand, touching the cup. Plates don\'t clutch sideways, so the handle cannot just stick out of the wall; it has to stand on something.',
    stages: [
      { name: 'Stand', from: 0, to: 1, blurb: 'Include the little foot where the handle will rise.' },
      { name: 'Cup', from: 2, to: 5, blurb: 'Cup and handle rise together so they stay aligned.' },
      { name: 'Coffee', from: 6, to: 6, blurb: 'Rim plates, then coffee tiles in the middle. Stop there; tiles don\'t take another course.' },
    ],
  }
}

function star() {
  const board = createBoard()
  paintPlan(
    board,
    ['...#...', '..###..', '#######', '.#####.', '.#...#.'],
    1,
    1,
    1,
    { '#': { role: 'body', kind: 'plate' } },
    2,
  )
  groundUnder(board, 'stand', 1)
  return {
    cells: board.cells,
    summary: 'A star in plan, two courses thick. The points are held because the whole shape sits on the stand, not because a point can float.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'Build the stand larger than the star.' },
      { name: 'Star', from: 1, to: 2, blurb: 'Two identical courses. Gold reads best against a dark stand.' },
    ],
  }
}

function fish() {
  const board = createBoard()
  paintPlan(
    board,
    ['.....##....', '..#######..', '.####e####.', '..#######..', '....###....', '......#....'],
    1,
    1,
    1,
    {
      '#': { role: 'body', kind: 'plate' },
      e: { role: 'eye', kind: 'round1' },
    },
    2,
  )
  groundUnder(board, 'water', 1)
  return {
    cells: board.cells,
    summary: 'The fish is a plate mosaic standing two courses off the water. An upright fish with a tail fin out to the side would be a cantilever.',
    stages: [
      { name: 'Water', from: 0, to: 0, blurb: 'A blue slab under the fish.' },
      { name: 'Fish', from: 1, to: 2, blurb: 'Both courses match. The eye is a round plate.' },
    ],
  }
}

function guitar() {
  const board = createBoard()
  paintPlan(
    board,
    [
      '....###....',
      '...#####...',
      '...##e##...',
      '....###....',
      '.....#.....',
      '.....#.....',
      '.....#.....',
      '....###....',
    ],
    1,
    1,
    1,
    {
      '#': { role: 'body', kind: 'plate' },
      e: { role: 'hole', kind: 'round1' },
    },
    2,
  )
  groundUnder(board, 'stand', 1)
  return {
    cells: board.cells,
    summary: 'A guitar on its back, two courses thick, so the neck does not have to span open air. The sound hole is a round plate.',
    stages: [
      { name: 'Stand', from: 0, to: 0, blurb: 'Stand first.' },
      { name: 'Guitar', from: 1, to: 2, blurb: 'Body, neck, and headstock are the same two courses.' },
    ],
  }
}

const GLYPHS = {
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....'],
  G: ['.####', '#....', '#..##', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  I: ['..#..', '..#..', '..#..', '..#..', '..#..'],
  J: ['..###', '....#', '....#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
  Q: ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  Z: ['#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '.###.'],
  2: ['.###.', '....#', '..##.', '.#...', '#####'],
  3: ['.###.', '....#', '..##.', '....#', '.###.'],
  4: ['#...#', '#...#', '#####', '....#', '....#'],
  5: ['#####', '#....', '####.', '....#', '####.'],
  6: ['.###.', '#....', '####.', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..'],
  8: ['.###.', '#...#', '.###.', '#...#', '.###.'],
  9: ['.###.', '#...#', '.####', '....#', '.###.'],
}

function spell(ctx) {
  const raw = (ctx.word || ctx.prompt || 'HI').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
  const text = raw.trim().replace(/\s+/g, ' ').slice(0, 12) || 'HI'
  const board = createBoard()
  let cursor = 0
  const placed = []
  for (const ch of text) {
    if (ch === ' ') {
      cursor += 2
      continue
    }
    const glyph = GLYPHS[ch]
    if (!glyph) continue
    placed.push({ glyph, x: cursor })
    cursor += 6
  }
  const width = Math.max(cursor - 1, 5)
  rect(board, -1, -1, 0, width + 2, 7, 'base')
  for (const letter of placed) {
    letter.glyph.forEach((row, z) => {
      ;[...row].forEach((ch, x) => {
        if (ch !== '#') return
        board.put(letter.x + x, 1, z, 'ink')
        board.put(letter.x + x, 2, z, 'ink')
      })
    })
  }
  return {
    cells: board.cells,
    summary: `The word "${text.trim()}" as a two-course mosaic. Letters like T and Y overhang when they stand upright; flat on a base, every stud is held. Twelve characters is the limit here.`,
    stages: [
      { name: 'Base', from: 0, to: 0, blurb: 'A dark base, one stud of margin around the word.' },
      { name: 'Letters', from: 1, to: 2, blurb: 'Two identical courses. Read the word from above.' },
    ],
  }
}

function generic(ctx) {
  const form = ctx.variant % 3
  const board = createBoard()
  if (form === 1) {
    rect(board, 0, 0, 0, 10, 10, 'base')
    rect(board, 1, 1, 1, 8, 8, 'base')
    box(board, 3, 3, 2, 12, 4, 4, 'main')
    rect(board, 4, 4, 13, 2, 2, 'main')
    board.put(4, 14, 4, 'accent', 'round1')
    return {
      cells: board.cells,
      summary: 'No stock plan matched that prompt, so this is an original obelisk in the colors of the words you used. Every course still clutches.',
      stages: [
        { name: 'Base', from: 0, to: 1, blurb: 'Two base courses, stepped in.' },
        { name: 'Shaft', from: 2, to: 14, blurb: 'A 4×4 shaft, then a cap and a round plate.' },
      ],
    }
  }
  if (form === 2) {
    rect(board, 0, 0, 0, 12, 12, 'base')
    box(board, 5, 5, 1, 2, 2, 2, 'main')
    rect(board, 5, 4, 3, 2, 4, 'main')
    rect(board, 4, 4, 4, 4, 4, 'accent')
    rect(board, 4, 3, 5, 4, 6, 'main')
    rect(board, 3, 3, 6, 6, 6, 'accent')
    rect(board, 4, 4, 7, 4, 4, 'main')
    rect(board, 5, 5, 8, 2, 2, 'accent')
    board.put(5, 9, 5, 'accent', 'round1')
    return {
      cells: board.cells,
      summary: 'No stock plan matched that prompt, so this is an original. The middle flares the legal way, one step per course, then steps back in.',
      stages: [
        { name: 'Base', from: 0, to: 2, blurb: 'Pedestal first.' },
        { name: 'Form', from: 3, to: 9, blurb: 'Out, then in. Don\'t skip a course; each one is the clutch for the next.' },
      ],
    }
  }
  const sizes = [12, 10, 8, 6, 4, 2]
  sizes.forEach((size, index) => {
    const inset = (12 - size) / 2
    rect(board, inset, inset, index, size, size, index === 0 ? 'base' : index > 3 ? 'accent' : 'main')
  })
  board.put(5, 6, 5, 'accent', 'round1')
  return {
    cells: board.cells,
    summary: 'No stock plan matched that prompt, so this is a stepped pyramid in the colors you named. Another take switches the form.',
    stages: [
      { name: 'Pyramid', from: 0, to: 6, blurb: 'Each course steps in one stud. The top is a round plate.' },
    ],
  }
}

const LEAF = (variant) => {
  const sets = [
    { leaf: 'green', leaf2: 'dark-green', canopy: 'bright-green' },
    { leaf: 'dark-green', leaf2: 'green', canopy: 'lime' },
    { leaf: 'bright-green', leaf2: 'lime', canopy: 'dark-green' },
  ]
  return sets[variant % sets.length]
}

const BUILDERS = [
  {
    id: 'lighthouse',
    title: 'Striped lighthouse',
    score: 6,
    main: 'stripe',
    test: (text) => /\blighthouse\b|\blight house\b/i.test(text),
    palette: () => ({
      rock: 'dark-bluish-gray',
      rock2: 'dark-tan',
      stripe: 'white',
      stripe2: 'red',
      door: 'reddish-brown',
      rail: 'dark-bluish-gray',
      lamp: 'black',
      light: 'yellow',
      roof: 'black',
      knob: 'pearl-gold',
    }),
    build: lighthouse,
  },
  {
    id: 'cottage',
    title: 'Seaside cottage',
    score: 4,
    main: 'wall',
    test: (text) => /\b(cottage|cabin|bungalow|chalet|house|home|barn)\b/i.test(text),
    palette: (variant, prompt) => {
      if (/\bbarn\b/i.test(prompt)) {
        return {
          ground: 'green',
          path: 'dark-tan',
          wall: 'red',
          trim: 'white',
          door: 'reddish-brown',
          glass: 'trans-light-blue',
          roof: 'white',
          chimney: 'dark-bluish-gray',
          knob: 'pearl-gold',
          flower: 'yellow',
          flower2: 'bright-pink',
          trunk: 'reddish-brown',
          ...LEAF(variant),
        }
      }
      const walls = ['tan', 'white', 'light-bluish-gray', 'yellow', 'medium-nougat']
      const roofs = ['red', 'dark-red', 'blue', 'dark-green', 'dark-bluish-gray']
      return {
        ground: 'green',
        path: 'dark-tan',
        wall: walls[variant % walls.length],
        trim: 'white',
        door: 'reddish-brown',
        glass: 'trans-light-blue',
        roof: roofs[variant % roofs.length],
        chimney: 'dark-bluish-gray',
        knob: 'yellow',
        flower: 'bright-pink',
        flower2: 'yellow',
        trunk: 'reddish-brown',
        ...LEAF(variant),
      }
    },
    build: cottage,
  },
  {
    id: 'castle',
    title: 'Castle gatehouse',
    score: 5,
    main: 'wall',
    test: (text) => /\b(castle|gatehouse|fortress|citadel|keep)\b/i.test(text),
    palette: (variant) => {
      const walls = ['light-bluish-gray', 'dark-bluish-gray', 'tan', 'dark-tan']
      return {
        ground: 'dark-green',
        wall: walls[variant % walls.length],
        battlement: 'dark-bluish-gray',
        door: 'reddish-brown',
        knob: 'pearl-gold',
        slit: 'black',
        flag: 'blue',
        roof: 'dark-red',
      }
    },
    build: castle,
  },
  {
    id: 'ship',
    title: 'Orbital shuttle',
    score: 5,
    main: 'body',
    test: (text) => /\b(shuttle|spaceship|space ship|spacecraft|rocket|missile|lander)\b/i.test(text),
    palette: (variant) => ({
      pad: 'dark-bluish-gray',
      wing: variant % 2 ? 'dark-azure' : 'blue',
      body: 'white',
      fin: 'dark-bluish-gray',
      glass: 'trans-light-blue',
      nose: 'white',
      light: 'red',
      flame: 'orange',
      engine: 'orange',
    }),
    build: (ctx) => (/\brocket\b|\bmissile\b/i.test(ctx.prompt) ? rocket() : shuttle()),
  },
  {
    id: 'car',
    title: 'Red coupe',
    score: 4,
    main: 'body',
    test: (text) => /\b(car|coupe|sedan|truck|pickup|lorry|automobile|jeep)\b/i.test(text),
    palette: (variant, prompt) => ({
      body: /\btruck|pickup|lorry\b/i.test(prompt) ? 'blue' : 'red',
      chassis: 'dark-bluish-gray',
      tire: 'black',
      rim: 'light-bluish-gray',
      glass: 'trans-light-blue',
      trim: 'white',
      lamp: 'yellow',
      tail: 'red',
      grille: 'black',
      spoiler: 'black',
      cargo: variant % 2 ? 'light-bluish-gray' : 'white',
    }),
    build: car,
  },
  {
    id: 'train',
    title: 'Steam train',
    score: 5,
    main: 'body',
    test: (text) => /\b(train|locomotive|steam engine)\b/i.test(text),
    palette: () => ({
      chassis: 'black',
      tire: 'black',
      rim: 'dark-bluish-gray',
      body: 'red',
      cab: 'black',
      glass: 'trans-light-blue',
      roof: 'dark-bluish-gray',
      stack: 'black',
      smoke: 'light-bluish-gray',
      lamp: 'yellow',
    }),
    build: train,
  },
  {
    id: 'tree',
    title: 'Old oak',
    score: 4,
    main: 'leaf',
    test: (text) => /\b(tree|oak|pine|canopy)\b/i.test(text),
    palette: (variant) => ({
      ground: 'green',
      trunk: 'reddish-brown',
      fruit: 'red',
      flower: 'bright-pink',
      flower2: 'yellow',
      ...LEAF(variant),
    }),
    build: tree,
  },
  {
    id: 'robot',
    title: 'Little robot',
    score: 4,
    main: 'body',
    test: (text) => /\b(robot|droid|mech|android)\b/i.test(text),
    palette: (variant) => ({
      stand: 'dark-bluish-gray',
      shoe: 'black',
      limb: 'dark-bluish-gray',
      body: ['light-bluish-gray', 'white', 'blue', 'yellow'][variant % 4],
      chest: 'red',
      head: 'white',
      eye: 'black',
      antenna: 'black',
      lamp: 'red',
    }),
    build: robot,
  },
]

const SIMPLE = [
  {
    id: 'duck',
    title: 'Garden duck',
    score: 4,
    main: 'body',
    test: (text) => /\bduck\b/i.test(text),
    palette: () => ({ body: 'yellow', belly: 'white', beak: 'orange', eye: 'black', foot: 'orange', stand: 'green' }),
    build: duck,
  },
  {
    id: 'penguin',
    title: 'Penguin',
    score: 4,
    main: 'body',
    test: (text) => /\bpenguin\b/i.test(text),
    palette: () => ({ body: 'black', belly: 'white', beak: 'orange', eye: 'black', foot: 'orange', stand: 'white' }),
    build: penguin,
  },
  {
    id: 'cat',
    title: 'Sitting cat',
    score: 4,
    main: 'body',
    test: (text) => /\b(cat|kitten)\b/i.test(text),
    palette: (variant) => ({
      body: ['dark-bluish-gray', 'orange', 'black', 'white'][variant % 4],
      belly: 'white',
      eye: 'black',
      foot: 'black',
      stand: 'green',
    }),
    build: cat,
  },
  {
    id: 'dog',
    title: 'Dog',
    score: 4,
    main: 'body',
    test: (text) => /\b(dog|puppy)\b/i.test(text),
    palette: (variant) => ({
      body: ['tan', 'reddish-brown', 'black', 'white'][variant % 4],
      nose: 'black',
      eye: 'black',
      foot: 'dark-brown',
      stand: 'green',
    }),
    build: dog,
  },
  {
    id: 'ghost',
    title: 'Ghost',
    score: 4,
    main: 'body',
    test: (text) => /\bghost\b/i.test(text),
    palette: () => ({ body: 'white', eye: 'black', stand: 'dark-bluish-gray' }),
    build: ghost,
  },
  {
    id: 'cake',
    title: 'Birthday cake',
    score: 4,
    main: 'sponge',
    test: (text) => /\b(cake|birthday)\b/i.test(text),
    palette: (variant) => ({
      stand: 'white',
      sponge: ['bright-light-yellow', 'nougat', 'tan'][variant % 3],
      filling: ['bright-pink', 'red', 'medium-azure'][variant % 3],
      icing: 'white',
      drip: 'bright-pink',
      candle: 'white',
      flame: 'orange',
    }),
    build: cake,
  },
  {
    id: 'heart',
    title: 'Heart',
    score: 4,
    main: 'body',
    test: (text) => /\bheart\b/i.test(text),
    palette: () => ({ body: 'red', stand: 'white' }),
    build: heart,
  },
  {
    id: 'bridge',
    title: 'Stone bridge',
    score: 4,
    main: 'stone',
    test: (text) => /\b(bridge|viaduct)\b/i.test(text),
    palette: () => ({ water: 'blue', stone: 'dark-bluish-gray', deck: 'dark-tan', rail: 'dark-bluish-gray' }),
    build: bridge,
  },
  {
    id: 'boat',
    title: 'Sailboat',
    score: 4,
    main: 'hull',
    test: (text) => /\b(boat|sailboat|yacht|ship|dinghy)\b/i.test(text) && !/space/i.test(text),
    palette: () => ({ water: 'blue', hull: 'white', deck: 'tan', mast: 'reddish-brown', sail: 'white', cabin: 'red' }),
    build: boat,
  },
  {
    id: 'flower',
    title: 'Flower',
    score: 3,
    main: 'petal',
    test: (text) => /\b(flower|tulip|daisy|bloom)\b/i.test(text),
    palette: (variant) => ({
      ground: 'green',
      stem: 'green',
      leaf: 'bright-green',
      petal: ['red', 'bright-pink', 'yellow', 'blue'][variant % 4],
      petal2: 'white',
      center: 'yellow',
    }),
    build: flower,
  },
  {
    id: 'mushroom',
    title: 'Mushroom',
    score: 4,
    main: 'cap',
    test: (text) => /\bmushroom\b/i.test(text),
    palette: () => ({ ground: 'green', stalk: 'light-nougat', cap: 'red', spot: 'white' }),
    build: mushroom,
  },
  {
    id: 'sword',
    title: 'Sword',
    score: 4,
    main: 'blade',
    test: (text) => /\b(sword|blade|dagger)\b/i.test(text),
    palette: () => ({ stand: 'dark-bluish-gray', grip: 'reddish-brown', guard: 'pearl-gold', blade: 'light-bluish-gray' }),
    build: sword,
  },
  {
    id: 'windmill',
    title: 'Windmill',
    score: 4,
    main: 'wall',
    test: (text) => /\bwindmill\b/i.test(text),
    palette: () => ({ ground: 'green', wall: 'tan', door: 'reddish-brown', cap: 'dark-red', sail: 'white' }),
    build: windmill,
  },
  {
    id: 'mountain',
    title: 'Mountain',
    score: 4,
    main: 'rock',
    test: (text) => /\b(mountain|volcano|peak)\b/i.test(text),
    palette: () => ({
      ground: 'green',
      slope: 'sand-green',
      rock: 'dark-bluish-gray',
      snow: 'white',
      flag: 'red',
    }),
    build: mountain,
  },
  {
    id: 'tower',
    title: 'Glass tower',
    score: 4,
    main: 'glass',
    test: (text) => /\b(skyscraper|high-?rise|office tower|tower block|glass tower)\b/i.test(text) || (/\btower\b/i.test(text) && !/light/i.test(text) && !/clock/i.test(text)),
    palette: () => ({
      plaza: 'dark-bluish-gray',
      floor: 'light-bluish-gray',
      glass: 'trans-light-blue',
      frame: 'light-bluish-gray',
      roof: 'dark-bluish-gray',
      antenna: 'black',
      light: 'red',
    }),
    build: tower,
  },
  {
    id: 'mug',
    title: 'Coffee mug',
    score: 4,
    main: 'body',
    test: (text) => /\b(mug|coffee|cup of coffee)\b/i.test(text),
    palette: (variant) => ({
      stand: 'dark-bluish-gray',
      body: ['white', 'red', 'blue', 'tan'][variant % 4],
      coffee: 'reddish-brown',
    }),
    build: mug,
  },
  {
    id: 'star',
    title: 'Star',
    score: 3,
    main: 'body',
    test: (text) => /\bstar\b/i.test(text),
    palette: () => ({ body: 'pearl-gold', stand: 'dark-blue' }),
    build: star,
  },
  {
    id: 'fish',
    title: 'Fish',
    score: 4,
    main: 'body',
    test: (text) => /\bfish\b/i.test(text),
    palette: (variant) => ({
      body: ['orange', 'yellow', 'blue', 'bright-pink'][variant % 4],
      eye: 'black',
      water: 'blue',
    }),
    build: fish,
  },
  {
    id: 'guitar',
    title: 'Guitar',
    score: 4,
    main: 'body',
    test: (text) => /\bguitar\b/i.test(text),
    palette: () => ({ body: 'red', hole: 'black', stand: 'dark-bluish-gray' }),
    build: guitar,
  },
]

const wordBuilder = {
  id: 'word',
  title: 'Lettering',
  main: 'ink',
  palette: () => ({ base: 'dark-bluish-gray', ink: 'red' }),
  build: spell,
}

const genericBuilder = {
  id: 'generic',
  title: 'Original study',
  main: 'main',
  palette: (variant) => {
    const mains = ['blue', 'red', 'yellow', 'green', 'medium-azure', 'dark-purple', 'orange']
    const accents = ['pearl-gold', 'white', 'yellow', 'bright-pink']
    return {
      base: 'dark-bluish-gray',
      main: mains[variant % mains.length],
      accent: accents[variant % accents.length],
    }
  },
  build: generic,
}

function extractWord(text) {
  const quoted = text.match(/["“']([A-Za-z0-9 ]{1,14})["”']/)
  if (quoted) return { explicit: quoted[1] }
  const named = text.match(/\b(?:word|letters?|name|text)\b[:\s-]+["']?([A-Za-z0-9 ]{1,14})/i)
  if (named) return { explicit: named[1] }
  if (/^[A-Za-z0-9 ]{1,12}$/.test(text)) return { fallback: text }
  return {}
}

export function draftFromPrompt(prompt, variant = 0) {
  const text = (prompt || '').trim()
  const word = extractWord(text)
  let builder = null
  if (word.explicit) builder = wordBuilder
  else {
    let best = 0
    for (const candidate of [...BUILDERS, ...SIMPLE]) {
      const score = candidate.test(text) ? candidate.score : 0
      if (score > best) {
        best = score
        builder = candidate
      }
    }
    if (!builder && word.fallback) builder = wordBuilder
    if (!builder) builder = genericBuilder
  }
  const palette = applyLanguage(builder.palette(variant, text), text, builder.main)
  const built = builder.build({
    prompt: text,
    variant,
    rng: mulberry32(hashString(`${text}:${variant}`)),
    word: word.explicit || word.fallback || '',
  })
  return {
    cells: built.cells,
    stages: built.stages,
    summary: built.summary,
    palette,
    main: builder.main,
    name: titleFrom(text, builder.title),
    prompt: text,
  }
}
