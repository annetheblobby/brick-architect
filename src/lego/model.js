import { scoreLabels, vectorOf } from './features.js'
import { TECHNIQUE_MODEL } from './weights.js'

/** Ranked technique ids. Empty when the weight file has not been trained. */
export function rankTechniques(text) {
  const model = TECHNIQUE_MODEL
  if (!model || !model.labels || model.labels.length < 8 || !model.W || !model.W.length) return []
  const vector = vectorOf(text, model.features)
  const probs = scoreLabels(model.W, vector)
  const ranked = model.labels.map((id, index) => ({ id, p: probs[index] }))
  ranked.sort((a, b) => b.p - a.p)
  return ranked
}

/** Confident when the top class is clear of the runner-up, not only when it owns half the mass. */
export function confidentPick(ranked) {
  const top = ranked[0]
  if (!top) return null
  const second = ranked[1] ? ranked[1].p : 0
  if (top.p >= 0.55 || (top.p >= 0.4 && top.p - second >= 0.2)) return top
  return null
}
