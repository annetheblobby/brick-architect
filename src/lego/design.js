import { coverageOf, packModel, staggerAgainst, supportRatio } from './pack.js'
import { reviewBuild } from './review.js'
import { brickFor, partFor } from './parts.js'
import { colorByKey } from './palette.js'
import { PLATE, PLATE_MM, STUD_H_MM, STUD_MM } from './scale.js'
import { draftFromPixels } from './image.js'
import { draftFromPrompt, realize } from './sculpt.js'

let sequence = 1

function footprint(course) {
  const set = new Set()
  for (const piece of course.pieces) {
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) set.add(`${piece.x + dx}|${piece.z + dz}`)
    }
  }
  return set
}

function changeLabel(course, prev) {
  if (!prev) return 'Foundation'
  const here = footprint(course)
  const under = footprint(prev)
  let added = 0
  let removed = 0
  for (const key of here) if (!under.has(key)) added++
  for (const key of under) if (!here.has(key)) removed++
  if (!added && !removed) return 'Stacks straight'
  if (added && !removed) return 'Steps out'
  if (removed && !added) return 'Steps in'
  return 'Shifts'
}

function dominant(pieces) {
  const counts = new Map()
  for (const piece of pieces) {
    const key = `${piece.colorName} ${piece.part.name}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
}

function braceSide(course) {
  const planted = new Set()
  for (const piece of course.pieces) {
    if (piece.mount === 'side') continue
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) planted.add(`${piece.x + dx}|${piece.z + dz}`)
    }
  }
  for (const piece of course.pieces) {
    if (piece.mount !== 'side') continue
    let held = false
    for (let dz = 0; dz < piece.d && !held; dz++) {
      for (let dx = 0; dx < piece.w && !held; dx++) {
        const x = piece.x + dx
        const z = piece.z + dz
        held = planted.has(`${x + 1}|${z}`) || planted.has(`${x - 1}|${z}`) || planted.has(`${x}|${z + 1}`) || planted.has(`${x}|${z - 1}`)
      }
    }
    if (held) piece.support = Math.max(piece.support || 0, 1)
  }
  if (course.pieces.length) course.minSupport = Math.min(...course.pieces.map((piece) => piece.support ?? 1))
}

function sectionFor(plateY, stages) {
  return stages.find((stage) => plateY >= stage.from && plateY <= stage.to) || null
}

function describe(course, prev, stage, stageStart) {
  if (!course.pieces.length) {
    return {
      title: 'Empty layer',
      name: 'This layer is open. Place a plate to start it.',
      notes: ['Click the layer to set a plate. Remove lifts a plate off this layer.'],
      section: course.section || 'Custom',
    }
  }
  const top = dominant(course.pieces)
  const notes = []
  if (stageStart && stage?.blurb) notes.push(stage.blurb)
  if (course.index === 0 && !notes.length) {
    notes.push('This course is the foundation. Seat the largest plates first so the rest of the build stays square.')
  }
  if (course.index > 0 && course.minSupport < 0.999) {
    notes.push('A plate on this course hangs past the one below. Half its studs stay clutched, which is as far as a plate should reach without a bracket.')
  }
  if (course.minSupport < 0.5) {
    notes.push('A plate here is held by less than half its studs. That joint will drop. Rebuild it with a smaller step-out.')
  }
  if (prev && course.pieces.length > 1 && prev.pieces.length > 1 && course.seamCount > 0) {
    const pct = Math.round(course.stagger * 100)
    if (course.stagger >= 0.55) {
      notes.push(`Seams are offset from the course below (${pct}% staggered), so this layer locks the one under it.`)
    } else if (course.stagger < 0.35) {
      notes.push(`Seams line up more than they should (${pct}% staggered). Build the plates as drawn so you don't lengthen that crack.`)
    }
  }
  if (course.pieces.length >= 12) {
    notes.push('Lay the largest plates first, then pinch the small ones against them so they don\'t skate.')
  }
  const sentence =
    course.pieces.length === 1
      ? `Lay the ${course.pieces[0].colorName} ${course.pieces[0].part.name}.`
      : `Lay ${course.pieces.length} parts, mostly ${top[1]}× ${top[0]}.`
  return {
    title: stageStart && stage ? stage.name : changeLabel(course, prev),
    name: sentence,
    notes: notes.slice(0, 3),
    section: stage?.name || 'Build',
  }
}

function findSwaps(courses) {
  const used = new Set()
  const swaps = new Map()
  for (let i = 0; i + 2 < courses.length; i++) {
    const layers = [courses[i], courses[i + 1], courses[i + 2]]
    if (layers[1].plateY !== layers[0].plateY + 1 || layers[2].plateY !== layers[0].plateY + 2) continue
    const indexes = layers.map((course) => {
      const map = new Map()
      for (const piece of course.pieces) map.set(`${piece.x}|${piece.z}|${piece.w}|${piece.d}`, piece)
      return map
    })
    for (const [key, piece] of indexes[0]) {
      if (piece.kind !== 'plate') continue
      if (used.has(`${i}|${key}`)) continue
      const mid = indexes[1].get(key)
      const top = indexes[2].get(key)
      if (!mid || !top) continue
      if (mid.kind !== 'plate' || top.kind !== 'plate') continue
      if (mid.color !== piece.color || top.color !== piece.color) continue
      const brick = brickFor(piece.w, piece.d)
      if (!brick) continue
      used.add(`${i}|${key}`)
      used.add(`${i + 1}|${key}`)
      used.add(`${i + 2}|${key}`)
      const id = `${brick.number}|${piece.colorId}`
      const row = swaps.get(id) || {
        number: brick.number,
        name: brick.name,
        colorName: piece.colorName,
        colorId: piece.colorId,
        hex: piece.hex,
        qty: 0,
      }
      row.qty += 1
      swaps.set(id, row)
    }
  }
  return [...swaps.values()].sort((a, b) => b.qty - a.qty)
}

export function compile(cellMap, meta) {
  const list = []
  for (const cell of cellMap.values()) {
    const colorKey = cell.direct ? cell.color : meta.palette[cell.role] || meta.palette[meta.main] || 'tan'
    list.push({
      x: cell.x,
      y: cell.y,
      z: cell.z,
      color: colorKey,
      kind: cell.kind || 'plate',
      deep: Boolean(cell.deep),
    })
  }
  if (!list.length) throw new Error('That one came out empty. Try a more specific prompt.')

  const packed = packModel(list)
  const minY = packed.courses[0].y
  const stages = (meta.stages || [{ name: 'Build', from: 0, to: 999, blurb: '' }]).map((stage) => ({
    ...stage,
    from: stage.from - minY,
    to: stage.to - minY,
  }))

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const courses = packed.courses.map((course, index) => {
    const plateY = course.y - minY
    const pieces = course.pieces.map((piece) => {
      const color = colorByKey(piece.color)
      const part = partFor(piece.kind, piece.w, piece.d)
      if (!part) throw new Error(`No part for ${piece.kind} ${piece.w}×${piece.d}`)
      minX = Math.min(minX, piece.x)
      maxX = Math.max(maxX, piece.x + piece.w - 1)
      minZ = Math.min(minZ, piece.z)
      maxZ = Math.max(maxZ, piece.z + piece.d - 1)
      return {
        ...piece,
        y: plateY,
        plateY,
        course: index,
        part,
        hex: color.hex,
        alpha: color.alpha ?? 1,
        colorName: color.name,
        colorId: color.id,
      }
    })
    return { ...course, y: plateY, plateY, index, pieces }
  })

  const shiftX = -(minX + maxX) / 2
  const shiftZ = -(minZ + maxZ) / 2
  for (const course of courses) {
    for (const piece of course.pieces) {
      piece.wx = piece.x + shiftX + (piece.w - 1) / 2
      piece.wz = piece.z + shiftZ + (piece.d - 1) / 2
      piece.wy = piece.mount === 'side' ? piece.plateY * PLATE + 0.5 : piece.plateY * PLATE + PLATE / 2
    }
    braceSide(course)
  }

  let prev = null
  let seenSection = new Set()
  for (const course of courses) {
    const stage = sectionFor(course.plateY, stages)
    const start = stage ? !seenSection.has(stage.name) : false
    if (stage) seenSection.add(stage.name)
    Object.assign(course, describe(course, prev, stage, start))
    if (course.pieces.some((piece) => piece.mount === 'side')) {
      course.notes.push('A thin part here is a tile turned on its side, so it stays one stud tall instead of a stack of plates.')
    }
    prev = course
  }

  const review = reviewBuild(courses)
  for (const warning of review.warnings) {
    const course = courses[warning.course]
    if (course && !course.notes.includes(warning.text)) course.notes.push(warning.text)
  }

  const billMap = new Map()
  for (const course of courses) {
    for (const piece of course.pieces) {
      const key = `${piece.part.number}|${piece.colorId}`
      const row = billMap.get(key) || {
        number: piece.part.number,
        name: piece.part.name,
        price: piece.part.price,
        grams: piece.part.grams,
        studs: piece.part.studs,
        color: piece.color,
        colorId: piece.colorId,
        colorName: piece.colorName,
        hex: piece.hex,
        kind: piece.kind,
        qty: 0,
      }
      row.qty += 1
      billMap.set(key, row)
    }
  }
  const bill = [...billMap.values()].sort(
    (a, b) => b.qty - a.qty || b.studs - a.studs || a.colorName.localeCompare(b.colorName),
  )
  const studs = bill.reduce((sum, line) => sum + line.qty * line.studs, 0)
  const grams = bill.reduce((sum, line) => sum + line.qty * line.grams, 0)
  const dollars = Math.round(bill.reduce((sum, line) => sum + line.qty * line.price, 0) * 100) / 100
  const top = courses[courses.length - 1]
  const hasStud = top.pieces.some((piece) => piece.kind === 'plate' || piece.kind === 'round1')
  const heightMm = (top.plateY + 1) * PLATE_MM + (hasStud ? STUD_H_MM : 0)
  let seams = 0
  let stacked = 0
  for (const course of courses) {
    seams += course.seamCount
    stacked += course.stackedSeams
  }

  const sections = []
  for (const course of courses) {
    if (!sections.find((section) => section.name === course.section)) {
      const stage = stages.find((item) => item.name === course.section)
      sections.push({ name: course.section, blurb: stage?.blurb || '' })
    }
  }

  return {
    id: sequence++,
    name: meta.name,
    prompt: meta.prompt || '',
    summary: meta.summary || '',
    technique: meta.technique || '',
    shiftX,
    shiftZ,
    courses,
    sections,
    bill,
    swaps: findSwaps(courses),
    stats: {
      parts: bill.reduce((sum, line) => sum + line.qty, 0),
      lots: bill.length,
      studs,
      grams: Math.round(grams),
      dollars,
      courses: courses.length,
      width: maxX - minX + 1,
      depth: maxZ - minZ + 1,
      bond: seams === 0 ? 1 : 1 - stacked / seams,
      minSupport: courses.length ? Math.min(...courses.map((course) => course.minSupport)) : 1,
      mm: {
        w: (maxX - minX + 1) * STUD_MM,
        d: (maxZ - minZ + 1) * STUD_MM,
        h: heightMm,
      },
    },
    heightUnits: (top.plateY + 1) * PLATE,
    weakCourses: courses.filter((course) => course.minSupport < 0.5).length,
    review,
  }
}

/** An empty custom build: one open layer and no plates. */
export function blankModel() {
  return {
    id: sequence++,
    name: 'Manual build',
    prompt: '',
    summary: 'An empty build. Place plates on the grid.',
    technique: '',
    origin: 'manual',
    grid: null,
    spec: null,
    sentence: '',
    tweaks: [],
    shiftX: 0,
    shiftZ: 0,
    sections: [{ name: 'Custom', blurb: '' }],
    courses: [
      {
        y: 0,
        plateY: 0,
        index: 0,
        section: 'Custom',
        pieces: [],
        stagger: 1,
        seamCount: 0,
        stackedSeams: 0,
        minSupport: 1,
        title: 'Empty layer',
        name: 'This layer is open. Place a plate to start it.',
        notes: ['Click the layer to set a plate. Remove lifts a plate off this layer.'],
      },
    ],
    bill: [],
    swaps: [],
    stats: {
      parts: 0,
      lots: 0,
      studs: 0,
      grams: 0,
      dollars: 0,
      courses: 1,
      width: 0,
      depth: 0,
      bond: 1,
      minSupport: 1,
      mm: { w: 0, d: 0, h: PLATE_MM },
    },
    heightUnits: PLATE,
    weakCourses: 0,
  }
}

/**
 * Rebuild bills, clutch, and course copy after a custom edit.
 * The grid origin stays put so plates already on the build don't jump.
 */
export function retouch(model, drafts) {
  const shiftX = model.shiftX
  const shiftZ = model.shiftZ
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const courses = drafts.map((draft, index) => {
    const plateY = draft.plateY
    const pieces = draft.pieces.map((piece) => {
      const color = colorByKey(piece.color)
      const part = partFor(piece.kind, piece.w, piece.d)
      if (!part) throw new Error(`No part for ${piece.kind} ${piece.w}×${piece.d}`)
      minX = Math.min(minX, piece.x)
      maxX = Math.max(maxX, piece.x + piece.w - 1)
      minZ = Math.min(minZ, piece.z)
      maxZ = Math.max(maxZ, piece.z + piece.d - 1)
      return {
        x: piece.x,
        y: plateY,
        z: piece.z,
        w: piece.w,
        d: piece.d,
        color: piece.color,
        kind: piece.kind,
        plateY,
        course: index,
        part,
        hex: color.hex,
        alpha: color.alpha ?? 1,
        colorName: color.name,
        colorId: color.id,
        wx: piece.x + shiftX + (piece.w - 1) / 2,
        wz: piece.z + shiftZ + (piece.d - 1) / 2,
        wy: piece.mount === 'side' ? plateY * PLATE + 0.5 : plateY * PLATE + PLATE / 2,
        mount: piece.mount || '',
        axis: piece.axis || '',
      }
    })
    return {
      y: plateY,
      plateY,
      index,
      section: draft.section || 'Custom',
      pieces,
    }
  })
  if (minX === Infinity) throw new Error('A build needs at least one plate.')

  let below = null
  let belowPieces = null
  let prevY = null
  for (const course of courses) {
    const gap = prevY != null && course.plateY !== prevY + 1
    const supportBelow = prevY == null || gap ? null : below
    for (const piece of course.pieces) piece.support = supportBelow ? supportRatio(piece, supportBelow) : 1
    const bond = staggerAgainst(course.pieces, gap ? null : belowPieces)
    course.stagger = bond.score
    course.seamCount = bond.seams
    course.stackedSeams = bond.stacked
    course.minSupport = course.pieces.length ? Math.min(...course.pieces.map((piece) => piece.support)) : 1
    braceSide(course)
    below = coverageOf(course.pieces)
    belowPieces = course.pieces
    prevY = course.plateY
  }

  let prev = null
  for (const course of courses) {
    const text = describe(course, prev, null, false)
    course.title = text.title
    course.name = text.name
    course.notes = text.notes
    if (course.pieces.some((piece) => piece.mount === 'side')) {
      course.notes.push('A thin part here is a tile turned on its side, so it stays one stud tall instead of a stack of plates.')
    }
    prev = course
  }
  const review = reviewBuild(courses)
  for (const warning of review.warnings) {
    const course = courses[warning.course]
    if (course && !course.notes.includes(warning.text)) course.notes.push(warning.text)
  }

  const billMap = new Map()
  for (const course of courses) {
    for (const piece of course.pieces) {
      const key = `${piece.part.number}|${piece.colorId}`
      const row = billMap.get(key) || {
        number: piece.part.number,
        name: piece.part.name,
        price: piece.part.price,
        grams: piece.part.grams,
        studs: piece.part.studs,
        color: piece.color,
        colorId: piece.colorId,
        colorName: piece.colorName,
        hex: piece.hex,
        kind: piece.kind,
        qty: 0,
      }
      row.qty += 1
      billMap.set(key, row)
    }
  }
  const bill = [...billMap.values()].sort(
    (a, b) => b.qty - a.qty || b.studs - a.studs || a.colorName.localeCompare(b.colorName),
  )
  const studs = bill.reduce((sum, line) => sum + line.qty * line.studs, 0)
  const grams = bill.reduce((sum, line) => sum + line.qty * line.grams, 0)
  const dollars = Math.round(bill.reduce((sum, line) => sum + line.qty * line.price, 0) * 100) / 100
  const top = courses[courses.length - 1]
  const hasStud = top.pieces.some((piece) => piece.kind === 'plate' || piece.kind === 'round1')
  const heightMm = (top.plateY + 1) * PLATE_MM + (hasStud ? STUD_H_MM : 0)
  let seams = 0
  let stacked = 0
  for (const course of courses) {
    seams += course.seamCount
    stacked += course.stackedSeams
  }
  const sections = []
  for (const course of courses) {
    if (!sections.find((section) => section.name === course.section)) {
      const previous = model.sections.find((section) => section.name === course.section)
      sections.push({ name: course.section, blurb: previous?.blurb || '' })
    }
  }
  const minSupport = Math.min(...courses.map((course) => course.minSupport))

  return {
    ...model,
    shiftX,
    shiftZ,
    courses,
    sections,
    bill,
    swaps: findSwaps(courses),
    stats: {
      parts: bill.reduce((sum, line) => sum + line.qty, 0),
      lots: bill.length,
      studs,
      grams: Math.round(grams),
      dollars,
      courses: courses.length,
      width: maxX - minX + 1,
      depth: maxZ - minZ + 1,
      bond: seams === 0 ? 1 : 1 - stacked / seams,
      minSupport,
      mm: {
        w: (maxX - minX + 1) * STUD_MM,
        d: (maxZ - minZ + 1) * STUD_MM,
        h: heightMm,
      },
    },
    heightUnits: (top.plateY + 1) * PLATE,
    weakCourses: courses.filter((course) => course.minSupport < 0.5).length,
    review,
  }
}

export function designFromPrompt(prompt, variant = 0) {
  const draft = draftFromPrompt(prompt, variant)
  return compile(draft.cells, draft)
}

export function designFromTechnique(id, prompt, variant = 0) {
  const draft = realize(id, prompt, variant)
  return compile(draft.cells, draft)
}

export function designFromPixels(pixels, width, height, options) {
  const draft = draftFromPixels(pixels, width, height, options)
  return compile(draft.cells, draft)
}
