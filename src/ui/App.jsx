import { useEffect, useRef, useState } from 'react'
import { blankModel } from '../lego/design.js'
import { addCourse, clonePiece, hingePiece, insertCourse, movePiece, placePiece, removePiece } from '../lego/edit.js'
import { download, slug } from '../lego/format.js'
import { forgetSave, listSaves, modelFromCourse, openSave, rememberBuild } from '../lego/library.js'
import { holdOutside, localRevision } from '../lego/hold.js'
import { diffBill } from '../lego/review.js'
import { fillSource, modelFromFile, modelFromPrompt } from '../lego/promptmesh.js'
import Composer from './Composer.jsx'
import Studio from './Studio.jsx'

function fitTweak(earlier, change, limit) {
  const note = (limit || '').trim()
  const latest = [change, note].filter(Boolean).join('. ')
  const prior = earlier.filter(Boolean).join('. ')
  if (!prior) return latest.slice(0, 500)
  const suffix = `. ${latest}`
  const head = prior.slice(0, Math.max(0, 500 - suffix.length))
  return `${head}${suffix}`.slice(0, 500)
}

export default function App() {
  const [phase, setPhase] = useState('compose')
  const [prompt, setPrompt] = useState('')
  const [photo, setPhoto] = useState(null)
  const [modelFile, setModelFile] = useState(null)
  const [studs, setStuds] = useState(32)
  const [style, setStyle] = useState('realistic')
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
  const [saves, setSaves] = useState(() => listSaves())
  const [saved, setSaved] = useState(false)
  const [mesh, setMesh] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tool, setTool] = useState('place')
  const [gridStep, setGridStep] = useState(1)
  const [snap, setSnap] = useState(true)
  const [selection, setSelection] = useState(null)
  const history = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [brush, setBrush] = useState({ w: 2, d: 4, color: 'red', kind: 'plate' })
  const [chat, setChat] = useState([])
  const [chatIndex, setChatIndex] = useState(0)
  const playingRef = useRef(false)
  const tokenRef = useRef(0)
  const partTimer = useRef(0)
  const savedTimer = useRef(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const courseRef = useRef(0)
  const modelRef = useRef(null)
  const meshRef = useRef(null)
  const viewRef = useRef(view)
  const chatRef = useRef([])
  const chatIndexRef = useRef(0)
  const chatSeq = useRef(0)
  const tweakFails = useRef({ text: '', count: 0 })
  playingRef.current = playing
  courseRef.current = course
  modelRef.current = model
  meshRef.current = mesh
  viewRef.current = view
  chatRef.current = chat
  chatIndexRef.current = chatIndex

  useEffect(() => {
    history.current = []
    setCanUndo(false)
  }, [model?.id])

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
      if (
        viewRef.current === 'custom' &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.code === 'KeyZ'
      ) {
        if (undoEdit()) event.preventDefault()
        return
      }
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
      } else if (viewRef.current === 'custom' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const key = event.key.toLowerCase()
        if (key === 'r') {
          event.preventDefault()
          setBrush((current) => ({ ...current, w: current.d, d: current.w }))
        } else if (key === 'e') {
          event.preventDefault()
          setTool((current) => (current === 'place' ? 'remove' : 'place'))
        } else if (key === 'v') {
          event.preventDefault()
          setTool('select')
        } else if (key === 'm') {
          event.preventDefault()
          setTool('move')
        } else if (key === 'c') {
          event.preventDefault()
          setTool('clone')
        } else if (key === 'h') {
          event.preventDefault()
          setTool('hinge')
        } else if (key === 's') {
          event.preventDefault()
          setSnap((current) => !current)
        }
      } else if (event.key === ' ') {
        event.preventDefault()
        if (viewRef.current === 'custom') return
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

  function disposeTree(root) {
    root?.traverse((obj) => {
      obj.geometry?.dispose()
      obj.material?.dispose()
    })
  }

  function copyModel(model) {
    return JSON.parse(JSON.stringify(model))
  }

  function nextChatId() {
    chatSeq.current += 1
    return `m${chatSeq.current}`
  }

  function forgetMeshes(keep) {
    const held = new Set((keep || []).filter(Boolean))
    const gone = new Set()
    const drop = (mesh) => {
      if (!mesh || held.has(mesh) || gone.has(mesh)) return
      gone.add(mesh)
      disposeTree(mesh)
    }
    drop(meshRef.current)
    for (const turn of chatRef.current) drop(turn.mesh)
  }

  function publishChat(turns, index) {
    chatRef.current = turns
    chatIndexRef.current = index
    setChat(turns)
    setChatIndex(index)
  }

  function commitBuild(next, source) {
    forgetMeshes([source])
    const turn = {
      id: nextChatId(),
      prompt: (next.sentence || '').trim(),
      reply: next.summary || 'Built.',
      status: 'done',
      error: '',
      model: copyModel(next),
      mesh: source,
    }
    publishChat([turn], 0)
    meshRef.current = source
    setMesh(source)
  }

  function commitRevision(next, source, chatId) {
    const turns = chatRef.current
    const index = turns.findIndex((turn) => turn.id === chatId)
    if (index < 0) {
      disposeTree(source)
      return false
    }
    const updated = {
      ...turns[index],
      reply: next.summary || 'Revised.',
      status: 'done',
      error: '',
      model: copyModel(next),
      mesh: source,
    }
    const nextTurns = turns.map((turn, i) => (i === index ? updated : turn)).slice(0, index + 1)
    forgetMeshes(nextTurns.map((turn) => turn.mesh))
    publishChat(nextTurns, index)
    meshRef.current = source
    setMesh(source)
    return true
  }

  function failChat(chatId, message) {
    const turns = chatRef.current.map((turn) =>
      turn.id === chatId
        ? { ...turn, status: 'error', error: message || 'That change did not come together.' }
        : turn,
    )
    chatRef.current = turns
    setChat(turns)
  }

  function ensureChat() {
    if (chatRef.current.length) return
    const current = modelRef.current
    if (!current || (current.origin !== 'model' && current.origin !== 'scan')) return
    const turn = {
      id: nextChatId(),
      prompt: (current.sentence || '').trim(),
      reply: current.summary || 'Built.',
      status: 'done',
      error: '',
      model: copyModel(current),
      mesh: meshRef.current,
    }
    publishChat([turn], 0)
  }

  function choosePanel(next) {
    if (next === 'ai') ensureChat()
    setPanel(next)
  }

  function restoreChat(index) {
    if (busy) return
    const turn = chatRef.current[index]
    if (!turn || turn.status !== 'done' || !turn.model) return
    chatIndexRef.current = index
    setChatIndex(index)
    setModel(copyModel(turn.model))
    if (turn.mesh) {
      meshRef.current = turn.mesh
      setMesh(turn.mesh)
    }
    setCourse(Math.max(0, turn.model.courses.length - 1))
    setFocus(null)
    setPlaying(false)
    setNotes({})
    setError('')
    setView('progress')
  }

  function finish(next, source, started, token, request) {
    const wait = Math.max(0, 480 - (performance.now() - started))
    window.setTimeout(() => {
      if (tokenRef.current !== token) {
        disposeTree(source)
        return
      }
      if (request?.chatId) {
        if (modelRef.current?.bill) next.changes = diffBill(modelRef.current.bill, next.bill)
        tweakFails.current = { text: '', count: 0 }
        const kept = commitRevision(next, source, request.chatId)
        if (!kept) {
          setBusy(false)
          return
        }
      } else {
        commitBuild(next, source)
      }
      setModel(next)
      setCourse(next.courses.length - 1)
      setFocus(null)
      setNotes({})
      setPlaying(false)
      setView('progress')
      setGhost(false)
      setPanel(request?.chatId ? 'ai' : 'step')
      setError('')
      setBusy(false)
      setPhase('studio')
    }, wait)
  }

  async function run(request) {
    const token = tokenRef.current + 1
    tokenRef.current = token
    const fromStudio = phaseRef.current === 'studio'
    setBusy(true)
    setPlaying(false)
    setError('')
    if (!fromStudio) setPhase('building')
    const started = performance.now()
    await new Promise((resolve) => window.setTimeout(resolve, 40))
    if (tokenRef.current !== token) return
    try {
      let next
      let source = null
      if (request.modelFile) {
        const built = await modelFromFile(request.modelFile, request.studs)
        next = built.model
        source = built.source
        if (request.prompt.trim()) {
          next.name = request.prompt.trim()
          next.prompt = request.prompt.trim()
        }
      } else {
        const built = await modelFromPrompt(
          request.prompt,
          request.studs,
          request.variant,
          request.photo?.dataUrl || null,
          request.revision || null,
          request.style,
        )
        next = built.model
        source = built.source
        if (request.hold?.previous && request.hold?.mask) {
          next = holdOutside(request.hold.previous, next, request.hold.mask)
        }
      }
      if (tokenRef.current !== token) {
        disposeTree(source)
        return
      }
      finish(next, source, started, token, request)
    } catch (err) {
      if (tokenRef.current !== token) return
      if (request.chatId) {
        const attempt = (request.revision?.tweak || '').trim()
        const same = tweakFails.current.text === attempt
        tweakFails.current = { text: attempt, count: same ? tweakFails.current.count + 1 : 1 }
        const message =
          tweakFails.current.count >= 2
            ? 'Two tries at that change did not land. Ask for a different change.'
            : err.message || 'That change did not come together.'
        failChat(request.chatId, message)
      }
      setBusy(false)
      setError(err.message || 'That build did not come together.')
      if (!fromStudio) setPhase('compose')
    }
  }

  function buildCurrent() {
    if (!prompt.trim() && !photo && !modelFile) return
    run({ prompt, photo: modelFile ? null : photo, modelFile, studs, variant, style })
  }

  function applyTweak(text, boundary = '', mask = null) {
    const current = modelRef.current
    const change = (text || '').trim()
    const limit = (boundary || '').trim()
    if (!current || (current.origin !== 'model' && current.origin !== 'scan') || !change || busy) return
    ensureChat()
    let local = null
    try {
      local = localRevision(current, mask, change)
    } catch (err) {
      const kept = chatRef.current.slice(0, chatIndexRef.current + 1).filter((turn) => turn.status !== 'pending')
      publishChat(
        [
          ...kept,
          {
            id: nextChatId(),
            prompt: change,
            boundary: (boundary || '').trim(),
            reply: '',
            status: 'error',
            error: err.message || 'That drawn area could not be changed.',
            model: null,
            mesh: null,
          },
        ],
        kept.length,
      )
      setPanel('ai')
      return
    }
    if (local) {
      const kept = chatRef.current.slice(0, chatIndexRef.current + 1).filter((turn) => turn.status !== 'pending')
      const id = nextChatId()
      if (!local.changed) {
        publishChat(
          [
            ...kept,
            {
              id,
              prompt: change,
              boundary: (boundary || '').trim(),
              reply: '',
              status: 'error',
              error: 'That drawn area did not change. Ask for a different change.',
              model: null,
              mesh: null,
            },
          ],
          kept.length,
        )
        setPanel('ai')
        return
      }
      const next = local.model
      next.changes = diffBill(current.bill, next.bill)
      next.summary = next.summary || 'Revised the drawn area on the current build.'
      publishChat(
        [
          ...kept,
          {
            id,
            prompt: change,
            boundary: (boundary || '').trim(),
            reply: next.summary,
            status: 'done',
            error: '',
            model: copyModel(next),
            mesh: meshRef.current,
          },
        ],
        kept.length,
      )
      tweakFails.current = { text: '', count: 0 }
      setModel(next)
      setCourse(next.courses.length - 1)
      setPanel('ai')
      setError('')
      return
    }
    if (tweakFails.current.text === change && tweakFails.current.count >= 2) {
      const kept = chatRef.current.slice(0, chatIndexRef.current + 1).filter((turn) => turn.status !== 'pending')
      publishChat(
        [
          ...kept,
          {
            id: nextChatId(),
            prompt: change,
            boundary: (boundary || '').trim(),
            reply: '',
            status: 'error',
            error: 'Two tries at that change did not land. Ask for a different change.',
            model: null,
            mesh: null,
          },
        ],
        kept.length,
      )
      setPanel('ai')
      return
    }
    const kept = chatRef.current.slice(0, chatIndexRef.current + 1).filter((turn) => turn.status !== 'pending')
    const sentence = (current.sentence || current.prompt || prompt || '').trim()
    const earlier = kept
      .map((turn) => [turn.prompt.trim(), (turn.boundary || '').trim()].filter(Boolean).join('. '))
      .filter((line) => line && line !== sentence)
    const id = nextChatId()
    const painted = mask && ((mask.pieces && mask.pieces.length) || (mask.cells && mask.cells.length))
      ? {
          pieces: (mask.pieces || []).map((piece) => ({ ...piece })),
          cells: (mask.cells || []).map((cell) => ({ ...cell })),
        }
      : null
    const pending = {
      id,
      prompt: change,
      boundary: limit,
      reply: '',
      status: 'pending',
      error: '',
      model: null,
      mesh: null,
    }
    const nextTurns = [...kept, pending]
    const keepMeshes = new Set(kept.map((turn) => turn.mesh).filter(Boolean))
    for (const turn of chatRef.current) {
      if (turn.mesh && !keepMeshes.has(turn.mesh) && turn.mesh !== meshRef.current) disposeTree(turn.mesh)
    }
    publishChat(nextTurns, nextTurns.length - 1)
    setPanel('ai')
    run({
      prompt: sentence,
      photo: null,
      modelFile: null,
      studs,
      style,
      variant: 0,
      revision: { tweak: fitTweak(earlier, change, limit), tweaks: [] },
      chatId: id,
      hold: painted ? { mask: painted, previous: copyModel(current) } : null,
    })
  }

  function anotherTake() {
    if (!model || model.origin === 'file' || model.origin === 'scan' || model.origin === 'manual') return
    const next = variant + 1
    setVariant(next)
    run({ prompt: model.prompt || prompt, photo, modelFile: null, studs, variant: next, style })
  }

  function refillMesh(value) {
    const source = meshRef.current
    const current = modelRef.current
    if (!source || !current) return
    const token = tokenRef.current + 1
    tokenRef.current = token
    setBusy(true)
    setPlaying(false)
    setError('')
    const started = performance.now()
    window.setTimeout(() => {
      if (tokenRef.current !== token) return
      try {
        const next = fillSource(source, value, {
          name: current.name,
          prompt: current.prompt,
          origin: current.origin,
          summary: current.summary,
          spec: current.spec,
          sentence: current.sentence,
          tweaks: current.tweaks,
        })
        const wait = Math.max(0, 480 - (performance.now() - started))
        window.setTimeout(() => {
          if (tokenRef.current !== token) return
          if (current.bill) next.changes = diffBill(current.bill, next.bill)
          setModel(next)
          setCourse(next.courses.length - 1)
          setFocus(null)
          setNotes({})
          setPlaying(false)
          setView('progress')
          setBusy(false)
        }, wait)
      } catch (err) {
        if (tokenRef.current !== token) return
        setBusy(false)
        setError(err.message || 'That build did not come together.')
      }
    }, 40)
  }

  function startManual() {
    forgetMeshes([])
    publishChat([], 0)
    meshRef.current = null
    setMesh(null)
    setModel(blankModel())
    setNotes({})
    setCourse(0)
    setFocus(null)
    setPlaying(false)
    setView('custom')
    setGhost(false)
    setPanel('step')
    setError('')
    setBusy(false)
    setSaved(false)
    setTool('place')
    setPhase('studio')
  }

  function showBuild(opened) {
    forgetMeshes([])
    publishChat([], 0)
    meshRef.current = null
    setMesh(null)
    setModel(opened.model)
    setNotes(opened.notes || {})
    setCourse(Math.max(0, opened.model.courses.length - 1))
    setFocus(null)
    setPlaying(false)
    setView('progress')
    setGhost(false)
    setPanel('step')
    setError('')
    setBusy(false)
    setSaved(false)
    setPrompt(opened.model.prompt || '')
    if (opened.model.grid) setStuds(opened.model.grid)
    setPhase('studio')
  }

  function saveCurrent() {
    const current = modelRef.current
    if (!current) return
    try {
      const record = rememberBuild(current, notes)
      current.libraryId = record.id
      setModel({ ...current, libraryId: record.id })
      setSaves(listSaves())
      download(`${slug(record.name)}.json`, JSON.stringify(record.file), 'application/json')
      setSaved(true)
      setError('')
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      setSaved(false)
      setError(err.message || 'That build could not be saved.')
    }
  }

  function openStored(id) {
    try {
      showBuild(openSave(id))
    } catch (err) {
      setSaves(listSaves())
      setError(err.message || 'That saved build could not be opened.')
    }
  }

  async function openCourseFile(file) {
    if (!file) return
    try {
      const opened = modelFromCourse(JSON.parse(await file.text()))
      showBuild(opened)
    } catch {
      setError('That file is not a saved build.')
    }
  }

  function removeStored(id) {
    forgetSave(id)
    setSaves(listSaves())
  }

  function changeParts(value) {
    if (modelRef.current?.origin === 'manual') return
    if (modelRef.current?.origin === 'library' && !meshRef.current) return
    setStuds(value)
    window.clearTimeout(partTimer.current)
    partTimer.current = window.setTimeout(() => {
      if (meshRef.current && modelRef.current) {
        refillMesh(value)
        return
      }
      const text = (modelRef.current?.prompt || prompt).trim()
      if (!text && !photo) return
      run({ prompt: text, photo, modelFile: null, studs: value, variant, style })
    }, 280)
  }

  function choosePhoto(next) {
    setPhoto(next)
    if (next) setModelFile(null)
  }

  function chooseModel(file) {
    setModelFile(file)
    if (file) setPhoto(null)
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

  function rememberEdit() {
    const current = modelRef.current
    if (!current) return
    history.current = [...history.current.slice(-49), { model: current, course: courseRef.current }]
    setCanUndo(true)
  }

  function undoEdit() {
    const previous = history.current.pop()
    setCanUndo(history.current.length > 0)
    if (!previous) return false
    setModel(previous.model)
    setCourse(Math.max(0, Math.min(previous.course, previous.model.courses.length - 1)))
    setSelection(null)
    setFocus(null)
    setPlaying(false)
    return true
  }

  function commitEdit(next) {
    if (!next || next === modelRef.current) return false
    rememberEdit()
    setModel(next)
    setFocus(null)
    setPlaying(false)
    return true
  }

  function handlePlace(cell) {
    commitEdit(
      placePiece(modelRef.current, courseRef.current, {
        x: cell.x,
        z: cell.z,
        w: brush.w,
        d: brush.d,
        color: brush.color,
        kind: brush.kind || 'plate',
      }),
    )
  }

  function handleRemove(pieceIndex) {
    const next = removePiece(modelRef.current, courseRef.current, pieceIndex)
    if (!next || next === modelRef.current) return
    rememberEdit()
    setModel(next)
    setFocus(null)
    setSelection((current) => {
      if (!current || current.course !== courseRef.current) return current
      if (current.index === pieceIndex) return null
      if (current.index > pieceIndex) return { course: current.course, index: current.index - 1 }
      return current
    })
    setCourse((current) => Math.max(0, Math.min(current, next.courses.length - 1)))
  }

  function handleSelect(pieceIndex) {
    if (pieceIndex == null || pieceIndex < 0) {
      setSelection(null)
      return
    }
    setSelection({ course: courseRef.current, index: pieceIndex })
  }

  function handleMove(pieceIndex, x, z) {
    commitEdit(movePiece(modelRef.current, courseRef.current, pieceIndex, x, z))
  }

  function handleClone(pieceIndex, x, z) {
    commitEdit(clonePiece(modelRef.current, courseRef.current, pieceIndex, x, z))
  }

  function handleHinge(pieceIndex) {
    commitEdit(hingePiece(modelRef.current, courseRef.current, pieceIndex))
  }

  function handleAddLayer() {
    const next = addCourse(modelRef.current)
    if (!next || next === modelRef.current) return
    rememberEdit()
    setPlaying(false)
    setModel(next)
    setCourse(next.courses.length - 1)
    setFocus(null)
  }

  function handleInsertLayer() {
    const index = courseRef.current
    const next = insertCourse(modelRef.current, index)
    if (!next || next === modelRef.current) return
    rememberEdit()
    setPlaying(false)
    setModel(next)
    setCourse(Math.min(index + 1, next.courses.length - 1))
    setFocus(null)
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
    <div className="app" data-origin={model?.origin || ''} data-parts={model ? String(model.stats.parts) : ''} data-busy={busy ? 'true' : 'false'} data-grid={model?.grid ? String(model.grid) : ''}>
      <div className={`shell ${phase === 'studio' ? 'is-studio' : 'is-compose'}${phase === 'studio' && panel === 'ai' ? ' is-ai' : ''}`}>
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
            mesh={mesh}
            busy={busy}
            error={error}
            fileModel={model?.origin === 'file'}
            studs={studs}
            onBack={() => {
              setPlaying(false)
              setPhase('compose')
            }}
            onCourse={(index) => {
              setPlaying(false)
              setCourse(index)
            }}
            onView={(next) => {
              if (next === 'custom') setPlaying(false)
              if (next === 'all') setFocus(null)
              setView(next)
            }}
            onGhost={setGhost}
            onSpeed={setSpeed}
            onPanel={choosePanel}
            chat={chat}
            chatIndex={chatIndex}
            onRestore={restoreChat}
            onFocus={setFocus}
            onCard={setCard}
            onReset={() => setNonce((value) => value + 1)}
            onPlay={togglePlay}
            onNote={addNote}
            onAnother={anotherTake}
            onTweak={applyTweak}
            onParts={changeParts}
            tool={tool}
            brush={brush}
            gridStep={gridStep}
            snap={snap}
            selection={selection}
            onTool={setTool}
            onGrid={setGridStep}
            onSnap={setSnap}
            onBrush={setBrush}
            onRotate={() => setBrush((current) => ({ ...current, w: current.d, d: current.w }))}
            onAddLayer={handleAddLayer}
            onInsertLayer={handleInsertLayer}
            onPlace={handlePlace}
            onRemove={handleRemove}
            onSelect={handleSelect}
            onMove={handleMove}
            onClone={handleClone}
            onHinge={handleHinge}
            onUndo={undoEdit}
            canUndo={canUndo}
            onSave={saveCurrent}
            saved={saved}
          />
        ) : (
          <Composer
            prompt={prompt}
            photo={photo}
            modelFile={modelFile}
            studs={studs}
            style={style}
            building={phase === 'building'}
            error={error}
            onPrompt={setPrompt}
            onPhoto={choosePhoto}
            onModel={chooseModel}
            onStuds={setStuds}
            onStyle={setStyle}
            onBuild={buildCurrent}
            saves={saves}
            onOpenSave={openStored}
            onForgetSave={removeStored}
            onOpenFile={openCourseFile}
            onManual={startManual}
          />
        )}
      </div>
    </div>
  )
}
