import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'

/**
 * The hero scene on the landing page, in a voxel style: a desk in the middle; a little voxel
 * character walks in from the side wearing a backpack, pulls the chair out, puts the bag down,
 * sits, scoots in, opens the laptop — and then keeps working for as long as the page is open
 * (typing, code scrolling on the screen, blinking, glancing up at the visitor now and then, and
 * whenever the scene is hovered).
 *
 * Everything is built from boxes in code and animated procedurally (no model files).
 * World units: the desk top is ~0.62 high; the character is ~1.3 tall; it sits on the -z side of
 * the desk facing +z (towards the camera).
 */

const C = {
  skin: '#f1b88c',
  skinShade: '#e2a477',
  hair: '#3a2a22',
  hairLight: '#4b372c',
  shirt: '#f3eee6',
  overalls: '#8a5a36',
  overallsDark: '#6e4529',
  boots: '#4a2f22',
  eye: '#1b1714',
  blush: '#f39a8a',
  bag: '#c4673b',
  bagDark: '#9e4f2b',
  wood: '#d9874c',
  woodDark: '#b8683a',
  pot: '#8f8f96',
  leaf: '#4f8a3a',
  leafLight: '#68a64c',
  laptop: '#2f7f86',
  laptopDark: '#235f65',
  keys: '#1f2a33',
}

const damp = THREE.MathUtils.damp
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) // easeInOutQuad
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)
const lerp = THREE.MathUtils.lerp

// layout
const CHAIR_TUCKED_Z = -0.3
const CHAIR_OUT_Z = -0.62
const SEATED_Z = -0.52
const START = { x: -2.6, z: -0.75 }
const BEHIND_CHAIR = { x: 0, z: -0.75 }
const PULLED_BACK_Z = -1.07
const SIDE_OF_CHAIR = { x: -0.52, z: -0.6 }
const BAG_FLOOR = { x: 0.56, z: -0.9 }
const SEATED_Y = 0.085

type Phase = 'walk' | 'turn' | 'grab' | 'pull' | 'dropBag' | 'toSide' | 'sit' | 'scoot' | 'open' | 'work'

// ---------- tiny voxel helpers ----------

function useMaterials() {
  return useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>()
    return (color: string) => {
      let m = cache.get(color)
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 })
        cache.set(color, m)
      }
      return m
    }
  }, [])
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1)

type V3 = [number, number, number]

function Box({ s, p = [0, 0, 0], c, r, mat }: { s: V3; p?: V3; c: string; r?: V3; mat: (c: string) => THREE.Material }) {
  return <mesh geometry={boxGeo} material={mat(c)} scale={s} position={p} rotation={r} castShadow receiveShadow />
}

// ---------- the screen: an editor with code scrolling ----------

function useCodeScreen() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 168
    const g = canvas.getContext('2d')!
    const palette = ['#7dd3fc', '#c4b5fd', '#86efac', '#fda4af', '#fcd34d', '#e2e8f0']
    const makeLine = () => {
      const indent = Math.floor(Math.random() * 4) * 12
      const tokens: Array<[number, string]> = []
      let w = 0
      const count = 1 + Math.floor(Math.random() * 4)
      for (let i = 0; i < count; i++) {
        const len = 14 + Math.random() * 46
        tokens.push([len, palette[Math.floor(Math.random() * palette.length)]])
        w += len + 6
        if (w > 180) break
      }
      return { indent, tokens }
    }
    const lines = Array.from({ length: 12 }, makeLine)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const draw = (cursorOn: boolean) => {
      g.fillStyle = '#141a26'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = '#1d2535'
      g.fillRect(0, 0, 22, canvas.height)
      lines.forEach((line, i) => {
        const y = 10 + i * 13
        g.fillStyle = '#3b4659'
        g.fillRect(6, y, 10, 5)
        let x = 30 + line.indent
        line.tokens.forEach(([len, color]) => {
          g.fillStyle = color
          g.fillRect(x, y, len, 6)
          x += len + 6
        })
      })
      if (cursorOn) {
        const last = lines[lines.length - 1]
        const x = 30 + last.indent + last.tokens.reduce((s, [len]) => s + len + 6, 0)
        g.fillStyle = '#ffffff'
        g.fillRect(Math.min(x, 240), 10 + (lines.length - 1) * 13 - 1, 3, 9)
      }
      texture.needsUpdate = true
    }
    draw(true)
    return {
      texture,
      step: (cursorOn: boolean) => {
        lines.shift()
        lines.push(makeLine())
        draw(cursorOn)
      },
      blink: draw,
    }
  }, [])
}

// ---------- the scene ----------

type Rig = {
  root: THREE.Group | null
  body: THREE.Group | null
  head: THREE.Group | null
  eyes: THREE.Group | null
  armL: THREE.Group | null
  armR: THREE.Group | null
  thighL: THREE.Group | null
  thighR: THREE.Group | null
  shinL: THREE.Group | null
  shinR: THREE.Group | null
  bag: THREE.Group | null
  chair: THREE.Group | null
  lid: THREE.Group | null
  screen: THREE.Mesh | null
}

function Scene({ hovered }: { hovered: RefObject<boolean> }) {
  const mat = useMaterials()
  const screen = useCodeScreen()
  const screenMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: screen.texture, emissiveIntensity: 0 }),
    [screen]
  )
  const rig = useRef<Rig>({
    root: null, body: null, head: null, eyes: null, armL: null, armR: null, thighL: null, thighR: null,
    shinL: null, shinR: null, bag: null, chair: null, lid: null, screen: null,
  })
  const set = <K extends keyof Rig>(k: K) => (v: Rig[K]) => {
    rig.current[k] = v
  }

  const st = useRef({
    phase: 'walk' as Phase,
    t: 0,
    clock: 0,
    x: START.x,
    z: START.z,
    y: 0,
    rotY: Math.PI / 2,
    gait: 0,
    walking: 0,
    chairZ: CHAIR_TUCKED_Z,
    bagT: 0, // 0 = on the back, 1 = on the floor
    lid: 0,
    screenOn: 0,
    sit: 0, // 0 standing → 1 seated pose
    reach: 0, // arms forward (grab / open)
    type: 0, // typing pose amount
    look: 0, // glancing at the viewer
    nextLook: 4,
    lookT: 0,
    blinkIn: 2,
    blinkT: 0,
    codeIn: 0.4,
    cursorIn: 0.5,
    cursor: true,
  })

  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const s = st.current
    const r = rig.current
    s.t += dt
    s.clock += dt
    const go = (p: Phase) => {
      s.phase = p
      s.t = 0
    }
    let walkTarget = 0
    let targetRot = s.rotY
    const walkTo = (tx: number, tz: number, speed: number) => {
      const dx = tx - s.x
      const dz = tz - s.z
      const d = Math.hypot(dx, dz)
      if (d < 0.01) return true
      const step = Math.min(d, speed * dt)
      s.x += (dx / d) * step
      s.z += (dz / d) * step
      targetRot = Math.atan2(dx, dz)
      walkTarget = 1
      return false
    }

    // -------- story --------
    switch (s.phase) {
      case 'walk':
        if (walkTo(BEHIND_CHAIR.x, BEHIND_CHAIR.z, 0.95)) go('turn')
        break
      case 'turn':
        targetRot = 0
        if (s.t > 0.35) go('grab')
        break
      case 'grab':
        targetRot = 0
        if (s.t > 0.35) go('pull')
        break
      case 'pull': {
        targetRot = 0
        const k = ease(clamp01(s.t / 0.7))
        s.z = lerp(BEHIND_CHAIR.z, PULLED_BACK_Z, k)
        s.chairZ = lerp(CHAIR_TUCKED_Z, CHAIR_OUT_Z, k)
        walkTarget = 0.5
        if (s.t > 0.75) go('dropBag')
        break
      }
      case 'dropBag':
        targetRot = 0.6 // half-turn towards where the bag goes
        s.bagT = clamp01(s.t / 0.6)
        if (s.t > 0.75) go('toSide')
        break
      case 'toSide':
        if (walkTo(SIDE_OF_CHAIR.x, SIDE_OF_CHAIR.z, 0.8)) go('sit')
        break
      case 'sit': {
        targetRot = 0
        const k = ease(clamp01((s.t - 0.15) / 0.55))
        s.x = lerp(SIDE_OF_CHAIR.x, 0, k)
        s.z = lerp(SIDE_OF_CHAIR.z, CHAIR_OUT_Z, k)
        s.y = lerp(0, SEATED_Y, k) + Math.sin(k * Math.PI) * 0.12 // a little hop up onto the seat
        s.sit = k
        if (s.t > 0.75) go('scoot')
        break
      }
      case 'scoot': {
        targetRot = 0
        const k = ease(clamp01(s.t / 0.45))
        s.z = lerp(CHAIR_OUT_Z, SEATED_Z, k)
        s.chairZ = s.z
        s.y = SEATED_Y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.02
        if (s.t > 0.5) go('open')
        break
      }
      case 'open': {
        targetRot = 0
        const k = clamp01((s.t - 0.25) / 0.7)
        s.lid = 1 - (1 - k) ** 3 // ease-out
        if (s.t > 0.8) s.screenOn = damp(s.screenOn, 1, 6, dt)
        if (s.t > 1.15) go('work')
        break
      }
      case 'work':
        targetRot = 0
        s.screenOn = damp(s.screenOn, 1, 6, dt)
        break
    }

    // -------- body mechanics --------
    s.rotY = damp(s.rotY, targetRot, 9, dt)
    s.walking = damp(s.walking, walkTarget, 10, dt)
    s.gait += dt * 9 * s.walking
    s.reach = damp(s.reach, s.phase === 'grab' || s.phase === 'pull' || (s.phase === 'open' && s.t < 0.9) ? 1 : 0, 10, dt)
    s.type = damp(s.type, s.phase === 'work' ? 1 : 0, 6, dt)

    // glance at the viewer now and then while working, or whenever hovered
    if (s.phase === 'work') {
      s.nextLook -= dt
      if (s.nextLook <= 0) {
        s.lookT = 1.6
        s.nextLook = 5 + Math.random() * 3
      }
    }
    s.lookT = Math.max(0, s.lookT - dt)
    s.look = damp(s.look, s.phase === 'work' && (s.lookT > 0 || hovered.current) ? 1 : 0, 6, dt)

    const sw = Math.sin(s.gait)
    if (r.root) {
      r.root.position.set(s.x, s.y + Math.abs(sw) * 0.035 * s.walking, s.z)
      r.root.rotation.y = s.rotY
    }
    if (r.body) {
      r.body.rotation.x = 0.06 * s.walking + 0.12 * s.reach * (1 - s.sit) + 0.08 * s.type
      r.body.position.y = Math.sin(s.clock * 2.2) * 0.004 // breathing
    }

    // legs: walk cycle with knee bend, or the seated pose
    const legPose = (thigh: THREE.Group | null, shin: THREE.Group | null, phase: number) => {
      if (!thigh || !shin) return
      const swing = Math.sin(s.gait + phase) * 0.55 * s.walking
      const knee = Math.max(0, -Math.sin(s.gait + phase)) * 0.7 * s.walking
      thigh.rotation.x = lerp(swing, -Math.PI / 2, s.sit)
      shin.rotation.x = lerp(knee, Math.PI / 2, s.sit)
    }
    legPose(r.thighL, r.shinL, 0)
    legPose(r.thighR, r.shinR, Math.PI)

    // arms: swing → reach forward (chair / lid) → on the keyboard, typing
    const typeL = Math.sin(s.clock * 17) * 0.07 * s.type
    const typeR = Math.sin(s.clock * 17 + 1.7) * 0.07 * s.type
    if (r.armL) {
      r.armL.rotation.x = -sw * 0.6 * s.walking - 1.25 * s.reach * (s.phase === 'open' ? 0 : 1) - 1.12 * s.type + typeL
      r.armL.rotation.z = -0.06 - 0.12 * s.type
    }
    if (r.armR) {
      r.armR.rotation.x = sw * 0.6 * s.walking - 1.25 * s.reach - 1.12 * s.type + typeR
      r.armR.rotation.z = 0.06 + 0.12 * s.type
    }

    // head: follows the hands while typing, glances up at you
    if (r.head) {
      r.head.rotation.x = 0.16 * s.type * (1 - s.look) + Math.sin(s.clock * 3.1) * 0.015 * s.type - 0.12 * s.look
      r.head.rotation.y = 0.45 * s.look
      r.head.rotation.z = Math.sin(s.gait) * 0.04 * s.walking
    }

    // blink
    s.blinkIn -= dt
    if (s.blinkIn <= 0) {
      s.blinkT = 0.12
      s.blinkIn = 2 + Math.random() * 2.5
    }
    s.blinkT = Math.max(0, s.blinkT - dt)
    if (r.eyes) r.eyes.scale.y = s.blinkT > 0 ? 0.15 : 1

    // chair, lid, screen
    if (r.chair) r.chair.position.z = s.chairZ
    if (r.lid) r.lid.rotation.x = s.lid * 1.85
    screenMat.emissiveIntensity = s.screenOn * 1.15
    if (s.phase === 'work') {
      s.codeIn -= dt
      s.cursorIn -= dt
      if (s.cursorIn <= 0) {
        s.cursor = !s.cursor
        s.cursorIn = 0.45
        screen.blink(s.cursor)
      }
      if (s.codeIn <= 0) {
        s.codeIn = 0.35 + Math.random() * 0.5
        screen.step(s.cursor)
      }
    }

    // backpack: rides on the back, then is set down on the floor
    if (r.bag && r.body) {
      const onBack = r.body.localToWorld(tmp.set(0, 0.55, -0.19))
      const k = ease(s.bagT)
      const arc = Math.sin(k * Math.PI) * 0.25
      r.bag.position.set(lerp(onBack.x, BAG_FLOOR.x, k), lerp(onBack.y, 0.17, k) + arc, lerp(onBack.z, BAG_FLOOR.z, k))
      r.bag.rotation.set(0, lerp(s.rotY, -0.5, k), lerp(0, 0.08, k))
    }
  })

  const m = mat
  const hair = (p: V3, sz: number | V3, c = C.hair) => <Box s={typeof sz === 'number' ? [sz, sz, sz] : sz} p={p} c={c} mat={m} />

  return (
    <>
      {/* ---------- desk ---------- */}
      <group>
        <Box s={[1.36, 0.05, 0.64]} p={[0, 0.6, 0]} c={C.wood} mat={m} />
        {(
          [
            [-0.62, -0.27],
            [0.62, -0.27],
            [-0.62, 0.27],
            [0.62, 0.27],
          ] as const
        ).map(([x, z], i) => (
          <Box key={i} s={[0.06, 0.58, 0.06]} p={[x, 0.29, z]} c={C.woodDark} mat={m} />
        ))}

        {/* plant */}
        <group position={[-0.42, 0.625, 0.05]}>
          <Box s={[0.13, 0.11, 0.13]} p={[0, 0.055, 0]} c={C.pot} mat={m} />
          <Box s={[0.11, 0.02, 0.11]} p={[0, 0.115, 0]} c="#5a4636" mat={m} />
          {(
            [
              [0, 0.2, 0, 0, 0],
              [0.06, 0.17, 0.02, 0, -0.6],
              [-0.06, 0.17, -0.01, 0, 0.6],
              [0.01, 0.17, 0.06, 0.6, 0],
              [-0.01, 0.16, -0.06, -0.6, 0],
            ] as const
          ).map(([x, y, z, rx, rz], i) => (
            <Box key={i} s={[0.05, 0.13, 0.025]} p={[x, y, z]} r={[rx, i * 0.7, rz]} c={i % 2 ? C.leafLight : C.leaf} mat={m} />
          ))}
        </group>

        {/* laptop: base with keyboard, lid hinged at the back */}
        <group position={[0.1, 0.625, -0.1]}>
          <Box s={[0.44, 0.025, 0.3]} p={[0, 0.0125, 0]} c={C.laptop} mat={m} />
          <Box s={[0.38, 0.004, 0.16]} p={[0, 0.026, -0.04]} c={C.keys} mat={m} />
          <group ref={set('lid')} position={[0, 0.025, 0.15]}>
            <Box s={[0.44, 0.018, 0.3]} p={[0, 0.009, -0.15]} c={C.laptopDark} mat={m} />
            {/* logo on the back of the lid */}
            <Box s={[0.07, 0.003, 0.05]} p={[0, 0.019, -0.15]} c="#7fe3e6" mat={m} />
            {/* the screen faces down when closed, towards the character when open */}
            <mesh ref={set('screen')} geometry={boxGeo} material={screenMat} scale={[0.4, 0.003, 0.26]} position={[0, -0.0005, -0.15]} />
          </group>
        </group>
      </group>

      {/* ---------- chair ---------- */}
      <group ref={set('chair')} position={[0, 0, CHAIR_TUCKED_Z]}>
        <Box s={[0.42, 0.045, 0.4]} p={[0, 0.36, 0]} c={C.wood} mat={m} />
        {(
          [
            [-0.18, -0.17],
            [0.18, -0.17],
            [-0.18, 0.17],
            [0.18, 0.17],
          ] as const
        ).map(([x, z], i) => (
          <Box key={i} s={[0.045, 0.34, 0.045]} p={[x, 0.17, z]} c={C.woodDark} mat={m} />
        ))}
        <Box s={[0.045, 0.42, 0.045]} p={[-0.18, 0.58, -0.18]} c={C.woodDark} mat={m} />
        <Box s={[0.045, 0.42, 0.045]} p={[0.18, 0.58, -0.18]} c={C.woodDark} mat={m} />
        <Box s={[0.4, 0.16, 0.04]} p={[0, 0.66, -0.18]} c={C.wood} mat={m} />
      </group>

      {/* ---------- backpack (positioned every frame) ---------- */}
      <group ref={set('bag')}>
        <Box s={[0.3, 0.32, 0.14]} c={C.bag} mat={m} />
        <Box s={[0.31, 0.11, 0.15]} p={[0, 0.12, 0.002]} c={C.bagDark} mat={m} />
        <Box s={[0.2, 0.12, 0.03]} p={[0, -0.06, -0.08]} c={C.bagDark} mat={m} />
        <Box s={[0.04, 0.035, 0.24]} p={[-0.1, 0.15, 0.13]} c={C.bagDark} mat={m} />
        <Box s={[0.04, 0.035, 0.24]} p={[0.1, 0.15, 0.13]} c={C.bagDark} mat={m} />
      </group>

      {/* ---------- the character ---------- */}
      <group ref={set('root')} position={[START.x, 0, START.z]} rotation={[0, Math.PI / 2, 0]}>
        {/* legs: thigh pivots at the hip, shin at the knee */}
        {([-1, 1] as const).map((side) => (
          <group key={side} ref={set(side < 0 ? 'thighL' : 'thighR')} position={[0.085 * side, 0.36, 0]}>
            <Box s={[0.14, 0.18, 0.15]} p={[0, -0.09, 0]} c={C.overalls} mat={m} />
            <group ref={set(side < 0 ? 'shinL' : 'shinR')} position={[0, -0.18, 0]}>
              <Box s={[0.13, 0.12, 0.14]} p={[0, -0.06, 0]} c={C.overalls} mat={m} />
              <Box s={[0.15, 0.07, 0.2]} p={[0, -0.145, 0.025]} c={C.boots} mat={m} />
            </group>
          </group>
        ))}

        <group ref={set('body')}>
          {/* torso: shirt + overalls bib and straps */}
          <Box s={[0.36, 0.36, 0.22]} p={[0, 0.54, 0]} c={C.shirt} mat={m} />
          <Box s={[0.37, 0.13, 0.23]} p={[0, 0.425, 0]} c={C.overalls} mat={m} />
          <Box s={[0.26, 0.18, 0.012]} p={[0, 0.51, 0.114]} c={C.overalls} mat={m} />
          <Box s={[0.12, 0.07, 0.014]} p={[0, 0.5, 0.122]} c={C.overallsDark} mat={m} />
          <Box s={[0.05, 0.2, 0.012]} p={[-0.1, 0.6, 0.114]} c={C.overalls} mat={m} />
          <Box s={[0.05, 0.2, 0.012]} p={[0.1, 0.6, 0.114]} c={C.overalls} mat={m} />
          <Box s={[0.035, 0.035, 0.016]} p={[-0.1, 0.6, 0.12]} c="#e7c35a" mat={m} />
          <Box s={[0.035, 0.035, 0.016]} p={[0.1, 0.6, 0.12]} c="#e7c35a" mat={m} />

          {/* arms: pivot at the shoulder */}
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={set(side < 0 ? 'armL' : 'armR')} position={[0.235 * side, 0.69, 0]}>
              <Box s={[0.11, 0.15, 0.12]} p={[0, -0.07, 0]} c={C.shirt} mat={m} />
              <Box s={[0.1, 0.15, 0.11]} p={[0, -0.21, 0]} c={C.skin} mat={m} />
              <Box s={[0.11, 0.09, 0.11]} p={[0, -0.32, 0.005]} c={C.skin} mat={m} />
            </group>
          ))}

          {/* head: pivot at the neck */}
          <group ref={set('head')} position={[0, 0.72, 0]}>
            <Box s={[0.46, 0.42, 0.42]} p={[0, 0.23, 0]} c={C.skin} mat={m} />
            <Box s={[0.04, 0.08, 0.07]} p={[-0.24, 0.22, 0]} c={C.skinShade} mat={m} />
            <Box s={[0.04, 0.08, 0.07]} p={[0.24, 0.22, 0]} c={C.skinShade} mat={m} />
            {/* eyes (blink by scaling y) + blush */}
            <group ref={set('eyes')} position={[0, 0.2, 0.212]}>
              <Box s={[0.055, 0.085, 0.01]} p={[-0.09, 0, 0]} c={C.eye} mat={m} />
              <Box s={[0.055, 0.085, 0.01]} p={[0.09, 0, 0]} c={C.eye} mat={m} />
            </group>
            <Box s={[0.07, 0.03, 0.008]} p={[-0.155, 0.13, 0.212]} c={C.blush} mat={m} />
            <Box s={[0.07, 0.03, 0.008]} p={[0.155, 0.13, 0.212]} c={C.blush} mat={m} />
            <Box s={[0.05, 0.012, 0.008]} p={[0, 0.1, 0.212]} c="#a5524a" mat={m} />

            {/* messy voxel hair */}
            {hair([0, 0.47, -0.01], [0.5, 0.12, 0.47])}
            {hair([0, 0.33, -0.22], [0.5, 0.34, 0.08])}
            {hair([-0.245, 0.36, -0.03], [0.06, 0.26, 0.4])}
            {hair([0.245, 0.36, -0.03], [0.06, 0.26, 0.4])}
            {hair([-0.18, 0.54, 0.1], 0.15)}
            {hair([0.0, 0.56, 0.13], 0.16, C.hairLight)}
            {hair([0.17, 0.54, 0.08], 0.14)}
            {hair([-0.12, 0.57, -0.12], 0.15, C.hairLight)}
            {hair([0.13, 0.58, -0.1], 0.15)}
            {hair([0.0, 0.6, -0.01], 0.13)}
            {hair([-0.17, 0.42, 0.2], [0.13, 0.11, 0.07])}
            {hair([-0.02, 0.43, 0.215], [0.14, 0.12, 0.06], C.hairLight)}
            {hair([0.15, 0.41, 0.2], [0.12, 0.1, 0.07])}
            {hair([-0.26, 0.5, 0.12], 0.1)}
            {hair([0.26, 0.51, -0.14], 0.1, C.hairLight)}
            {hair([-0.25, 0.27, 0.12], [0.05, 0.1, 0.06])}
            {hair([0.25, 0.27, 0.12], [0.05, 0.1, 0.06])}
          </group>
        </group>
      </group>

      <ContactShadows position={[0, 0.001, 0]} opacity={0.32} scale={7} blur={2.6} far={1.6} resolution={512} color="#3b2a22" />
    </>
  )
}

export default function DeskScene({ className }: { className?: string }) {
  const hovered = useRef(false)
  return (
    <div
      className={className}
      onPointerEnter={() => (hovered.current = true)}
      onPointerLeave={() => (hovered.current = false)}
      // soft edges, so the character walks in out of nowhere instead of from a hard border
      style={{ maskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 92%, transparent 100%)' }}
    >
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.75]}
        camera={{ position: [2.1, 1.9, 2.9], fov: 30, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ camera }) => camera.lookAt(-0.15, 0.55, -0.3)}
      >
        <hemisphereLight args={['#fff6ea', '#c9b29a', 1.6]} />
        <directionalLight
          position={[2.5, 4.5, 3]}
          intensity={2.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-3, 2.5, -2]} intensity={0.6} color="#ffe3c4" />
        <Scene hovered={hovered} />
      </Canvas>
    </div>
  )
}
