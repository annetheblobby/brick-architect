import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { colorByKey } from '../lego/palette.js'
import { overlaps } from '../lego/edit.js'
import { BODY_H, PLATE } from '../lego/scale.js'
import { isShown } from './draw.js'

const STUD_H = 0.18
const geometries = new Map()

function plateGeometry(kind, w, d) {
  const key = `${kind}|${w}|${d}`
  const cached = geometries.get(key)
  if (cached) return cached
  let geometry
  if (kind === 'round1' || kind === 'round2') {
    const radius = kind === 'round2' ? 0.92 : 0.46
    geometry = new THREE.CylinderGeometry(radius, radius, BODY_H, 18)
  } else {
    const radius = Math.min(0.045, w * 0.08, d * 0.08, BODY_H * 0.2)
    geometry = new RoundedBoxGeometry(w * 0.97, BODY_H, d * 0.97, 1, radius)
  }
  geometries.set(key, geometry)
  return geometry
}

function rimGeometry(kind, w, d) {
  const key = `rim|${kind}|${w}|${d}`
  const cached = geometries.get(key)
  if (cached) return cached
  const geometry = plateGeometry(kind, w, d).clone()
  geometry.scale(1.16, 1, 1.16)
  geometries.set(key, geometry)
  return geometry
}

function studGeometry(kind) {
  const key = `stud|${kind}`
  const cached = geometries.get(key)
  if (cached) return cached
  const radius = kind === 'round1' ? 0.22 : 0.28
  const geometry = new THREE.CylinderGeometry(radius, radius, STUD_H, 12)
  geometries.set(key, geometry)
  return geometry
}

function groupPieces(pieces) {
  const map = new Map()
  for (const piece of pieces) {
    const key = `${piece.kind}|${piece.w}|${piece.d}|${piece.hex}|${piece.alpha}`
    const list = map.get(key)
    if (list) list.push(piece)
    else map.set(key, [piece])
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }))
}

function classify(model, index, view, showGhost, focusKey) {
  const solid = []
  const faded = []
  const outline = []
  for (const course of model.courses) {
    let role = 'hide'
    if (view === 'all') role = 'solid'
    else if (view === 'one') role = course.index === index ? 'solid' : 'hide'
    else if (course.index <= index) role = 'solid'
    else role = showGhost ? 'ghost' : 'hide'
    if (role === 'hide') continue
    for (const piece of course.pieces) {
      const matched = !focusKey || `${piece.color}|${piece.part.number}` === focusKey
      if (role === 'ghost' || !matched) faded.push(piece)
      else solid.push(piece)
      if (course.index === index) outline.push(piece)
    }
  }
  const ghostCover = new Set()
  for (const piece of faded) {
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) {
        ghostCover.add(`${piece.plateY}|${piece.x + dx}|${piece.z + dz}`)
      }
    }
  }
  const tops = new Map()
  for (const piece of solid) {
    if (piece.kind !== 'plate' && piece.kind !== 'round1') continue
    for (let dz = 0; dz < piece.d; dz++) {
      for (let dx = 0; dx < piece.w; dx++) {
        const x = piece.x + dx
        const z = piece.z + dz
        const id = `${x}|${z}`
        const prev = tops.get(id)
        if (!prev || piece.plateY >= prev.piece.plateY) tops.set(id, { piece, dx, dz, x, z })
      }
    }
  }
  const studMap = new Map()
  for (const { piece, dx, dz, x, z } of tops.values()) {
    if (ghostCover.has(`${piece.plateY + 1}|${x}|${z}`)) continue
    const key = `${piece.kind}|${piece.hex}|${piece.alpha}`
    const item = {
      wx: piece.wx - (piece.w - 1) / 2 + dx,
      wz: piece.wz - (piece.d - 1) / 2 + dz,
      wy: piece.wy + BODY_H / 2 + STUD_H / 2 - 0.012,
      hex: piece.hex,
      alpha: piece.alpha,
      kind: piece.kind,
    }
    const list = studMap.get(key)
    if (list) list.push(item)
    else studMap.set(key, [item])
  }
  return {
    solid: groupPieces(solid),
    faded: groupPieces(faded),
    outline: groupPieces(outline),
    studs: [...studMap.entries()].map(([key, items]) => ({ key, items })),
  }
}

const dummy = new THREE.Object3D()

function Plates({ items, faded }) {
  const ref = useRef(null)
  const sample = items[0]
  const geometry = plateGeometry(sample.kind, sample.w, sample.d)
  useLayoutEffect(() => {
    const mesh = ref.current
    items.forEach((piece, index) => {
      dummy.position.set(piece.wx, piece.wy, piece.wz)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
  }, [items])
  const glassy = sample.alpha < 0.95
  const opacity = faded ? 0.14 : glassy ? sample.alpha : 1
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false}>
      <meshPhysicalMaterial
        color={sample.hex}
        roughness={0.38}
        metalness={0.04}
        clearcoat={faded ? 0 : 0.45}
        clearcoatRoughness={0.35}
        transparent={faded || glassy}
        opacity={opacity}
        depthWrite={!faded && !glassy}
      />
    </instancedMesh>
  )
}

function Rims({ items, color = '#3ecf8e', grow = 1 }) {
  const ref = useRef(null)
  const sample = items[0]
  const geometry = rimGeometry(sample.kind, sample.w, sample.d)
  useLayoutEffect(() => {
    const mesh = ref.current
    items.forEach((piece, index) => {
      dummy.position.set(piece.wx, piece.wy, piece.wz)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(grow, 1, grow)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
  }, [items, grow])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial color={color} side={THREE.BackSide} />
    </instancedMesh>
  )
}

function Studs({ items }) {
  const ref = useRef(null)
  const sample = items[0]
  const geometry = studGeometry(sample.kind)
  useLayoutEffect(() => {
    const mesh = ref.current
    items.forEach((stud, index) => {
      dummy.position.set(stud.wx, stud.wy, stud.wz)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
  }, [items])
  const glassy = sample.alpha < 0.95
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false}>
      <meshPhysicalMaterial
        color={sample.hex}
        roughness={0.32}
        metalness={0.05}
        clearcoat={0.55}
        clearcoatRoughness={0.28}
        transparent={glassy}
        opacity={glassy ? sample.alpha : 1}
        depthWrite={!glassy}
      />
    </instancedMesh>
  )
}

function Frame({ model, nonce }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls)
  useLayoutEffect(() => {
    if (!controls) return
    const { width, depth } = model.stats
    const height = model.heightUnits
    const radius = Math.max(width, depth, height * 1.4, 4)
    const distance = radius / Math.sin((30 * Math.PI) / 360)
    camera.position.set(width * 0.42 + distance * 0.28, height * 0.55 + distance * 0.42, -depth * 0.2 - distance * 0.82)
    const target = new THREE.Vector3(0, Math.max(height * 0.38, 0.4), 0)
    camera.near = 0.05
    camera.far = distance * 8
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    controls.target.copy(target)
    controls.update()
  }, [model.id, nonce, camera, controls])
  return null
}

function MeshFrame({ object, nonce }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls)
  useLayoutEffect(() => {
    if (!object || !controls) return
    object.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(object)
    const center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius, 0.2)
    const distance = (radius / Math.sin((30 * Math.PI) / 360)) * 1.2
    camera.position.set(center.x + distance * 0.45, center.y + distance * 0.32, center.z + distance * 0.9)
    camera.near = Math.max(0.01, distance / 100)
    camera.far = distance * 14
    camera.lookAt(center)
    camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.minDistance = radius * 0.4
    controls.maxDistance = distance * 4
    controls.update()
  }, [object, nonce, camera, controls])
  return null
}

function mixHex(from, to, t) {
  const amount = Math.min(1, Math.max(0, t))
  const a = parseInt(from.slice(1), 16)
  const b = parseInt(to.slice(1), 16)
  const channel = (shift) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount)
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`
}

export function sceneTone(light, dim) {
  const lamp = Math.min(100, Math.max(0, Number(light) || 0)) / 100
  const shade = Math.min(100, Math.max(0, Number(dim) || 0)) / 100
  return {
    key: 0.05 + lamp * 1.72,
    fill: 0.04 + lamp * 0.48,
    ambient: 1.02 * (1 - shade * 0.92),
    background: mixHex('#e7ebf0', '#12161c', shade),
    grid: mixHex('#d5dce6', '#2a313b', shade),
    section: mixHex('#c1cbd6', '#3d4856', shade),
    shadow: 0.22 + shade * 0.38,
  }
}

function MeshView({ mesh, nonce, tone, drawing }) {
  const ground = useMemo(() => {
    mesh.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(mesh).min.y
  }, [mesh])
  return (
    <>
      <color attach="background" args={[tone.background]} />
      <ambientLight intensity={tone.ambient} />
      <directionalLight position={[4, 6, 3]} intensity={tone.key} />
      <directionalLight position={[-6, 4, -4]} intensity={tone.fill} />
      <Grid
        infiniteGrid
        cellSize={0.2}
        cellThickness={0.5}
        cellColor={tone.grid}
        sectionSize={1}
        sectionThickness={1}
        sectionColor={tone.section}
        fadeDistance={12}
        fadeStrength={1.4}
        side={THREE.DoubleSide}
        position={[0, ground, 0]}
      />
      <primitive object={mesh} />
      <OrbitControls
        makeDefault
        enabled={!drawing}
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
      <MeshFrame object={mesh} nonce={nonce} />
    </>
  )
}

function pieceIndexAt(ray, pieces, target) {
  let best = -1
  let bestDist = Infinity
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index]
    const box = new THREE.Box3(
      new THREE.Vector3(piece.wx - piece.w / 2, piece.wy - BODY_H / 2, piece.wz - piece.d / 2),
      new THREE.Vector3(piece.wx + piece.w / 2, piece.wy + BODY_H / 2 + STUD_H, piece.wz + piece.d / 2),
    )
    const point = ray.intersectBox(box, target)
    if (!point) continue
    const dist = point.distanceToSquared(ray.origin)
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
  }
  return best
}

function LayerEditor({ model, courseIndex, tool, brush, onPlace, onRemove }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const [hover, setHover] = useState(null)
  const toolRef = useRef(tool)
  const brushRef = useRef(brush)
  const onPlaceRef = useRef(onPlace)
  const onRemoveRef = useRef(onRemove)
  toolRef.current = tool
  brushRef.current = brush
  onPlaceRef.current = onPlace
  onRemoveRef.current = onRemove
  const ghostGeometry = useMemo(() => plateGeometry('plate', brush.w, brush.d).clone(), [brush.w, brush.d])

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const hit = new THREE.Vector3()
    const boxHit = new THREE.Vector3()
    let down = null

    const inside = (event) => {
      const rect = el.getBoundingClientRect()
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }

    const sample = (event) => {
      const course = model.courses[courseIndex]
      if (!course || !inside(event)) return null
      const rect = el.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      )
      const pieceIndex = pieceIndexAt(raycaster.ray, course.pieces, boxHit)
      if (toolRef.current === 'remove') return { pieceIndex }
      const planeY = (course.plateY + 1) * PLATE
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
      if (!raycaster.ray.intersectPlane(plane, hit)) return null
      const x = Math.round(hit.x - model.shiftX)
      const z = Math.round(hit.z - model.shiftZ)
      const { w, d } = brushRef.current
      return { x, z, blocked: overlaps(course.pieces, x, z, w, d), pieceIndex: -1 }
    }

    const publish = (event) => {
      const next = sample(event)
      setHover((prev) => {
        if (!next) return prev ? null : prev
        if (
          prev &&
          prev.x === next.x &&
          prev.z === next.z &&
          prev.blocked === next.blocked &&
          prev.pieceIndex === next.pieceIndex
        ) {
          return prev
        }
        return next
      })
    }

    const onDown = (event) => {
      if (event.button !== 0) return
      down = { x: event.clientX, y: event.clientY }
    }
    const onLeave = () => setHover(null)
    const onUp = (event) => {
      if (!down || event.button !== 0) return
      const dx = event.clientX - down.x
      const dy = event.clientY - down.y
      down = null
      if (dx * dx + dy * dy > 36) return
      const next = sample(event)
      if (!next) return
      if (toolRef.current === 'remove') {
        if (next.pieceIndex >= 0) onRemoveRef.current(next.pieceIndex)
        return
      }
      if (!next.blocked) onPlaceRef.current({ x: next.x, z: next.z })
    }

    el.style.cursor = tool === 'remove' ? 'pointer' : 'crosshair'
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', publish)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.style.cursor = ''
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', publish)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerup', onUp)
    }
  }, [model, courseIndex, tool, brush.w, brush.d, camera, gl])

  useEffect(() => {
    return () => ghostGeometry.dispose()
  }, [ghostGeometry])

  const course = model.courses[courseIndex]
  const showGhost = tool === 'place' && hover && hover.x != null && course
  const wx = showGhost ? hover.x + model.shiftX + (brush.w - 1) / 2 : 0
  const wz = showGhost ? hover.z + model.shiftZ + (brush.d - 1) / 2 : 0
  const wy = showGhost ? course.plateY * PLATE + PLATE / 2 : 0
  const piece = tool === 'remove' && hover?.pieceIndex >= 0 ? course?.pieces[hover.pieceIndex] : null
  return (
    <>
      {piece ? <Rims items={[piece]} color="#e24b38" grow={1.08} /> : null}
      {tool === 'place' ? (
        <mesh visible={Boolean(showGhost)} position={[wx, wy, wz]} geometry={ghostGeometry} dispose={null} renderOrder={3}>
          <meshStandardMaterial
            color={hover?.blocked ? '#e24b38' : colorByKey(brush.color).hex}
            transparent
            opacity={0.62}
            roughness={0.4}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </>
  )
}

const MASK_CAP = 512

function CameraTap({ viewRef }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  if (viewRef) viewRef.current = { camera, canvas: gl.domElement }
  return null
}

function PlateMask({ pieces }) {
  const ref = useRef(null)
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    pieces.forEach((piece, index) => {
      dummy.position.set(piece.wx, piece.wy + 0.02, piece.wz)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(piece.w * 1.04, BODY_H + 0.1, piece.d * 1.04)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = pieces.length
    mesh.instanceMatrix.needsUpdate = true
  }, [pieces])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, MASK_CAP]} frustumCulled={false} renderOrder={4}>
      <meshBasicMaterial color="#3b6cf0" transparent opacity={0.42} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </instancedMesh>
  )
}

function CellMask({ cells, shiftX, shiftZ }) {
  const ref = useRef(null)
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    cells.forEach((cell, index) => {
      dummy.position.set(cell.x + shiftX, 0.05, cell.z + shiftZ)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(0.9, 0.08, 0.9)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = cells.length
    mesh.instanceMatrix.needsUpdate = true
  }, [cells, shiftX, shiftZ])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, MASK_CAP]} frustumCulled={false} renderOrder={3}>
      <meshBasicMaterial color="#3b6cf0" transparent opacity={0.34} depthWrite={false} />
    </instancedMesh>
  )
}

function MaskMarks({ pieces, cells, shiftX, shiftZ, course, view, ghost }) {
  const shown = pieces.filter((piece) => isShown(piece.course, course, view, ghost)).slice(0, MASK_CAP)
  const flats = cells.slice(0, MASK_CAP)
  if (!shown.length && !flats.length) return null
  return (
    <>
      {shown.length ? <PlateMask pieces={shown} /> : null}
      {flats.length ? <CellMask cells={flats} shiftX={shiftX} shiftZ={shiftZ} /> : null}
    </>
  )
}

function Scene({
  model,
  course,
  view,
  ghost,
  focusKey,
  nonce,
  mesh,
  editing,
  tool,
  brush,
  onPlace,
  onRemove,
  light,
  dim,
  viewRef,
  drawing,
  mask,
}) {
  const buckets = useMemo(
    () => classify(model, course, view, ghost, focusKey),
    [model, course, view, ghost, focusKey],
  )
  const tone = sceneTone(light, dim)
  if (view === 'model' && mesh) {
    return (
      <>
        <CameraTap viewRef={viewRef} />
        <MeshView mesh={mesh} nonce={nonce} tone={tone} drawing={drawing} />
      </>
    )
  }
  const span = Math.max(model.stats.width, model.stats.depth, 12)
  return (
    <>
      <color attach="background" args={[tone.background]} />
      <ambientLight intensity={tone.ambient} />
      <directionalLight position={[10, 16, 8]} intensity={tone.key} />
      <directionalLight position={[-8, 7, -6]} intensity={tone.fill} />
      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={0.55}
        cellColor={tone.grid}
        sectionSize={8}
        sectionThickness={1.05}
        sectionColor={tone.section}
        fadeDistance={Math.max(36, span * 3.2)}
        fadeStrength={1.45}
        side={THREE.DoubleSide}
        position={[0, -0.004, 0]}
      />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={tone.shadow}
        scale={Math.max(18, span * 2.4)}
        blur={2.2}
        far={Math.max(3, model.heightUnits + 1.5)}
        resolution={512}
      />
      {buckets.faded.map((group) => (
        <Plates key={`f-${group.key}-${group.items.length}`} items={group.items} faded />
      ))}
      {buckets.solid.map((group) => (
        <Plates key={`s-${group.key}-${group.items.length}`} items={group.items} />
      ))}
      {buckets.studs.map((group) => (
        <Studs key={`u-${group.key}-${group.items.length}`} items={group.items} />
      ))}
      {buckets.outline.map((group) => (
        <Rims key={`r-${group.key}-${group.items.length}`} items={group.items} />
      ))}
      <OrbitControls
        makeDefault
        enabled={!drawing}
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={1.5}
        maxDistance={Math.max(40, span * 6)}
      />
      <Frame model={model} nonce={nonce} />
      <CameraTap viewRef={viewRef} />
      <MaskMarks
        pieces={mask.pieces}
        cells={mask.cells}
        shiftX={model.shiftX || 0}
        shiftZ={model.shiftZ || 0}
        course={course}
        view={view}
        ghost={ghost}
      />
      {editing ? (
        <LayerEditor
          model={model}
          courseIndex={course}
          tool={tool}
          brush={brush}
          onPlace={onPlace}
          onRemove={onRemove}
        />
      ) : null}
    </>
  )
}

const emptyViewportMask = { pieces: [], cells: [] }

function FillCanvas({ children }) {
  const hold = useRef(null)
  const nudged = useRef(false)
  useLayoutEffect(() => {
    if (nudged.current) return undefined
    const node = hold.current
    const canvas = node?.querySelector('canvas')
    if (!node || !canvas) return undefined
    const box = node.getBoundingClientRect()
    if (box.width < 2 || canvas.clientWidth > box.width * 0.5) return undefined
    const parent = canvas.parentElement
    if (!parent) return undefined
    nudged.current = true
    parent.style.height = `${Math.max(1, Math.round(box.height) - 1)}px`
    window.setTimeout(() => {
      parent.style.height = '100%'
    }, 80)
  })
  return (
    <div ref={hold} className="viewport-hold">
      {children}
    </div>
  )
}

export default function Viewport({
  model,
  course,
  view,
  ghost,
  focusKey,
  nonce,
  mesh,
  editing,
  tool,
  brush,
  onPlace,
  onRemove,
  light,
  dim,
  viewRef,
  drawing = false,
  mask = emptyViewportMask,
}) {
  return (
    <FillCanvas>
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 30, position: [6, 5, -8], near: 0.05, far: 200 }}
    >
      <Scene
        model={model}
        course={course}
        view={view}
        ghost={ghost}
        focusKey={focusKey}
        nonce={nonce}
        mesh={mesh}
        editing={editing}
        tool={tool}
        brush={brush}
        onPlace={onPlace}
        onRemove={onRemove}
        light={light}
        dim={dim}
        viewRef={viewRef}
        drawing={drawing}
        mask={mask}
      />
    </Canvas>
    </FillCanvas>
  )
}
