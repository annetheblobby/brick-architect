import { useEffect, useRef, useState } from 'react'

function earlierIndex(turns, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (turns[i].status === 'done') return i
  }
  return -1
}

function laterIndex(turns, index) {
  for (let i = index + 1; i < turns.length; i += 1) {
    if (turns[i].status === 'done') return i
  }
  return -1
}

export default function Chat({
  turns,
  index,
  busy,
  drawing,
  boundary,
  drawHint,
  onToggleDraw,
  onUndoDraw,
  onClearDraw,
  onSend,
  onRestore,
}) {
  const [draft, setDraft] = useState('')
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const earlier = earlierIndex(turns, index)
  const later = laterIndex(turns, index)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const node = logRef.current?.querySelector('[data-current="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [turns, index])

  return (
    <div className="chat">
      <div className="chat-nav">
        <button type="button" onClick={() => onRestore(earlier)} disabled={busy || earlier < 0}>
          Back
        </button>
        <span>
          {turns.length ? index + 1 : 0} of {turns.length}
        </span>
        <button type="button" onClick={() => onRestore(later)} disabled={busy || later < 0}>
          Forward
        </button>
      </div>
      <div className="chat-log" ref={logRef}>
        {turns.map((turn, i) => (
          <article
            key={turn.id}
            className={`chat-turn ${i === index ? 'is-current' : ''} ${i > index ? 'is-later' : ''}`}
            data-current={i === index ? 'true' : 'false'}
          >
            <p className="chat-user">{turn.prompt || 'Started from a picture'}</p>
            {turn.boundary ? <p className="chat-boundary">{turn.boundary}</p> : null}
            <p className={`chat-reply ${turn.status === 'error' ? 'is-error' : ''}`}>
              {turn.status === 'pending'
                ? 'Revising the model…'
                : turn.status === 'error'
                  ? turn.error
                  : turn.reply}
            </p>
            {turn.status === 'done' ? (
              <div className="chat-meta">
                {i === index ? (
                  <span className="chat-current">Current</span>
                ) : (
                  <button type="button" onClick={() => onRestore(i)} disabled={busy}>
                    Revert
                  </button>
                )}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {later >= 0 ? <p className="chat-note">Sending from here drops the later messages.</p> : null}
      <div className="chat-compose">
        <div className="chat-draw">
          <button
            type="button"
            className={drawing ? 'on' : ''}
            aria-pressed={drawing}
            disabled={busy}
            onClick={onToggleDraw}
          >
            Draw area
          </button>
          {boundary ? (
            <p className="boundary-live">
              <span>{boundary}</span>
              <button type="button" onClick={onUndoDraw} disabled={busy}>
                Undo
              </button>
              <button type="button" onClick={onClearDraw} disabled={busy}>
                Clear
              </button>
            </p>
          ) : drawing ? (
            <p className="boundary-hint">{drawHint}</p>
          ) : null}
        </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault()
          const text = draft.trim()
          if (!text || busy) return
          onSend(text)
          setDraft('')
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          placeholder="Make the lid taller"
          aria-label="Message"
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim() || busy}>
          {busy ? 'Revising…' : 'Send'}
        </button>
      </form>
      </div>
    </div>
  )
}
