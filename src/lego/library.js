import { retouch } from './design.js'
import { COLORS } from './palette.js'
import { isLegal } from './parts.js'

const KEY = 'course.saves'
const LIMIT = 24

/** Plain record of the plates, so a build can be stored and opened again. */
export function courseFile(model, notes) {
  return {
    format: 'course',
    version: 1,
    name: String(model?.name || 'Saved build').slice(0, 80),
    prompt: model?.prompt || '',
    summary: model?.summary || '',
    technique: model?.technique || '',
    grid: model?.grid || null,
    sentence: model?.sentence || '',
    tweaks: Array.isArray(model?.tweaks) ? model.tweaks.slice(-8) : [],
    shiftX: Number(model?.shiftX) || 0,
    shiftZ: Number(model?.shiftZ) || 0,
    sections: (model?.sections || []).map((section) => ({
      name: section.name,
      blurb: section.blurb || '',
    })),
    notes: notesOf(notes, model?.courses?.length || 0),
    courses: (model?.courses || []).map((course) => ({
      plateY: course.plateY,
      section: course.section || 'Build',
      pieces: course.pieces.map((piece) => ({
        x: piece.x,
        z: piece.z,
        w: piece.w,
        d: piece.d,
        color: piece.color,
        kind: piece.kind,
      })),
    })),
  }
}

function notesOf(raw, count) {
  const notes = {}
  if (!raw || typeof raw !== 'object') return notes
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= count || !Array.isArray(value)) continue
    const lines = value
      .filter((line) => typeof line === 'string')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12)
    if (lines.length) notes[index] = lines
  }
  return notes
}

function pieceOf(raw) {
  const kind = typeof raw?.kind === 'string' ? raw.kind : 'plate'
  const w = Math.round(Number(raw?.w))
  const d = Math.round(Number(raw?.d))
  const x = Math.round(Number(raw?.x))
  const z = Math.round(Number(raw?.z))
  const color = typeof raw?.color === 'string' ? raw.color : ''
  if (!Number.isFinite(x) || !Number.isFinite(z) || !isLegal(kind, w, d) || !COLORS[color]) return null
  return { x, z, w, d, color, kind }
}

/** Turn a saved file back into a model the studio can show. */
export function modelFromCourse(data) {
  if (!data || data.format !== 'course' || !Array.isArray(data.courses)) {
    throw new Error('That file is not a saved build.')
  }
  const drafts = []
  for (const course of data.courses) {
    const plateY = Math.round(Number(course?.plateY))
    if (!Number.isInteger(plateY) || plateY < 0 || plateY > 400) continue
    const pieces = (Array.isArray(course.pieces) ? course.pieces : []).map(pieceOf).filter(Boolean)
    drafts.push({
      plateY,
      section: typeof course.section === 'string' && course.section ? course.section.slice(0, 40) : 'Build',
      pieces,
    })
  }
  if (!drafts.some((course) => course.pieces.length)) throw new Error('That saved build has no plates.')
  const shell = {
    name: String(data.name || 'Saved build').slice(0, 80),
    prompt: typeof data.prompt === 'string' ? data.prompt : '',
    summary: typeof data.summary === 'string' && data.summary ? data.summary : 'Opened from a saved build.',
    technique: typeof data.technique === 'string' ? data.technique : '',
    origin: 'library',
    grid: Number(data.grid) || null,
    spec: null,
    sentence: typeof data.sentence === 'string' ? data.sentence : '',
    tweaks: Array.isArray(data.tweaks) ? data.tweaks.filter((line) => typeof line === 'string').slice(-8) : [],
    shiftX: Number(data.shiftX) || 0,
    shiftZ: Number(data.shiftZ) || 0,
    sections: Array.isArray(data.sections) ? data.sections : [],
    courses: [],
  }
  const model = retouch(shell, drafts)
  return { model, notes: notesOf(data.notes, model.courses.length) }
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function listSaves() {
  return readAll().map((item) => ({
    id: item.id,
    name: item.name,
    savedAt: item.savedAt,
    parts: item.parts,
    courses: item.file?.courses || [],
  }))
}

/** Keep this build on this browser. A later save of the same build replaces it. */
export function rememberBuild(model, notes) {
  if (!model?.courses?.length) throw new Error('There is nothing to save yet.')
  const file = courseFile(model, notes)
  const list = readAll()
  const id =
    model.libraryId && list.some((item) => item.id === model.libraryId)
      ? model.libraryId
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const record = {
    id,
    name: file.name,
    savedAt: new Date().toISOString(),
    parts: model.stats?.parts || file.courses.reduce((sum, course) => sum + course.pieces.length, 0),
    file,
  }
  const next = [record, ...list.filter((item) => item.id !== id)].slice(0, LIMIT)
  try {
    writeAll(next)
  } catch {
    while (next.length > 1) {
      next.pop()
      try {
        writeAll(next)
        return record
      } catch {
        // The newest build stays. Older ones give up their space.
      }
    }
    throw new Error('This browser could not store that build.')
  }
  return record
}

export function openSave(id) {
  const record = readAll().find((item) => item.id === id)
  if (!record) throw new Error('That saved build is no longer on this browser.')
  const opened = modelFromCourse(record.file)
  opened.model.libraryId = record.id
  return opened
}

export function forgetSave(id) {
  writeAll(readAll().filter((item) => item.id !== id))
}
