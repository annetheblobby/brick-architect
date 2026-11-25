import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { sculptAnimal } from '../lego/animal.js'
import { compile } from '../lego/design.js'
import { rubricFor, sectionStages } from '../lego/review.js'
import { bakeModel, voxelize } from '../lego/voxelize.js'
import { ANGLES, band, frameObject, legoObject, scoreAngles } from './evaluate.js'

const ROUNDS = [
  { id: 'alpaca', name: 'Alpaca', file: 'Alpaca.glb' },
  { id: 'bull', name: 'Bull', file: 'Bull.glb' },
  { id: 'cow', name: 'Cow', file: 'Cow.glb' },
  { id: 'deer', name: 'Deer', file: 'Deer.glb' },
  { id: 'donkey', name: 'Donkey', file: 'Donkey.glb' },
  { id: 'fox', name: 'Fox', file: 'Fox.glb' },
  { id: 'horse', name: 'Horse', file: 'Horse.glb' },
  { id: 'husky', name: 'Husky', file: 'Husky.glb' },
  { id: 'shiba', name: 'Shiba Inu', file: 'ShibaInu.glb' },
  { id: 'wolf', name: 'Wolf', file: 'Wolf.glb' },
]

const LEVELS = [24, 32, 48, 64, 96, 128, 160, 192]

const ALIASES = {
  alpaca: ['alpaca', 'llama'],
  bull: ['bull', 'ox', 'steer'],
  cow: ['cow', 'cattle', 'heifer'],
  deer: ['deer', 'stag', 'doe', 'fawn'],
  donkey: ['donkey', 'burro', 'mule'],
  fox: ['fox', 'vixen'],
  horse: ['horse', 'pony', 'stallion', 'mare'],
  husky: ['husky'],
  shiba: ['shiba inu', 'shiba'],
  wolf: ['wolf', 'wolves'],
}

// Last round: solid body fill on a 32-stud grid.
const PREVIOUS = {
  alpaca: [0.84, 0.84, 0.84, 0.83, 0.82],
  bull: [0.9, 0.9, 0.91, 0.9, 0.88],
  cow: [0.86, 0.88, 0.9, 0.87, 0.83],
  deer: [0.8, 0.85, 0.87, 0.84, 0.8],
  donkey: [0.8, 0.83, 0.84, 0.8, 0.83],
  fox: [0.78, 0.79, 0.82, 0.78, 0.8],
  horse: [0.88, 0.87, 0.9, 0.87, 0.87],
  husky: [0.87, 0.86, 0.89, 0.87, 0.86],
  shiba: [0.89, 0.88, 0.9, 0.89, 0.84],
  wolf: [0.81, 0.82, 0.86, 0.85, 0.84],
}
const PREVIOUS_MEAN = 0.85

function resolveQuery(text) {
  const q = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return { error: 'Type an animal to build.' }
  const hits = ROUNDS.filter((spec) =>
    ALIASES[spec.id].some((alias) => new RegExp(`\\b${alias}\\b`).test(q)),
  )
  if (hits.length === 1) return { spec: hits[0] }
  if (hits.length > 1) return { error: `Name one animal: ${hits.map((item) => item.name).join(', ')}.` }
  const sculpted = sculptAnimal(q)
  if (sculpted) return { spec: sculpted }
  return { error: 'Name an animal. A cottage, a car, or a violin stays outside this path.' }
}

function delta(next, previous) {
  if (next == null || previous == null) return null
  return next - previous
}

function pct(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(value * 100)}%`
}

function signed(value) {
  if (value == null || Number.isNaN(value)) return '—'
  const points = Math.round(value * 100)
  if (points > 0) return `+${points}`
  return String(points)
}

function Frame({ object, yaw, lightRef }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    frameObject(camera, object, yaw, lightRef.current)
  }, [camera, object, yaw, lightRef])
  return null
}

function Subject({ object, yaw }) {
  const lightRef = useRef(null)
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 30, position: [4, 3, 8], near: 0.01, far: 400 }}
    >
      <color attach="background" args={['#e7ebf0']} />
      <ambientLight intensity={0.78} />
      <directionalLight ref={lightRef} intensity={1.15} />
      <primitive object={object} />
      <Frame object={object} yaw={yaw} lightRef={lightRef} />
    </Canvas>
  )
}

async function runRound(spec, studs) {
  let source
  if (spec.group) source = bakeModel(spec.group)
  else {
    const gltf = await new GLTFLoader().loadAsync(`/bench/models/${spec.file}`)
    source = bakeModel(gltf.scene)
  }
  const solid = voxelize(source, studs, { parts: Boolean(spec.group) })
  const model = compile(solid.cells, {
    name: spec.name,
    prompt: spec.group ? spec.name : `${spec.name}, Quaternius CC0`,
    summary: spec.group
      ? `Sculpted solid, then filled. The narrow side is ${Math.min(solid.fit.width, solid.fit.depth)} studs across.`
      : `Solid plate fill. The narrow side is ${Math.min(solid.fit.width, solid.fit.depth)} studs across.`,
    stages: sectionStages(solid.cells),
    palette: {},
    main: 'wall',
  })
  const lego = legoObject(model)
  const scored = scoreAngles(source, lego)
  const rubric = rubricFor(model, scored.mean)
  return { spec, source, lego, model, solid, studs, rubric, ...scored }
}

function disposeTree(root) {
  root?.traverse((obj) => {
    obj.geometry?.dispose()
    obj.material?.dispose()
  })
}

function release(result) {
  disposeTree(result?.source)
  disposeTree(result?.lego)
  if (result?.spec?.origin === 'sculpt') disposeTree(result.spec.group)
}

export default function Bench() {
  const [results, setResults] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [angleId, setAngleId] = useState('side')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState('Ask for an animal. A stored scan is used when we have one; every other animal is sculpted, then filled.')
  const [phase, setPhase] = useState('idle')
  const [studs, setStuds] = useState(96)
  const [draft, setDraft] = useState(96)
  const runToken = useRef(0)
  const studsRef = useRef(96)
  const draftRef = useRef(96)
  const queryRef = useRef('')
  const slideTimer = useRef(0)
  queryRef.current = query

  async function startBuild(text, resolved, grid) {
    const token = runToken.current + 1
    runToken.current = token
    setNotice('')
    setPhase('running')
    setStatus(
      resolved.spec.group
        ? `Sculpting ${resolved.spec.name}, then filling it at ${grid} studs`
        : `Filling ${resolved.spec.name} at ${grid} studs`,
    )
    try {
      const result = await runRound(resolved.spec, grid)
      if (runToken.current !== token) {
        release(result)
        return
      }
      result.query = text
      setResults((current) => {
        release(current[resolved.spec.id])
        return { ...current, [resolved.spec.id]: result }
      })
      setActiveId(resolved.spec.id)
      setPhase('done')
      setStatus(`${result.spec.name} · match ${Math.round(result.mean * 100)}% · ${result.model.stats.parts} parts`)
    } catch (error) {
      if (runToken.current !== token) return
      setResults((current) => ({
        ...current,
        [resolved.spec.id]: { spec: resolved.spec, query: text, error: error.message || 'This query failed.' },
      }))
      setActiveId(resolved.spec.id)
      setPhase('done')
      setStatus(error.message || 'This query failed.')
    }
  }

  function onQuery(event) {
    event.preventDefault()
    const text = query.trim()
    const resolved = resolveQuery(text)
    if (resolved.error) {
      setNotice(resolved.error)
      setPhase('miss')
      setStatus(resolved.error)
      return
    }
    startBuild(text, resolved, studsRef.current)
  }

  function commitStuds(next) {
    draftRef.current = next
    setDraft(next)
    if (next === studsRef.current) return
    studsRef.current = next
    setStuds(next)
    const text = queryRef.current.trim()
    if (!text) return
    const resolved = resolveQuery(text)
    if (resolved.error) return
    startBuild(text, resolved, next)
  }

  function onSlide(event) {
    const next = LEVELS[Number(event.target.value)]
    draftRef.current = next
    setDraft(next)
    window.clearTimeout(slideTimer.current)
    slideTimer.current = window.setTimeout(() => commitStuds(next), 280)
  }

  function onSlideEnd() {
    window.clearTimeout(slideTimer.current)
    commitStuds(draftRef.current)
  }

  const current = activeId ? results[activeId] : null
  const angle = current?.angles?.find((item) => item.id === angleId) || current?.angles?.[2]
  const finished = ROUNDS.map((spec) => results[spec.id]).filter((item) => item?.mean != null)
  const viable = finished.filter((item) => item.model && item.model.stats.minSupport >= 0.5 - 1e-9 && !item.model.weakCourses)
  const mean = finished.length ? finished.reduce((sum, item) => sum + item.mean, 0) / finished.length : null
  const sameGrid = finished.length === ROUNDS.length && finished.every((item) => item.studs === 32)
  const meanDelta = delta(mean, sameGrid ? PREVIOUS_MEAN : null)
  const partLabel = current?.model && current.studs === studs && draft === studs
    ? `${current.model.stats.parts.toLocaleString()} parts`
    : `${draft} studs`
  const worst = finished.reduce((low, item) => (!low || item.worst.score < low.worst.score ? item : low), null)

  return (
    <div
      className="bench is-filled"
      data-ready={phase === 'done' ? 'true' : 'false'}
      data-phase={phase}
      data-query={current?.query || ''}
      data-animal={current?.spec?.id || ''}
      data-origin={current?.spec?.origin || (current ? 'mesh' : '')}
      data-rounds={String(ROUNDS.length)}
      data-done={String(finished.length)}
      data-mean={mean == null ? '' : mean.toFixed(3)}
      data-viable={String(viable.length)}
      data-studs={String(studs)}
      data-parts={current?.model ? String(current.model.stats.parts) : ''}
    >
      <header className="bench-bar">
        <div className="bench-title">
          <span className="mark" />
          <strong>Evaluator bench</strong>
        </div>
        <label className="bench-parts">
          <span>Fewer</span>
          <input
            type="range"
            min="0"
            max={LEVELS.length - 1}
            step="1"
            value={Math.max(0, LEVELS.indexOf(draft))}
            aria-label="Part count"
            aria-valuetext={partLabel}
            onChange={onSlide}
            onPointerUp={onSlideEnd}
            onKeyUp={onSlideEnd}
          />
          <span>More</span>
          <span className="quiet">{partLabel}</span>
        </label>
        <form className="bench-query" onSubmit={onQuery}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A gray wolf, an elephant, a penguin…"
            aria-label="Query"
            disabled={phase === 'running'}
          />
          <button className="primary" type="submit" disabled={phase === 'running' || !query.trim()}>
            Build
          </button>
        </form>
        <span className="quiet">
          {status || (finished.length ? `Mean match ${pct(mean)}${meanDelta == null ? '' : ` (${signed(meanDelta)})`}` : notice)}
        </span>
      </header>

      <div className="bench-stage">
        <section className="bench-pane" aria-label="Open model">
          <div className="bench-pane-label">
            <span>{current?.spec?.origin === 'sculpt' ? 'Sculpted model' : 'Open model'}{current ? ` · ${current.spec.name}` : ''}</span>
            <span className="quiet">{angle ? angle.name : 'Side'}</span>
          </div>
          <div className="bench-view">
            {current?.source ? (
              <div className="stage-fill" key={current.spec.id}>
                <Subject object={current.source} yaw={angle ? angle.yaw : Math.PI / 2} />
              </div>
            ) : null}
            {!current ? <div className="bench-wait">{status || 'The mesh and the brick fill show up here.'}</div> : null}
            {current?.error ? <div className="bench-wait">{current.error}</div> : null}
          </div>
        </section>
        <section className="bench-pane" aria-label="Brick fill">
          <div className="bench-pane-label">
            <span>Brick fill</span>
            <span className="quiet">
              {current?.model
                ? `${current.model.stats.parts} parts · hold ${current.model.stats.minSupport.toFixed(2)} · look ${current.rubric ? current.rubric.mean.toFixed(1) : '—'}`
                : 'Plates inside the mesh'}
            </span>
          </div>
          <div className="bench-view">
            {current?.lego ? (
              <div className="stage-fill" key={current.spec.id}>
                <Subject object={current.lego} yaw={angle ? angle.yaw : Math.PI / 2} />
              </div>
            ) : null}
            {!current ? <div className="bench-wait">{notice || 'Plates from the trained fill.'}</div> : null}
          </div>
        </section>
      </div>

      <div className="bench-angles" role="group" aria-label="Evaluator angles">
        {(current?.angles || []).map((item, index) => {
          const previous = current.studs === 32 ? PREVIOUS[current.spec.id]?.[index] : null
          const change = delta(item.score, previous)
          return (
            <button
              key={item.id}
              type="button"
              className={item.id === (angle?.id || angleId) ? 'on' : ''}
              onClick={() => setAngleId(item.id)}
            >
              <span>
                {item.name} <strong className={`band-${band(item.score).toLowerCase()}`}>{pct(item.score)}</strong>
                {change == null ? null : <span className={change >= 0 ? 'delta-up' : 'delta-down'}> {signed(change)}</span>}
              </span>
              <span className="bench-pair">
                <img src={item.sourceUrl} alt="" />
                <img src={item.legoUrl} alt="" />
              </span>
            </button>
          )
        })}
      </div>

      <div className="bench-results">
        <div className="bench-results-head">
          <strong>Angle evaluator</strong>
          <span className="quiet">
            {finished.length} of {ROUNDS.length} scored
            {finished.length ? ` · mean ${pct(mean)}${sameGrid ? ` was ${pct(PREVIOUS_MEAN)} (${signed(meanDelta)})` : ''}` : ''}
            {finished.length ? ` · viable ${viable.length} of ${finished.length}` : ''}
            {worst ? ` · lowest ${worst.spec.name} ${worst.worst.name.toLowerCase()} ${pct(worst.worst.score)}` : ''}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Round</th>
              <th>Model</th>
              <th>Front</th>
              <th>3/4</th>
              <th>Side</th>
              <th>Rear 3/4</th>
              <th>Back</th>
              <th>Under</th>
              <th>Match</th>
              <th>Look</th>
              <th>Was</th>
              <th>Change</th>
              <th>Hold</th>
            </tr>
          </thead>
          <tbody>
            {ROUNDS.map((spec, index) => {
              const row = results[spec.id]
              const scores = row?.angles || []
              const previous = PREVIOUS[spec.id]
              const previousMean = previous ? previous.reduce((sum, score) => sum + score, 0) / previous.length : null
              const change = row?.studs === 32 ? delta(row?.mean, previousMean) : null
              return (
                <tr key={spec.id} className={spec.id === activeId ? 'on' : ''}>
                  <td>{index + 1}</td>
                  <td>
                    <button type="button" onClick={() => row && setActiveId(spec.id)} disabled={!row}>
                      {spec.name}
                    </button>
                  </td>
                  {scores.length
                    ? scores.map((item) => <td key={item.id}>{pct(item.score)}</td>)
                    : ANGLES.map((angle) => (
                        <td key={angle.id}>{row?.error ? 'fail' : '…'}</td>
                      ))}
                  <td>{row?.mean != null ? `${pct(row.mean)} ${band(row.mean)}` : row?.error ? 'fail' : '…'}</td>
                  <td>{row?.rubric ? row.rubric.mean.toFixed(1) : row?.error ? 'fail' : '…'}</td>
                  <td>{pct(previousMean)}</td>
                  <td className={change == null ? '' : change >= 0 ? 'delta-up' : 'delta-down'}>
                    {change == null ? (row?.mean != null ? '—' : '…') : signed(change)}
                  </td>
                  <td>{row?.model ? row.model.stats.minSupport.toFixed(2) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
