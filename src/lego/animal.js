import * as THREE from 'three'

const INK = '#1C2830'
const WHITE = '#F4F4F4'
const GRAY = '#6C6E68'
const TAN = '#E4CD9E'
const BROWN = '#582A12'
const ORANGE = '#FE8A18'
const PINK = '#E4ADC8'

const COLORS = {
  black: INK,
  white: WHITE,
  gray: GRAY,
  grey: GRAY,
  brown: BROWN,
  red: '#C91A09',
  orange: ORANGE,
  yellow: '#F2CD37',
  gold: '#AA7F2E',
  green: '#237841',
  blue: '#0055BF',
  pink: PINK,
  purple: '#923978',
  tan: TAN,
}

const SPECIES = [
  { names: ['cat', 'kitten'], color: ORANGE, body: [0.16, 0.12, 0.28], leg: [0.035, 0.16, 0.08, 0.14], head: [0.09, 0.08, 0.08], snout: [0.035, 0.03, 0.05], ear: [0.03, 0.07, 0.015], tail: [0.02, 0.22, 0.55] },
  { names: ['tiger'], color: ORANGE, accent: INK, bands: 6, body: [0.22, 0.16, 0.36], leg: [0.05, 0.2, 0.12, 0.18], head: [0.12, 0.1, 0.11], snout: [0.045, 0.04, 0.07], ear: [0.035, 0.06, 0.02], tail: [0.03, 0.28, 0.15] },
  { names: ['lion'], color: TAN, accent: BROWN, mane: 1.55, body: [0.22, 0.16, 0.34], leg: [0.05, 0.2, 0.12, 0.16], head: [0.11, 0.1, 0.11], snout: [0.045, 0.04, 0.06], ear: [0.03, 0.04, 0.02], tail: [0.025, 0.3, 0.1] },
  { names: ['dog', 'puppy', 'hound', 'pup'], color: TAN, body: [0.18, 0.14, 0.3], leg: [0.04, 0.18, 0.09, 0.15], head: [0.1, 0.09, 0.1], snout: [0.045, 0.04, 0.09], ear: [0.045, 0.07, 0.02], earDrop: 0.06, tail: [0.025, 0.2, 0.35] },
  { names: ['rabbit', 'bunny', 'hare'], color: WHITE, accent: PINK, body: [0.14, 0.12, 0.2], leg: [0.04, 0.12, 0.07, 0.08], hind: 1.7, head: [0.08, 0.08, 0.08], snout: [0.03, 0.025, 0.04], ear: [0.025, 0.14, 0.015], tail: [0.03, 0.04, 0.2] },
  { names: ['mouse', 'rat'], color: GRAY, body: [0.1, 0.08, 0.18], leg: [0.02, 0.08, 0.05, 0.08], head: [0.06, 0.05, 0.06], snout: [0.025, 0.02, 0.05], ear: [0.03, 0.03, 0.01], tail: [0.012, 0.28, -0.15] },
  { names: ['bear'], color: BROWN, body: [0.28, 0.2, 0.34], leg: [0.07, 0.18, 0.12, 0.14], head: [0.14, 0.12, 0.13], snout: [0.06, 0.05, 0.07], ear: [0.04, 0.04, 0.02], tail: [0.03, 0.06, 0] },
  { names: ['panda'], color: WHITE, accent: INK, marks: 'panda', body: [0.26, 0.2, 0.32], leg: [0.07, 0.16, 0.12, 0.14], head: [0.14, 0.13, 0.13], snout: [0.04, 0.035, 0.04], ear: [0.045, 0.045, 0.02], tail: [0.03, 0.04, 0] },
  { names: ['pig', 'hog'], color: PINK, body: [0.22, 0.16, 0.3], leg: [0.045, 0.14, 0.1, 0.12], head: [0.12, 0.11, 0.1], snout: [0.07, 0.05, 0.05], ear: [0.04, 0.05, 0.015], tail: [0.015, 0.08, 0.4] },
  { names: ['sheep', 'lamb'], color: WHITE, accent: INK, wool: 1.25, body: [0.2, 0.16, 0.28], leg: [0.04, 0.16, 0.1, 0.12], head: [0.08, 0.09, 0.1], snout: [0.035, 0.03, 0.05], ear: [0.03, 0.05, 0.015], tail: [0.03, 0.05, 0.1] },
  { names: ['goat'], color: WHITE, accent: BROWN, horns: [0.015, 0.08], body: [0.16, 0.14, 0.26], leg: [0.035, 0.18, 0.08, 0.12], head: [0.08, 0.08, 0.09], snout: [0.035, 0.03, 0.05], ear: [0.025, 0.06, 0.015], tail: [0.02, 0.08, 0.2] },
  { names: ['zebra'], color: WHITE, accent: INK, bands: 7, body: [0.2, 0.18, 0.38], leg: [0.04, 0.28, 0.09, 0.18], head: [0.09, 0.1, 0.12], snout: [0.04, 0.04, 0.1], ear: [0.03, 0.07, 0.015], tail: [0.02, 0.22, -0.2] },
  { names: ['giraffe'], color: TAN, accent: BROWN, plan: 'neck', bands: 5, body: [0.18, 0.16, 0.32], leg: [0.04, 0.42, 0.08, 0.14], neck: 0.55, head: [0.08, 0.1, 0.12], snout: [0.035, 0.035, 0.08], ear: [0.025, 0.05, 0.015], horns: [0.012, 0.06], tail: [0.02, 0.25, -0.35] },
  { names: ['elephant'], color: GRAY, body: [0.32, 0.26, 0.42], leg: [0.08, 0.28, 0.16, 0.18], head: [0.18, 0.18, 0.16], ear: [0.16, 0.2, 0.025], earSpread: 0.28, trunk: [0.045, 0.38], tail: [0.02, 0.18, -0.2] },
  { names: ['hippo', 'hippopotamus'], color: GRAY, body: [0.32, 0.2, 0.4], leg: [0.07, 0.14, 0.14, 0.16], head: [0.18, 0.14, 0.16], snout: [0.12, 0.08, 0.1], ear: [0.03, 0.03, 0.02], tail: [0.02, 0.06, 0] },
  { names: ['rhino', 'rhinoceros'], color: GRAY, horns: [0.03, 0.1], body: [0.28, 0.2, 0.4], leg: [0.06, 0.18, 0.12, 0.16], head: [0.12, 0.1, 0.14], snout: [0.06, 0.05, 0.1], ear: [0.03, 0.04, 0.015], tail: [0.02, 0.1, -0.1] },
  { names: ['camel'], color: TAN, hump: [0.1, 0.12, 0.1], body: [0.2, 0.16, 0.36], leg: [0.04, 0.32, 0.09, 0.16], head: [0.08, 0.1, 0.12], snout: [0.04, 0.035, 0.08], ear: [0.025, 0.04, 0.015], tail: [0.02, 0.16, -0.2] },
  { names: ['kangaroo'], color: TAN, hind: 2.1, body: [0.16, 0.18, 0.22], leg: [0.035, 0.14, 0.08, 0.06], head: [0.08, 0.1, 0.1], snout: [0.035, 0.03, 0.06], ear: [0.03, 0.08, 0.015], tail: [0.035, 0.32, -0.7] },
  { names: ['squirrel'], color: BROWN, body: [0.1, 0.08, 0.16], leg: [0.02, 0.08, 0.05, 0.06], head: [0.06, 0.055, 0.06], snout: [0.02, 0.02, 0.03], ear: [0.02, 0.04, 0.01], tail: [0.05, 0.16, 0.85] },
  { names: ['frog', 'toad'], color: '#237841', plan: 'low', body: [0.18, 0.08, 0.16], leg: [0.03, 0.06, 0.12, 0.08], head: [0.1, 0.06, 0.08], ear: [0.025, 0.025, 0.01], },
  { names: ['turtle', 'tortoise'], color: '#237841', accent: BROWN, shell: [0.2, 0.1, 0.24], body: [0.16, 0.06, 0.22], leg: [0.03, 0.05, 0.1, 0.1], head: [0.05, 0.045, 0.07], },
  { names: ['penguin'], color: INK, accent: WHITE, snoutColor: ORANGE, plan: 'upright', body: [0.14, 0.26, 0.12], head: [0.09, 0.09, 0.09], snout: [0.02, 0.016, 0.06], belly: [0.1, 0.16, 0.08], leg: [0.018, 0.045, 0.05, 0] },
  { names: ['owl'], color: BROWN, accent: WHITE, plan: 'upright', body: [0.14, 0.18, 0.14], head: [0.11, 0.11, 0.11], snout: [0.02, 0.02, 0.04], ear: [0.02, 0.04, 0.015], eyes: 0.035 },
  { names: ['duck'], color: '#F2CD37', accent: ORANGE, plan: 'upright', body: [0.14, 0.12, 0.18], head: [0.07, 0.07, 0.07], snout: [0.03, 0.015, 0.08], leg: [0.015, 0.08, 0.04, 0.04] },
  { names: ['chicken', 'hen', 'rooster'], color: WHITE, accent: '#C91A09', plan: 'upright', body: [0.14, 0.12, 0.16], head: [0.06, 0.06, 0.06], snout: [0.015, 0.015, 0.05], comb: true, leg: [0.015, 0.1, 0.04, 0.02] },
  { names: ['whale'], color: GRAY, plan: 'serpent', body: [0.22, 0.16, 0.55], head: [0.16, 0.12, 0.16], tail: [0.16, 0.04, 0.08] },
  { names: ['snake'], color: '#237841', plan: 'serpent', body: [0.06, 0.05, 0.55], head: [0.055, 0.045, 0.08] },
  { names: ['crocodile', 'alligator'], color: '#237841', plan: 'low', body: [0.14, 0.08, 0.5], leg: [0.03, 0.06, 0.1, 0.2], head: [0.08, 0.05, 0.1], snout: [0.05, 0.03, 0.16], tail: [0.04, 0.2, -0.2] },
  { names: ['monkey'], color: BROWN, accent: TAN, body: [0.14, 0.12, 0.16], leg: [0.03, 0.16, 0.08, 0.06], head: [0.09, 0.09, 0.09], ear: [0.03, 0.03, 0.015], tail: [0.02, 0.28, 0.2] },
  { names: ['gorilla'], color: INK, body: [0.28, 0.22, 0.24], leg: [0.07, 0.2, 0.14, 0.08], head: [0.14, 0.14, 0.13], ear: [0.03, 0.03, 0.015], },
  { names: ['koala'], color: GRAY, body: [0.16, 0.14, 0.16], leg: [0.04, 0.1, 0.08, 0.06], head: [0.12, 0.11, 0.11], ear: [0.05, 0.05, 0.02], snout: [0.04, 0.03, 0.04] },
  { names: ['hamster'], color: TAN, body: [0.12, 0.1, 0.14], leg: [0.02, 0.05, 0.06, 0.05], head: [0.08, 0.07, 0.07], ear: [0.025, 0.025, 0.01] },
  { names: ['hedgehog'], color: BROWN, body: [0.14, 0.1, 0.18], leg: [0.02, 0.05, 0.07, 0.06], head: [0.06, 0.05, 0.06], snout: [0.02, 0.02, 0.04], spines: true },
  { names: ['seal'], color: GRAY, plan: 'low', body: [0.14, 0.1, 0.36], head: [0.09, 0.08, 0.1], snout: [0.04, 0.03, 0.05], tail: [0.08, 0.04, 0.06] },
  { names: ['otter'], color: BROWN, body: [0.1, 0.08, 0.26], leg: [0.025, 0.06, 0.06, 0.1], head: [0.06, 0.05, 0.07], snout: [0.025, 0.02, 0.04], tail: [0.03, 0.14, -0.15] },
  { names: ['raccoon'], color: GRAY, accent: INK, marks: 'mask', body: [0.14, 0.1, 0.24], leg: [0.03, 0.1, 0.07, 0.1], head: [0.08, 0.07, 0.08], snout: [0.03, 0.025, 0.04], ear: [0.025, 0.035, 0.015], tail: [0.03, 0.16, 0.1], bands: 4 },
  { names: ['fish'], color: '#0055BF', accent: ORANGE, plan: 'serpent', body: [0.1, 0.08, 0.28], head: [0.08, 0.07, 0.08], tail: [0.12, 0.025, 0.08] },
  { names: ['shark'], color: GRAY, accent: WHITE, plan: 'serpent', body: [0.14, 0.1, 0.42], head: [0.1, 0.08, 0.12], tail: [0.14, 0.03, 0.08] },
  { names: ['bird'], color: '#0055BF', accent: ORANGE, snoutColor: ORANGE, plan: 'upright', wings: [0.18, 0.05], body: [0.1, 0.1, 0.14], head: [0.06, 0.06, 0.06], snout: [0.015, 0.012, 0.05], leg: [0.012, 0.06, 0.03, 0.02] },
  { names: ['bee'], color: '#F2CD37', accent: INK, plan: 'upright', wings: [0.1, 0.035], body: [0.08, 0.07, 0.12], head: [0.05, 0.05, 0.05], leg: [0.01, 0.04, 0.025, 0.02] },
  { names: ['dragon'], color: '#237841', accent: BROWN, wings: [0.28, 0.07], horns: [0.016, 0.08], body: [0.2, 0.14, 0.36], leg: [0.04, 0.16, 0.1, 0.16], head: [0.1, 0.09, 0.12], snout: [0.05, 0.04, 0.1], tail: [0.03, 0.32, -0.35] },
  { names: ['dinosaur', 'dino'], color: '#237841', accent: BROWN, body: [0.22, 0.18, 0.42], leg: [0.05, 0.22, 0.12, 0.18], head: [0.1, 0.09, 0.14], snout: [0.05, 0.04, 0.1], tail: [0.04, 0.38, -0.45] },
]

function ellipsoid(rx, ry, rz, color, name) {
  const geo = new THREE.SphereGeometry(1, 22, 16)
  geo.scale(rx, ry, rz)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 }),
  )
  mesh.name = name
  return mesh
}

function capsule(radius, length, color, name) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.02, length), 5, 8)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 }),
  )
  mesh.name = name
  return mesh
}

function place(group, mesh, x, y, z) {
  mesh.position.set(x, y, z)
  group.add(mesh)
  return mesh
}

function seat(group) {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  group.position.y -= box.min.y
  group.updateMatrixWorld(true)
  return group
}

function build(profile, color) {
  const group = new THREE.Group()
  const accent = profile.accent || color
  const placeWings = (y, z) => {
    if (!profile.wings) return
    const [rx, ry] = profile.wings
    const left = ellipsoid(rx, ry, 0.02, accent, 'wing')
    left.rotation.z = 0.4
    place(group, left, body[0] + rx * 0.3, y, z)
    const right = ellipsoid(rx, ry, 0.02, accent, 'wing')
    right.rotation.z = -0.4
    place(group, right, -(body[0] + rx * 0.3), y, z)
  }
  const plan = profile.plan || 'quad'
  const body = profile.body
  const leg = profile.leg || (plan === 'upright' || plan === 'serpent' ? [0, 0, 0, 0] : [0.04, 0.16, 0.08, 0.12])

  if (plan === 'serpent') {
    const torso = place(group, ellipsoid(body[0], body[1], body[2], color, 'body'), 0, body[1], 0)
    const head = profile.head
    place(
      group,
      ellipsoid(head[0], head[1], head[2], color, 'head'),
      0,
      torso.position.y + body[1] * 0.1,
      body[2] + head[2] * 0.6,
    )
    if (profile.tail) {
      const fluke = ellipsoid(profile.tail[0], profile.tail[1], profile.tail[2], accent, 'fluke')
      place(group, fluke, 0, torso.position.y, -body[2] - profile.tail[2] * 0.4)
    }
    return seat(group)
  }

  if (plan === 'upright') {
    const torso = place(group, ellipsoid(body[0], body[1], body[2], color, 'body'), 0, body[1] + (leg[1] || 0) * 0.4, 0)
    if (profile.belly) {
      const belly = ellipsoid(profile.belly[0], profile.belly[1], profile.belly[2], accent, 'belly')
      place(group, belly, 0, torso.position.y - body[1] * 0.08, body[2] * 0.95)
    }
    const head = profile.head
    const skull = place(
      group,
      ellipsoid(head[0], head[1], head[2], color, 'head'),
      0,
      torso.position.y + body[1] * 0.72,
      body[2] * 0.15,
    )
    if (profile.snout) {
      const snout = profile.snout
      place(
        group,
        ellipsoid(snout[0], snout[1], snout[2], profile.snoutColor || accent, 'beak'),
        0,
        skull.position.y - head[1] * 0.15,
        skull.position.z + head[2] + snout[2] * 0.45,
      )
    }
    if (profile.eyes) {
      place(group, ellipsoid(profile.eyes, profile.eyes, profile.eyes * 0.4, WHITE, 'eye'), head[0] * 0.45, skull.position.y + head[1] * 0.1, skull.position.z + head[2] * 0.75)
      place(group, ellipsoid(profile.eyes, profile.eyes, profile.eyes * 0.4, WHITE, 'eye'), -head[0] * 0.45, skull.position.y + head[1] * 0.1, skull.position.z + head[2] * 0.75)
    }
    if (profile.comb) {
      place(group, ellipsoid(0.015, 0.04, 0.03, accent, 'comb'), 0, skull.position.y + head[1] * 0.85, skull.position.z)
    }
    placeWings(torso.position.y, 0)
    const flipper = ellipsoid(body[0] * 0.55, body[1] * 0.28, 0.03, color, 'flipper')
    place(group, flipper, body[0] + body[0] * 0.35, torso.position.y, 0)
    const flipperL = flipper.clone()
    place(group, flipperL, -body[0] - body[0] * 0.35, torso.position.y, 0)
    if (leg[1]) {
      for (const x of [-leg[2], leg[2]]) {
        const foot = capsule(leg[0], leg[1], accent, 'leg')
        place(group, foot, x, leg[1] * 0.5, body[2] * 0.2)
      }
    }
    return seat(group)
  }

  const legLen = leg[1]
  const bodyY = legLen * (plan === 'low' ? 0.55 : 0.82) + body[1] * 0.2
  const torso = place(group, ellipsoid(body[0], body[1], body[2], color, 'body'), 0, bodyY, 0)
  placeWings(bodyY, 0)
  if (profile.wool) {
    place(group, ellipsoid(body[0] * profile.wool, body[1] * profile.wool, body[2] * profile.wool * 0.92, color, 'wool'), 0, bodyY, 0)
  }
  if (profile.shell) {
    const shell = profile.shell
    place(group, ellipsoid(shell[0], shell[1], shell[2], accent, 'shell'), 0, bodyY + body[1] * 0.45, 0)
  }
  if (profile.hump) {
    const hump = profile.hump
    place(group, ellipsoid(hump[0], hump[1], hump[2], color, 'hump'), 0, bodyY + body[1] + hump[1] * 0.3, 0)
  }
  if (profile.spines) {
    for (let i = 0; i < 5; i++) {
      const spine = capsule(0.012, 0.06, accent, 'spine')
      spine.rotation.z = 0.4
      place(group, spine, 0, bodyY + body[1] + 0.02, -body[2] * 0.6 + i * body[2] * 0.25)
    }
  }
  if (profile.bands) {
    for (let i = 0; i < profile.bands; i++) {
      const t = (i + 1) / (profile.bands + 1)
      const band = ellipsoid(body[0] * 1.04, body[1] * 1.04, body[2] * 0.045, accent, 'band')
      place(group, band, 0, bodyY, -body[2] + t * body[2] * 2)
    }
  }

  const neckLen = profile.neck || body[1] * 0.35
  const neck = capsule(body[0] * 0.28, neckLen, color, 'neck')
  if (profile.plan === 'neck') neck.rotation.x = -0.15
  const neckZ = body[2] * 0.72
  const neckY = bodyY + (profile.plan === 'neck' ? neckLen * 0.45 : body[1] * 0.45)
  place(group, neck, 0, neckY, neckZ)

  const head = profile.head || [body[0] * 0.55, body[1] * 0.55, body[2] * 0.3]
  const headZ = neckZ + neckLen * 0.35 + head[2]
  const headY = neckY + (profile.plan === 'neck' ? neckLen * 0.45 : head[1] * 0.15)
  const skull = place(group, ellipsoid(head[0], head[1], head[2], color, 'head'), 0, headY, headZ)
  if (profile.mane) {
    place(group, ellipsoid(head[0] * profile.mane, head[1] * profile.mane, head[2] * profile.mane, accent, 'mane'), 0, headY, headZ - head[2] * 0.2)
  }
  if (profile.snout) {
    const snout = profile.snout
    place(
      group,
      ellipsoid(snout[0], snout[1], snout[2], profile.marks ? accent : color, 'snout'),
      0,
      headY - head[1] * 0.2,
      headZ + head[2] * 0.55 + snout[2] * 0.35,
    )
  }
  if (profile.trunk) {
    const trunk = capsule(profile.trunk[0], profile.trunk[1], color, 'trunk')
    trunk.rotation.x = 0.7
    place(group, trunk, 0, headY - head[1] * 0.2, headZ + head[2] + profile.trunk[0])
  }
  if (profile.ear) {
    const ear = profile.ear
    const spread = profile.earSpread || head[0] * 0.95
    const drop = profile.earDrop || 0
    const earColor = profile.marks ? accent : color
    place(group, ellipsoid(ear[0], ear[1], ear[2], earColor, 'ear'), spread, headY + head[1] * 0.55 - drop, headZ)
    place(group, ellipsoid(ear[0], ear[1], ear[2], earColor, 'ear'), -spread, headY + head[1] * 0.55 - drop, headZ)
  }
  if (profile.horns) {
    for (const x of [-head[0] * 0.45, head[0] * 0.45]) {
      const horn = capsule(profile.horns[0], profile.horns[1], accent, 'horn')
      place(group, horn, x, headY + head[1] + profile.horns[1] * 0.4, headZ)
    }
  }
  if (profile.marks === 'panda' || profile.marks === 'mask') {
    place(group, ellipsoid(head[0] * 0.28, head[1] * 0.22, 0.02, accent, 'patch'), head[0] * 0.4, headY + head[1] * 0.05, headZ + head[2] * 0.85)
    place(group, ellipsoid(head[0] * 0.28, head[1] * 0.22, 0.02, accent, 'patch'), -head[0] * 0.4, headY + head[1] * 0.05, headZ + head[2] * 0.85)
  }
  if (profile.tail) {
    const tail = capsule(profile.tail[0], profile.tail[1], profile.bands ? accent : color, 'tail')
    tail.rotation.x = Math.PI / 2 - (profile.tail[2] || 0)
    place(group, tail, 0, bodyY + body[1] * 0.15, -body[2] - profile.tail[1] * 0.35)
  }

  const frontZ = Math.max(leg[3], body[2] * 0.42)
  const spreadX = Math.max(leg[2], body[0] * 0.42)
  const zs = [frontZ, -frontZ]
  const xs = [spreadX, -spreadX]
  for (const z of zs) {
    const len = z < 0 && profile.hind ? legLen * profile.hind : legLen
    for (const x of xs) {
      const limb = capsule(leg[0], len, profile.marks === 'panda' ? accent : color, 'leg')
      place(group, limb, x, len * 0.5, z)
    }
  }
  return seat(group)
}

function titleCase(name) {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function parsePrompt(text) {
  const q = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return null
  let species = null
  let aliasLength = 0
  for (const profile of SPECIES) {
    for (const name of profile.names) {
      if (new RegExp(`\\b${name}\\b`).test(q) && name.length > aliasLength) {
        species = profile
        aliasLength = name.length
      }
    }
  }
  let color = null
  for (const [word, hex] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${word}\\b`).test(q)) color = hex
  }
  if (!species) return null
  const name = species.names.find((item) => new RegExp(`\\b${item}\\b`).test(q)) || species.names[0]
  return { profile: species, name, color }
}

/** A solid animal mesh for a prompt that is not one of the stored scans. */
export function sculptAnimal(text) {
  const parsed = parsePrompt(text)
  if (!parsed) return null
  const color = parsed.color || parsed.profile.color
  const group = build(parsed.profile, color)
  const name = titleCase(parsed.name)
  return {
    id: `sculpt-${parsed.name.replace(/\s+/g, '-')}`,
    name,
    origin: 'sculpt',
    group,
  }
}
