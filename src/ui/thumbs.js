function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (channel) => Math.max(0, Math.min(255, Math.round(channel * amount)))
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

export function paintThumb(canvas, course) {
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  ctx.clearRect(0, 0, width, height)
  const cells = []
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const piece of course.pieces) {
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) {
        const x = piece.x + dx
        const z = piece.z + dz
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
        cells.push({ x, z, hex: piece.hex, stud: piece.kind === 'plate' || piece.kind === 'round1' })
      }
    }
  }
  if (!cells.length) return
  const span = Math.max(maxX - minX + 1, maxZ - minZ + 1, 1)
  const unit = Math.min(width * 0.78, height * 1.15) / span
  const originX = (minX + maxX) / 2
  const originZ = (minZ + maxZ) / 2
  const cx = width / 2
  const cy = height * 0.46
  cells.sort((a, b) => a.x + a.z - (b.x + b.z) || a.x - b.x)
  const studs = cells.length <= 160
  for (const cell of cells) {
    const ix = cell.x - originX - (cell.z - originZ)
    const iz = cell.x - originX + (cell.z - originZ)
    const sx = cx + ix * unit * 0.5
    const sy = cy + iz * unit * 0.27
    const hw = unit * 0.5
    const hh = unit * 0.27
    const t = unit * 0.15
    ctx.beginPath()
    ctx.moveTo(sx + hw, sy)
    ctx.lineTo(sx + hw, sy + t)
    ctx.lineTo(sx, sy + hh + t)
    ctx.lineTo(sx, sy + hh)
    ctx.closePath()
    ctx.fillStyle = shade(cell.hex, 0.78)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(sx - hw, sy)
    ctx.lineTo(sx - hw, sy + t)
    ctx.lineTo(sx, sy + hh + t)
    ctx.lineTo(sx, sy + hh)
    ctx.closePath()
    ctx.fillStyle = shade(cell.hex, 0.58)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(sx, sy - hh)
    ctx.lineTo(sx + hw, sy)
    ctx.lineTo(sx, sy + hh)
    ctx.lineTo(sx - hw, sy)
    ctx.closePath()
    ctx.fillStyle = cell.hex
    ctx.fill()
    if (studs && cell.stud) {
      ctx.beginPath()
      ctx.ellipse(sx, sy - hh * 0.15, unit * 0.09, unit * 0.05, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.fill()
    }
  }
}
