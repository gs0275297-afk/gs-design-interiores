/* Galeria imersiva — corredor de páginas em WebGL (three.js).
   Port em JS puro do componente "Magazine Flip" (Originkit). Carregado sob demanda. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, BoxGeometry, ShaderMaterial, InstancedMesh,
  InstancedBufferAttribute, WebGLRenderTarget, CanvasTexture, DataTexture,
  NoColorSpace, LinearMipmapLinearFilter, LinearFilter, ClampToEdgeWrapping, RGBAFormat,
} from 'three';

const CAM_FOV = 75;
const CAM_Z = 6;
const VIEW_HEIGHT = 2 * CAM_Z * Math.tan((CAM_FOV * Math.PI) / 360);
const PAGE_SEGMENTS = 40;
const MAX_PAGES = 60;
const THICKNESS_RATIO = 0.005;
const CORRIDOR_DIM = 0.22;
const TAP_SLOP = 6;
const TAP_MS = 600;
const PICK_MAX = 1600;
const ATLAS_MAX = 4096;

const DEFAULTS = {
  pages: 7, spacing: 5, tilt: 0, turn: 0, pageWidth: 620, pageHeight: 620, scrollSens: 4.6,
  view: { tap: true, zoom: 5, speed: 5 },
  travel: { drift: 2, smoothing: 5, wave: 5 },
  cellMax: 512,
};

const clamp = (v, lo, hi, fb) => Math.max(lo, Math.min(hi, typeof v === 'number' && isFinite(v) ? v : fb));
const power2InOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function settingsFor(cfg, vw, vh) {
  const worldPerPx = VIEW_HEIGHT / Math.max(1, vh);
  const viewAspect = Math.max(1, vw) / Math.max(1, vh);
  const pageWidthPx = clamp(cfg.pageWidth, 40, 1200, DEFAULTS.pageWidth);
  const pageHeightPx = clamp(cfg.pageHeight, 40, 1600, DEFAULTS.pageHeight);
  const pageWidth = pageWidthPx * worldPerPx;
  const pageHeight = pageHeightPx * worldPerPx;
  const spacing = clamp(cfg.spacing, 0, 10, DEFAULTS.spacing);
  const smoothing = clamp(cfg.travel.smoothing, 0, 10, 5);
  const wave = clamp(cfg.travel.wave, 0, 10, 5);
  const drift = clamp(cfg.travel.drift, -10, 10, 2);
  const focusZ = Math.min(CAM_Z * 0.55, pageWidth * 0.75);
  const planeHeight = (VIEW_HEIGHT * (CAM_Z - focusZ)) / CAM_Z;
  const planeWidth = planeHeight * viewAspect;
  const fill = 0.6 + clamp(cfg.view.zoom, 0, 10, 5) * 0.04;
  return {
    pageWidth, pageHeight, pageWidthPx, pageHeightPx, worldPerPx,
    pages: Math.round(clamp(cfg.pages, 4, MAX_PAGES, DEFAULTS.pages)),
    pageSpacing: pageWidth * (0.1 + spacing * 0.08),
    thickness: pageWidth * THICKNESS_RATIO,
    tilt: (clamp(cfg.tilt, -45, 45, 0) * Math.PI) / 180,
    turn: (clamp(cfg.turn, -60, 60, 0) * Math.PI) / 180,
    wave: pageWidth * 0.04 * wave,
    lerp: 0.35 * Math.pow(0.82, smoothing),
    driftPerSecond: drift * pageWidth * 0.15,
    wheel: 0.4 + clamp(cfg.scrollSens, 0, 10, DEFAULTS.scrollSens) * 0.16,
    tapToView: cfg.view.tap !== false,
    focusZ,
    focusScale: Math.min((planeHeight * fill) / pageHeight, (planeWidth * fill) / pageWidth),
    viewDuration: 1.6 - clamp(cfg.view.speed, 0, 10, 5) * 0.13,
  };
}

const PAGE_VERTEX = `
attribute float aIndex;
attribute vec4 aRect;
attribute float aAspect;
attribute float aOffset;
uniform float uPageThickness;
uniform float uPageWidth;
uniform float uPageHeight;
uniform float uMeshCount;
uniform float uPageSpacing;
uniform float uScrollY;
uniform float uSpeedY;
uniform float uWave;
uniform float uTilt;
uniform float uTurn;
uniform float uFocusIndex;
uniform float uFocusProgress;
uniform float uFocusScale;
uniform float uFocusZ;
varying vec2 vUv;
varying vec4 vRect;
varying float vAspect;
varying float vOffset;
varying float vIndex;
varying float vDim;
const float TAU_HALF = 3.14159265359;
mat3 rotY(float a) { return mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a)); }
mat3 rotX(float a) { return mat3(1.0, 0.0, 0.0, 0.0, cos(a), -sin(a), 0.0, sin(a), cos(a)); }
void main() {
  float PI = TAU_HALF;
  vec3 basePos = vec3(position.x * uPageWidth, position.y * uPageHeight, position.z * uPageThickness);
  vec3 rotationCenter = vec3(-uPageWidth * 0.5, 0.0, 0.0);
  float fromMiddle = aIndex - (uMeshCount - 1.0) * 0.5;
  float yAngle = -PI * 0.5 + uTurn;
  float xAngle = uTilt;
  float boxCenterZ = uPageSpacing * (-fromMiddle);
  float maxZ = uMeshCount * (uPageSpacing + uPageThickness) * 0.5;
  float bow = sin((position.y + 0.5) * 2.0) * uWave;
  float speed = clamp(uSpeedY / uPageWidth * 4.0, -2.0, 2.0);
  float zCorridor = mod(boxCenterZ - uScrollY + maxZ, 2.0 * maxZ) - maxZ - bow * speed;
  float focused = step(abs(aIndex - uFocusIndex), 0.5);
  float e = focused * uFocusProgress;
  float k = mix(1.0, uFocusScale, e);
  vec3 pivot = rotationCenter * (1.0 - e);
  vec3 vertexLocal = basePos * k - pivot;
  vertexLocal.z += zCorridor * (1.0 - e);
  vec3 rotated = rotY(yAngle * (1.0 - e)) * vertexLocal + pivot;
  rotated.z -= uPageWidth * 0.5 * (1.0 - e);
  rotated.x += uPageWidth * 0.5 * (1.0 - e);
  vec3 newPosition = rotX(xAngle * (1.0 - e)) * rotated;
  newPosition.z += uFocusZ * e;
  vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
  gl_Position = projectionMatrix * viewMatrix * modelPosition;
  vUv = uv;
  vRect = aRect;
  vAspect = aAspect;
  vOffset = aOffset;
  vIndex = aIndex;
  vDim = uFocusProgress * (1.0 - focused);
}`;

const PAGE_FRAGMENT = `
uniform sampler2D uAtlas;
uniform float uPageAspect;
varying vec2 vUv;
varying vec4 vRect;
varying float vAspect;
varying float vOffset;
varying float vDim;
void main() {
  vec2 uv = vUv;
  float s = vAspect / uPageAspect;
  float band = min(s, 1.0 / s);
  float slack = (1.0 - band) * 0.5;
  float slide = clamp(vOffset, -1.0, 1.0) * slack;
  if (s >= 1.0) { uv.x = (uv.x - 0.5) * band + 0.5 - slide; }
  else { uv.y = (uv.y - 0.5) * band + 0.5 + slide; }
  vec2 atlasUv = mix(vRect.xy, vRect.zw, clamp(uv, 0.0, 1.0));
  vec4 color = texture2D(uAtlas, atlasUv);
  gl_FragColor = vec4(color.rgb * mix(1.0, ${CORRIDOR_DIM.toFixed(2)}, vDim), color.a);
}`;

const PICK_FRAGMENT = `
varying float vIndex;
void main() { gl_FragColor = vec4((vIndex + 1.0) / 255.0, 0.0, 0.0, 1.0); }`;

/* ---------- Atlas de texturas ---------- */
const imageCache = new Map();
function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

async function buildAtlas(sources, cellMax, maxAnisotropy) {
  const n = Math.max(1, sources.length);
  const images = await Promise.all(sources.map((s) => (s ? loadImage(s) : null)));
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = Math.min(cellMax, Math.floor(ATLAS_MAX / Math.max(cols, rows)));
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cells = [];
  for (let i = 0; i < n; i++) {
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * cell;
    const img = images[i];
    const aspect = img && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
    const w = aspect >= 1 ? cell : cell * aspect;
    const h = aspect >= 1 ? cell / aspect : cell;
    const dx = cx + (cell - w) / 2;
    const dy = cy + (cell - h) / 2;
    if (img) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, w, h);
    } else {
      ctx.fillStyle = '#2e2e30';
      ctx.fillRect(dx, dy, w, h);
    }
    cells.push({
      rect: [(dx + 1) / canvas.width, 1 - (dy + h - 1) / canvas.height, (dx + w - 1) / canvas.width, 1 - (dy + 1) / canvas.height],
      aspect,
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return { texture, cells };
}

/* ---------- Cena ---------- */
class MagazineScene {
  constructor(container, cfg) {
    this.container = container;
    this.cfg = cfg;
    this.scene = new Scene();
    this.width = 1;
    this.height = 1;
    this.frameId = 0;
    this.disposed = false;
    this.atlas = null;
    this.scroll = { target: 0, current: 0, speed: 0 };
    this.drag = { active: false, lastX: 0, id: -1 };
    this.focus = { index: -1, t: 0, target: 0 };
    this.tap = { x: 0, y: 0, at: 0, id: -1, hit: -1 };
    this.pickBuffer = new Uint8Array(4);
    this.settingsCache = null;
    this.active = false;
    this.onReady = null;

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(CAM_FOV, 1, 0.1, 200);
    this.camera.position.z = CAM_Z;
    this.scene.add(this.camera);

    this.blank = new DataTexture(new Uint8Array([46, 46, 48, 255]), 1, 1, RGBAFormat);
    this.blank.needsUpdate = true;
    this.geometry = new BoxGeometry(1, 1, 1, PAGE_SEGMENTS, PAGE_SEGMENTS, 1);
    this.pickTarget = new WebGLRenderTarget(1, 1);

    this.material = new ShaderMaterial({
      vertexShader: PAGE_VERTEX,
      fragmentShader: PAGE_FRAGMENT,
      transparent: true,
      uniforms: {
        uPageThickness: { value: 0.01 }, uPageWidth: { value: 2 }, uPageHeight: { value: 3 },
        uMeshCount: { value: cfg.pages }, uPageSpacing: { value: 1 }, uScrollY: { value: 0 },
        uSpeedY: { value: 0 }, uWave: { value: 0.4 }, uTilt: { value: 0 }, uTurn: { value: 0 },
        uFocusIndex: { value: -1 }, uFocusProgress: { value: 0 }, uFocusScale: { value: 1 },
        uFocusZ: { value: 0 }, uPageAspect: { value: 2 / 3 }, uAtlas: { value: this.blank },
      },
    });
    this.pickMaterial = new ShaderMaterial({ vertexShader: PAGE_VERTEX, fragmentShader: PICK_FRAGMENT, uniforms: this.material.uniforms });

    this.mesh = new InstancedMesh(this.geometry, this.material, MAX_PAGES);
    this.mesh.frustumCulled = false;
    const index = new Float32Array(MAX_PAGES);
    for (let i = 0; i < MAX_PAGES; i++) index[i] = i;
    this.geometry.setAttribute('aIndex', new InstancedBufferAttribute(index, 1));
    this.rectAttr = new InstancedBufferAttribute(new Float32Array(MAX_PAGES * 4), 4);
    this.aspectAttr = new InstancedBufferAttribute(new Float32Array(MAX_PAGES).fill(1), 1);
    this.offsetAttr = new InstancedBufferAttribute(new Float32Array(MAX_PAGES), 1);
    this.geometry.setAttribute('aRect', this.rectAttr);
    this.geometry.setAttribute('aAspect', this.aspectAttr);
    this.geometry.setAttribute('aOffset', this.offsetAttr);
    for (let i = 0; i < MAX_PAGES; i++) this.rectAttr.setXYZW(i, 0, 0, 1, 1);
    this.scene.add(this.mesh);

    this.applyConfig();
    this.loadAtlas();
  }

  settings() {
    return (this.settingsCache ||= settingsFor(this.cfg, this.width, this.height));
  }

  applyConfig() {
    const S = this.settings();
    const u = this.material.uniforms;
    this.mesh.count = S.pages;
    u.uMeshCount.value = S.pages;
    u.uPageWidth.value = S.pageWidth;
    u.uPageHeight.value = S.pageHeight;
    u.uPageThickness.value = S.thickness;
    u.uPageSpacing.value = S.pageSpacing;
    u.uWave.value = S.wave;
    u.uTilt.value = S.tilt;
    u.uTurn.value = S.turn;
    u.uPageAspect.value = S.pageWidthPx / S.pageHeightPx;
    u.uFocusScale.value = S.focusScale;
    u.uFocusZ.value = S.focusZ;
  }

  loadAtlas() {
    buildAtlas(this.cfg.images, this.cfg.cellMax, this.renderer.capabilities.getMaxAnisotropy()).then((atlas) => {
      if (this.disposed || !atlas) return atlas && atlas.texture.dispose();
      this.atlas = atlas;
      this.material.uniforms.uAtlas.value = atlas.texture;
      const cells = atlas.cells;
      for (let i = 0; i < MAX_PAGES; i++) {
        const c = cells[i % cells.length];
        this.rectAttr.setXYZW(i, ...c.rect);
        this.aspectAttr.setX(i, c.aspect);
      }
      this.rectAttr.needsUpdate = true;
      this.aspectAttr.needsUpdate = true;
      this.onReady && this.onReady();
    });
  }

  get focused() { return this.focus.index >= 0 && this.focus.target === 1; }
  unfocus() { this.focus.target = 0; }

  pick(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return -1;
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return -1;
    const scale = Math.min(1, PICK_MAX / Math.max(this.width, this.height));
    const tw = Math.max(1, Math.round(this.width * scale));
    const th = Math.max(1, Math.round(this.height * scale));
    if (this.pickTarget.width !== tw || this.pickTarget.height !== th) this.pickTarget.setSize(tw, th);
    const previous = this.mesh.material;
    this.mesh.material = this.pickMaterial;
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.pickTarget, Math.min(tw - 1, Math.floor(u * tw)), Math.min(th - 1, Math.floor((1 - v) * th)), 1, 1, this.pickBuffer);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 0);
    this.mesh.material = previous;
    const hit = this.pickBuffer[0] - 1;
    return hit >= 0 && hit < this.settings().pages ? hit : -1;
  }

  onTap(hit) {
    if (!this.settings().tapToView) return;
    if (this.focus.index >= 0) { this.focus.target = 0; return; }
    if (hit >= 0) { this.focus.index = hit; this.focus.target = 1; }
  }

  push(d) {
    if (!isFinite(d)) return;
    this.scroll.target += d;
    this.scroll.speed += d;
  }

  onWheel = (e) => {
    if (this.disposed || this.focus.index >= 0) return;
    const mul = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
    const dx = e.deltaX * mul, dy = e.deltaY * mul;
    // Embutido na página: a rolagem vertical continua sendo da página
    if (this.cfg.wheel === 'horizontal' && Math.abs(dx) <= Math.abs(dy)) return;
    e.preventDefault();
    const S = this.settings();
    this.push((Math.abs(dx) > Math.abs(dy) ? dx : dy) * S.worldPerPx * S.wheel);
  };
  onPointerDown = (e) => {
    if (this.disposed || e.button !== 0) return;
    this.tap = {
      x: e.clientX, y: e.clientY, at: performance.now(), id: e.pointerId,
      hit: this.focus.index < 0 && this.settings().tapToView ? this.pick(e.clientX, e.clientY) : -1,
    };
    this.container.setPointerCapture?.(e.pointerId);
    if (this.focus.index >= 0) return;
    this.drag = { active: true, lastX: e.clientX, id: e.pointerId };
  };
  onPointerMove = (e) => {
    if (!this.drag.active || e.pointerId !== this.drag.id) return;
    const delta = this.drag.lastX - e.clientX;
    this.drag.lastX = e.clientX;
    const S = this.settings();
    this.push(delta * 2 * S.worldPerPx * S.wheel);
  };
  onPointerUp = (e) => {
    if (e.pointerId === this.drag.id) this.drag = { active: false, lastX: 0, id: -1 };
    if (e.pointerId !== this.tap.id) return;
    this.container.releasePointerCapture?.(e.pointerId);
    this.tap.id = -1;
    const moved = Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y);
    if (moved <= TAP_SLOP && performance.now() - this.tap.at <= TAP_MS) this.onTap(this.tap.hit);
  };
  onPointerCancel = (e) => {
    if (e.pointerId === this.drag.id) this.drag = { active: false, lastX: 0, id: -1 };
    if (e.pointerId === this.tap.id) { this.container.releasePointerCapture?.(e.pointerId); this.tap.id = -1; }
  };

  setSize(w, h) {
    if (this.disposed) return;
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.settingsCache = null;
    this.applyConfig();
  }

  setActive(on) {
    if (this.disposed || on === this.active) return;
    this.active = on;
    if (on) {
      this.lastT = performance.now();
      const loop = () => {
        if (this.disposed || !this.active) return;
        this.frameId = requestAnimationFrame(loop);
        this.step();
      };
      this.frameId = requestAnimationFrame(loop);
    } else cancelAnimationFrame(this.frameId);
  }

  start() {
    const n = this.container;
    n.addEventListener('wheel', this.onWheel, { passive: false });
    n.addEventListener('pointerdown', this.onPointerDown);
    n.addEventListener('pointermove', this.onPointerMove);
    n.addEventListener('pointerup', this.onPointerUp);
    n.addEventListener('pointercancel', this.onPointerCancel);
    this.setActive(true);
  }

  step() {
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    const S = this.settings();
    const u = this.material.uniforms;

    if (this.focus.index >= 0) {
      const rate = dt / Math.max(0.05, S.viewDuration);
      this.focus.t = Math.min(1, Math.max(0, this.focus.t + (this.focus.target ? rate : -rate)));
      if (this.focus.t === 0 && this.focus.target === 0) this.focus.index = -1;
    }
    u.uFocusIndex.value = this.focus.index;
    u.uFocusProgress.value = power2InOut(this.focus.t);
    const cursor = this.focus.index >= 0 && this.focus.target === 1 ? 'zoom-out' : 'grab';
    if (this.container.style.cursor !== cursor) this.container.style.cursor = cursor;

    if (S.driftPerSecond !== 0 && this.focus.index < 0) this.push(S.driftPerSecond * dt);

    const k = dt * 60;
    this.scroll.current += (this.scroll.target - this.scroll.current) * (1 - Math.pow(1 - S.lerp, k));
    this.scroll.speed *= Math.pow(0.835, k);
    const period = S.pages * (S.pageSpacing + S.thickness);
    if (Math.abs(this.scroll.current) > period) {
      const wrap = Math.sign(this.scroll.current) * period;
      this.scroll.current -= wrap;
      this.scroll.target -= wrap;
    }
    u.uScrollY.value = this.scroll.current;
    u.uSpeedY.value = this.scroll.speed;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    const n = this.container;
    n.removeEventListener('wheel', this.onWheel);
    n.removeEventListener('pointerdown', this.onPointerDown);
    n.removeEventListener('pointermove', this.onPointerMove);
    n.removeEventListener('pointerup', this.onPointerUp);
    n.removeEventListener('pointercancel', this.onPointerCancel);
    this.geometry.dispose();
    this.material.dispose();
    this.pickMaterial.dispose();
    this.pickTarget.dispose();
    this.blank.dispose();
    this.atlas?.texture.dispose();
    this.mesh.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Cria a galeria imersiva em `container`. `images`: lista de URLs. */
export function createImmersive(container, { images, compact = false, drift = true, wheel = 'all' }) {
  const cfg = {
    images,
    pages: Math.min(MAX_PAGES, Math.max(4, images.length)),
    spacing: DEFAULTS.spacing, tilt: 0,
    wheel,
    // No celular as páginas giram um pouco em direção ao visitante, para as fotos ficarem legíveis
    turn: compact ? 34 : 0,
    pageWidth: compact ? 300 : 440,
    pageHeight: compact ? 400 : 580,
    scrollSens: DEFAULTS.scrollSens,
    view: { ...DEFAULTS.view },
    travel: { ...DEFAULTS.travel, drift: drift ? DEFAULTS.travel.drift : 0 },
    cellMax: compact ? 640 : 1024,
  };
  const scene = new MagazineScene(container, cfg);
  scene.setSize(container.clientWidth, container.clientHeight);
  const ro = new ResizeObserver(() => scene.setSize(container.clientWidth, container.clientHeight));
  ro.observe(container);
  scene.start();
  const vis = new IntersectionObserver(([en]) => scene.setActive(en.isIntersecting), { threshold: 0.05 });
  vis.observe(container);
  const dispose = scene.dispose.bind(scene);
  scene.dispose = () => { ro.disconnect(); vis.disconnect(); dispose(); };
  return scene;
}
