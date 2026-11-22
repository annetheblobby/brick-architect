/**
 * Fit the technique classifier and write src/lego/weights.js.
 * The packer is not in this loop. This model only chooses which technique to run.
 * Run from the repo root: npm run train
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreLabels, signalsOf, vectorOf } from './features.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

const CORES = {
  lighthouse: ['lighthouse', 'light house', 'striped lighthouse', 'a striped lighthouse'],
  cottage: ['cottage', 'cabin', 'bungalow', 'chalet', 'house', 'home', 'barn', 'seaside cottage', 'red barn', 'country cottage'],
  castle: ['castle', 'gatehouse', 'fortress', 'citadel', 'keep', 'castle gate'],
  ship: ['shuttle', 'spaceship', 'space ship', 'spacecraft', 'rocket', 'missile', 'lander', 'orbital shuttle'],
  car: ['car', 'coupe', 'sedan', 'truck', 'pickup', 'lorry', 'automobile', 'jeep', 'red coupe', 'blue pickup truck'],
  train: ['train', 'locomotive', 'steam engine', 'steam train'],
  tree: ['tree', 'oak', 'pine', 'canopy', 'old oak'],
  robot: ['robot', 'droid', 'mech', 'android', 'little robot'],
  duck: ['duck', 'garden duck'],
  penguin: ['penguin'],
  cat: ['cat', 'kitten'],
  dog: ['dog', 'puppy'],
  ghost: ['ghost'],
  cake: ['cake', 'birthday', 'birthday cake'],
  heart: ['heart'],
  bridge: ['bridge', 'viaduct', 'stone bridge'],
  boat: ['boat', 'sailboat', 'yacht', 'ship', 'dinghy', 'pirate ship', 'cargo ship'],
  flower: ['flower', 'tulip', 'daisy', 'bloom'],
  mushroom: ['mushroom'],
  sword: ['sword', 'blade', 'dagger'],
  windmill: ['windmill'],
  mountain: ['mountain', 'volcano', 'peak'],
  tower: ['skyscraper', 'high-rise', 'highrise', 'office tower', 'tower block', 'glass tower', 'stone tower', 'watch tower', 'tower'],
  mug: ['mug', 'coffee', 'cup of coffee'],
  star: ['star'],
  fish: ['fish'],
  guitar: ['guitar'],
  word: ['HI', 'HELLO', 'ABC', 'YO', 'OK', 'YES', 'NO'],
  generic: ['violin', 'dragon', 'teapot', 'piano', 'lamp', 'a mysterious quartz violin', 'abstract sculpture', 'dinosaur', 'umbrella'],
  treehouse: [
    'tree house',
    'treehouse',
    'house in a tree',
    'house in the tree',
    'cabin in a tree',
    'cottage in a tree',
    'home in the canopy',
    'a house among the branches',
    'house in an oak',
    'home in a tree',
  ],
  clocktower: ['clock tower', 'clocktower', 'tower with a clock', 'a tower with the clock', 'stone tower with a clock'],
}

const EXTRA = [
  ['cottage with a tree', 'cottage'],
  ['house with a tree', 'cottage'],
  ['barn and a tree', 'cottage'],
  ['cottage beside a tree', 'cottage'],
  ['a blue cottage with a black roof', 'cottage'],
  ['red barn with two chimneys', 'cottage'],
  ['red barn, two chimneys', 'cottage'],
  ['barn with three chimneys', 'cottage'],
  ['A blue pickup truck', 'car'],
  ['An orbital shuttle', 'ship'],
  ['a rocket', 'ship'],
  ['word HI', 'word'],
]

const HOLDOUT = [
  ['cabin in the canopy', 'treehouse'],
  ['home in an oak', 'treehouse'],
  ['a tower with a clock', 'clocktower'],
  ['a cottage by an oak', 'cottage'],
  ['striped light house', 'lighthouse'],
  ['please design a garden duck', 'duck'],
  ['WORLD', 'word'],
  ['glass office tower', 'tower'],
  ['cruise ship', 'boat'],
  ['toy rocket', 'ship'],
  ['A tree house', 'treehouse'],
  ['A clock tower', 'clocktower'],
  ['a mysterious quartz violin', 'generic'],
  ['Seaside cottage', 'cottage'],
  ['Old oak', 'tree'],
  ['Castle gate', 'castle'],
]

const PREFIXES = ['', 'a ', 'the ']

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

function expand() {
  const rows = []
  for (const [id, phrases] of Object.entries(CORES)) {
    for (const phrase of phrases) {
      for (const prefix of PREFIXES) {
        const text = prefix && /^(a|the)\b/i.test(phrase) ? phrase : `${prefix}${phrase}`.trim()
        rows.push({ text, id })
      }
    }
  }
  for (const [text, id] of EXTRA) rows.push({ text, id })
  const held = new Set(HOLDOUT.map(([text]) => text.toLowerCase()))
  return rows.filter((row) => !held.has(row.text.toLowerCase()))
}

function repeatCollisions(rows) {
  const heavy = new Set(['treehouse', 'clocktower', 'boat', 'ship', 'tower', 'cottage', 'tree', 'word', 'generic'])
  const out = []
  for (const row of rows) {
    const times = heavy.has(row.id) ? 3 : 1
    for (let i = 0; i < times; i++) out.push(row)
  }
  return out
}

function vocabOf(rows) {
  const counts = new Map()
  for (const row of rows) {
    for (const name of new Set(signalsOf(row.text))) counts.set(name, (counts.get(name) || 0) + 1)
  }
  const features = ['bias']
  const rest = [...counts.keys()]
    .filter((name) => name !== 'bias' && (name.startsWith('sig_') || counts.get(name) >= 2))
    .sort()
  features.push(...rest)
  return features
}

function fit(rows, features, labels) {
  const labelAt = new Map(labels.map((id, index) => [id, index]))
  const classes = labels.length
  const width = features.length
  const weights = Array.from({ length: classes }, () => new Array(width).fill(0))
  const rand = mulberry32(0x5eed)
  const data = rows.slice()
  let trainAcc = 0
  for (let epoch = 0; epoch < 160; epoch++) {
    for (let i = data.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const swap = data[i]
      data[i] = data[j]
      data[j] = swap
    }
    const lr = 0.45 / (1 + epoch * 0.035)
    for (const row of data) {
      const vector = vectorOf(row.text, features)
      const probs = scoreLabels(weights, vector)
      const target = labelAt.get(row.id)
      for (let c = 0; c < classes; c++) {
        const grad = probs[c] - (c === target ? 1 : 0)
        const line = weights[c]
        for (let f = 0; f < width; f++) {
          if (!vector[f]) continue
          line[f] -= lr * (grad + 1e-4 * line[f])
        }
      }
    }
    let hit = 0
    for (const row of rows) {
      const probs = scoreLabels(weights, vectorOf(row.text, features))
      let best = 0
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i
      if (labels[best] === row.id) hit++
    }
    trainAcc = hit / rows.length
    if (trainAcc > 0.995 && epoch > 40) break
  }
  return { weights, trainAcc }
}

function predict(weights, features, labels, text) {
  const probs = scoreLabels(weights, vectorOf(text, features))
  let best = 0
  let second = -1
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[best]) {
      second = best
      best = i
    } else if (second < 0 || probs[i] > probs[second]) second = i
  }
  return { id: labels[best], p: probs[best], second: second < 0 ? 0 : probs[second] }
}

function roundWeights(weights) {
  return weights.map((row) => row.map((value) => Math.round(value * 1e6) / 1e6))
}

const rows = repeatCollisions(expand())
const features = vocabOf(rows)
const labels = Object.keys(CORES).sort()
const { weights, trainAcc } = fit(rows, features, labels)

let missed = 0
for (const [text, id] of HOLDOUT) {
  const guess = predict(weights, features, labels, text)
  const clear =
    guess.id === id && (guess.p >= 0.55 || (guess.p >= 0.4 && guess.p - guess.second >= 0.2))
  const mark = clear ? 'ok ' : 'MISS'
  if (mark === 'MISS') missed += 1
  console.log(`${mark}  ${guess.p.toFixed(2)}  ${guess.id.padEnd(12)}  ${text}  → ${id}`)
}
console.log(`train ${rows.length} rows, ${features.length} features, accuracy ${trainAcc.toFixed(3)}, holdout misses ${missed}`)

if (missed || trainAcc < 0.98) {
  console.error('model did not clear the holdout bar, weights left unchanged')
  process.exit(1)
}

const model = { features, labels, W: roundWeights(weights) }
const file = join(dirname(fileURLToPath(import.meta.url)), 'weights.js')
writeFileSync(
  file,
  `/** Generated by npm run train. Technique classifier: prompt → builder id. */\nexport const TECHNIQUE_MODEL = ${JSON.stringify(model)}\n`,
)
console.log(`wrote ${file}`)

const check = spawnSync(process.execPath, ['src/lego/selfcheck.js'], { cwd: root, stdio: 'inherit' })
process.exit(check.status ?? 1)
