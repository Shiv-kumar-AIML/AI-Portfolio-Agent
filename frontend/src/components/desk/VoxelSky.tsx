import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'

/**
 * The sun / moon of the landing page, built from cubes in the same voxel style as the desk scene.
 * `dark` (a ref, read every frame) decides which one is up: the other spins and sinks out of view
 * while it rises in. Both idle with a slow turn and bob; the sun's rays pulse, the stars twinkle.
 */

type Cell = { x: number; y: number; color: string; z?: number }

const R = 3.2 // disc radius in cells

function sunCells(): Cell[] {
  const cells: Cell[] = []
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y)
      if (d > R) continue
      // lighter towards the upper left, deeper orange at the rim
      const shade = d > 2.4 ? '#f59e0b' : x + y > 1 ? '#fbbf24' : '#fde047'
      cells.push({ x, y, color: shade })
    }
  }
  return cells
}

// 8 rays: two cubes each, pointing out from the disc
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  return [4.6, 5.7].map((r, j) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r, color: j ? '#fcd34d' : '#fbbf24' }))
})

function moonCells(): Cell[] {
  const cells: Cell[] = []
  const craters = new Set(['-2,1', '-1,-1', '-2,-2', '0,2'])
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      if (Math.hypot(x, y) > R) continue
      if (Math.hypot(x - 1.7, y - 1.0) < 2.55) continue // bite out of the disc → crescent
      const crater = craters.has(`${x},${y}`)
      cells.push({ x, y, color: crater ? '#aeb9d9' : x < -1 ? '#e3e9fb' : '#f4f6ff', z: crater ? -0.25 : 0 })
    }
  }
  return cells
}

const STARS = [
  { x: 4.2, y: 3.6, s: 0.55, phase: 0 },
  { x: 3.4, y: -3.8, s: 0.45, phase: 1.7 },
  { x: -4.4, y: 3.9, s: 0.4, phase: 3.1 },
]

const box = new THREE.BoxGeometry(1, 1, 1)

function useMat() {
  return useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>()
    return (color: string, glow = 0.35) => {
      const key = `${color}/${glow}`
      let m = cache.get(key)
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: 0.8 })
        cache.set(key, m)
      }
      return m
    }
  }, [])
}

const damp = THREE.MathUtils.damp

function Bodies({ dark }: { dark: RefObject<boolean> }) {
  const mat = useMat()
  const sun = useRef<THREE.Group>(null)
  const moon = useRef<THREE.Group>(null)
  const rays = useRef<THREE.Group>(null)
  const stars = useRef<Array<THREE.Mesh | null>>([])
  const st = useRef({ k: dark.current ? 1 : 0, clock: 0 })
  const sunC = useMemo(sunCells, [])
  const moonC = useMemo(moonCells, [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const s = st.current
    s.clock += dt
    s.k = damp(s.k, dark.current ? 1 : 0, 4.5, dt) // 0 = day, 1 = night
    const bob = Math.sin(s.clock * 1.6) * 0.25
    const sway = Math.sin(s.clock * 0.7) * 0.35
    if (sun.current) {
      // sets: drops and spins away as night comes
      sun.current.position.y = -s.k * 24 + bob * (1 - s.k)
      sun.current.rotation.set(0.25, sway + s.k * Math.PI, s.clock * 0.25 + s.k * 1.5)
      sun.current.visible = s.k < 0.98
    }
    if (rays.current) rays.current.scale.setScalar(1 + Math.sin(s.clock * 2.6) * 0.07)
    if (moon.current) {
      moon.current.position.y = (1 - s.k) * -24 + bob * s.k
      moon.current.rotation.set(0.15, sway * 0.5 - (1 - s.k) * Math.PI, -0.2 + Math.sin(s.clock * 0.9) * 0.06)
      moon.current.visible = s.k > 0.02
    }
    stars.current.forEach((m, i) => {
      if (m) m.scale.setScalar(STARS[i].s * (0.65 + 0.35 * Math.sin(s.clock * 3 + STARS[i].phase)) * s.k + 0.0001)
    })
  })

  return (
    <>
      <group ref={sun}>
        {sunC.map((c, i) => (
          <mesh key={i} geometry={box} material={mat(c.color, 0.95)} position={[c.x, c.y, 0]} scale={[1, 1, 1.6]} />
        ))}
        <group ref={rays}>
          {RAYS.flat().map((c, i) => (
            <mesh key={i} geometry={box} material={mat(c.color, 1.1)} position={[c.x, c.y, 0]} scale={0.8} />
          ))}
        </group>
      </group>

      <group ref={moon}>
        {moonC.map((c, i) => (
          <mesh key={i} geometry={box} material={mat(c.color, 0.75)} position={[c.x, c.y, c.z ?? 0]} scale={[1, 1, 1.6]} />
        ))}
        {STARS.map((p, i) => (
          <mesh
            key={i}
            ref={(m) => {
              stars.current[i] = m
            }}
            geometry={box}
            material={mat('#ffffff', 1.6)}
            position={[p.x, p.y, 0.5]}
            rotation={[0, 0, Math.PI / 4]}
          />
        ))}
      </group>
    </>
  )
}

export default function VoxelSky({ dark }: { dark: RefObject<boolean> }) {
  return (
    <Canvas
      dpr={[1, 2]}
      orthographic
      camera={{ position: [0, 0, 20], zoom: 8.5, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
      style={{ pointerEvents: 'none' }}
    >
      <hemisphereLight args={['#ffffff', '#9a8f86', 1.5]} />
      <directionalLight position={[-4, 6, 8]} intensity={1.8} />
      <Bodies dark={dark} />
    </Canvas>
  )
}
