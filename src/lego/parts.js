/**
 * Plates, tiles, and rounds that actually exist in the BrickLink catalog.
 * Prices are planning estimates for a common color in new condition, not a live quote.
 * Grams follow BrickLink shipping weights.
 */

const PLATE_DIMS = [
  [1, 1, '3024', 0.04, 0.2],
  [1, 2, '3023', 0.05, 0.32],
  [1, 3, '3623', 0.06, 0.45],
  [1, 4, '3710', 0.07, 0.71],
  [1, 6, '3666', 0.1, 1.06],
  [1, 8, '3460', 0.13, 1.48],
  [2, 2, '3022', 0.07, 0.6],
  [2, 3, '3021', 0.09, 0.9],
  [2, 4, '3020', 0.11, 1.2],
  [2, 6, '3795', 0.16, 1.78],
  [2, 8, '3034', 0.2, 2.27],
  [4, 4, '3031', 0.22, 2.4],
  [4, 6, '3032', 0.3, 3.5],
  [4, 8, '3035', 0.4, 4.7],
  [6, 6, '3958', 0.42, 4.71],
  [6, 8, '3036', 0.55, 6.3],
]

const TILE_DIMS = [
  [1, 1, '3070', 0.05, 0.16],
  [1, 2, '3069', 0.06, 0.26],
  [1, 3, '63864', 0.08, 0.4],
  [1, 4, '2431', 0.09, 0.55],
  [1, 6, '6636', 0.12, 0.85],
  [1, 8, '4162', 0.16, 1.15],
  [2, 2, '3068', 0.08, 0.45],
  [2, 3, '26603', 0.11, 0.68],
  [2, 4, '87079', 0.14, 0.9],
  [2, 6, '69729', 0.2, 1.35],
  [4, 4, '1751', 0.28, 1.9],
]

const GLASS_DIMS = [
  [1, 1, '3070', 0.08, 0.16],
  [1, 2, '3069', 0.09, 0.26],
  [1, 3, '63864', 0.11, 0.4],
  [1, 4, '2431', 0.12, 0.55],
  [1, 6, '6636', 0.16, 0.85],
  [2, 2, '3068', 0.12, 0.45],
  [2, 4, '87079', 0.18, 0.9],
]

const BRICKS = [
  [1, 1, '3005', 'Brick 1 x 1'],
  [1, 2, '3004', 'Brick 1 x 2'],
  [1, 3, '3622', 'Brick 1 x 3'],
  [1, 4, '3010', 'Brick 1 x 4'],
  [1, 6, '3009', 'Brick 1 x 6'],
  [1, 8, '3008', 'Brick 1 x 8'],
  [2, 2, '3003', 'Brick 2 x 2'],
  [2, 3, '3002', 'Brick 2 x 3'],
  [2, 4, '3001', 'Brick 2 x 4'],
  [2, 6, '2456', 'Brick 2 x 6'],
  [2, 8, '3007', 'Brick 2 x 8'],
]

function family(dims, label) {
  const bySize = new Map()
  const legal = new Set()
  for (const [a, b, number, price, grams] of dims) {
    const name = `${label} ${a} x ${b}`
    const part = { number, name, price, grams, studs: a * b, w: a, d: b }
    bySize.set(`${a}x${b}`, part)
    legal.add(`${a}x${b}`)
    legal.add(`${b}x${a}`)
    if (a !== b) {
      bySize.set(`${b}x${a}`, { ...part, w: b, d: a })
    }
  }
  return { bySize, legal, dims }
}

const FAMILIES = {
  plate: family(PLATE_DIMS, 'Plate'),
  tile: family(TILE_DIMS, 'Tile'),
  glass: family(GLASS_DIMS, 'Tile'),
  round1: {
    bySize: new Map([
      ['1x1', { number: '4073', name: 'Plate, Round 1 x 1', price: 0.06, grams: 0.12, studs: 1, w: 1, d: 1 }],
    ]),
    legal: new Set(['1x1']),
  },
  round2: {
    bySize: new Map([
      ['2x2', { number: '4032', name: 'Plate, Round 2 x 2', price: 0.1, grams: 0.37, studs: 4, w: 2, d: 2 }],
    ]),
    legal: new Set(['2x2']),
  },
}

export function partFor(kind, w, d) {
  const familyKey = kind === 'glass' ? 'glass' : kind
  const found = FAMILIES[familyKey]?.bySize.get(`${w}x${d}`)
  if (!found) return null
  return found
}

export function isLegal(kind, w, d) {
  const familyKey = kind === 'glass' ? 'glass' : kind
  return FAMILIES[familyKey]?.legal.has(`${w}x${d}`) ?? false
}

export function lengthsFor(kind) {
  const familyKey = kind === 'glass' ? 'glass' : kind
  const set = new Set()
  const dims = familyKey === 'plate' ? PLATE_DIMS : familyKey === 'tile' ? TILE_DIMS : GLASS_DIMS
  if (familyKey === 'round1' || familyKey === 'round2') return [1]
  for (const [a, b] of dims) {
    if (a === 1) set.add(b)
    if (b === 1) set.add(a)
  }
  return [...set].sort((a, b) => b - a)
}

export function legalDepths(w, kind) {
  const familyKey = kind === 'glass' ? 'glass' : kind
  const dims = familyKey === 'plate' ? PLATE_DIMS : familyKey === 'tile' ? TILE_DIMS : familyKey === 'glass' ? GLASS_DIMS : []
  const set = new Set([1])
  for (const [a, b] of dims) {
    if (a === w) set.add(b)
    if (b === w) set.add(a)
  }
  return [...set].sort((a, b) => b - a)
}

export function brickFor(w, d) {
  const a = Math.min(w, d)
  const b = Math.max(w, d)
  const found = BRICKS.find((item) => item[0] === a && item[1] === b)
  if (!found) return null
  return { number: found[2], name: found[3], w: a, d: b }
}
