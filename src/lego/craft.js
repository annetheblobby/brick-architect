const LEAF = new Set(['leaf', 'leaf2', 'canopy'])

export function chimneyColumns(cells) {
  const xs = new Set()
  for (const cell of cells.values()) if (cell.role === 'chimney') xs.add(cell.x)
  return xs.size / 2
}

/** The house floor is above the trunk, with canopy under it and beside the walls. */
export function houseSitsInTree(cells) {
  let trunkTop = -Infinity
  let wallBottom = Infinity
  let walls = 0
  for (const cell of cells.values()) {
    if (cell.role === 'trunk') trunkTop = Math.max(trunkTop, cell.y)
    if (cell.role === 'wall') {
      walls += 1
      wallBottom = Math.min(wallBottom, cell.y)
    }
  }
  if (!walls || trunkTop === -Infinity) return false
  let under = false
  let beside = false
  for (const cell of cells.values()) {
    if (!LEAF.has(cell.role)) continue
    if (cell.y < wallBottom) under = true
    if (cell.y >= wallBottom - 1 && cell.y <= wallBottom) beside = true
  }
  return wallBottom > trunkTop && under && beside
}

export function hasRole(cells, role) {
  for (const cell of cells.values()) if (cell.role === role) return true
  return false
}
