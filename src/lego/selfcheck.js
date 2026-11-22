import { chimneyColumns, hasRole, houseSitsInTree } from './craft.js'
import { courseFile, modelFromCourse } from './library.js'
import { compile, designFromPixels, designFromPrompt, designFromTechnique } from './design.js'
import { addCourse, insertCourse, placePiece, removePiece } from './edit.js'
import { fillSource, objectFromModel } from './promptmesh.js'
import { bakeModel } from './voxelize.js'
import { confidentPick, rankTechniques } from './model.js'
import { packModel } from './pack.js'
import { draftFromPrompt } from './sculpt.js'

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

function disc() {
  const width = 48
  const height = 64
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const body = (x - 24) ** 2 / 16 ** 2 + (y - 36) ** 2 / 22 ** 2 < 1
      const ear = (x - 16) ** 2 + (y - 12) ** 2 < 36 || (x - 32) ** 2 + (y - 12) ** 2 < 36
      const on = body || ear
      data[i] = on ? 176 : 244
      data[i + 1] = on ? 112 : 244
      data[i + 2] = on ? 64 : 244
      data[i + 3] = 255
    }
  }
  return data
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
  const solid = designFromPixels(disc(), 48, 64, { studs: 24, mode: 'solid', name: 'Disc' })
  check(solid, 'solid')
  if (solid.stats.courses < 8 || solid.stats.depth < 4) {
    throw new Error(`solid stayed flat: courses ${solid.stats.courses} depth ${solid.stats.depth}`)
  }
  console.log(`solid disc ${solid.stats.width}×${solid.stats.depth}×${solid.stats.courses}`)
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

const fixtures = [
  ['A tree house', 'treehouse'],
  ['cabin in the canopy', 'treehouse'],
  ['A clock tower', 'clocktower'],
  ['a tower with a clock', 'clocktower'],
  ['a cottage by an oak', 'cottage'],
  ['A blue cottage with a black roof', 'cottage'],
  ['red barn with two chimneys', 'cottage'],
  ['barn with three chimneys', 'cottage'],
  ['a mysterious quartz violin', 'generic'],
  ['Seaside cottage', 'cottage'],
  ['Old oak', 'tree'],
]

for (const [prompt, id] of fixtures) {
  try {
    const ranked = rankTechniques(prompt)
    const top = confidentPick(ranked)
    if (!top || top.id !== id) {
      const raw = ranked[0]
      throw new Error(`model ${raw ? `${raw.id} ${raw.p.toFixed(2)}` : 'untrained'} !== ${id}`)
    }
    const draft = draftFromPrompt(prompt, 0)
    if (draft.technique !== id) throw new Error(`draft technique ${draft.technique} !== ${id}`)
    if (id === 'treehouse' && !houseSitsInTree(draft.cells)) throw new Error('house is not in the tree')
    if (id === 'clocktower' && !hasRole(draft.cells, 'clock')) throw new Error('no clock face')
    if (prompt === 'a cottage by an oak' && !hasRole(draft.cells, 'trunk')) throw new Error('yard tree missing')
    if (prompt.startsWith('red barn with two') && chimneyColumns(draft.cells) !== 2) {
      throw new Error(`chimneys ${chimneyColumns(draft.cells)}`)
    }
    if (prompt.startsWith('barn with three') && chimneyColumns(draft.cells) !== 3) {
      throw new Error(`chimneys ${chimneyColumns(draft.cells)}`)
    }
    if (id === 'cottage' && prompt.includes('black roof') && draft.palette.roof !== 'black') {
      throw new Error(`roof ${draft.palette.roof}`)
    }
    if (id === 'cottage' && prompt.includes('blue cottage') && draft.palette.wall !== 'blue') {
      throw new Error(`wall ${draft.palette.wall}`)
    }
    check(designFromPrompt(prompt, 0), `craft ${prompt}`)
  } catch (error) {
    failed += 1
    console.error('FAIL craft', prompt, error.message)
  }
}

for (const [id, prompt] of [
  ['treehouse', 'tree house with two chimneys'],
  ['clocktower', 'clock tower'],
]) {
  try {
    check(designFromTechnique(id, prompt, 0), `technique ${id}`)
    const draft = draftFromPrompt(prompt, 0)
    if (id === 'treehouse' && chimneyColumns(draft.cells) !== 2) {
      throw new Error(`treehouse chimneys ${chimneyColumns(draft.cells)}`)
    }
  } catch (error) {
    failed += 1
    console.error('FAIL technique', id, error.message)
  }
}

try {
  const cells = new Map()
  for (let x = 0; x < 4; x++) cells.set(`${x}|0|0`, { x, y: 0, z: 0, color: 'red', kind: 'plate', direct: true })
  const base = compile(cells, { name: 'Pad', prompt: 'pad', summary: 'A pad.' })
  const placed = placePiece(base, 0, { x: 6, z: 0, w: 2, d: 4, color: 'blue' })
  const piece = placed.courses[0].pieces.find((item) => item.x === 6 && item.z === 0)
  if (!piece || piece.w !== 2 || piece.d !== 4 || piece.color !== 'blue') {
    throw new Error('placed plate was repacked or dropped')
  }
  if (placed.shiftX !== base.shiftX || placed.shiftZ !== base.shiftZ) throw new Error('edit moved the grid')
  if (placed.courses[0].pieces[0].wx !== base.courses[0].pieces[0].wx) {
    throw new Error('edit shifted an existing plate')
  }
  if (placePiece(placed, 0, { x: 6, z: 1, w: 1, d: 1, color: 'white' }) !== placed) {
    throw new Error('overlapping plate was placed')
  }
  check(placed, 'custom place')
  const index = placed.courses[0].pieces.findIndex((item) => item.x === 6)
  const removed = removePiece(placed, 0, index)
  if (removed.stats.parts !== base.stats.parts) throw new Error('remove did not restore the part count')
  const lone = new Map([['0|0|0', { x: 0, y: 0, z: 0, color: 'red', kind: 'plate', direct: true }]])
  const only = compile(lone, { name: 'Stud', prompt: 'stud', summary: 'One stud.' })
  if (only.stats.parts !== 1) throw new Error('expected one plate')
  if (removePiece(only, 0, 0) !== only) throw new Error('removed the last plate')
  const grown = addCourse(base)
  if (grown.courses.length !== 2 || grown.courses[1].pieces.length !== 0 || grown.courses[1].plateY !== 1) {
    throw new Error('add layer failed')
  }
  if (addCourse(grown) !== grown) throw new Error('added a layer above an empty course')
  if (insertCourse(grown, 1) !== grown) throw new Error('inserted a layer above an empty course')
  const stacked = placePiece(grown, 1, { x: 0, z: 0, w: 2, d: 2, color: 'yellow' })
  const cap = stacked.courses[1].pieces[0]
  if (!cap || cap.w !== 2 || cap.d !== 2 || cap.plateY !== 1) throw new Error('layer plate missing')
  check(stacked, 'custom layer')
  const opened = insertCourse(stacked, 0)
  if (opened.courses.length !== 3 || opened.courses[1].pieces.length !== 0 || opened.courses[1].plateY !== 1) {
    throw new Error('insert layer failed')
  }
  if (opened.courses[2].plateY !== 2 || opened.courses[2].pieces[0].color !== 'yellow') {
    throw new Error('insert layer did not keep the course above')
  }
  const lifted = opened.courses[2].pieces[0]
  const original = stacked.courses[1].pieces[0]
  if (lifted.wx !== original.wx || Math.abs(lifted.wy - (original.wy + 0.4)) > 1e-6) {
    throw new Error('insert layer did not lift the course above')
  }
  console.log('custom edit ok')
} catch (error) {
  failed += 1
  console.error('FAIL edit', error.message)
}

try {
  const cube = `v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 2 3
f 1 3 4
f 5 8 7
f 5 7 6
f 1 5 6
f 1 6 2
f 2 6 7
f 2 7 3
f 3 7 8
f 3 8 4
f 5 1 4
f 5 4 8
`
  const root = objectFromModel('cube.obj', cube)
  const source = bakeModel(root)
  const model = fillSource(source, 24, { name: 'Cube', prompt: 'cube.obj' })
  if (model.origin !== 'file') throw new Error('dropped model origin')
  if (!model.stats.parts || !model.courses.length) throw new Error('dropped model filled nothing')
  console.log('dropped model ok', model.stats.parts)
} catch (error) {
  failed += 1
  console.error('FAIL dropped model', error.message)
}

try {
  const cells = new Map()
  for (let x = 0; x < 4; x++) cells.set(`${x}|0|0`, { x, y: 0, z: 0, color: 'red', kind: 'plate', direct: true })
  const base = compile(cells, { name: 'Pad', prompt: 'pad', summary: 'A pad.' })
  const edited = placePiece(base, 0, { x: 6, z: 0, w: 2, d: 4, color: 'blue' })
  const file = courseFile(edited, { 0: ['Seat the red plates'] })
  const opened = modelFromCourse(file)
  if (opened.model.origin !== 'library') throw new Error('saved build origin')
  if (opened.model.stats.parts !== edited.stats.parts) throw new Error('saved build dropped a plate')
  const blue = opened.model.courses[0].pieces.find((piece) => piece.color === 'blue')
  if (!blue || blue.x !== 6 || blue.w !== 2 || blue.d !== 4) throw new Error('saved plate did not come back')
  if (opened.notes[0]?.[0] !== 'Seat the red plates') throw new Error('saved note did not come back')
  let rejected = false
  try {
    modelFromCourse({ format: 'nope' })
  } catch (error) {
    rejected = /not a saved build/.test(error.message)
  }
  if (!rejected) throw new Error('a plain file was accepted as a build')
  console.log('save ok')
} catch (error) {
  failed += 1
  console.error('FAIL save', error.message)
}

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all checks passed')
