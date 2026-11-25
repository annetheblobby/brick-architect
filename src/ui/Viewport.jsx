import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { colorByKey } from '../lego/palette.js'
import { overlaps, snapOrigin } from '../lego/edit.js'
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
    const key = `${piece.kind}|${piece.w}|${piece.d}|${piece.hex}|${piece.alpha}|${piece.mount || ''}|${piece.axis || ''}`
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
      if (piece.mount === 'side' && piece.axis === 'z') dummy.rotation.set(Math.PI / 2, 0, 0)
      else if (piece.mount === 'side') dummy.rotation.set(0, 0, Math.PI / 2)
      else dummy.rotation.set(0, 0, 0)
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
      if (piece.mount === 'side' && piece.axis === 'z') dummy.rotation.set(Math.PI / 2, 0, 0)
      else if (piece.mount === 'side') dummy.rotation.set(0, 0, Math.PI / 2)
      else dummy.rotation.set(0, 0, 0)
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
    camera.position.set(distance * 0.08, height * 0.5 + distance * 0.36, depth * 0.45 + distance * 0.72)
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

function LayerEditor({
  model,
  courseIndex,
  tool,
  brush,
  gridStep,
  snap,
  selection,
  onPlace,
  onRemove,
  onSelect,
  onMove,
  onClone,
  onHinge,
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const controls = useThree((state) => state.controls)
  const [hover, setHover] = useState(null)
  const live = useRef({})
  live.current = {
    model,
    courseIndex,
    tool,
    brush,
    gridStep,
    snap,
    selection,
    onPlace,
    onRemove,
    onSelect,
    onMove,
    onClone,
    onHinge,
    controls,
  }
  const ghostKind = hover?.kind || brush.kind || 'plate'
  const ghostW = hover?.w || brush.w
  const ghostD = hover?.d || brush.d
  const ghostGeometry = useMemo(
    () => plateGeometry(ghostKind, ghostW, ghostD).clone(),
    [ghostKind, ghostW, ghostD],
  )

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const hit = new THREE.Vector3()
    const boxHit = new THREE.Vector3()
    let drag = null

    const inside = (event) => {
      const rect = el.getBoundingClientRect()
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }

    const read = (event) => {
      const props = live.current
      const build = props.model
      const course = build.courses[props.courseIndex]
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
      const planeY = (course.plateY + 1) * PLATE
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
      let rawX = null
      let rawZ = null
      if (raycaster.ray.intersectPlane(plane, hit)) {
        rawX = hit.x - (build.shiftX || 0)
        rawZ = hit.z - (build.shiftZ || 0)
      }
      return { course, pieceIndex, rawX, rawZ }
    }

    const footprint = (sample, w, d, ignore) => {
      if (!sample || sample.rawX == null) return null
      const props = live.current
      const snapped = snapOrigin(sample.rawX, sample.rawZ, w, d, sample.course.pieces, ignore, props.gridStep, props.snap)
      return {
        ...snapped,
        blocked: overlaps(sample.course.pieces, snapped.x, snapped.z, w, d, ignore),
      }
    }

    const sameHover = (prev, next) =>
      prev &&
      next &&
      prev.x === next.x &&
      prev.z === next.z &&
      prev.blocked === next.blocked &&
      prev.pieceIndex === next.pieceIndex &&
      prev.dragging === next.dragging

    const publish = (event) => {
      const props = live.current
      const sample = read(event)
      if (!sample) {
        setHover((prev) => (prev ? null : prev))
        return
      }
      const mode = props.tool
      if (mode === 'place') {
        const spot = footprint(sample, props.brush.w, props.brush.d, -1)
        if (!spot) return
        const next = {
          ...spot,
          pieceIndex: -1,
          w: props.brush.w,
          d: props.brush.d,
          kind: props.brush.kind || 'plate',
          color: props.brush.color,
        }
        setHover((prev) => (sameHover(prev, next) ? prev : next))
        return
      }
      if (mode === 'clone') {
        const picked = props.selection && props.selection.course === props.courseIndex ? props.selection.index : -1
        const piece = picked >= 0 ? sample.course.pieces[picked] : null
        if (!piece) {
          setHover((prev) => (prev?.pieceIndex === sample.pieceIndex && prev.x == null ? prev : { pieceIndex: sample.pieceIndex }))
          return
        }
        const spot = footprint(sample, piece.w, piece.d, -1)
        if (!spot) return
        const next = { ...spot, pieceIndex: picked, w: piece.w, d: piece.d, kind: piece.kind, color: piece.color, dragging: true }
        setHover((prev) => (sameHover(prev, next) ? prev : next))
        return
      }
      if (mode === 'move' && drag?.moved && drag.index >= 0) {
        const piece = sample.course.pieces[drag.index]
        if (!piece) return
        const spot = footprint(sample, piece.w, piece.d, drag.index)
        if (!spot) return
        const next = { ...spot, pieceIndex: drag.index, w: piece.w, d: piece.d, kind: piece.kind, color: piece.color, dragging: true }
        setHover((prev) => (sameHover(prev, next) ? prev : next))
        return
      }
      setHover((prev) => (prev?.pieceIndex === sample.pieceIndex && prev.x == null ? prev : { pieceIndex: sample.pieceIndex }))
    }

    const onDown = (event) => {
      if (event.button !== 0) return
      const sample = read(event)
      drag = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
        index: sample?.pieceIndex ?? -1,
        tool: live.current.tool,
        angle: null,
      }
      if ((drag.tool === 'move' || drag.tool === 'hinge') && drag.index >= 0 && live.current.controls) {
        live.current.controls.enabled = false
      }
    }

    const onLeave = () => {
      if (!drag?.moved) setHover(null)
    }

    const onSlide = (event) => {
      if (drag) {
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (dx * dx + dy * dy > 16) drag.moved = true
        if (drag.tool === 'hinge' && drag.moved && drag.index >= 0) {
          const sample = read(event)
          const piece = sample?.course.pieces[drag.index]
          if (sample?.rawX != null && piece) {
            const angle = Math.atan2(
              sample.rawZ - (piece.z + (piece.d - 1) / 2),
              sample.rawX - (piece.x + (piece.w - 1) / 2),
            )
            if (drag.angle == null) drag.angle = angle
            let delta = angle - drag.angle
            while (delta > Math.PI) delta -= Math.PI * 2
            while (delta < -Math.PI) delta += Math.PI * 2
            if (Math.abs(delta) > Math.PI / 2) {
              live.current.onHinge(drag.index)
              drag.angle = angle
            }
          }
        }
      }
      publish(event)
    }

    const onUp = (event) => {
      const gesture = drag
      drag = null
      if (live.current.controls) live.current.controls.enabled = true
      if (!gesture || event.button !== 0) return
      const sample = read(event)
      const props = live.current
      if (!sample) return
      if (gesture.tool === 'place') {
        if (gesture.moved) return
        const spot = footprint(sample, props.brush.w, props.brush.d, -1)
        if (spot && !spot.blocked) props.onPlace({ x: spot.x, z: spot.z })
        return
      }
      if (gesture.tool === 'remove') {
        if (!gesture.moved && sample.pieceIndex >= 0) props.onRemove(sample.pieceIndex)
        return
      }
      if (gesture.tool === 'select') {
        if (!gesture.moved) props.onSelect(sample.pieceIndex >= 0 ? sample.pieceIndex : null)
        return
      }
      if (gesture.tool === 'move') {
        if (gesture.moved && gesture.index >= 0) {
          const piece = sample.course.pieces[gesture.index]
          if (!piece) return
          const spot = footprint(sample, piece.w, piece.d, gesture.index)
          if (spot && !spot.blocked) props.onMove(gesture.index, spot.x, spot.z)
          return
        }
        if (!gesture.moved && sample.pieceIndex >= 0) props.onSelect(sample.pieceIndex)
        return
      }
      if (gesture.tool === 'clone') {
        const selected = props.selection && props.selection.course === props.courseIndex ? props.selection.index : -1
        if (!gesture.moved && sample.pieceIndex >= 0) {
          props.onSelect(sample.pieceIndex)
          return
        }
        const source = gesture.moved && gesture.index >= 0 ? gesture.index : selected
        if (source < 0) return
        const piece = sample.course.pieces[source]
        if (!piece) return
        const spot = footprint(sample, piece.w, piece.d, -1)
        if (spot && !spot.blocked) props.onClone(source, spot.x, spot.z)
        return
      }
      if (gesture.tool === 'hinge' && !gesture.moved && sample.pieceIndex >= 0) props.onHinge(sample.pieceIndex)
    }

    const cursor = tool === 'remove' ? 'pointer' : tool === 'move' ? 'grab' : 'crosshair'
    el.style.cursor = cursor
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onSlide)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.style.cursor = ''
      if (live.current.controls) live.current.controls.enabled = true
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onSlide)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerup', onUp)
    }
  }, [camera, gl, tool])

  useEffect(() => {
    return () => ghostGeometry.dispose()
  }, [ghostGeometry])

  const course = model.courses[courseIndex]
  const showGhost = Boolean(course && hover && hover.x != null && (tool === 'place' || tool === 'clone' || hover.dragging))
  const wx = showGhost ? hover.x + (model.shiftX || 0) + ((hover.w || brush.w) - 1) / 2 : 0
  const wz = showGhost ? hover.z + (model.shiftZ || 0) + ((hover.d || brush.d) - 1) / 2 : 0
  const wy = showGhost ? course.plateY * PLATE + PLATE / 2 : 0
  const hoverPiece = hover?.pieceIndex >= 0 && hover.x == null ? course?.pieces[hover.pieceIndex] : null
  const selectedPiece = selection && selection.course === courseIndex ? course?.pieces[selection.index] : null
  const ghostColor = hover?.color || brush.color
  return (
    <>
      {selectedPiece ? <Rims items={[selectedPiece]} color="#3b6cf0" grow={1.08} /> : null}
      {hoverPiece && hoverPiece !== selectedPiece ? <Rims items={[hoverPiece]} color={tool === 'remove' ? '#e24b38' : '#8eb0ff'} grow={1.08} /> : null}
      {showGhost ? (
        <mesh position={[wx, wy, wz]} geometry={ghostGeometry} dispose={null} renderOrder={3}>
          <meshStandardMaterial
            color={hover?.blocked ? '#e24b38' : colorByKey(ghostColor).hex}
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
  gridStep = 1,
  snap = true,
  selection = null,
  onPlace,
  onRemove,
  onSelect,
  onMove,
  onClone,
  onHinge,
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
        cellSize={editing ? gridStep : 1}
        cellThickness={0.55}
        cellColor={tone.grid}
        sectionSize={editing && gridStep < 1 ? 1 : 8}
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
          gridStep={gridStep}
          snap={snap}
          selection={selection}
          onPlace={onPlace}
          onRemove={onRemove}
          onSelect={onSelect}
          onMove={onMove}
          onClone={onClone}
          onHinge={onHinge}
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
  gridStep = 1,
  snap = true,
  selection = null,
  onPlace,
  onRemove,
  onSelect,
  onMove,
  onClone,
  onHinge,
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
        gridStep={gridStep}
        snap={snap}
        selection={selection}
        onPlace={onPlace}
        onRemove={onRemove}
        onSelect={onSelect}
        onMove={onMove}
        onClone={onClone}
        onHinge={onHinge}
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
