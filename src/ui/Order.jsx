import { useState } from 'react'
import { download, money, shoppingList, slug, toBricklinkXml, toCsv } from '../lego/format.js'

export default function Order({ model, focus, onFocus }) {
  const [copied, setCopied] = useState(false)
  const base = slug(model.name)

  function copyList() {
    const text = shoppingList(model)
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      },
      () => download(`${base}-list.txt`, text, 'text/plain'),
    )
  }

  return (
    <div className="order">
      <p className="summary">{model.summary}</p>
      <div className="order-stats">
        <div>
          <strong>{model.stats.parts}</strong>
          <span>parts</span>
        </div>
        <div>
          <strong>{model.stats.lots}</strong>
          <span>lots</span>
        </div>
        <div>
          <strong>{model.stats.grams} g</strong>
          <span>weight</span>
        </div>
        <div>
          <strong>{money(model.stats.dollars)}</strong>
          <span>estimate</span>
        </div>
      </div>
      <p className="measure">
        {model.stats.width} × {model.stats.depth} studs · {(model.stats.mm.w / 10).toFixed(1)} ×{' '}
        {(model.stats.mm.d / 10).toFixed(1)} × {(model.stats.mm.h / 10).toFixed(1)} cm · bond{' '}
        {Math.round(model.stats.bond * 100)}%
      </p>
      <div className="order-actions">
        <button type="button" onClick={copyList}>
          {copied ? 'Copied' : 'Copy list'}
        </button>
        <button type="button" onClick={() => download(`${base}-parts.csv`, toCsv(model), 'text/csv')}>
          CSV
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => download(`${base}-bricklink.xml`, toBricklinkXml(model), 'application/xml')}
        >
          BrickLink XML
        </button>
      </div>
      {focus && (
        <button type="button" className="focus-clear" onClick={() => onFocus(null)}>
          Showing {focus.colorName} {focus.name}. Show everything.
        </button>
      )}
      <ul className="bill">
        {model.bill.map((line) => {
          const on = focus && focus.color === line.color && focus.number === line.number
          return (
            <li key={`${line.number}-${line.colorId}`}>
              <button
                type="button"
                className={on ? 'on' : ''}
                onClick={() =>
                  onFocus(
                    on
                      ? null
                      : { color: line.color, number: line.number, colorName: line.colorName, name: line.name },
                  )
                }
              >
                <span className="swatch" style={{ background: line.hex }} />
                <span className="qty">{line.qty}</span>
                <span className="bill-name">
                  {line.colorName}
                  <small>
                    {line.name} · {line.number}
                  </small>
                </span>
                <span className="bill-price">{money(line.price * line.qty)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {model.swaps.length > 0 && (
        <div className="swaps">
          <h3>Safe brick swaps</h3>
          <p>Three identical plate courses can become one brick. The order list stays plates, so the picture still matches the parts.</p>
          <ul>
            {model.swaps.map((swap) => (
              <li key={`${swap.number}-${swap.colorId}`}>
                <span className="swatch" style={{ background: swap.hex }} />
                {swap.qty}× {swap.colorName} {swap.name}
                <small>{swap.number}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="fine">
        Prices are planning estimates, not a quote. Upload the BrickLink XML for live lots. LEGO is a trademark of the
        LEGO Group, which does not sponsor or endorse this app.
      </p>
    </div>
  )
}
