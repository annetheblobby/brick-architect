const MODEL = 'v3.1-20260211'
const ROOT = 'https://openapi.tripo3d.ai/v3'
const STUD_MIN = 24
const STUD_MAX = 192
const STUD_STEP = 8

function failure(body, status, hosted) {
  const message = body?.message || body?.error?.message || body?.suggestion || 'Tripo rejected that request.'
  if (status === 401 || /auth|credential|api key/i.test(message)) {
    return hosted
      ? 'Tripo rejected the key. In Netlify, set TRIPO_API_KEY to a current key and redeploy.'
      : 'Tripo rejected the key in .env.local. Paste a current key on the TRIPO_API_KEY= line and build again.'
  }
  if (/credit|balance|quota|insufficient/i.test(`${message} ${body?.suggestion || ''}`)) {
    return 'The Tripo account is out of API credits. Add credits in the developer console, then build again.'
  }
  return String(message).slice(0, 240)
}

export function missingKeyMessage(hosted) {
  return hosted
    ? 'Add TRIPO_API_KEY in the Netlify site settings under Environment variables, then redeploy.'
    : 'Paste your Tripo API key into .env.local in the project folder as TRIPO_API_KEY=, then build again.'
}

export function studsOf(value) {
  const snapped = Math.round(Number(value) / STUD_STEP) * STUD_STEP
  if (!Number.isFinite(snapped)) return 32
  return Math.min(STUD_MAX, Math.max(STUD_MIN, snapped))
}

function faceLimit(studs) {
  const t = (studs - STUD_MIN) / (STUD_MAX - STUD_MIN)
  return Math.round(4000 + t * 16000)
}

function lengthOf(studs) {
  const cm = (studs * 8) / 10
  return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`
}

function buildPrompt(prompt, tweak, studs) {
  const sentence = (prompt || '').trim()
  const change = (tweak || '').trim()
  const text = change ? [sentence, change].filter(Boolean).join('. ') : sentence
  if (!text) return ''
  const guide = `The subject is about ${lengthOf(studs)} on its longest side. if there are appendages such as heads or limbs, have them facing striaght`
  const room = 1024 - guide.length - 2
  return `${text.slice(0, Math.max(0, room))}. ${guide}`
}

async function tripo(key, route, init, hosted) {
  const headers = { authorization: `Bearer ${key}` }
  if (init.body && !(init.body instanceof FormData)) headers['content-type'] = 'application/json'
  const response = await fetch(`${ROOT}${route}`, {
    method: init.method || 'GET',
    headers,
    body: init.body,
    signal: AbortSignal.timeout(20000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || (body.code != null && body.code !== 0)) {
    throw new Error(failure(body, response.status, hosted))
  }
  return body.data ?? body
}

async function uploadImage(key, dataUrl, hosted) {
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || '')
  if (!match) throw new Error('Use a PNG or JPEG picture.')
  const type = match[1] === 'png' ? 'image/png' : 'image/jpeg'
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), type === 'image/png' ? 'subject.png' : 'subject.jpg')
  const data = await tripo(key, '/files', { method: 'POST', body: form }, hosted)
  if (!data?.file_token) throw new Error('Tripo did not accept the picture.')
  return data.file_token
}

/** Start a Tripo task and return its id. The caller polls until the file is ready. */
export async function startGeneration(key, { prompt, image, tweak, variant, studs }, hosted = false) {
  const scale = studsOf(studs)
  const sentence = buildPrompt(prompt, tweak, scale)
  const geometry = {
    model: MODEL,
    texture: true,
    pbr: true,
    texture_quality: 'standard',
    delight: true,
    face_limit: faceLimit(scale),
    export_uv: true,
  }
  if (!tweak && variant > 0) geometry.model_seed = variant
  let route = '/generation/text-to-model'
  let payload = { ...geometry, prompt: sentence }
  if (image && !tweak) {
    route = '/generation/image-to-model'
    payload = { ...geometry, input: await uploadImage(key, image, hosted), texture_alignment: 'original_image' }
  } else if (!sentence) {
    throw new Error('Type a sentence, add a picture, or use both.')
  }
  const created = await tripo(key, route, { method: 'POST', body: JSON.stringify(payload) }, hosted)
  const taskId = created?.task_id
  if (!taskId) throw new Error('Tripo did not start a model.')
  return taskId
}

/** One status check. Returns the model when Tripo has finished, otherwise a running status. */
export async function fetchResult(key, taskId, hosted = false) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId || '')) {
    throw new Error('That build could not be checked.')
  }
  const task = await tripo(key, `/tasks/${taskId}`, {}, hosted)
  if (task?.status === 'success') {
    const url = task.output?.model_url
    if (!url) throw new Error('Tripo finished without a model file.')
    const file = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!file.ok) throw new Error('Tripo built the model, but the file could not be downloaded.')
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length < 100) throw new Error('Tripo returned an empty model.')
    return { glb: buffer.toString('base64') }
  }
  if (['failed', 'cancelled', 'banned', 'expired'].includes(task?.status)) {
    throw new Error(String(task.error_message || task.message || 'Tripo could not build that model.').slice(0, 240))
  }
  return { status: task?.status || 'running' }
}

export { MODEL }
