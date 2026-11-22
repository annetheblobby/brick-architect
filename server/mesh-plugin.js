import fs from 'node:fs'
import path from 'node:path'

const MODEL = 'v3.1-20260211'
const ROOT = 'https://openapi.tripo3d.ai/v3'
const STUD_MIN = 24
const STUD_MAX = 192
const STUD_STEP = 8

function readKey(root) {
  const file = path.join(root, '.env.local')
  try {
    const text = fs.readFileSync(file, 'utf8')
    for (const row of text.split('\n')) {
      const line = row.trim()
      if (!line || line.startsWith('#') || !line.startsWith('TRIPO_API_KEY=')) continue
      let value = line.slice('TRIPO_API_KEY='.length).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (value) return value
    }
  } catch {
    // The file is created empty so the key has a place to go.
  }
  return process.env.TRIPO_API_KEY || ''
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 6_000_000) {
        reject(new Error('That picture is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function failure(body, status) {
  const message = body?.message || body?.error?.message || body?.suggestion || 'Tripo rejected that request.'
  if (status === 401 || /auth|credential|api key/i.test(message)) {
    return 'Tripo rejected the key in .env.local. Paste a current key on the TRIPO_API_KEY= line and build again.'
  }
  if (/credit|balance|quota|insufficient/i.test(`${message} ${body?.suggestion || ''}`)) {
    return 'The Tripo account is out of API credits. Add credits in the developer console, then build again.'
  }
  return String(message).slice(0, 240)
}

async function tripo(key, route, init = {}) {
  const headers = { authorization: `Bearer ${key}` }
  if (init.body && !(init.body instanceof FormData)) headers['content-type'] = 'application/json'
  const response = await fetch(`${ROOT}${route}`, {
    method: init.method || 'GET',
    headers,
    body: init.body,
    signal: AbortSignal.timeout(180000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || (body.code != null && body.code !== 0)) {
    throw new Error(failure(body, response.status))
  }
  return body.data ?? body
}

function studsOf(value) {
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

function buildGuide(studs) {
  return `The subject is about ${lengthOf(studs)} on its longest side. if there are appendages such as heads or limbs, have them facing striaght`
}

function buildPrompt(prompt, tweak, studs) {
  const sentence = (prompt || '').trim()
  const change = (tweak || '').trim()
  const text = change ? [sentence, change].filter(Boolean).join('. ') : sentence
  if (!text) return ''
  const guide = buildGuide(studs)
  const room = 1024 - guide.length - 2
  return `${text.slice(0, Math.max(0, room))}. ${guide}`
}

async function uploadImage(key, dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || '')
  if (!match) throw new Error('Use a PNG or JPEG picture.')
  const type = match[1] === 'png' ? 'image/png' : 'image/jpeg'
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), type === 'image/png' ? 'subject.png' : 'subject.jpg')
  const data = await tripo(key, '/files', { method: 'POST', body: form })
  if (!data?.file_token) throw new Error('Tripo did not accept the picture.')
  return data.file_token
}

async function generate(key, prompt, image, tweak, variant, studs) {
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
    payload = { ...geometry, input: await uploadImage(key, image), texture_alignment: 'original_image' }
  } else if (!sentence) {
    throw new Error('Type a sentence, add a picture, or use both.')
  }
  const created = await tripo(key, route, { method: 'POST', body: JSON.stringify(payload) })
  const taskId = created?.task_id
  if (!taskId) throw new Error('Tripo did not start a model.')
  const started = Date.now()
  while (Date.now() - started < 240000) {
    const task = await tripo(key, `/tasks/${taskId}`)
    if (task?.status === 'success') {
      const url = task.output?.model_url
      if (!url) throw new Error('Tripo finished without a model file.')
      const file = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!file.ok) throw new Error('Tripo built the model, but the file could not be downloaded.')
      const buffer = Buffer.from(await file.arrayBuffer())
      if (buffer.length < 100) throw new Error('Tripo returned an empty model.')
      return buffer.toString('base64')
    }
    if (['failed', 'cancelled', 'banned', 'expired'].includes(task?.status)) {
      throw new Error(String(task.error_message || task.message || 'Tripo could not build that model.').slice(0, 240))
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Tripo is still working. Try the build again in a minute.')
}

function attach(server, root) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/api/mesh')) return next()
    try {
      if (req.method === 'GET') {
        send(res, 200, { ready: Boolean(readKey(root)), model: MODEL })
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'Use a sentence, a picture, or both.' })
        return
      }
      const key = readKey(root)
      if (!key) {
        send(res, 400, {
          error: 'Paste your Tripo API key into .env.local in the project folder as TRIPO_API_KEY=, then build again.',
        })
        return
      }
      const raw = await readBody(req)
      const payload = JSON.parse(raw || '{}')
      const prompt = typeof payload.prompt === 'string' ? payload.prompt.slice(0, 2000) : ''
      const image = typeof payload.image === 'string' ? payload.image : ''
      const tweak = typeof payload.tweak === 'string' ? payload.tweak.trim().slice(0, 500) : ''
      const variant = Number.isInteger(payload.variant) ? payload.variant : 0
      const studs = studsOf(payload.studs)
      if (!prompt.trim() && !image && !tweak) {
        send(res, 400, { error: 'Type a sentence, add a picture, or use both.' })
        return
      }
      if (image && !tweak && !/^data:image\/(png|jpeg|jpg);base64,/.test(image)) {
        send(res, 400, { error: 'Use a PNG or JPEG picture.' })
        return
      }
      const glb = await generate(key, prompt, image, tweak, variant, studs)
      send(res, 200, { glb })
    } catch (err) {
      send(res, 502, { error: err.message || 'The model did not return a mesh.' })
    }
  })
}

/** Dev and preview server route. The key is read from .env.local and never sent to the browser. */
export function meshApi() {
  let root = process.cwd()
  return {
    name: 'mesh-api',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      attach(server, root)
    },
    configurePreviewServer(server) {
      attach(server, root)
    },
  }
}
