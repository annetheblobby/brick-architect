import { useState } from 'react'

function readFile(file, onPhoto) {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 320 / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    onPhoto({
      data: pixels.data,
      width: canvas.width,
      height: canvas.height,
      url,
      name: file.name.replace(/\.[^.]+$/, ''),
    })
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
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  onPhoto({
    data: pixels.data,
    width: canvas.width,
    height: canvas.height,
    url: canvas.toDataURL('image/png'),
    name: 'Sample cottage',
  })
}

export default function Composer({
  prompt,
  photo,
  mode,
  studs,
  examples,
  building,
  error,
  onPrompt,
  onPhoto,
  onMode,
  onStuds,
  onExample,
  onBuild,
}) {
  const [over, setOver] = useState(false)
  const ready = Boolean(prompt.trim() || photo)

  return (
    <div className="composer">
      <header className="composer-bar">
        <span className="mark" aria-hidden="true" />
        <strong>Course</strong>
        <span className="quiet">Brick architect</span>
      </header>
      <div className="composer-body">
        <p className="eyebrow">One plate thick, every course</p>
        <h1>What should we build?</h1>
        <p className="lede">
          A sentence or a photo becomes a model of real plates. You step through it course by course,
          the way a slicer walks a print, and leave with the parts, colors, and counts to order.
        </p>
        <label className="prompt">
          <span className="sr">Prompt</span>
          <textarea
            value={prompt}
            rows={3}
            placeholder="A blue cottage with a black roof"
            onChange={(event) => onPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready && !building) onBuild()
            }}
          />
        </label>
        <div
          className={`drop ${over ? 'is-over' : ''} ${photo ? 'has-photo' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            const file = event.dataTransfer.files?.[0]
            if (file && file.type.startsWith('image/')) readFile(file, onPhoto)
          }}
        >
          {photo ? (
            <img src={photo.url} alt="" />
          ) : (
            <div>
              <strong>Drop a photo</strong>
              <span>or choose one. Relief by default, mosaic if you want a flat picture.</span>
            </div>
          )}
          <div className="drop-actions">
            <label className="file">
              Choose image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) readFile(file, onPhoto)
                  event.target.value = ''
                }}
              />
            </label>
            <button type="button" className="texty" onClick={() => samplePhoto(onPhoto)}>
              Use a sample
            </button>
            {photo && (
              <button type="button" className="texty" onClick={() => onPhoto(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
        {photo && (
          <div className="photo-options">
            <div className="segment" role="group" aria-label="Picture mode">
              <button type="button" className={mode === 'relief' ? 'on' : ''} onClick={() => onMode('relief')}>
                Relief
              </button>
              <button type="button" className={mode === 'mosaic' ? 'on' : ''} onClick={() => onMode('mosaic')}>
                Mosaic
              </button>
            </div>
            <label className="studs">
              <span>{studs} studs wide</span>
              <input
                type="range"
                min={16}
                max={48}
                step={4}
                value={studs}
                onChange={(event) => onStuds(Number(event.target.value))}
              />
            </label>
          </div>
        )}
        <div className="chips" aria-label="Examples">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => onExample(example)} disabled={building}>
              {example}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="compose-actions">
          <button type="button" className="primary" disabled={!ready || building} onClick={onBuild}>
            {building ? 'Laying plates…' : 'Build'}
          </button>
          <span className="quiet">⌘ Enter</span>
        </div>
        <p className="fine">
          Course lays the plates from your words, or turns a photo into studs. It is not a live catalog.
          LEGO is a trademark of the LEGO Group, which does not sponsor or endorse this app.
        </p>
      </div>
      {building && (
        <div className="building" role="status">
          <div className="stud-spin" />
          <p>Checking the clutch on every plate.</p>
        </div>
      )}
    </div>
  )
}
