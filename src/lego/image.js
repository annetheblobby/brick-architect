import { COLORS, OPAQUE } from './palette.js'

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

export function draftFromPixels(data, width, height, options = {}) {
  const studs = Math.max(8, Math.min(48, options.studs || 32))
  const mode = options.mode === 'mosaic' ? 'mosaic' : 'relief'
  const ditherOn = options.dither !== false && mode === 'mosaic'
  const cols = studs
  const rows = Math.max(8, Math.round((studs * height) / width))
  const samples = sample(data, width, height, cols, rows)
  const quantized = ditherOn
    ? dither(samples, cols, rows)
    : samples.map((sample) => (sample ? nearest(sample[0], sample[1], sample[2]).color : null))

  const present = samples.map((sample, i) => (sample ? nearest(sample[0], sample[1], sample[2]) : null))
  const corners = [present[0], present[cols - 1], present[(rows - 1) * cols], present[rows * cols - 1]].filter(Boolean)
  let background = null
  if (corners.length === 4 && mode === 'relief') {
    const agree = corners.every((corner) => labDist(corner.lab, corners[0].lab) < 18 ** 2)
    if (agree) background = corners[0]
  }

  const cells = new Map()
  const put = (x, y, z, color) => {
    const name = keyOf(color)
    cells.set(`${x}|${y}|${z}`, { x, y, z, color: name, kind: 'plate', direct: true })
  }

  const frame = COLORS.black
  const W = cols + 2
  const D = rows + 2
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) put(x, 0, z, frame)
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
    if (background && present[i].dist < 16 ** 2 && labDist(present[i].lab, background.lab) < 18 ** 2) return 0
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
