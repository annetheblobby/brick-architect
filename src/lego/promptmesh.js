import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { groupFromSpec, requestMesh } from './aimsh.js'
import { compile } from './design.js'
import { STUD_MM } from './scale.js'
import { bakeModel, voxelize } from './voxelize.js'

export const STUD_MIN = 24
export const STUD_MAX = 192
export const STUD_STEP = 8
export const PART_LEVELS = [24, 32, 48, 64, 96, 128, 160, 192]

const SCANS = [
  { name: 'Alpaca', file: 'Alpaca.glb', aliases: ['alpaca', 'llama'] },
  { name: 'Bull', file: 'Bull.glb', aliases: ['bull', 'ox', 'steer'] },
  { name: 'Cow', file: 'Cow.glb', aliases: ['cow', 'cattle', 'heifer'] },
  { name: 'Deer', file: 'Deer.glb', aliases: ['deer', 'stag', 'doe', 'fawn'] },
  { name: 'Donkey', file: 'Donkey.glb', aliases: ['donkey', 'burro', 'mule'] },
  { name: 'Fox', file: 'Fox.glb', aliases: ['fox', 'vixen'] },
  { name: 'Horse', file: 'Horse.glb', aliases: ['horse', 'pony', 'stallion', 'mare'] },
  { name: 'Husky', file: 'Husky.glb', aliases: ['husky'] },
  { name: 'Shiba Inu', file: 'ShibaInu.glb', aliases: ['shiba inu', 'shiba'] },
  { name: 'Wolf', file: 'Wolf.glb', aliases: ['wolf', 'wolves'] },
]

export function partLevel(value) {
  const snapped = Math.round(Number(value) / STUD_STEP) * STUD_STEP
  if (!Number.isFinite(snapped)) return 32
  return Math.min(STUD_MAX, Math.max(STUD_MIN, snapped))
}

/** Longest side of the brick model, in studs and in real length. A stud is 8 mm. */
export function scaleText(value) {
  const studs = partLevel(value)
  const cm = (studs * STUD_MM) / 10
  const length = cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`
  return `${studs} studs · ${length}`
}

function disposeTree(root) {
  root?.traverse((obj) => {
    obj.geometry?.dispose()
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const material of materials) {
      material?.map?.dispose()
      material?.dispose()
    }
  })
}

function matchScan(text) {
  const q = text.toLowerCase()
  const hits = SCANS.filter((scan) => scan.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(q)))
  return hits.length === 1 ? hits[0] : null
}

function fill(source, studs, parts) {
  return voxelize(source, studs, { parts, exact: true })
}

function parseGlb(glb) {
  const binary = Uint8Array.from(atob(glb), (char) => char.charCodeAt(0))
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(binary.buffer, '', resolve, reject)
  })
}

/**
 * A stored animal scan when the sentence names one and no picture is attached.
 * Every other sentence or picture is built by Tripo, then filled.
 */
export async function modelFromPrompt(prompt, studs, variant = 0, image = null, revision = null) {
  const text = (prompt || '').trim()
  const tweak = (revision?.tweak || '').trim()
  if (!text && !image && !tweak) throw new Error('Type a sentence, add a picture, or use both.')
  const grid = partLevel(studs)
  const scan = text && !image && !tweak ? matchScan(text) : null
  let source
  let parts = false
  let name = text || 'Picture'
  let origin = 'model'
  let summary
  if (scan) {
    const gltf = await new GLTFLoader().loadAsync(`/bench/models/${scan.file}`)
    source = bakeModel(gltf.scene)
    disposeTree(gltf.scene)
    name = scan.name
    origin = 'scan'
  } else {
    const glb = await requestMesh(text, image, variant, tweak, grid)
    const gltf = await parseGlb(glb)
    source = bakeModel(gltf.scene)
    disposeTree(gltf.scene)
    if (!source.children.length) throw new Error('The model returned no mesh.')
    parts = true
    name = (text || 'Picture').slice(0, 60)
  }
  const solid = fill(source, grid, parts)
  const across = Math.min(solid.fit.width, solid.fit.depth)
  const length = scaleText(grid)
  if (origin === 'scan') {
    summary = `Filled from the ${name} scan. Longest side ${length}. The narrow side is ${across} studs across.`
  } else if (tweak) {
    summary = `Revised with Tripo: ${tweak} Longest side ${length}.`
  } else if (image) {
    summary = `Modeled the picture with Tripo at ${length} on the longest side, then filled it with plates in the picture's colors.`
  } else {
    summary = `Modeled with Tripo from the sentence at ${length} on the longest side, then filled it with plates in the model's colors.`
  }
  const model = compile(solid.cells, {
    name,
    prompt: text || name,
    summary,
    stages: [{ name: 'Body', from: 0, to: 999, blurb: 'Plates fill the model from the ground up.' }],
    palette: {},
    main: 'wall',
  })
  model.origin = origin
  model.grid = grid
  model.spec = null
  model.sentence = text
  model.tweaks = tweak ? [...(revision?.tweaks || []), tweak].slice(-8) : []
  return { model, source }
}

const MODEL_EXT = new Set(['glb', 'gltf', 'obj', 'stl', 'ply'])

export function modelExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name || '')
  return match ? match[1].toLowerCase() : ''
}

export function isModelFile(file) {
  return MODEL_EXT.has(modelExtension(file?.name))
}

function geometryGroup(geometry) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: '#c8c8c8', side: THREE.DoubleSide }),
  )
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

/** Parse a model the page already read. glb and gltf stay on the loader path. */
export function objectFromModel(name, data) {
  const ext = modelExtension(name)
  if (ext === 'obj') return new OBJLoader().parse(typeof data === 'string' ? data : new TextDecoder().decode(data))
  if (ext === 'stl') return geometryGroup(new STLLoader().parse(data))
  if (ext === 'ply') return geometryGroup(new PLYLoader().parse(data))
  throw new Error('Drop a glb, gltf, obj, stl, or ply model.')
}

/** Voxelize a mesh the user already has, then pack it into plates. */
export function fillSource(source, studs, meta) {
  const grid = partLevel(studs)
  let mesh = source
  let scratch = null
  let baked = null
  if (meta?.origin === 'model' && meta?.spec?.parts?.length) {
    scratch = groupFromSpec(meta.spec)
    baked = bakeModel(scratch)
    mesh = baked
  }
  let solid
  try {
    solid = fill(mesh, grid, meta?.origin === 'model')
  } finally {
    if (scratch) disposeTree(scratch)
    if (baked) disposeTree(baked)
  }
  const across = Math.min(solid.fit.width, solid.fit.depth)
  const name = meta?.name || 'Model'
  const model = compile(solid.cells, {
    name,
    prompt: meta?.prompt || name,
    summary: meta?.summary || `Filled from ${name}. The narrow side is ${across} studs across.`,
    stages: [{ name: 'Body', from: 0, to: 999, blurb: 'Plates fill the model from the ground up.' }],
    palette: {},
    main: 'wall',
  })
  model.origin = meta?.origin || 'file'
  model.grid = grid
  model.spec = meta?.spec || null
  model.sentence = meta?.sentence || ''
  model.tweaks = meta?.tweaks || []
  return model
}

export async function modelFromFile(file, studs) {
  if (!isModelFile(file)) throw new Error('Drop a glb, gltf, obj, stl, or ply model.')
  const name = (file.name || 'Model').replace(/\.[^.]+$/, '') || 'Model'
  const ext = modelExtension(file.name)
  let root
  if (ext === 'glb' || ext === 'gltf') {
    const url = URL.createObjectURL(file)
    try {
      const gltf = await new GLTFLoader().loadAsync(url)
      root = gltf.scene
    } finally {
      URL.revokeObjectURL(url)
    }
  } else {
    const data = ext === 'obj' ? await file.text() : await file.arrayBuffer()
    root = objectFromModel(file.name, data)
  }
  const source = bakeModel(root)
  disposeTree(root)
  if (!source.children.length) throw new Error('That model has no mesh.')
  return { model: fillSource(source, studs, { name, prompt: file.name }), source }
}
