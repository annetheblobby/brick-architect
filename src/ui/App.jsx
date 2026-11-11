import { useEffect, useRef, useState } from 'react'
import { designFromPixels, designFromPrompt } from '../lego/design.js'
import Composer from './Composer.jsx'
import Studio from './Studio.jsx'

const EXAMPLES = [
  'Seaside cottage',
  'Castle gate',
  'Red coupe',
  'An orbital shuttle',
  'A striped lighthouse',
  'Old oak',
  'Garden duck',
  'Birthday cake',
  'Stone bridge',
  'Little robot',
]

export default function App() {
  const [phase, setPhase] = useState('compose')
  const [prompt, setPrompt] = useState('')
  const [photo, setPhoto] = useState(null)
  const [mode, setMode] = useState('relief')
  const [studs, setStuds] = useState(32)
  const [variant, setVariant] = useState(0)
  const [model, setModel] = useState(null)
  const [course, setCourse] = useState(0)
  const [view, setView] = useState('progress')
  const [ghost, setGhost] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [panel, setPanel] = useState('step')
  const [focus, setFocus] = useState(null)
  const [notes, setNotes] = useState({})
  const [card, setCard] = useState(168)
  const [nonce, setNonce] = useState(0)
  const [error, setError] = useState('')
  const playingRef = useRef(false)
  const courseRef = useRef(0)
  const modelRef = useRef(null)
  playingRef.current = playing
  courseRef.current = course
  modelRef.current = model

  useEffect(() => {
    if (phase !== 'studio' || !playing || !model) return undefined
    const id = setInterval(() => {
      setCourse((current) => {
        if (current >= model.courses.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, 1100 / speed)
    return () => clearInterval(id)
  }, [phase, playing, speed, model])

  useEffect(() => {
    function onKey(event) {
      if (phase !== 'studio' || !modelRef.current) return
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) return
      const count = modelRef.current.courses.length
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        setPlaying(false)
        setCourse((current) => Math.min(count - 1, current + 1))
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setPlaying(false)
        setCourse((current) => Math.max(0, current - 1))
      } else if (event.key === ' ') {
        event.preventDefault()
        if (playingRef.current) setPlaying(false)
        else if (courseRef.current >= count - 1) {
          setCourse(0)
          setPlaying(true)
        } else setPlaying(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  function finish(next, started) {
    const wait = Math.max(0, 480 - (performance.now() - started))
    window.setTimeout(() => {
      setModel(next)
      setCourse(next.courses.length - 1)
      setFocus(null)
      setNotes({})
      setPlaying(false)
      setView('progress')
      setGhost(false)
      setPanel('step')
      setError('')
      setPhase('studio')
    }, wait)
  }

  function run(request) {
    setPhase('building')
    setPlaying(false)
    setError('')
    const started = performance.now()
    window.setTimeout(() => {
      try {
        const next = request.photo
          ? designFromPixels(request.photo.data, request.photo.width, request.photo.height, {
              studs: request.studs,
              mode: request.mode,
              name: request.prompt.trim() || request.photo.name || 'Photo',
              prompt: request.prompt,
            })
          : designFromPrompt(request.prompt, request.variant)
        finish(next, started)
      } catch (err) {
        setError(err.message || 'That build did not come together.')
        setPhase('compose')
      }
    }, 40)
  }

  function buildCurrent() {
    if (!prompt.trim() && !photo) return
    run({ prompt, photo, mode, studs, variant })
  }

  function buildExample(text) {
    setPrompt(text)
    setPhoto(null)
    setVariant(0)
    run({ prompt: text, photo: null, mode, studs, variant: 0 })
  }

  function anotherTake() {
    if (!model || photo) return
    const next = variant + 1
    setVariant(next)
    run({ prompt: model.prompt || prompt, photo: null, mode, studs, variant: next })
  }

  function rebuildPhoto() {
    if (!photo) return
    run({ prompt, photo, mode, studs, variant })
  }

  function togglePlay() {
    if (!model) return
    if (playing) {
      setPlaying(false)
      return
    }
    if (course >= model.courses.length - 1) setCourse(0)
    setPlaying(true)
  }

  function addNote(text) {
    const clean = text.trim()
    if (!clean) return
    setNotes((current) => ({
      ...current,
      [course]: [...(current[course] || []), clean],
    }))
  }

  return (
    <div className="app">
      <div className={`shell ${phase === 'studio' ? 'is-studio' : 'is-compose'}`}>
        {phase === 'studio' && model ? (
          <Studio
            model={model}
            course={course}
            view={view}
            ghost={ghost}
            playing={playing}
            speed={speed}
            panel={panel}
            focus={focus}
            notes={notes[course] || []}
            card={card}
            nonce={nonce}
            photo={photo}
            mode={mode}
            studs={studs}
            onBack={() => {
              setPlaying(false)
              setPhase('compose')
            }}
            onCourse={(index) => {
              setPlaying(false)
              setCourse(index)
            }}
            onView={setView}
            onGhost={setGhost}
            onSpeed={setSpeed}
            onPanel={setPanel}
            onFocus={setFocus}
            onCard={setCard}
            onReset={() => setNonce((value) => value + 1)}
            onPlay={togglePlay}
            onNote={addNote}
            onAnother={anotherTake}
            onMode={setMode}
            onStuds={setStuds}
            onRebuild={rebuildPhoto}
          />
        ) : (
          <Composer
            prompt={prompt}
            photo={photo}
            mode={mode}
            studs={studs}
            examples={EXAMPLES}
            building={phase === 'building'}
            error={error}
            onPrompt={setPrompt}
            onPhoto={setPhoto}
            onMode={setMode}
            onStuds={setStuds}
            onExample={buildExample}
            onBuild={buildCurrent}
          />
        )}
      </div>
    </div>
  )
}
