const STOP = new Set(['please', 'build', 'make', 'design', 'create', 'me', 'want', 'like', 'give'])

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !STOP.has(token))
}

/** Phrase signals that disambiguate collisions a bag of words would tie. */
export function phraseSignals(text) {
  const raw = text || ''
  const folded = raw.toLowerCase()
  const names = []
  if (/\btree ?houses?\b|\btreehouse\b/.test(folded)) names.push('sig_treehouse')
  if (/\b(?:in|inside|among|atop)\s+(?:a\s+|the\s+|an\s+)?(?:tree|oak|canopy|branches)\b/.test(folded)) {
    names.push('sig_in_tree')
  }
  if (/\b(?:with|beside|by|and)\s+(?:a\s+|the\s+|an\s+)?(?:tree|oak)\b/.test(folded)) names.push('sig_with_tree')
  if (/\bclock ?towers?\b|\bclocktower\b|\btower with (?:a |the )?clock\b/.test(folded)) names.push('sig_clocktower')
  if (/\b(?:glass tower|skyscraper|high-?rise|office tower|tower block)\b/.test(folded)) names.push('sig_glasstower')
  if (/\b(?:space\s*ships?|spaceship|spacecraft|shuttle|rocket|missile|lander)\b/.test(folded)) names.push('sig_spacecraft')
  if (/^[A-Z0-9 ]{1,12}$/.test(raw.trim())) names.push('sig_shout')
  return names
}

export function signalsOf(text) {
  const tokens = tokenize(text)
  const names = ['bias', ...tokens]
  for (let i = 0; i < tokens.length - 1; i++) names.push(`${tokens[i]}_${tokens[i + 1]}`)
  names.push(...phraseSignals(text))
  return names
}

export function vectorOf(text, features) {
  const on = new Set(signalsOf(text))
  const vector = new Array(features.length)
  for (let i = 0; i < features.length; i++) vector[i] = on.has(features[i]) ? 1 : 0
  return vector
}

export function softmax(logits) {
  let max = -Infinity
  for (const value of logits) if (value > max) max = value
  const exps = new Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    const value = Math.exp(logits[i] - max)
    exps[i] = value
    sum += value
  }
  for (let i = 0; i < exps.length; i++) exps[i] /= sum
  return exps
}

export function scoreLabels(weights, vector) {
  const logits = new Array(weights.length)
  for (let row = 0; row < weights.length; row++) {
    const line = weights[row]
    let sum = 0
    for (let i = 0; i < vector.length; i++) if (vector[i]) sum += line[i]
    logits[row] = sum
  }
  return softmax(logits)
}
