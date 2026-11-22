import { COLORS } from '../lego/palette.js'

const EDIT_COLORS = [
  'red',
  'blue',
  'yellow',
  'green',
  'white',
  'black',
  'tan',
  'orange',
  'lime',
  'reddish-brown',
  'light-bluish-gray',
  'dark-bluish-gray',
  'dark-green',
  'dark-blue',
  'nougat',
  'bright-pink',
]

const PLATES = [
  [1, 1],
  [1, 2],
  [1, 4],
  [1, 6],
  [2, 2],
  [2, 3],
  [2, 4],
  [2, 6],
  [4, 4],
]

function sizeOn(w, d, a, b) {
  return (w === a && d === b) || (w === b && d === a)
}

export default function Custom({
  tool,
  brush,
  onTool,
  onBrush,
  onRotate,
  onAddLayer,
  onInsertLayer,
  canInsert,
  canAddTop,
}) {
  const color = COLORS[brush.color]
  return (
    <div className="custom-edit">
      <h2>Custom editing</h2>
      <p>
        Build on this layer. Place sets a plate with its corner on the stud you click. Remove lifts the plate you click.
      </p>
      <div className="edit-field">
        <span>Tool</span>
        <div className="segment" role="group" aria-label="Edit tool">
          <button type="button" className={tool === 'place' ? 'on' : ''} onClick={() => onTool('place')}>
            Place
          </button>
          <button type="button" className={tool === 'remove' ? 'on' : ''} onClick={() => onTool('remove')}>
            Remove
          </button>
        </div>
      </div>
      <div className="edit-field">
        <span>Color</span>
        <div className="swatches" role="group" aria-label="Plate color">
          {EDIT_COLORS.map((key) => {
            const swatch = COLORS[key]
            return (
              <button
                key={key}
                type="button"
                className={brush.color === key ? 'on' : ''}
                style={{ background: swatch.hex }}
                aria-label={swatch.name}
                aria-pressed={brush.color === key}
                onClick={() => onBrush({ ...brush, color: key })}
              />
            )
          })}
        </div>
      </div>
      <div className="edit-field">
        <span>Plate</span>
        <div className="sizes" role="group" aria-label="Plate size">
          {PLATES.map(([w, d]) => (
            <button
              key={`${w}x${d}`}
              type="button"
              className={sizeOn(brush.w, brush.d, w, d) ? 'on' : ''}
              aria-pressed={sizeOn(brush.w, brush.d, w, d)}
              onClick={() => onBrush({ ...brush, w, d })}
            >
              {w}×{d}
            </button>
          ))}
          <button type="button" onClick={onRotate} disabled={brush.w === brush.d}>
            Rotate
          </button>
        </div>
      </div>
      <p className="edit-current">
        {tool === 'place'
          ? `${brush.w} × ${brush.d} ${color.name} plate`
          : 'Click a plate on this layer to lift it.'}
      </p>
      <div className="edit-field">
        <span>Layers</span>
        <div className="layer-actions">
          <button
            type="button"
            onClick={onInsertLayer}
            disabled={!canInsert}
            title={canInsert ? 'Add an empty layer above this one' : 'Place a plate on this layer first'}
          >
            New layer above
          </button>
          <button
            type="button"
            onClick={onAddLayer}
            disabled={!canAddTop}
            title={canAddTop ? 'Add an empty layer on top of the build' : 'Place a plate on the top layer first'}
          >
            Add layer on top
          </button>
        </div>
        <p>
          New layer above lifts every course over this one. Add layer on top starts an empty course at the top. Either one
          needs plates on the course under it.
        </p>
      </div>
      <p className="edit-keys">R rotates the plate. E switches between place and remove.</p>
    </div>
  )
}
