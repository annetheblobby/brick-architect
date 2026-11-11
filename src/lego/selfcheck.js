import { designFromPixels, designFromPrompt } from './design.js'
import { packModel } from './pack.js'

const prompts = [
  'Seaside cottage',
  'Castle gate',
  'Red coupe',
  'An orbital shuttle',
  'A striped lighthouse',
  'Old oak',
  'Garden duck',
  'Birthday cake',
  'Stone bridge',
  'Little robot',
  'A red barn',
  'A blue pickup truck',
  'A rocket',
  'A tree house',
  'A blue cottage with a black roof',
  'HELLO',
  'a mysterious quartz violin',
  'A sailboat',
  'A steam train',
  'A penguin',
  'A cat',
  'A dog',
  'A ghost',
  'A heart',
  'A flower',
  'A mushroom',
  'A sword',
  'A windmill',
  'A mountain',
  'A clock tower',
  'A mug',
  'A star',
  'A fish',
  'A guitar',
  'word HI',
]

function clutch(model) {
  const surface = new Map()
  for (const course of model.courses) {
    for (const piece of course.pieces) {
      for (let dz = 0; dz < piece.d; dz++) {
        for (let dx = 0; dx < piece.w; dx++) {
          const key = `${piece.x + dx}|${piece.z + dz}`
          const prev = surface.get(key)
          if (
            prev &&
            prev.plateY === course.plateY - 1 &&
            (prev.kind === 'tile' || prev.kind === 'round2' || prev.kind === 'glass')
          ) {
            throw new Error(
              `${model.name} course ${course.plateY}: ${piece.kind} sits on ${prev.kind} at ${key}`,
            )
          }
          surface.set(key, { kind: piece.kind, plateY: course.plateY })
        }
      }
    }
  }
}

function check(model, label) {
  if (!model.courses.length) throw new Error(`${label}: no courses`)
  if (model.stats.minSupport < 0.5 - 1e-9) {
    const weak = model.courses.filter((course) => course.minSupport < 0.5)
    const detail = weak
      .map((course) => `y${course.plateY}=${course.minSupport.toFixed(2)}`)
      .join(', ')
    throw new Error(`${label}: minSupport ${model.stats.minSupport} (${detail})`)
  }
  if (model.weakCourses) throw new Error(`${label}: weakCourses ${model.weakCourses}`)
  const studs = model.bill.reduce((sum, line) => sum + line.qty * line.studs, 0)
  if (studs !== model.stats.studs) throw new Error(`${label}: bill studs ${studs} != ${model.stats.studs}`)
  let expect = 0
  for (const course of model.courses) {
    if (!course.pieces.length) throw new Error(`${label}: empty course ${course.plateY}`)
    if (course.plateY !== expect) throw new Error(`${label}: gap before course ${course.plateY}`)
    expect += 1
  }
  clutch(model)
  const bond = Math.round(model.stats.bond * 100)
  console.log(
    `${label.padEnd(36)} ${model.name.slice(0, 22).padEnd(22)} parts ${String(model.stats.parts).padStart(4)}  courses ${String(model.stats.courses).padStart(2)}  bond ${String(bond).padStart(3)}%  hold ${model.stats.minSupport.toFixed(2)}  $${model.stats.dollars.toFixed(2)}`,
  )
}

let failed = 0
for (const prompt of prompts) {
  try {
    check(designFromPrompt(prompt, 0), prompt)
  } catch (error) {
    failed += 1
    console.error('FAIL', prompt, error.message)
  }
}

for (const [prompt, variant] of [
  ['Seaside cottage', 1],
  ['Old oak', 1],
  ['Birthday cake', 2],
]) {
  try {
    check(designFromPrompt(prompt, variant), `${prompt} v${variant}`)
  } catch (error) {
    failed += 1
    console.error('FAIL', prompt, variant, error.message)
  }
}

try {
  const cottage = designFromPrompt('A blue cottage with a black roof', 0)
  const blue = cottage.bill.some((line) => /blue/i.test(line.colorName))
  const black = cottage.bill.some((line) => line.colorName === 'Black')
  if (!blue || !black) throw new Error(`color language missed blue=${blue} black=${black}`)
  console.log('color language ok')
} catch (error) {
  failed += 1
  console.error('FAIL color', error.message)
}

function picture() {
  const width = 32
  const height = 32
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inside = (x - 16) ** 2 + (y - 16) ** 2 < 100
      data[i] = inside ? 200 : 236
      data[i + 1] = inside ? 40 : 236
      data[i + 2] = inside ? 36 : 236
      data[i + 3] = 255
    }
  }
  return data
}

try {
  const data = picture()
  check(designFromPixels(data, 32, 32, { studs: 16, mode: 'mosaic', name: 'Red dot' }), 'mosaic')
  check(designFromPixels(data, 32, 32, { studs: 16, mode: 'relief', name: 'Red dot' }), 'relief')
} catch (error) {
  failed += 1
  console.error('FAIL image', error.message)
}

try {
  const cells = []
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 8; x++) cells.push({ x, y, z: 0, color: 'red', kind: 'plate' })
  }
  const packed = packModel(cells)
  const odd = packed.courses[1]
  const widths = odd.pieces.map((piece) => piece.w).sort((a, b) => a - b)
  if (odd.pieces[0].x !== 0 || widths[0] !== 2) {
    throw new Error(`odd course did not step: ${JSON.stringify(odd.pieces)}`)
  }
  console.log('running bond ok', packed.courses.map((course) => course.stagger.toFixed(2)).join(' '))
} catch (error) {
  failed += 1
  console.error('FAIL bond', error.message)
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all checks passed')
