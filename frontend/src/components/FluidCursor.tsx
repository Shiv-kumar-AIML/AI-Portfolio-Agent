import { useEffect, useRef } from 'react'

/**
 * Full-screen WebGL fluid simulation that follows the pointer — moving the mouse (or a finger)
 * pushes coloured dye through a Navier–Stokes velocity field. Technique from Pavel Dobryakov's
 * WebGL-Fluid-Simulation (MIT): semi-Lagrangian advection, vorticity confinement, and a Jacobi
 * pressure solve, all as fragment-shader passes over half-float textures.
 *
 * The canvas is transparent (alpha = brightest dye channel), so on a white page the dye reads as
 * soft pastel smoke and on a dark page as glowing colour. It ignores pointer events, renders
 * nothing when WebGL or half-float textures are missing, and stays off for reduced motion.
 */

const CONFIG = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1024,
  DENSITY_DISSIPATION: 2,
  VELOCITY_DISSIPATION: 2,
  PRESSURE: 0.1,
  PRESSURE_ITERATIONS: 20,
  CURL: 3,
  SPLAT_RADIUS: 0.38,
  SPLAT_FORCE: 6000,
  COLOR_UPDATE_SPEED: 10,
  INITIAL_SPLATS: 10,
}

type GL = WebGLRenderingContext | WebGL2RenderingContext

interface Format {
  internalFormat: number
  format: number
}

interface FBO {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
  attach: (id: number) => number
}

interface DoubleFBO {
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
  read: FBO
  write: FBO
  swap: () => void
}

const FRAG_HEADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
precision highp sampler2D;
#else
precision mediump float;
precision mediump sampler2D;
#endif
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
`

const VERTEX = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const CLEAR = `${FRAG_HEADER}
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
`

const DISPLAY = `${FRAG_HEADER}
uniform sampler2D uTexture;
void main () {
  vec3 c = texture2D(uTexture, vUv).rgb;
  float a = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c, a);
}
`

const SPLAT = `${FRAG_HEADER}
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`

const ADVECTION = `${FRAG_HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
#endif
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`

const DIVERGENCE = `${FRAG_HEADER}
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`

const CURL = `${FRAG_HEADER}
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`

const VORTICITY = `${FRAG_HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`

const PRESSURE = `${FRAG_HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`

const GRADIENT_SUBTRACT = `${FRAG_HEADER}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`

class Program {
  readonly program: WebGLProgram
  private readonly uniforms = new Map<string, WebGLUniformLocation>()
  private readonly gl: GL

  constructor(gl: GL, vertex: WebGLShader, fragment: WebGLShader) {
    this.gl = gl
    const program = gl.createProgram()!
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.bindAttribLocation(program, 0, 'aPosition')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed')
    }
    this.program = program
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i)!.name
      this.uniforms.set(name, gl.getUniformLocation(program, name)!)
    }
  }

  bind() {
    this.gl.useProgram(this.program)
  }

  /** Location of a uniform, or null when the compiler optimised it out (setting null is a no-op). */
  u(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null
  }
}

function compile(gl: GL, type: number, source: string, keywords: string[] = []) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, keywords.map((k) => `#define ${k}\n`).join('') + source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed')
  }
  return shader
}

function getContext(canvas: HTMLCanvasElement) {
  const params: WebGLContextAttributes = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }
  let gl: GL | null = canvas.getContext('webgl2', params)
  const isWebGL2 = !!gl
  if (!gl) gl = (canvas.getContext('webgl', params) ?? canvas.getContext('experimental-webgl', params)) as GL | null
  if (!gl) return null

  let halfFloatType: number
  let supportLinearFiltering: boolean
  if (isWebGL2) {
    const gl2 = gl as WebGL2RenderingContext
    gl2.getExtension('EXT_color_buffer_float')
    supportLinearFiltering = !!gl2.getExtension('OES_texture_float_linear')
    halfFloatType = gl2.HALF_FLOAT
  } else {
    const ext = gl.getExtension('OES_texture_half_float')
    if (!ext) return null
    supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear')
    halfFloatType = ext.HALF_FLOAT_OES
  }

  const renderable = (internalFormat: number, format: number) => {
    const texture = gl!.createTexture()
    gl!.bindTexture(gl!.TEXTURE_2D, texture)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, halfFloatType, null)
    const fbo = gl!.createFramebuffer()
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, texture, 0)
    const ok = gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) === gl!.FRAMEBUFFER_COMPLETE
    gl!.deleteFramebuffer(fbo)
    gl!.deleteTexture(texture)
    return ok
  }

  // Prefer the narrowest format; fall back to wider ones a device can actually render to.
  const supported = (candidates: Array<[number, number]>): Format | null => {
    for (const [internalFormat, format] of candidates) {
      if (renderable(internalFormat, format)) return { internalFormat, format }
    }
    return null
  }

  let rgba: Format | null
  let rg: Format | null
  let r: Format | null
  if (isWebGL2) {
    const gl2 = gl as WebGL2RenderingContext
    rgba = supported([[gl2.RGBA16F, gl2.RGBA]])
    rg = supported([[gl2.RG16F, gl2.RG], [gl2.RGBA16F, gl2.RGBA]])
    r = supported([[gl2.R16F, gl2.RED], [gl2.RG16F, gl2.RG], [gl2.RGBA16F, gl2.RGBA]])
  } else {
    rgba = rg = r = supported([[gl.RGBA, gl.RGBA]])
  }
  if (!rgba || !rg || !r) return null

  return { gl, halfFloatType, supportLinearFiltering, formats: { rgba, rg, r } }
}

function hsvToRgb(h: number, s: number, v: number) {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const table: Array<[number, number, number]> = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ]
  const [r, g, b] = table[i % 6]
  return { r, g, b }
}

// Dye strength per splat — higher = more vivid colour on screen.
const DYE_INTENSITY = 0.15

const randomColor = () => {
  const c = hsvToRgb(Math.random(), 0.8, 1)
  return { r: c.r * DYE_INTENSITY, g: c.g * DYE_INTENSITY, b: c.b * DYE_INTENSITY }
}

function startFluid(canvas: HTMLCanvasElement): (() => void) | null {
  const ctx = getContext(canvas)
  if (!ctx) return null
  const { gl, halfFloatType, supportLinearFiltering, formats } = ctx

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
  const scale = (v: number) => Math.floor(v * dpr())

  let programs: Record<string, Program>
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const frag = (src: string, keywords?: string[]) => compile(gl, gl.FRAGMENT_SHADER, src, keywords)
    programs = {
      clear: new Program(gl, vertex, frag(CLEAR)),
      display: new Program(gl, vertex, frag(DISPLAY)),
      splat: new Program(gl, vertex, frag(SPLAT)),
      advection: new Program(gl, vertex, frag(ADVECTION, supportLinearFiltering ? [] : ['MANUAL_FILTERING'])),
      divergence: new Program(gl, vertex, frag(DIVERGENCE)),
      curl: new Program(gl, vertex, frag(CURL)),
      vorticity: new Program(gl, vertex, frag(VORTICITY)),
      pressure: new Program(gl, vertex, frag(PRESSURE)),
      gradient: new Program(gl, vertex, frag(GRADIENT_SUBTRACT)),
    }
  } catch (error) {
    console.warn('Fluid background disabled:', error)
    return null
  }

  // Full-screen quad, bound once.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)

  const blit = (target: FBO | null) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }

  const textures: WebGLTexture[] = []
  const framebuffers: WebGLFramebuffer[] = []

  const createFBO = (w: number, h: number, f: Format, filter: number): FBO => {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internalFormat, w, h, 0, f.format, halfFloatType, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    textures.push(texture)
    framebuffers.push(fbo)
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return id
      },
    }
  }

  const createDoubleFBO = (w: number, h: number, f: Format, filter: number): DoubleFBO => {
    let a = createFBO(w, h, f, filter)
    let b = createFBO(w, h, f, filter)
    return {
      width: w,
      height: h,
      texelSizeX: a.texelSizeX,
      texelSizeY: a.texelSizeY,
      get read() {
        return a
      },
      get write() {
        return b
      },
      swap() {
        ;[a, b] = [b, a]
      },
    }
  }

  const resolution = (target: number) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspect < 1) aspect = 1 / aspect
    const min = Math.round(target)
    const max = Math.round(target * aspect)
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: max, h: min } : { w: min, h: max }
  }

  let dye: DoubleFBO
  let velocity: DoubleFBO
  let divergence: FBO
  let curl: FBO
  let pressure: DoubleFBO

  const initFramebuffers = () => {
    textures.splice(0).forEach((t) => gl.deleteTexture(t))
    framebuffers.splice(0).forEach((f) => gl.deleteFramebuffer(f))
    const sim = resolution(CONFIG.SIM_RESOLUTION)
    const dyeRes = resolution(CONFIG.DYE_RESOLUTION)
    const filter = supportLinearFiltering ? gl.LINEAR : gl.NEAREST
    gl.disable(gl.BLEND)
    dye = createDoubleFBO(dyeRes.w, dyeRes.h, formats.rgba, filter)
    velocity = createDoubleFBO(sim.w, sim.h, formats.rg, filter)
    divergence = createFBO(sim.w, sim.h, formats.r, gl.NEAREST)
    curl = createFBO(sim.w, sim.h, formats.r, gl.NEAREST)
    pressure = createDoubleFBO(sim.w, sim.h, formats.r, gl.NEAREST)
  }

  const resizeCanvas = () => {
    const w = scale(canvas.clientWidth)
    const h = scale(canvas.clientHeight)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      return true
    }
    return false
  }

  const correctRadius = (radius: number) => {
    const aspect = canvas.width / canvas.height
    return aspect > 1 ? radius * aspect : radius
  }

  const splat = (x: number, y: number, dx: number, dy: number, color: { r: number; g: number; b: number }) => {
    const p = programs.splat
    p.bind()
    gl.uniform1i(p.u('uTarget'), velocity.read.attach(0))
    gl.uniform1f(p.u('aspectRatio'), canvas.width / canvas.height)
    gl.uniform2f(p.u('point'), x, y)
    gl.uniform3f(p.u('color'), dx, dy, 0)
    gl.uniform1f(p.u('radius'), correctRadius(CONFIG.SPLAT_RADIUS / 100))
    blit(velocity.write)
    velocity.swap()
    gl.uniform1i(p.u('uTarget'), dye.read.attach(0))
    gl.uniform3f(p.u('color'), color.r, color.g, color.b)
    blit(dye.write)
    dye.swap()
  }

  const randomSplats = (count: number) => {
    for (let i = 0; i < count; i++) {
      const c = randomColor()
      // Softer than a click burst: the opening splashes set the mood, they shouldn't shout.
      splat(Math.random(), Math.random(), 1000 * (Math.random() - 0.5), 1000 * (Math.random() - 0.5), {
        r: c.r * 5,
        g: c.g * 5,
        b: c.b * 5,
      })
    }
  }

  const step = (dt: number) => {
    gl.disable(gl.BLEND)
    const texel = (p: Program) => gl.uniform2f(p.u('texelSize'), velocity.texelSizeX, velocity.texelSizeY)

    let p = programs.curl
    p.bind()
    texel(p)
    gl.uniform1i(p.u('uVelocity'), velocity.read.attach(0))
    blit(curl)

    p = programs.vorticity
    p.bind()
    texel(p)
    gl.uniform1i(p.u('uVelocity'), velocity.read.attach(0))
    gl.uniform1i(p.u('uCurl'), curl.attach(1))
    gl.uniform1f(p.u('curl'), CONFIG.CURL)
    gl.uniform1f(p.u('dt'), dt)
    blit(velocity.write)
    velocity.swap()

    p = programs.divergence
    p.bind()
    texel(p)
    gl.uniform1i(p.u('uVelocity'), velocity.read.attach(0))
    blit(divergence)

    p = programs.clear
    p.bind()
    gl.uniform1i(p.u('uTexture'), pressure.read.attach(0))
    gl.uniform1f(p.u('value'), CONFIG.PRESSURE)
    blit(pressure.write)
    pressure.swap()

    p = programs.pressure
    p.bind()
    texel(p)
    gl.uniform1i(p.u('uDivergence'), divergence.attach(0))
    for (let i = 0; i < CONFIG.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(p.u('uPressure'), pressure.read.attach(1))
      blit(pressure.write)
      pressure.swap()
    }

    p = programs.gradient
    p.bind()
    texel(p)
    gl.uniform1i(p.u('uPressure'), pressure.read.attach(0))
    gl.uniform1i(p.u('uVelocity'), velocity.read.attach(1))
    blit(velocity.write)
    velocity.swap()

    p = programs.advection
    p.bind()
    texel(p)
    if (!supportLinearFiltering) gl.uniform2f(p.u('dyeTexelSize'), velocity.texelSizeX, velocity.texelSizeY)
    const velocityId = velocity.read.attach(0)
    gl.uniform1i(p.u('uVelocity'), velocityId)
    gl.uniform1i(p.u('uSource'), velocityId)
    gl.uniform1f(p.u('dt'), dt)
    gl.uniform1f(p.u('dissipation'), CONFIG.VELOCITY_DISSIPATION)
    blit(velocity.write)
    velocity.swap()

    if (!supportLinearFiltering) gl.uniform2f(p.u('dyeTexelSize'), dye.texelSizeX, dye.texelSizeY)
    gl.uniform1i(p.u('uVelocity'), velocity.read.attach(0))
    gl.uniform1i(p.u('uSource'), dye.read.attach(1))
    gl.uniform1f(p.u('dissipation'), CONFIG.DENSITY_DISSIPATION)
    blit(dye.write)
    dye.swap()
  }

  const render = () => {
    const p = programs.display
    p.bind()
    gl.uniform1i(p.u('uTexture'), dye.read.attach(0))
    blit(null)
  }

  const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, started: false, color: randomColor() }

  const updatePointer = (clientX: number, clientY: number) => {
    const x = scale(clientX) / canvas.width
    const y = 1 - scale(clientY) / canvas.height
    if (!pointer.started) {
      // First event: no delta yet, so the first splat doesn't fling dye across the screen.
      pointer.x = x
      pointer.y = y
      pointer.started = true
      return
    }
    const aspect = canvas.width / canvas.height
    let dx = x - pointer.x
    let dy = y - pointer.y
    if (aspect < 1) dx *= aspect
    if (aspect > 1) dy /= aspect
    pointer.x = x
    pointer.y = y
    pointer.dx = dx
    pointer.dy = dy
    pointer.moved = Math.abs(dx) > 0 || Math.abs(dy) > 0
  }

  const onMouseMove = (e: MouseEvent) => updatePointer(e.clientX, e.clientY)
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0]
    if (t) updatePointer(t.clientX, t.clientY)
  }
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    pointer.started = false
    updatePointer(t.clientX, t.clientY)
  }
  const onMouseDown = (e: MouseEvent) => {
    // A click bursts a bigger, brighter splash at the pointer.
    const x = scale(e.clientX) / canvas.width
    const y = 1 - scale(e.clientY) / canvas.height
    const c = randomColor()
    splat(x, y, 10 * (Math.random() - 0.5), 30 * (Math.random() - 0.5), { r: c.r * 6, g: c.g * 6, b: c.b * 6 })
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: true })

  resizeCanvas()
  initFramebuffers()
  randomSplats(CONFIG.INITIAL_SPLATS)

  let colorTimer = 0
  let last = performance.now()
  let frame = 0
  const loop = () => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.016666)
    last = now
    if (resizeCanvas()) initFramebuffers()
    colorTimer += dt * CONFIG.COLOR_UPDATE_SPEED
    if (colorTimer >= 1) {
      colorTimer %= 1
      pointer.color = randomColor()
    }
    if (pointer.moved) {
      pointer.moved = false
      splat(pointer.x, pointer.y, pointer.dx * CONFIG.SPLAT_FORCE, pointer.dy * CONFIG.SPLAT_FORCE, pointer.color)
    }
    step(dt)
    render()
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    textures.forEach((t) => gl.deleteTexture(t))
    framebuffers.forEach((f) => gl.deleteFramebuffer(f))
    Object.values(programs).forEach((p) => gl.deleteProgram(p.program))
  }
}

export function FluidCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    return startFluid(canvas) ?? undefined
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 block h-dvh w-screen"
    />
  )
}
