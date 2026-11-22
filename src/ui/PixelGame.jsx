import { useEffect, useRef, useState } from 'react'

const COLS = 22
const ROWS = 11
const CELL = 16
const AWAY_MS = 2000
const BRICKS = ['#F2CD37', '#0055BF', '#237841', '#FE8A18', '#E4ADC8', '#C91A09', '#36AEBF']

function blocked(x, y, list) {
  return list.some((item) => item.x === x && item.y === y)
}

function openCell(deny) {
  let x = 0
  let y = 0
  let guard = 0
  do {
    x = 1 + Math.floor(Math.random() * (COLS - 2))
    y = 1 + Math.floor(Math.random() * (ROWS - 2))
    guard += 1
  } while (guard < 40 && deny(x, y))
  return { x, y }
}

function farFrom(enemies) {
  let best = { x: 4, y: 5 }
  let bestD = -1
  for (let i = 0; i < 24; i++) {
    const cell = openCell(() => false)
    const distance = Math.min(...enemies.map((enemy) => Math.abs(enemy.x - cell.x) + Math.abs(enemy.y - cell.y)))
    if (distance > bestD) {
      best = cell
      bestD = distance
    }
  }
  return best
}

function plate(ctx, gx, gy, color) {
  const x = gx * CELL + 2
  const y = gy * CELL + 3
  const w = CELL - 4
  const h = CELL - 5
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(x, y, w, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.beginPath()
  ctx.arc(x + w / 2, y + 1.5, 2.6, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function builder(ctx, gx, gy) {
  const x = gx * CELL + 3
  const y = gy * CELL + 1
  ctx.fillStyle = '#0055BF'
  ctx.fillRect(x, y + 6, 10, 5)
  ctx.fillStyle = '#F2CD37'
  ctx.fillRect(x + 1, y + 11, 3, 3)
  ctx.fillRect(x + 6, y + 11, 3, 3)
  ctx.beginPath()
  ctx.arc(x + 5, y + 4, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1C2830'
  ctx.fillRect(x + 3, y + 3, 1, 1)
  ctx.fillRect(x + 6, y + 3, 1, 1)
}

function enemyBrick(ctx, gx, gy) {
  plate(ctx, gx, gy, '#1C2830')
  const x = gx * CELL + 2
  const y = gy * CELL + 3
  ctx.beginPath()
  ctx.arc(x + (CELL - 4) / 2, y + 1.5, 2.6, 0, Math.PI * 2)
  ctx.fillStyle = '#C91A09'
  ctx.fill()
  ctx.fillStyle = '#F4F4F4'
  ctx.fillRect(x + 3, y + 4, 2, 2)
  ctx.fillRect(x + 7, y + 4, 2, 2)
}

export function PixelGame() {
  const canvasRef = useRef(null)
  const [score, setScore] = useState(0)
  const [away, setAway] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    canvas.width = COLS * CELL
    canvas.height = ROWS * CELL
    const player = { x: 4, y: 5, nx: 0, ny: 0, awayUntil: 0 }
    const bricks = []
    const enemies = []
    for (let i = 0; i < 3; i++) {
      const cell = openCell((x, y) => (x === player.x && y === player.y) || blocked(x, y, enemies))
      enemies.push(cell)
    }
    for (let i = 0; i < 6; i++) {
      const cell = openCell(
        (x, y) => (x === player.x && y === player.y) || blocked(x, y, bricks) || blocked(x, y, enemies),
      )
      bricks.push({ ...cell, color: BRICKS[i % BRICKS.length], pop: 1 })
    }
    const keys = new Set()
    let aim = null
    let acc = 0
    let last = 0
    let tick = 0
    let alive = true
    let hidden = false

    function hide(next) {
      if (hidden === next) return
      hidden = next
      setAway(next)
    }

    function movePlayer() {
      let dx = 0
      let dy = 0
      if (keys.has('arrowleft') || keys.has('a')) dx -= 1
      if (keys.has('arrowright') || keys.has('d')) dx += 1
      if (keys.has('arrowup') || keys.has('w')) dy -= 1
      if (keys.has('arrowdown') || keys.has('s')) dy += 1
      if (dx === 0 && dy === 0 && aim) {
        dx = Math.sign(aim.x - player.x)
        dy = dx === 0 ? Math.sign(aim.y - player.y) : 0
        if (player.x === aim.x && player.y === aim.y) aim = null
      }
      if (dx === 0 && dy === 0) return
      const x = Math.max(0, Math.min(COLS - 1, player.x + dx))
      const y = Math.max(0, Math.min(ROWS - 1, player.y + dy))
      if (x === player.x && y === player.y) return
      player.nx = x - player.x
      player.ny = y - player.y
      player.x = x
      player.y = y
      const hit = bricks.findIndex((brick) => brick.x === x && brick.y === y)
      if (hit >= 0) {
        bricks.splice(hit, 1)
        const cell = openCell(
          (cx, cy) => (cx === player.x && cy === player.y) || blocked(cx, cy, bricks) || blocked(cx, cy, enemies),
        )
        bricks.push({
          ...cell,
          color: BRICKS[Math.floor(Math.random() * BRICKS.length)],
          pop: 1,
        })
        setScore((value) => value + 1)
      }
    }

    function moveEnemies(now) {
      const chasing = player.awayUntil <= now
      for (const enemy of enemies) {
        const choices = []
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [0, 0],
        ]) {
          const x = enemy.x + dx
          const y = enemy.y + dy
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue
          if (enemies.some((other) => other !== enemy && other.x === x && other.y === y)) continue
          choices.push({ x, y })
        }
        if (!choices.length) continue
        let pick = choices[Math.floor(Math.random() * choices.length)]
        if (chasing) {
          const toward = choices.filter(
            (choice) =>
              Math.abs(choice.x - player.x) + Math.abs(choice.y - player.y) <
              Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y),
          )
          if (toward.length && Math.random() < 0.75) pick = toward[Math.floor(Math.random() * toward.length)]
        }
        enemy.x = pick.x
        enemy.y = pick.y
      }
    }

    function knock(now) {
      if (player.awayUntil > now) return
      if (!enemies.some((enemy) => enemy.x === player.x && enemy.y === player.y)) return
      player.awayUntil = now + AWAY_MS
      aim = null
      hide(true)
    }

    function step(now) {
      tick += 1
      if (player.awayUntil <= now) movePlayer()
      if (tick % 2 === 0) moveEnemies(now)
      knock(now)
    }

    function draw() {
      ctx.fillStyle = '#4f8f32'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          ctx.beginPath()
          ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      for (const brick of bricks) {
        brick.pop = Math.max(0, brick.pop - 0.08)
        plate(ctx, brick.x, brick.y, brick.color)
      }
      for (const enemy of enemies) enemyBrick(ctx, enemy.x, enemy.y)
      if (!hidden) builder(ctx, player.x, player.y)
    }

    let raf = 0
    function frame(now) {
      if (!alive) return
      const dt = last ? Math.min(48, now - last) : 16
      last = now
      if (hidden && player.awayUntil <= now) {
        const spot = farFrom(enemies)
        player.x = spot.x
        player.y = spot.y
        player.nx = 0
        player.ny = 0
        hide(false)
      }
      acc += dt
      while (acc >= 120) {
        acc -= 120
        step(now)
      }
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    function onKey(event) {
      const key = event.key.toLowerCase()
      if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) return
      keys.add(key)
      event.preventDefault()
    }
    function onUp(event) {
      keys.delete(event.key.toLowerCase())
    }
    function onPointer(event) {
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * COLS)
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS)
      aim = {
        x: Math.max(0, Math.min(COLS - 1, x)),
        y: Math.max(0, Math.min(ROWS - 1, y)),
      }
      canvas.focus()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    canvas.addEventListener('pointerdown', onPointer)
    canvas.focus()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      canvas.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <div className="pixel-game">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="You are the builder on a baseplate. Gather bricks with the arrow keys, or tap where you want to go. Dark bricks knock you off for a couple of seconds."
      />
      <p className="pixel-caption">
        <strong>{score}</strong> {score === 1 ? 'brick' : 'bricks'}
        <span>{away ? 'Knocked off the base' : 'You are the builder'}</span>
      </p>
    </div>
  )
}
