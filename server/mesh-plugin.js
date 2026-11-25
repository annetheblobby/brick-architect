import fs from 'node:fs'
import path from 'node:path'
import { MODEL, fetchResult, missingKeyMessage, startGeneration, studsOf } from './tripo.js'

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

function attach(server, root) {
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url || '', 'http://localhost')
    if (url.pathname !== '/api/mesh') return next()
    try {
      const task = url.searchParams.get('task') || ''
      if (req.method === 'GET' && !task) {
        send(res, 200, { ready: Boolean(readKey(root)), model: MODEL })
        return
      }
      const key = readKey(root)
      if (!key) {
        send(res, 400, { error: missingKeyMessage(false) })
        return
      }
      if (req.method === 'GET') {
        send(res, 200, await fetchResult(key, task, false))
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { error: 'Use a sentence, a picture, or both.' })
        return
      }
      const payload = JSON.parse((await readBody(req)) || '{}')
      const prompt = typeof payload.prompt === 'string' ? payload.prompt.slice(0, 2000) : ''
      const image = typeof payload.image === 'string' ? payload.image : ''
      const tweak = typeof payload.tweak === 'string' ? payload.tweak.trim().slice(0, 500) : ''
      const variant = Number.isInteger(payload.variant) ? payload.variant : 0
      if (!prompt.trim() && !image && !tweak) {
        send(res, 400, { error: 'Type a sentence, add a picture, or use both.' })
        return
      }
      if (image && !tweak && !/^data:image\/(png|jpeg|jpg);base64,/.test(image)) {
        send(res, 400, { error: 'Use a PNG or JPEG picture.' })
        return
      }
      const taskId = await startGeneration(key, {
        prompt,
        image,
        tweak,
        variant,
        studs: studsOf(payload.studs),
        style: payload.style,
      }, false)
      send(res, 200, { taskId })
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
