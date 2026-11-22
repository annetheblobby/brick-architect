import { useEffect, useMemo, useRef, useState } from 'react'
import { download, money, pad, slug, toBricklinkXml } from '../lego/format.js'
import { partLevel, scaleText, STUD_MAX, STUD_MIN, STUD_STEP } from '../lego/promptmesh.js'
import Chat from './Chat.jsx'
import Custom from './Custom.jsx'
import DrawMask from './DrawMask.jsx'
import Order from './Order.jsx'
import Rail from './Rail.jsx'
import Viewport from './Viewport.jsx'
import { boundaryText, emptyMask, mergeMask } from './draw.js'

const idleMask = emptyMask()

const SPEEDS = [0.5, 1, 1.5, 2, 3]

function tally(pieces) {
  const map = new Map()
  for (const piece of pieces) {
    const key = `${piece.part.number}|${piece.color}`
    const row = map.get(key)
    if (row) row.qty += 1
    else {
      map.set(key, {
        key,
        qty: 1,
        color: piece.color,
        number: piece.part.number,
        name: piece.part.name,
        colorName: piece.colorName,
        hex: piece.hex,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
}

export default function Studio({
  model,
  course,
  view,
  ghost,
  playing,
  speed,
  panel,
  focus,
  notes,
  card,
  nonce,
  mesh,
  busy,
  error,
  fileModel,
  studs,
  onBack,
  onCourse,
  onView,
  onGhost,
  onSpeed,
  onPanel,
  onFocus,
  onCard,
  onReset,
  onPlay,
  onNote,
  onAnother,
  onTweak,
  onRestore,
  chat,
  chatIndex,
  onParts,
  tool,
  brush,
  onTool,
  onBrush,
  onRotate,
  onAddLayer,
  onInsertLayer,
  onPlace,
  onRemove,
  onSave,
  saved,
}) {
  const [draft, setDraft] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [light, setLight] = useState(70)
  const [dim, setDim] = useState(0)
  const [drawing, setDrawing] = useState(false)
  const [mask, setMask] = useState(emptyMask)
  const [maskNonce, setMaskNonce] = useState(0)
  const settingsRef = useRef(null)
  const viewRef = useRef(null)
  const boundary = useMemo(() => boundaryText(mask), [mask])
  const buildKey = `${model.id}:${model.stats.parts}:${model.courses.length}`
  const step = model.courses[course]
  const parts = tally(step.pieces)
  const focusKey = focus ? `${focus.color}|${focus.number}` : ''
  const speedIndex = Math.max(0, SPEEDS.indexOf(speed))

  useEffect(() => {
    if (!settingsOpen) return
    function onPointer(event) {
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  useEffect(() => {
    if (!orderOpen) return undefined
    function onKey(event) {
      if (event.key === 'Escape') setOrderOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [orderOpen])

  useEffect(() => {
    setMask(emptyMask())
    setMaskNonce((value) => value + 1)
    setDrawing(false)
  }, [buildKey])

  useEffect(() => {
    if (panel !== 'ai') setDrawing(false)
  }, [panel])

  useEffect(() => {
    if (!drawing) return undefined
    function onKey(event) {
      if (event.key === 'Escape' && !orderOpen) setDrawing(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawing, orderOpen])

  function clearMask() {
    setMask(emptyMask())
    setMaskNonce((value) => value + 1)
  }

  function toggleDraw() {
    if (!drawing && playing) onPlay()
    setDrawing((on) => !on)
  }

  function sendTweak(text) {
    onTweak(text, boundary, mask)
    clearMask()
    setDrawing(false)
  }

  return (
    <>
      <header className="topbar">
        <div className="top-left">
          <button type="button" className="texty" onClick={onBack}>
            ← Back
          </button>
          <span className="draft">Draft</span>
          <h1 title={model.name}>{model.name}</h1>
        </div>
        <div className="top-center">
          <div className="segment" role="group" aria-label="View">
            <button type="button" className={view === 'progress' ? 'on' : ''} onClick={() => onView('progress')}>
              Built
            </button>
            <button type="button" className={view === 'one' ? 'on' : ''} onClick={() => onView('one')}>
              Course
            </button>
            <button type="button" className={view === 'all' ? 'on' : ''} onClick={() => onView('all')}>
              All
            </button>
            <button type="button" className={view === 'custom' ? 'on' : ''} onClick={() => onView('custom')}>
              Custom
            </button>
            {mesh ? (
              <button type="button" className={view === 'model' ? 'on' : ''} onClick={() => onView('model')}>
                Model
              </button>
            ) : null}
          </div>
          <div className="settings" ref={settingsRef}>
            <button
              type="button"
              className={settingsOpen ? 'on' : ''}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              aria-controls="studio-settings"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                />
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
            {settingsOpen ? (
              <div className="settings-menu" id="studio-settings">
                <label className="parts-slider">
                  <span>Fewer</span>
                  <input
                    type="range"
                    min={STUD_MIN}
                    max={STUD_MAX}
                    step={STUD_STEP}
                    value={partLevel(studs)}
                    aria-label="Longest side"
                    aria-valuetext={scaleText(studs)}
                    disabled={busy || model.origin === 'library' || model.origin === 'manual'}
                    onChange={(event) => onParts(partLevel(event.target.value))}
                  />
                  <span>More</span>
                  <span className="quiet">{busy ? 'Refilling…' : scaleText(studs)}</span>
                </label>
                <label className="scene-slider">
                  <span>Light</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={light}
                    aria-label="Lighting"
                    aria-valuetext={`${light}%`}
                    onChange={(event) => setLight(Number(event.target.value))}
                  />
                  <span className="quiet">{light}%</span>
                </label>
                <label className="scene-slider">
                  <span>Dim</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={dim}
                    aria-label="Dimness"
                    aria-valuetext={`${dim}%`}
                    onChange={(event) => setDim(Number(event.target.value))}
                  />
                  <span className="quiet">{dim}%</span>
                </label>
                <label className="ghost">
                  <input type="checkbox" checked={ghost} onChange={(event) => onGhost(event.target.checked)} />
                  Ghost
                </label>
                <div className="speed">
                  <span>Size</span>
                  <button
                    type="button"
                    aria-label="Slower"
                    onClick={() => onSpeed(SPEEDS[Math.max(0, speedIndex - 1)])}
                  >
                    −
                  </button>
                  <span>{speed.toFixed(1)}×</span>
                  <button
                    type="button"
                    aria-label="Faster"
                    onClick={() => onSpeed(SPEEDS[Math.min(SPEEDS.length - 1, speedIndex + 1)])}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="top-right">
          {error ? <span className="error">{error}</span> : null}
          <span className="quiet hide-sm">
            {model.stats.parts} parts · {money(model.stats.dollars)}
          </span>
          <button type="button" className="texty" onClick={onSave} disabled={busy}>
            {saved ? 'Saved' : 'Save'}
          </button>
          <button type="button" className="primary" onClick={() => setOrderOpen(true)}>
            Order
          </button>
        </div>
      </header>
      <div className="stage-row">
        <div className={`stage ${view === 'custom' ? 'is-custom' : ''} ${panel === 'ai' && drawing ? 'is-drawing' : ''}`} data-tool={tool}>
          <Viewport
            model={model}
            course={course}
            view={view}
            ghost={ghost}
            focusKey={focusKey}
            nonce={nonce}
            mesh={mesh}
            editing={view === 'custom' && !(panel === 'ai' && drawing)}
            tool={tool}
            brush={brush}
            onPlace={onPlace}
            onRemove={onRemove}
            light={light}
            dim={dim}
            viewRef={viewRef}
            drawing={panel === 'ai' && drawing}
            mask={panel === 'ai' ? mask : idleMask}
          />
          {panel === 'ai' && drawing ? (
            <DrawMask
              active
              viewRef={viewRef}
              model={model}
              course={course}
              view={view}
              ghost={ghost}
              nonce={maskNonce}
              frame={nonce}
              onMark={(found) => setMask((current) => mergeMask(current, found))}
            />
          ) : null}
          {panel === 'ai' && drawing ? (
            <p className="draw-hint">
              {view === 'model' ? 'Switch to Built to mark the space' : 'Drag to mark the space to change'}
            </p>
          ) : null}
          {view === 'custom' ? (
            <div className="edit-bar">
              <div className="segment" role="group" aria-label="Edit tool">
                <button type="button" className={tool === 'place' ? 'on' : ''} onClick={() => onTool('place')}>
                  Place
                </button>
                <button type="button" className={tool === 'remove' ? 'on' : ''} onClick={() => onTool('remove')}>
                  Remove
                </button>
              </div>
              <div className="segment" role="group" aria-label="New layer">
                <button
                  type="button"
                  onClick={onInsertLayer}
                  disabled={!step.pieces.length}
                  title={step.pieces.length ? 'Add an empty layer above this one' : 'Place a plate on this layer first'}
                >
                  Layer above
                </button>
                <button
                  type="button"
                  onClick={onAddLayer}
                  disabled={!model.courses[model.courses.length - 1].pieces.length}
                  title={
                    model.courses[model.courses.length - 1].pieces.length
                      ? 'Add an empty layer on top of the build'
                      : 'Place a plate on the top layer first'
                  }
                >
                  Layer on top
                </button>
              </div>
            </div>
          ) : null}
          <div className="plaque">
            <strong>
              {model.stats.width} × {model.stats.depth} studs
            </strong>
            <span>
              {(model.stats.mm.w / 10).toFixed(1)} × {(model.stats.mm.d / 10).toFixed(1)} ×{' '}
              {(model.stats.mm.h / 10).toFixed(1)} cm
            </span>
            <span>Bond {Math.round(model.stats.bond * 100)}%</span>
          </div>
          <div className="scrub">
            <button
              type="button"
              className="play"
              onClick={onPlay}
              disabled={view === 'custom'}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={model.courses.length - 1}
              value={course}
              aria-label="Course"
              onChange={(event) => onCourse(Number(event.target.value))}
            />
            <span>
              {pad(course + 1)} / {pad(model.courses.length)}
            </span>
          </div>
          <div className="view-actions">
            {model.origin === 'model' ? (
              <button
                type="button"
                className={panel === 'ai' ? 'on' : ''}
                aria-pressed={panel === 'ai'}
                aria-label="Chat"
                onClick={() => onPanel(panel === 'ai' ? 'step' : 'ai')}
              >
                Chat
              </button>
            ) : null}
            <button type="button" className="reset-view" onClick={onReset}>
              Reset view
            </button>
          </div>
          {focus && (
            <button type="button" className="focus-chip" onClick={() => onFocus(null)}>
              {focus.colorName} {focus.name}
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <aside className={`inspector ${panel === 'ai' ? 'is-chat' : ''}`}>
          <div className="inspector-head">
            {panel === 'ai' ? null : (
              <button type="button" disabled={course === 0} onClick={() => onCourse(course - 1)}>
                Prev
              </button>
            )}
            <div className="segment" role="group" aria-label="Panel">
              <button
                type="button"
                className={panel === 'step' || panel === 'order' ? 'on' : ''}
                onClick={() => onPanel('step')}
              >
                Step
              </button>
              {model.origin === 'model' ? (
                <button type="button" className={panel === 'ai' ? 'on' : ''} onClick={() => onPanel('ai')}>
                  Chat
                </button>
              ) : null}
            </div>
            {panel === 'ai' ? null : (
              <button type="button" disabled={course === model.courses.length - 1} onClick={() => onCourse(course + 1)}>
                Next
              </button>
            )}
          </div>
          {panel === 'ai' ? (
            <Chat
              turns={chat}
              index={chatIndex}
              busy={busy}
              drawing={drawing}
              boundary={boundary}
              drawHint={
                view === 'model'
                  ? 'Switch to Built to mark the space to change.'
                  : 'Drag to mark the space to change — bricks and open baseplate in that area.'
              }
              onToggleDraw={toggleDraw}
              onClearDraw={clearMask}
              onSend={sendTweak}
              onRestore={onRestore}
            />
          ) : view === 'custom' && panel === 'step' ? (
            <div className="step-panel">
              <div className="step-kicker">
                <span>Layer</span>
                <strong>{pad(course + 1)}</strong>
              </div>
              <Custom
                tool={tool}
                brush={brush}
                onTool={onTool}
                onBrush={onBrush}
                onRotate={onRotate}
                onAddLayer={onAddLayer}
                onInsertLayer={onInsertLayer}
                canInsert={step.pieces.length > 0}
                canAddTop={model.courses[model.courses.length - 1].pieces.length > 0}
              />
            </div>
          ) : (
            <div className="step-panel">
              <div className="step-kicker">
                <span>Course</span>
                <strong>{pad(course + 1)}</strong>
              </div>
              <div className="step-kicker">
                <span>Section</span>
                <strong>{step.section}</strong>
              </div>
              <h2>{step.title}</h2>
              <p className="step-name">{step.name}</p>
              {course === 0 && <p className="summary">{model.summary}</p>}
              <p className="step-facts">
                Clutch {Math.round(step.minSupport * 100)}%
                {step.seamCount > 0 ? ` · seams ${Math.round(step.stagger * 100)}% offset` : ''}
              </p>
              <ul className="notes">
                {step.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
                {notes.map((note) => (
                  <li key={note} className="mine">
                    {note}
                  </li>
                ))}
              </ul>
              <form
                className="note-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  onNote(draft)
                  setDraft('')
                }}
              >
                <input
                  value={draft}
                  placeholder="Add a note"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" disabled={!draft.trim()}>
                  Add
                </button>
              </form>
              <h3>On this course</h3>
              <ul className="course-parts">
                {parts.map((part) => {
                  const on = focus && focus.color === part.color && focus.number === part.number
                  return (
                    <li key={part.key}>
                      <button
                        type="button"
                        className={on ? 'on' : ''}
                        onClick={() =>
                          onFocus(
                            on
                              ? null
                              : { color: part.color, number: part.number, colorName: part.colorName, name: part.name },
                          )
                        }
                      >
                        <span className="swatch" style={{ background: part.hex }} />
                        <span className="qty">{part.qty}</span>
                        <span>
                          {part.colorName} {part.name}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {fileModel || model.origin === 'scan' || model.origin === 'library' || model.origin === 'manual' ? null : (
                <button type="button" className="another" onClick={onAnother}>
                  Another take
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      {panel === 'ai' ? null : (
        <Rail model={model} course={course} card={card} onCourse={onCourse} onCard={onCard} />
      )}
      {orderOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setOrderOpen(false)}>
          <div
            className="order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="order-modal-bar">
              <h2 id="order-title">Order</h2>
              <button
                type="button"
                className="primary"
                onClick={() => download(`${slug(model.name)}-bricklink.xml`, toBricklinkXml(model), 'application/xml')}
              >
                Export
              </button>
              <button type="button" className="texty" onClick={() => setOrderOpen(false)}>
                Close
              </button>
            </div>
            <div className="order-modal-body">
              <Order model={model} focus={focus} onFocus={onFocus} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
