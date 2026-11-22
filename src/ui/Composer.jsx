import { useEffect, useRef, useState } from 'react'
import { isModelFile, partLevel, scaleText, STUD_MAX, STUD_MIN, STUD_STEP } from '../lego/promptmesh.js'
import { COLORS } from '../lego/palette.js'
import { PixelGame } from './PixelGame.jsx'

function pictureFromImage(image, name, onPhoto) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 768 / Math.max(image.width, image.height))
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  onPhoto({ dataUrl, url: dataUrl, name })
}

function readFile(file, onPhoto) {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    pictureFromImage(image, file.name.replace(/\.[^.]+$/, ''), onPhoto)
    URL.revokeObjectURL(url)
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
  }
  image.src = url
}

function samplePhoto(onPhoto) {
  const canvas = document.createElement('canvas')
  canvas.width = 240
  canvas.height = 160
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const sky = ctx.createLinearGradient(0, 0, 0, 120)
  sky.addColorStop(0, '#7eb6e8')
  sky.addColorStop(1, '#e7f3fb')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 240, 160)
  ctx.fillStyle = '#f3d36b'
  ctx.beginPath()
  ctx.arc(190, 34, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6aaa62'
  ctx.beginPath()
  ctx.moveTo(0, 118)
  ctx.quadraticCurveTo(70, 86, 150, 116)
  ctx.lineTo(240, 128)
  ctx.lineTo(240, 160)
  ctx.lineTo(0, 160)
  ctx.fill()
  ctx.fillStyle = '#6a4630'
  ctx.fillRect(48, 96, 8, 28)
  ctx.fillStyle = '#2f7d46'
  ctx.beginPath()
  ctx.arc(52, 86, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#efe6d6'
  ctx.fillRect(118, 90, 48, 36)
  ctx.fillStyle = '#b5523a'
  ctx.beginPath()
  ctx.moveTo(112, 90)
  ctx.lineTo(142, 66)
  ctx.lineTo(172, 90)
  ctx.fill()
  ctx.fillStyle = '#5c4636'
  ctx.fillRect(136, 106, 12, 20)
  ctx.fillStyle = '#9ed6f0'
  ctx.fillRect(124, 100, 10, 10)
  const image = new Image()
  image.onload = () => pictureFromImage(image, 'Sample cottage', onPhoto)
  image.src = canvas.toDataURL('image/png')
}

const IDEAS = [
  { id: 'cottage', text: 'A blue cottage with a black roof' },
  { id: 'wolf', text: 'A gray wolf standing on all fours' },
  { id: 'teapot', text: 'A yellow teapot with a blue lid' },
  { id: 'light', text: 'A striped lighthouse on a rocky point' },
]

function takeFile(file, onPhoto, onModel) {
  if (!file) return
  if (isModelFile(file)) onModel(file)
  else if (file.type.startsWith('image/')) readFile(file, onPhoto)
}

function SavePreview({ courses }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#e7edf4'
    ctx.fillRect(0, 0, width, height)
    const cells = new Map()
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const course of courses || []) {
      const y = Number(course.plateY) || 0
      for (const piece of course.pieces || []) {
        const color = COLORS[piece.color]?.hex || '#A0A5A9'
        for (let dz = 0; dz < piece.d; dz++) {
          for (let dx = 0; dx < piece.w; dx++) {
            const x = piece.x + dx
            const z = piece.z + dz
            const previous = cells.get(`${x}|${z}`)
            if (!previous || y >= previous.y) cells.set(`${x}|${z}`, { y, color, x, z })
            minX = Math.min(minX, x)
            minZ = Math.min(minZ, z)
            maxX = Math.max(maxX, x)
            maxZ = Math.max(maxZ, z)
          }
        }
      }
    }
    if (!cells.size) return
    const cols = maxX - minX + 1
    const rows = maxZ - minZ + 1
    const pad = 18
    const cell = Math.max(2, Math.min((width - pad * 2) / cols, (height - pad * 2) / rows))
    const ox = (width - cols * cell) / 2
    const oy = (height - rows * cell) / 2
    const gap = Math.max(0.6, cell * 0.08)
    for (const item of cells.values()) {
      const x = ox + (item.x - minX) * cell + gap / 2
      const y = oy + (item.z - minZ) * cell + gap / 2
      const size = cell - gap
      ctx.fillStyle = item.color
      ctx.beginPath()
      ctx.roundRect(x, y, size, size, Math.min(4, size * 0.18))
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.beginPath()
      ctx.arc(x + size / 2, y + size / 2, Math.max(1, size * 0.18), 0, Math.PI * 2)
      ctx.fill()
    }
  }, [courses])
  return <canvas ref={ref} className="save-preview" width={440} height={280} aria-hidden="true" />
}

export default function Composer({
  prompt,
  photo,
  modelFile,
  studs,
  building,
  error,
  onPrompt,
  onPhoto,
  onModel,
  onStuds,
  onBuild,
  saves,
  onOpenSave,
  onForgetSave,
  onOpenFile,
  onManual,
}) {
  const [over, setOver] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [list, setList] = useState('ideas')
  const attachRef = useRef(null)
  const sizeRef = useRef(null)
  const ready = Boolean(prompt.trim() || photo || modelFile)
  const attached = photo?.name || modelFile?.name || ''

  useEffect(() => {
    if (!attachOpen && !sizeOpen) return undefined
    function onPointer(event) {
      if (attachOpen && !attachRef.current?.contains(event.target)) setAttachOpen(false)
      if (sizeOpen && !sizeRef.current?.contains(event.target)) setSizeOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setAttachOpen(false)
        setSizeOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [attachOpen, sizeOpen])

  return (
    <div className="composer">
      <header className="composer-bar">
        <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="1" y="3.5" width="30" height="27.5" rx="7" fill="#8E1408" />
          <rect x="1" y="1" width="30" height="26" rx="7" fill="#C91A09" />
          <g>
            <circle cx="10.5" cy="9.5" r="3.55" fill="#8E1408" />
            <circle cx="21.5" cy="9.5" r="3.55" fill="#8E1408" />
            <circle cx="10.5" cy="18.5" r="3.55" fill="#8E1408" />
            <circle cx="21.5" cy="18.5" r="3.55" fill="#8E1408" />
            <circle cx="10.5" cy="8.85" r="2.7" fill="#F06A58" />
            <circle cx="21.5" cy="8.85" r="2.7" fill="#F06A58" />
            <circle cx="10.5" cy="17.85" r="2.7" fill="#F06A58" />
            <circle cx="21.5" cy="17.85" r="2.7" fill="#F06A58" />
            <circle cx="9.7" cy="8.05" r="0.95" fill="#fff" fillOpacity="0.7" />
            <circle cx="20.7" cy="8.05" r="0.95" fill="#fff" fillOpacity="0.7" />
            <circle cx="9.7" cy="17.05" r="0.95" fill="#fff" fillOpacity="0.7" />
            <circle cx="20.7" cy="17.05" r="0.95" fill="#fff" fillOpacity="0.7" />
          </g>
        </svg>
        <strong>Brick Studio</strong>
      </header>
      <div className="composer-body hero-home">
        <div className="hero-stage">
          <div className="hero-sheet">
            <h1 className="hero-title">
              Turn your <strong>ideas</strong> into lego models
            </h1>
          </div>
          <form
            className={`ask-card ${over ? 'is-over' : ''}`}
            onSubmit={(event) => {
              event.preventDefault()
              if (ready && !building) onBuild()
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setOver(false)
              takeFile(event.dataTransfer.files?.[0], onPhoto, onModel)
            }}
          >
            <textarea
              aria-label="Prompt"
              value={prompt}
              rows={2}
              placeholder="What do you want to build?"
              onChange={(event) => onPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && ready && !building) {
                  event.preventDefault()
                  onBuild()
                }
              }}
            />
            <div className="ask-bar">
              <div className="attach" ref={attachRef}>
                <button
                  type="button"
                  className={attachOpen || attached ? 'on' : ''}
                  aria-label="Add a picture or model"
                  aria-haspopup="menu"
                  aria-expanded={attachOpen}
                  onClick={() => {
                    setSizeOpen(false)
                    setAttachOpen((open) => !open)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.6 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"
                    />
                  </svg>
                </button>
                {attachOpen ? (
                  <div className="attach-menu" role="menu">
                    <label className="file">
                      Choose image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) readFile(file, onPhoto)
                          event.target.value = ''
                          setAttachOpen(false)
                        }}
                      />
                    </label>
                    <label className="file">
                      Choose model
                      <input
                        type="file"
                        accept=".glb,.gltf,.obj,.stl,.ply,model/gltf-binary,model/gltf+json"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) takeFile(file, onPhoto, onModel)
                          event.target.value = ''
                          setAttachOpen(false)
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        samplePhoto(onPhoto)
                        setAttachOpen(false)
                      }}
                    >
                      Use a sample
                    </button>
                    {attached ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (photo) onPhoto(null)
                          if (modelFile) onModel(null)
                          setAttachOpen(false)
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {attached ? (
                <span className="attach-chip">
                  {photo ? <img src={photo.url} alt="" /> : null}
                  {attached}
                </span>
              ) : null}
              <div className="size-control" ref={sizeRef}>
                <button
                  type="button"
                  className={`ask-pill ${sizeOpen ? 'on' : ''}`}
                  aria-expanded={sizeOpen}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setAttachOpen(false)
                    setSizeOpen((open) => !open)
                  }}
                >
                  Size
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {sizeOpen ? (
                  <div className="size-menu" role="dialog" aria-label="Model size">
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
                        onChange={(event) => onStuds(partLevel(event.target.value))}
                      />
                      <span>More</span>
                    </label>
                    <p>{scaleText(studs)}. Each step is 8 studs, 6.4 cm.</p>
                  </div>
                ) : null}
              </div>
              <button type="submit" className="ask-send" aria-label="Build" disabled={!ready || building}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </button>
            </div>
          </form>
        </div>
        <div className="start-row">
        <div className="idea-filters" role="tablist" aria-label="Start lists">
          <button type="button" role="tab" className={list === 'ideas' ? 'on' : ''} aria-selected={list === 'ideas'} onClick={() => setList('ideas')}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11c.4.4.7 1 .8 1.6V17h4.4v-1.4c.1-.6.4-1.2.8-1.6A6 6 0 0 0 12 3z" />
            </svg>
            Ideas
          </button>
          <button type="button" role="tab" className={list === 'saved' ? 'on' : ''} aria-selected={list === 'saved'} onClick={() => setList('saved')}>
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10z"
              />
            </svg>
            Saved
            {saves.length ? <span className="quiet">{saves.length}</span> : null}
          </button>
        </div>
          <button type="button" className="manual-start" onClick={onManual} disabled={building}>
            Build manually
          </button>
        </div>
        {list === 'ideas' ? (
          <ul className="idea-list">
            {IDEAS.map((idea) => (
              <li key={idea.id}>
                <button type="button" disabled={building} onClick={() => onPrompt(idea.text)}>
                  <span>{idea.text}</span>
                  <svg className="idea-go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {list === 'saved' ? (
          <section className="save-folder" aria-label="Saved builds">
            {saves.length ? (
              <ul className="saves">
                {saves.map((item) => (
                  <li key={item.id}>
                    <article className="save-card">
                      <button type="button" className="save-open" onClick={() => onOpenSave(item.id)} disabled={building}>
                        <SavePreview courses={item.courses} />
                        <span className="save-meta">
                          <strong>{item.name}</strong>
                          <span>
                            {item.parts} {item.parts === 1 ? 'part' : 'parts'}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="save-remove"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => onForgetSave(item.id)}
                        disabled={building}
                      >
                        ×
                      </button>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="folder-empty">Nothing saved yet.</p>
            )}
            <label className="file">
              Open a file
              <input
                type="file"
                accept="application/json,.json"
                disabled={building}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onOpenFile(file)
                  event.target.value = ''
                }}
              />
            </label>
          </section>
        ) : null}
        {error && <p className="error">{error}</p>}
      </div>
      {building && (
        <div className="building">
          <p role="status">
            {modelFile
              ? 'Filling the model with plates.'
              : photo
                ? 'Modeling the picture with Tripo. This takes about a minute.'
                : 'Modeling the form with Tripo. This takes about a minute.'}
          </p>
          <PixelGame />
        </div>
      )}
    </div>
  )
}
