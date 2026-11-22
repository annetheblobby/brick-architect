import { MODEL, fetchResult, missingKeyMessage, startGeneration, studsOf } from '../../server/tripo.js'

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

function key() {
  return process.env.TRIPO_API_KEY || ''
}

/** Production route for /api/mesh. Each call stays short; the page polls until Tripo finishes. */
export async function handler(event) {
  try {
    const task = event.queryStringParameters?.task || ''
    if (event.httpMethod === 'GET' && !task) {
      return json(200, { ready: Boolean(key()), model: MODEL })
    }
    const secret = key()
    if (!secret) return json(400, { error: missingKeyMessage(true) })
    if (event.httpMethod === 'GET') {
      return json(200, await fetchResult(secret, task, true))
    }
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Use a sentence, a picture, or both.' })
    }
    const payload = JSON.parse(event.body || '{}')
    const prompt = typeof payload.prompt === 'string' ? payload.prompt.slice(0, 2000) : ''
    const image = typeof payload.image === 'string' ? payload.image : ''
    const tweak = typeof payload.tweak === 'string' ? payload.tweak.trim().slice(0, 500) : ''
    const variant = Number.isInteger(payload.variant) ? payload.variant : 0
    if (!prompt.trim() && !image && !tweak) {
      return json(400, { error: 'Type a sentence, add a picture, or use both.' })
    }
    if (image && !tweak && !/^data:image\/(png|jpeg|jpg);base64,/.test(image)) {
      return json(400, { error: 'Use a PNG or JPEG picture.' })
    }
    const taskId = await startGeneration(secret, { prompt, image, tweak, variant, studs: studsOf(payload.studs) }, true)
    return json(200, { taskId })
  } catch (err) {
    return json(502, { error: err.message || 'The model did not return a mesh.' })
  }
}
