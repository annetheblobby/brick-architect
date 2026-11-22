import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BODY_H } from '../lego/scale.js'

export const ANGLES = [
  { id: 'front', name: 'Front', yaw: 0 },
  { id: 'quarter', name: '3/4', yaw: Math.PI * 0.25 },
  { id: 'side', name: 'Side', yaw: Math.PI * 0.5 },
  { id: 'rear', name: 'Rear 3/4', yaw: Math.PI * 0.75 },
  { id: 'back', name: 'Back', yaw: Math.PI },
]

const SIZE = 176
const PITCH = 0.38

let renderer
let scene
let camera
let keyLight

function ensure() {
  if (renderer) return
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 500)
  scene.add(new THREE.AmbientLight(0xffffff, 0.78))
  keyLight = new THREE.DirectionalLight(0xffffff, 1.15)
  scene.add(keyLight)
}

export function frameObject(cameraObject, object, yaw, light) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.2)
  const fov = (cameraObject.fov * Math.PI) / 180
  const dist = (radius / Math.sin(fov / 2)) * 1.18
  cameraObject.position.set(
    center.x + Math.sin(yaw) * Math.cos(PITCH) * dist,
    center.y + Math.sin(PITCH) * dist,
    center.z + Math.cos(yaw) * Math.cos(PITCH) * dist,
  )
  cameraObject.near = Math.max(0.01, dist / 100)
  cameraObject.far = dist * 16
  cameraObject.lookAt(center)
  cameraObject.updateProjectionMatrix()
  if (light) light.position.copy(cameraObject.position)
  return center
}

export function legoObject(model) {
  const byColor = new Map()
  for (const course of model.courses) {
    for (const piece of course.pieces) {
      const round = piece.kind === 'round1' || piece.kind === 'round2'
      const geo = round
        ? new THREE.CylinderGeometry(piece.w * 0.48, piece.w * 0.48, BODY_H, 12)
        : new THREE.BoxGeometry(piece.w * 0.96, BODY_H, piece.d * 0.96)
      geo.translate(piece.wx, piece.wy, piece.wz)
      const list = byColor.get(piece.hex)
      if (list) list.push(geo)
      else byColor.set(piece.hex, [geo])
    }
  }
  const group = new THREE.Group()
  for (const [hex, geos] of byColor) {
    const merged = mergeGeometries(geos, false)
    for (const geo of geos) geo.dispose()
    group.add(
      new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, metalness: 0.04 })),
    )
  }
  return group
}

function compare(source, lego) {
  let inter = 0
  let union = 0
  let tint = 0
  for (let i = 0; i < source.length; i += 4) {
    const sourceOn = source[i + 3] > 24
    const legoOn = lego[i + 3] > 24
    if (sourceOn || legoOn) union += 1
    if (sourceOn && legoOn) {
      inter += 1
      const dr = source[i] - lego[i]
      const dg = source[i + 1] - lego[i + 1]
      const db = source[i + 2] - lego[i + 2]
      tint += 1 - Math.min(1, Math.hypot(dr, dg, db) / 441.7)
    }
  }
  const shape = union ? inter / union : 0
  const color = inter ? tint / inter : 0
  return { shape, color, score: shape * 0.8 + color * 0.2 }
}

function shot(pixels) {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  const image = context.createImageData(SIZE, SIZE)
  for (let y = 0; y < SIZE; y++) {
    const src = (SIZE - 1 - y) * SIZE * 4
    image.data.set(pixels.subarray(src, src + SIZE * 4), y * SIZE * 4)
  }
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3] / 255
    const bgR = 231
    const bgG = 235
    const bgB = 240
    image.data[i] = Math.round(image.data[i] * alpha + bgR * (1 - alpha))
    image.data[i + 1] = Math.round(image.data[i + 1] * alpha + bgG * (1 - alpha))
    image.data[i + 2] = Math.round(image.data[i + 2] * alpha + bgB * (1 - alpha))
    image.data[i + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.72)
}

function capture(object, yaw) {
  ensure()
  scene.add(object)
  frameObject(camera, object, yaw, keyLight)
  renderer.render(scene, camera)
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  renderer.getContext().readPixels(0, 0, SIZE, SIZE, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels)
  scene.remove(object)
  return { pixels, url: shot(pixels) }
}

export function scoreAngles(source, lego) {
  const angles = ANGLES.map((angle) => {
    const sourceShot = capture(source, angle.yaw)
    const legoShot = capture(lego, angle.yaw)
    const match = compare(sourceShot.pixels, legoShot.pixels)
    return {
      ...angle,
      ...match,
      sourceUrl: sourceShot.url,
      legoUrl: legoShot.url,
    }
  })
  const mean = angles.reduce((sum, angle) => sum + angle.score, 0) / angles.length
  const worst = angles.reduce((low, angle) => (angle.score < low.score ? angle : low))
  return { angles, mean, worst }
}

export function band(score) {
  if (score >= 0.64) return 'Close'
  if (score >= 0.5) return 'Partial'
  return 'Weak'
}
