const COUNTS = { one: 1, two: 2, three: 3, twin: 2, double: 2, single: 1, pair: 2, extra: 2 }

/** How many chimneys the sentence asks for. Null when it never mentions one. */
export function chimneysIn(text) {
  const raw = (text || '').toLowerCase()
  if (!/\bchimneys?\b/.test(raw)) return null
  const match = raw.match(
    /\b(one|two|three|twin|double|single|pair|extra|1|2|3)\b(?:\s+of)?(?:\s+\w+){0,3}\s+chimneys?\b/,
  )
  if (match) {
    const word = match[1]
    if (word === '1' || word === '2' || word === '3') return Number(word)
    return COUNTS[word]
  }
  if (/\bchimneys\b/.test(raw)) return 2
  return 1
}

/**
 * True when the tree is beside the building, false when the building is in the tree.
 * Null when the sentence does not say.
 */
export function treeAttachment(text) {
  const raw = (text || '').toLowerCase()
  if (/\btreehouse\b|\btree house\b/.test(raw)) return false
  if (/\b(?:in|inside|among|atop)\s+(?:a\s+|the\s+|an\s+)?(?:tree|oak|canopy|branches)\b/.test(raw)) return false
  if (/\b(?:with|beside|by|and)\s+(?:a\s+|the\s+|an\s+)?(?:tree|oak)\b/.test(raw)) return true
  return null
}
