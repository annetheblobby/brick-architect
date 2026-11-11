import { useState } from 'react'
import { download, money, pad, slug, toBricklinkXml } from '../lego/format.js'
import Order from './Order.jsx'
import Rail from './Rail.jsx'
import Viewport from './Viewport.jsx'

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
  photo,
  mode,
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
  onMode,
  onStuds,
  onRebuild,
}) {
  const [draft, setDraft] = useState('')
  const step = model.courses[course]
  const parts = tally(step.pieces)
  const focusKey = focus ? `${focus.color}|${focus.number}` : ''
  const speedIndex = Math.max(0, SPEEDS.indexOf(speed))

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
          </div>
          <label className="ghost">
            <input type="checkbox" checked={ghost} onChange={(event) => onGhost(event.target.checked)} />
            Ghost
          </label>
          <div className="speed">
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
        <div className="top-right">
          <span className="quiet hide-sm">
            {model.stats.parts} parts · {money(model.stats.dollars)}
          </span>
          <button
            type="button"
            className="primary"
            onClick={() => download(`${slug(model.name)}-bricklink.xml`, toBricklinkXml(model), 'application/xml')}
          >
            Export
          </button>
        </div>
      </header>
      <div className="stage-row">
        <div className="stage">
          <Viewport model={model} course={course} view={view} ghost={ghost} focusKey={focusKey} nonce={nonce} />
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
            <button type="button" className="play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play'}>
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
          <button type="button" className="reset-view" onClick={onReset}>
            Reset view
          </button>
          {focus && (
            <button type="button" className="focus-chip" onClick={() => onFocus(null)}>
              {focus.colorName} {focus.name}
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <aside className="inspector">
          <div className="inspector-head">
            <button type="button" disabled={course === 0} onClick={() => onCourse(course - 1)}>
              Prev
            </button>
            <div className="segment" role="group" aria-label="Panel">
              <button type="button" className={panel === 'step' ? 'on' : ''} onClick={() => onPanel('step')}>
                Step
              </button>
              <button type="button" className={panel === 'order' ? 'on' : ''} onClick={() => onPanel('order')}>
                Order
              </button>
            </div>
            <button type="button" disabled={course === model.courses.length - 1} onClick={() => onCourse(course + 1)}>
              Next
            </button>
          </div>
          {panel === 'order' ? (
            <Order model={model} focus={focus} onFocus={onFocus} />
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
              {photo ? (
                <div className="rebuild">
                  <div className="segment">
                    <button type="button" className={mode === 'relief' ? 'on' : ''} onClick={() => onMode('relief')}>
                      Relief
                    </button>
                    <button type="button" className={mode === 'mosaic' ? 'on' : ''} onClick={() => onMode('mosaic')}>
                      Mosaic
                    </button>
                  </div>
                  <label className="studs">
                    <span>{studs} studs</span>
                    <input
                      type="range"
                      min={16}
                      max={48}
                      step={4}
                      value={studs}
                      onChange={(event) => onStuds(Number(event.target.value))}
                    />
                  </label>
                  <button type="button" onClick={onRebuild}>
                    Rebuild picture
                  </button>
                </div>
              ) : (
                <button type="button" className="another" onClick={onAnother}>
                  Another take
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      <Rail model={model} course={course} card={card} onCourse={onCourse} onCard={onCard} />
    </>
  )
}
