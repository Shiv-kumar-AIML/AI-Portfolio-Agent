/**
 * Shared, frame-rate state between the 3D desk scene and the mini-OS overlay (outside React, so
 * per-frame updates never re-render anything that doesn't care):
 *
 *  - quad:   where the laptop screen is on the page (4 corners in CSS px) once the camera has
 *            settled at the character's eyes — the OS is mapped onto exactly that quad.
 *  - typing: the reply is being typed into the OS right now — the character's hands type faster.
 */

export type Pt = { x: number; y: number }
export type Quad = { tl: Pt; tr: Pt; br: Pt; bl: Pt }

/** Below this viewport width the screen would be too small to read: the OS goes full-screen. */
export const POV_MIN_WIDTH = 700

export const deskSignals = { typing: false }

let quad: Quad | null = null
const listeners = new Set<() => void>()

const close = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

export function setScreenQuad(next: Quad | null) {
  if (next === quad) return
  if (next && quad && close(next.tl, quad.tl) && close(next.tr, quad.tr) && close(next.br, quad.br) && close(next.bl, quad.bl)) return
  quad = next
  listeners.forEach((l) => l())
}

export const getScreenQuad = () => quad

export function subscribeScreenQuad(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * CSS matrix3d that maps the rectangle (0,0)-(w,h) onto `q` (a projective transform / homography),
 * for an element with transform-origin 0 0.
 */
export function quadTransform(w: number, h: number, q: Quad): string {
  const src = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const dst = [q.tl, q.tr, q.br, q.bl]
  // Solve for H (8 unknowns): x' = (a x + b y + c) / (g x + h y + 1), y' = (d x + e y + f) / (g x + h y + 1)
  const A: number[][] = []
  const B: number[] = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const { x: X, y: Y } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    B.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    B.push(Y)
  }
  const s = solve(A, B)
  if (!s) return 'none'
  const [a, b, c, d, e, f, g, hh] = s
  // column-major 4x4
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`
}

function solve(A: number[][], B: number[]): number[] | null {
  const n = B.length
  const M = A.map((row, i) => [...row, B[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const k = M[r][col] / M[col][col]
      for (let c = col; c <= n; c++) M[r][c] -= k * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}
