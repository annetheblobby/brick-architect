import { useMemo, useState } from 'react'
import { COLORS } from '../lego/palette.js'
import { catalog } from '../lego/parts.js'

const PARTS = catalog()
const COLOR_KEYS = Object.keys(COLORS)
const FAMILIES = [
  { id: 'all', label: 'All' },
  { id: 'plate', label: 'Plates' },
  { id: 'tile', label: 'Tiles' },
  { id: 'round', label: 'Rounds' },
]

function familyOf(kind) {
  if (kind === 'round1' || kind === 'round2') return 'round'
  if (kind === 'glass') return 'tile'
  return kind || 'plate'
}

function matches(part, query) {
  if (!query) return true
  const text = query.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '')
  const size = `${part.w}x${part.d}`
  const flipped = `${part.d}x${part.w}`
  return (
    part.number.toLowerCase().includes(text) ||
    part.name.toLowerCase().replace(/\s+/g, '').includes(text) ||
    size.includes(text) ||
    flipped.includes(text)
  )
}

function samePart(piece, part) {
  const kind = piece.kind === 'glass' ? 'tile' : piece.kind
  const size = (piece.w === part.w && piece.d === part.d) || (piece.w === part.d && piece.d === part.w)
  return kind === part.kind && size && piece.part?.number === part.number
}

function money(value) {
  return `$${value.toFixed(2)}`
}

export default function Custom({
  model,
  tool,
  brush,
  onBrush,
  onRotate,
  onAddLayer,
  onInsertLayer,
  canInsert,
  canAddTop,
}) {
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('all')
  const [copied, setCopied] = useState(false)
  const kind = brush.kind || 'plate'
  const selected = PARTS.find((part) => part.kind === familyOf(kind) && ((part.w === brush.w && part.d === brush.d) || (part.w === brush.d && part.d === brush.w)))
    || PARTS.find((part) => part.kind === 'plate' && part.w === 2 && part.d === 4)
  const color = COLORS[brush.color] || COLORS.red
  const results = useMemo(
    () => PARTS.filter((part) => (family === 'all' || familyOf(part.kind) === family) && matches(part, query.trim())),
    [family, query],
  )
  const onBuild = useMemo(() => {
    if (!model || !selected) return 0
    let count = 0
    for (const course of model.courses) {
      for (const piece of course.pieces) {
        if (piece.color === brush.color && samePart(piece, selected)) count += 1
      }
    }
    return count
  }, [model, selected, brush.color])

  function choose(part) {
    onBrush({ ...brush, w: part.w, d: part.d, kind: part.kind })
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(selected.number)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="custom-edit">
      <h2>Catalog</h2>
      <p>Search the BrickLink catalog by name or part number, then place that part on this layer.</p>
      <label className="catalog-search">
        <span>Search</span>
        <input
          value={query}
          placeholder="3020 or plate 2 x 4"
          aria-label="Search catalog"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="segment catalog-families" role="group" aria-label="Catalog category">
        {FAMILIES.map((item) => (
          <button key={item.id} type="button" className={family === item.id ? 'on' : ''} onClick={() => setFamily(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <ul className="catalog-list">
        {results.length ? (
          results.map((part) => {
            const on = part.number === selected.number && part.kind === selected.kind
            return (
              <li key={`${part.kind}|${part.number}`}>
                <button type="button" className={on ? 'on' : ''} onClick={() => choose(part)}>
                  <strong>{part.number}</strong>
                  <span>{part.name}</span>
                  <em>{money(part.price)}</em>
                </button>
              </li>
            )
          })
        ) : (
          <li className="catalog-empty">No parts match.</li>
        )}
      </ul>
      <div className="catalog-lot">
        <div>
          <button type="button" className="catalog-number" onClick={copyNumber}>
            {selected.number}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <strong>{selected.name}</strong>
          <p>
            {color.name} · {color.id}
            {brush.w !== selected.w || brush.d !== selected.d ? ` · turned ${brush.w} × ${brush.d}` : ''}
          </p>
        </div>
        <dl>
          <div>
            <dt>Est. new</dt>
            <dd>{money(selected.price)}</dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>{selected.grams.toFixed(2)} g</dd>
          </div>
          <div>
            <dt>On this build</dt>
            <dd>{onBuild}</dd>
          </div>
        </dl>
        <button type="button" onClick={onRotate} disabled={selected.w === selected.d}>
          Rotate
        </button>
      </div>
      <div className="edit-field">
        <span>Color · {color.name} {color.id}</span>
        <div className="swatches" role="group" aria-label="BrickLink color">
          {COLOR_KEYS.map((key) => {
            const swatch = COLORS[key]
            return (
              <button
                key={key}
                type="button"
                className={brush.color === key ? 'on' : ''}
                style={{ background: swatch.hex }}
                title={`${swatch.name} · ${swatch.id}`}
                aria-label={`${swatch.name} ${swatch.id}`}
                aria-pressed={brush.color === key}
                onClick={() => onBrush({ ...brush, color: key })}
              />
            )
          })}
        </div>
      </div>
      <p className="edit-current">
        {tool === 'place'
          ? `Place ${selected.number} ${color.name}`
          : tool === 'select'
            ? 'Click a part to select it.'
            : tool === 'move'
              ? 'Drag a part. It snaps to the grid and to its neighbors.'
              : tool === 'clone'
                ? 'Click a part, then click where the copy should land.'
                : tool === 'hinge'
                  ? 'Click a part, or drag around it, to turn it 90°.'
                  : 'Click a part on this layer to lift it.'}
      </p>
      <div className="edit-field">
        <span>Layers</span>
        <div className="layer-actions">
          <button
            type="button"
            onClick={onInsertLayer}
            disabled={!canInsert}
            title={canInsert ? 'Add an empty layer above this one' : 'Place a part on this layer first'}
          >
            New layer above
          </button>
          <button
            type="button"
            onClick={onAddLayer}
            disabled={!canAddTop}
            title={canAddTop ? 'Add an empty layer on top of the build' : 'Place a part on the top layer first'}
          >
            Add layer on top
          </button>
        </div>
      </div>
      <p className="edit-keys">Ctrl+Z undoes the last edit. V select, M move, C clone, H hinge, E place or remove, S toggles snap.</p>
    </div>
  )
}
