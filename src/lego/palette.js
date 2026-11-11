/** BrickLink color IDs. Hex values are for the viewport; the id is what an order uses. */
export const COLORS = {
  white: { id: 1, name: 'White', hex: '#F4F4F4' },
  tan: { id: 2, name: 'Tan', hex: '#E4CD9E' },
  yellow: { id: 3, name: 'Yellow', hex: '#F2CD37' },
  orange: { id: 4, name: 'Orange', hex: '#FE8A18' },
  red: { id: 5, name: 'Red', hex: '#C91A09' },
  green: { id: 6, name: 'Green', hex: '#237841' },
  blue: { id: 7, name: 'Blue', hex: '#0055BF' },
  'light-bluish-gray': { id: 86, name: 'Light Bluish Gray', hex: '#A0A5A9' },
  'dark-bluish-gray': { id: 85, name: 'Dark Bluish Gray', hex: '#6C6E68' },
  black: { id: 11, name: 'Black', hex: '#1C2830' },
  'dark-red': { id: 59, name: 'Dark Red', hex: '#720E0F' },
  'reddish-brown': { id: 88, name: 'Reddish Brown', hex: '#582A12' },
  'dark-tan': { id: 69, name: 'Dark Tan', hex: '#958A73' },
  'dark-green': { id: 80, name: 'Dark Green', hex: '#184632' },
  lime: { id: 34, name: 'Lime', hex: '#BBE90B' },
  'bright-green': { id: 36, name: 'Bright Green', hex: '#4B9F4A' },
  'medium-azure': { id: 156, name: 'Medium Azure', hex: '#36AEBF' },
  'bright-light-blue': { id: 105, name: 'Bright Light Blue', hex: '#9FC3E9' },
  'dark-blue': { id: 63, name: 'Dark Blue', hex: '#0A3463' },
  'dark-azure': { id: 153, name: 'Dark Azure', hex: '#078BC9' },
  'bright-pink': { id: 104, name: 'Bright Pink', hex: '#E4ADC8' },
  'dark-pink': { id: 47, name: 'Dark Pink', hex: '#C870A0' },
  magenta: { id: 71, name: 'Magenta', hex: '#923978' },
  'dark-purple': { id: 89, name: 'Dark Purple', hex: '#3F3691' },
  'medium-nougat': { id: 150, name: 'Medium Nougat', hex: '#AA7D55' },
  nougat: { id: 28, name: 'Nougat', hex: '#D09168' },
  'light-nougat': { id: 90, name: 'Light Nougat', hex: '#F6D7B3' },
  'bright-light-orange': { id: 110, name: 'Bright Light Orange', hex: '#F8BB3D' },
  'bright-light-yellow': { id: 103, name: 'Bright Light Yellow', hex: '#FFF03A' },
  'sand-green': { id: 48, name: 'Sand Green', hex: '#A0BCAC' },
  'dark-turquoise': { id: 39, name: 'Dark Turquoise', hex: '#008F9B' },
  'dark-brown': { id: 120, name: 'Dark Brown', hex: '#352100' },
  'pearl-gold': { id: 115, name: 'Pearl Gold', hex: '#AA7F2E' },
  'trans-clear': { id: 12, name: 'Trans-Clear', hex: '#C5D5DE', alpha: 0.42 },
  'trans-light-blue': { id: 15, name: 'Trans-Light Blue', hex: '#9ED6F0', alpha: 0.48 },
}

function srgbToLin(c) {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function labOf(hex) {
  const n = parseInt(hex.slice(1), 16)
  const R = srgbToLin((n >> 16) & 255)
  const G = srgbToLin((n >> 8) & 255)
  const B = srgbToLin(n & 255)
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722)
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

for (const color of Object.values(COLORS)) {
  const [L, A, B] = labOf(color.hex)
  color.L = L
  color.A = A
  color.B = B
}

export const OPAQUE = Object.values(COLORS).filter((c) => !c.alpha)

export function colorByKey(key) {
  const color = COLORS[key]
  if (!color) throw new Error(`Unknown color "${key}"`)
  return color
}

const WORDS = [
  ['light bluish gray', 'light-bluish-gray'],
  ['dark bluish gray', 'dark-bluish-gray'],
  ['reddish brown', 'reddish-brown'],
  ['dark red', 'dark-red'],
  ['dark green', 'dark-green'],
  ['dark blue', 'dark-blue'],
  ['bright pink', 'bright-pink'],
  ['light blue', 'bright-light-blue'],
  ['gold', 'pearl-gold'],
  ['pink', 'bright-pink'],
  ['purple', 'dark-purple'],
  ['brown', 'reddish-brown'],
  ['tan', 'tan'],
  ['grey', 'light-bluish-gray'],
  ['gray', 'light-bluish-gray'],
  ['black', 'black'],
  ['white', 'white'],
  ['red', 'red'],
  ['blue', 'blue'],
  ['yellow', 'yellow'],
  ['green', 'green'],
  ['orange', 'orange'],
  ['lime', 'lime'],
  ['azure', 'medium-azure'],
  ['teal', 'dark-turquoise'],
]

/**
 * "blue cottage with a black roof" recolors the main mass and the roof.
 * A bare color word recolors the builder's main role.
 */
export function applyLanguage(palette, prompt, mainRole) {
  const next = { ...palette }
  const text = prompt.toLowerCase()
  const hits = []
  for (const [phrase, id] of WORDS) {
    const re = new RegExp(`\\b${phrase}\\b`, 'g')
    let match
    while ((match = re.exec(text))) {
      hits.push({ index: match.index, end: match.index + phrase.length, id, len: phrase.length })
    }
  }
  hits.sort((a, b) => b.len - a.len || a.index - b.index)
  const claimed = []
  for (const hit of hits) {
    if (claimed.some((c) => hit.index < c.end && hit.end > c.index)) continue
    claimed.push(hit)
  }
  claimed.sort((a, b) => a.index - b.index)
  const loose = []
  const named = new Set()
  for (const hit of claimed) {
    const window = text.slice(Math.max(0, hit.index - 18), Math.min(text.length, hit.end + 18))
    let role = null
    if (/\broofs?\b/.test(window)) role = 'roof'
    else if (/\bwalls?\b/.test(window)) role = 'wall'
    else if (/\bdoors?\b/.test(window)) role = 'door'
    else if (/\btrims?\b/.test(window)) role = 'trim'
    else if (/\bgrass\b|\blawn\b/.test(window)) role = 'ground'
    else if (/\bwater\b/.test(window)) role = 'water'
    else if (/\bsails?\b/.test(window)) role = 'sail'
    if (role && role in next) {
      next[role] = hit.id
      named.add(role)
    } else loose.push(hit.id)
  }
  if (loose[0] && mainRole && mainRole in next) next[mainRole] = loose[0]
  if (loose[1] && 'roof' in next && !named.has('roof')) next.roof = loose[1]
  return next
}
