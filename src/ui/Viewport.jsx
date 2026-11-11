import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { BODY_H } from '../lego/scale.js'

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

function Rims({ items }) {
  const ref = useRef(null)
  const sample = items[0]
  const geometry = rimGeometry(sample.kind, sample.w, sample.d)
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
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial color="#3ecf8e" side={THREE.BackSide} />
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
  }, [model, nonce, camera, controls])
  return null
}

function Scene({ model, course, view, ghost, focusKey, nonce }) {
  const buckets = useMemo(
    () => classify(model, course, view, ghost, focusKey),
    [model, course, view, ghost, focusKey],
  )
  const span = Math.max(model.stats.width, model.stats.depth, 12)
  return (
    <>
      <color attach="background" args={['#e7ebf0']} />
      <ambientLight intensity={0.78} />
      <directionalLight position={[10, 16, 8]} intensity={1.25} />
      <directionalLight position={[-8, 7, -6]} intensity={0.38} />
      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={0.55}
        cellColor="#d5dce6"
        sectionSize={8}
        sectionThickness={1.05}
        sectionColor="#c1cbd6"
        fadeDistance={Math.max(36, span * 3.2)}
        fadeStrength={1.45}
        side={THREE.DoubleSide}
        position={[0, -0.004, 0]}
      />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.32}
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
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={1.5}
        maxDistance={Math.max(40, span * 6)}
      />
      <Frame model={model} nonce={nonce} />
    </>
  )
}

export default function Viewport({ model, course, view, ghost, focusKey, nonce }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 30, position: [6, 5, -8], near: 0.05, far: 200 }}
    >
      <Scene model={model} course={course} view={view} ghost={ghost} focusKey={focusKey} nonce={nonce} />
    </Canvas>
  )
}
