import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type FireworkStyle = "burst" | "ring" | "spray";

interface Firework {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  halo: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  haloMaterial: THREE.PointsMaterial;
  trail: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  trailMaterial: THREE.PointsMaterial;
  trailPositions: Float32Array;
  trailSegments: number;
  flash: THREE.Sprite;
  flashMaterial: THREE.SpriteMaterial;
  velocities: Float32Array;
  baseColors: Float32Array;
  baseColor: THREE.Color;
  dragFactors: Float32Array;
  sparkMask: Uint8Array;
  fizzleMask: Uint8Array;
  fizzleTriggered: Uint8Array;
  enableFizzle: boolean;
  trailPersistent: boolean;
  age: number;
  life: number;
  baseSize: number;
  flashBaseScale: number;
  trailBaseOpacity: number;
  trailSizeScale: number;
}

interface FireworkConfig {
  countRange: [number, number];
  radiusRange: [number, number];
  lifeRange: [number, number];
  sizeRange: [number, number];
  baseColor?: THREE.Color;
  enableFizzle: boolean;
  fizzleChance: number;
  sparkProbability: number;
  trailOpacity: number;
  trailSizeScale: number;
  applyCap: boolean;
  trailPersistent?: boolean;
}

const app = document.getElementById("app");
if (!app) {
  throw new Error("App container missing");
}

const canvas = document.createElement("canvas");
app.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(new THREE.Color(0x000000), 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const radialTexture = createRadialTexture();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 12);
scene.add(camera);

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const warmColor = new THREE.Color(1, 0.6, 0.25);
const tempVec3 = new THREE.Vector3();
const tempColor = new THREE.Color();

const fireworks: Firework[] = [];
const gravity = new THREE.Vector3(0, -6, 0);
const drag = 0.985;
const maxFireworks = 120;
const longTrailChance = 0.25;
let pointerDown = false;
let lastSpawnTime = 0;
const dragSpawnIntervalMs = 1000 / 60; // ~60 bursts per second while dragging

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.6,
  0.8,
  0.2
);
bloomPass.threshold = 0.05;
bloomPass.strength = 0.65;
bloomPass.radius = 0.5;
composer.addPass(renderPass);
composer.addPass(bloomPass);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}

window.addEventListener("resize", resize);
resize();

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pickStyle(): FireworkStyle {
  const r = Math.random();
  if (r < 0.4) return "burst";
  if (r < 0.7) return "ring";
  return "spray";
}

function randomColor(): THREE.Color {
  const hue = Math.random();
  const saturation = randomInRange(0.65, 0.9);
  const lightness = randomInRange(0.5, 0.65);
  const color = new THREE.Color();
  color.setHSL(hue, saturation, lightness);
  return color;
}

function createRadialTexture(): THREE.Texture {
  const size = 128;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = size;
  canvasEl.height = size;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create radial texture context");
  }

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.25)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.Texture(canvasEl);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeDirection(style: FireworkStyle): THREE.Vector3 {
  const v = new THREE.Vector3();
  if (style === "ring") {
    const theta = Math.random() * Math.PI * 2;
    v.set(Math.cos(theta), Math.sin(theta), randomInRange(-0.15, 0.15));
  } else if (style === "spray") {
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    v.set(Math.cos(theta) * r, Math.sin(theta) * r, Math.random() * 0.35);
    v.y += 0.8;
    v.normalize();
  } else {
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  }
  v.normalize();
  return v;
}

function spawnFirework(
  worldPosition: THREE.Vector3,
  opts?: Partial<FireworkConfig>
) {
  const style = pickStyle();
  const countRange = opts?.countRange ?? [60, 300];
  const radiusRange = opts?.radiusRange ?? [2.5, 20];
  const lifeRange = opts?.lifeRange ?? [1.5, 2.8];
  const sizeRange = opts?.sizeRange ?? [0.06, 0.14];
  const particleCount = Math.floor(randomInRange(countRange[0], countRange[1]));
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const baseColors = new Float32Array(particleCount * 3);
  const dragFactors = new Float32Array(particleCount);
  const sparkMask = new Uint8Array(particleCount);
  const fizzleMask = new Uint8Array(particleCount);
  const fizzleTriggered = new Uint8Array(particleCount);
  const baseColor = opts?.baseColor ? opts.baseColor.clone() : randomColor();
  const usePersistentTrail = opts?.trailPersistent ?? (Math.random() < longTrailChance);
  const trailSegments = usePersistentTrail ? 50 : 1;
  const trailPositions = new Float32Array(particleCount * trailSegments * 3);
  const radius = randomInRange(radiusRange[0], radiusRange[1]);
  const life = randomInRange(lifeRange[0], lifeRange[1]);
  const baseSize = randomInRange(sizeRange[0], sizeRange[1]);
  const flashBaseScale = radius * randomInRange(0.05, 0.12);
  const enableFizzle = opts?.enableFizzle ?? true;
  const fizzleChance = opts?.fizzleChance ?? 0.25;
  const sparkProbability = opts?.sparkProbability ?? 0.18;
  const trailBaseOpacity = opts?.trailOpacity ?? (usePersistentTrail ? 1 : 0.35);
  const trailSizeScale = opts?.trailSizeScale ?? (usePersistentTrail ? 0.9 : 0.5);
  const applyCap = opts?.applyCap ?? true;
  const burstWillFizzle = enableFizzle && Math.random() < fizzleChance;

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    positions[idx] = worldPosition.x;
    positions[idx + 1] = worldPosition.y + randomInRange(-0.05, 0.05);
    positions[idx + 2] = worldPosition.z + randomInRange(-0.25, 0.25);

    const dir = makeDirection(style);
    const isSpark = Math.random() < sparkProbability;
    sparkMask[i] = isSpark ? 1 : 0;
    fizzleMask[i] = burstWillFizzle ? 1 : 0;
    const speedScale = isSpark ? randomInRange(1.35, 1.9) : randomInRange(0.6, 1.2);
    const speed = radius * speedScale;
    dir.multiplyScalar(speed);
    velocities[idx] = dir.x;
    velocities[idx + 1] = dir.y;
    velocities[idx + 2] = dir.z;

    const tint = baseColor.clone().offsetHSL(randomInRange(-0.05, 0.05), 0, randomInRange(-0.08, 0.08));
    const brightnessBoost = isSpark ? 0.2 : 0;
    colors[idx] = Math.min(1, tint.r + brightnessBoost);
    colors[idx + 1] = Math.min(1, tint.g + brightnessBoost * 0.6);
    colors[idx + 2] = Math.min(1, tint.b + brightnessBoost * 0.3);

    baseColors[idx] = colors[idx];
    baseColors[idx + 1] = colors[idx + 1];
    baseColors[idx + 2] = colors[idx + 2];

    dragFactors[i] = randomInRange(0.97, 0.995);
    for (let s = 0; s < trailSegments; s++) {
      const tIdx = i * trailSegments * 3 + s * 3;
      trailPositions[tIdx] = positions[idx];
      trailPositions[tIdx + 1] = positions[idx + 1];
      trailPositions[tIdx + 2] = positions[idx + 2];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: baseSize,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1,
    map: radialTexture,
    alphaMap: radialTexture,
    alphaTest: 0.01
  });

  const haloMaterial = new THREE.PointsMaterial({
    size: baseSize * 2.2,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.55,
    map: radialTexture,
    alphaMap: radialTexture,
    alphaTest: 0.01
  });

  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  const trailColors = new Float32Array(trailPositions.length);
  for (let i = 0; i < particleCount; i++) {
    for (let s = 0; s < trailSegments; s++) {
      const colorIdx = i * trailSegments * 3 + s * 3;
      const fadeFactor = usePersistentTrail
        ? 1 - s / Math.max(1, trailSegments - 1)
        : 0.9;
      trailColors[colorIdx] = baseColors[i * 3] * fadeFactor;
      trailColors[colorIdx + 1] = baseColors[i * 3 + 1] * fadeFactor;
      trailColors[colorIdx + 2] = baseColors[i * 3 + 2] * fadeFactor;
    }
  }
  trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
  const trailMaterial = new THREE.PointsMaterial({
    size: baseSize * trailSizeScale,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: trailBaseOpacity,
    map: radialTexture,
    alphaMap: radialTexture,
    alphaTest: 0.01
  });

  const points = new THREE.Points(geometry, material);
  const halo = new THREE.Points(geometry, haloMaterial);
  const trail = new THREE.Points(trailGeometry, trailMaterial);
  points.frustumCulled = false;
  halo.frustumCulled = false;
  trail.frustumCulled = false;
  scene.add(trail);
  scene.add(halo);
  scene.add(points);

  const flashMaterial = new THREE.SpriteMaterial({
    map: radialTexture,
    color: baseColor.clone(),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.9
  });
  const flash = new THREE.Sprite(flashMaterial);
  flash.position.copy(worldPosition);
  flash.position.z += 0.05;
  flash.scale.setScalar(flashBaseScale);
  scene.add(flash);

  fireworks.push({
    points,
    halo,
    haloMaterial,
    trail,
    trailMaterial,
    trailPositions,
    trailSegments,
    flash,
    flashMaterial,
    velocities,
    baseColors,
    baseColor,
    dragFactors,
    sparkMask,
    fizzleMask,
    fizzleTriggered,
    enableFizzle,
    trailPersistent: usePersistentTrail,
    age: 0,
    life,
    baseSize,
    flashBaseScale,
    trailBaseOpacity,
    trailSizeScale
  });

  if (applyCap && fireworks.length > maxFireworks) {
    disposeFireworkAt(0);
  }
}

function updateFireworks(delta: number) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const fw = fireworks[i];
    const geometry = fw.points.geometry;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const positionsArray = positions.array as Float32Array;
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    const colorsArray = colors.array as Float32Array;
    const velocities = fw.velocities;
    const dragFactors = fw.dragFactors;
    const baseColors = fw.baseColors;
    const sparkMask = fw.sparkMask;
    const fizzleMask = fw.fizzleMask;
    const fizzleTriggered = fw.fizzleTriggered;
    const trailGeometry = fw.trail.geometry;
    const trailPositionsAttr = trailGeometry.getAttribute("position") as THREE.BufferAttribute;
    const trailPositionsArray = trailPositionsAttr.array as Float32Array;
    const trailSegments = fw.trailSegments;

    fw.age += delta;
    const lifeProgress = Math.min(1, fw.age / fw.life);
    const fade = 1 - lifeProgress;

    for (let p = 0; p < positions.count; p++) {
      const idx = p * 3;
      const baseTrailIdx = p * trailSegments * 3;
      for (let s = trailSegments - 1; s > 0; s--) {
        const curr = baseTrailIdx + s * 3;
        const prev = baseTrailIdx + (s - 1) * 3;
        trailPositionsArray[curr] = trailPositionsArray[prev];
        trailPositionsArray[curr + 1] = trailPositionsArray[prev + 1];
        trailPositionsArray[curr + 2] = trailPositionsArray[prev + 2];
      }
      trailPositionsArray[baseTrailIdx] = positionsArray[idx];
      trailPositionsArray[baseTrailIdx + 1] = positionsArray[idx + 1];
      trailPositionsArray[baseTrailIdx + 2] = positionsArray[idx + 2];

      const prevVy = velocities[idx + 1];
      const dragFactor = dragFactors[p];
      velocities[idx] *= drag * dragFactor;
      velocities[idx + 1] *= drag * dragFactor;
      velocities[idx + 2] *= drag * dragFactor;

      const isSpark = sparkMask[p] === 1;
      const jitter = isSpark ? 1.5 : 0.6;
      velocities[idx] += (Math.random() - 0.5) * jitter * delta;
      velocities[idx + 1] += (Math.random() - 0.5) * jitter * delta;
      velocities[idx + 2] += (Math.random() - 0.5) * jitter * delta;

      velocities[idx] += gravity.x * delta;
      velocities[idx + 1] += gravity.y * delta;
      velocities[idx + 2] += gravity.z * delta;

      positionsArray[idx] += velocities[idx] * delta;
      positionsArray[idx + 1] += velocities[idx + 1] * delta;
      positionsArray[idx + 2] += velocities[idx + 2] * delta;

      if (
        fw.enableFizzle &&
        fizzleMask[p] === 1 &&
        fizzleTriggered[p] === 0 &&
        prevVy > 0 &&
        velocities[idx + 1] <= 0
      ) {
        tempVec3.set(positionsArray[idx], positionsArray[idx + 1], positionsArray[idx + 2]);
        tempColor.setRGB(baseColors[idx], baseColors[idx + 1], baseColors[idx + 2]);
        spawnFirework(tempVec3, {
          countRange: [10, 22],
          radiusRange: [0.6, 1.4],
          lifeRange: [0.25, 0.55],
          sizeRange: [0.03, 0.06],
          baseColor: tempColor,
          enableFizzle: false,
          fizzleChance: 0,
          sparkProbability: 0.5,
          trailOpacity: 0.15,
          trailSizeScale: 0.3,
          applyCap: false
        });
        fizzleTriggered[p] = 1;
      }

      const warmMix = Math.min(1, lifeProgress * 1.1);
      colorsArray[idx] =
        THREE.MathUtils.lerp(baseColors[idx], warmColor.r, warmMix) * fade;
      colorsArray[idx + 1] =
        THREE.MathUtils.lerp(baseColors[idx + 1], warmColor.g, warmMix) * fade;
      colorsArray[idx + 2] =
        THREE.MathUtils.lerp(baseColors[idx + 2], warmColor.b, warmMix) * fade;
    }

    positions.needsUpdate = true;
    colors.needsUpdate = true;
    trailPositionsAttr.needsUpdate = true;
    const material = fw.points.material as THREE.PointsMaterial;
    material.opacity = Math.max(0, fade);
    material.size = fw.baseSize * (0.45 + 0.55 * fade);
    const haloMaterial = fw.haloMaterial;
    haloMaterial.opacity = material.opacity * 0.6;
    haloMaterial.size = material.size * 2.1;
    const trailMaterial = fw.trailMaterial;
    const trailFade = fw.trailPersistent ? 1 : Math.max(0, 1 - lifeProgress * 2);
    trailMaterial.opacity = fw.trailPersistent ? material.opacity : trailFade * fw.trailBaseOpacity;
    trailMaterial.size = fw.baseSize * fw.trailSizeScale * (fw.trailPersistent ? (0.9 + 0.1 * fade) : (0.7 + 0.3 * trailFade));
    const flashFade = Math.max(0, 1 - fw.age / 0.15);
    fw.flashMaterial.opacity = flashFade;
    fw.flashMaterial.color.copy(fw.baseColor);
    fw.flash.scale.setScalar(fw.flashBaseScale * (0.6 + 0.2 * flashFade));

    if (fw.age >= fw.life) {
      disposeFireworkAt(i);
    }
  }
}

function disposeFireworkAt(index: number) {
  const fw = fireworks[index];
  scene.remove(fw.points);
  scene.remove(fw.halo);
  scene.remove(fw.trail);
  scene.remove(fw.flash);
  fw.points.geometry.dispose();
  fw.points.material.dispose();
  fw.haloMaterial.dispose();
  fw.trail.geometry.dispose();
  fw.trailMaterial.dispose();
  fw.flashMaterial.dispose();
  fireworks.splice(index, 1);
}

function getWorldPositionFromPointer(event: PointerEvent): THREE.Vector3 | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const ndc = new THREE.Vector2(x, y);
  raycaster.setFromCamera(ndc, camera);
  const hitPoint = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
  return hit ? hitPoint : null;
}

function handlePointer(event: PointerEvent) {
  const worldPos = getWorldPositionFromPointer(event);
  if (!worldPos) return;
  spawnFirework(worldPos);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  lastSpawnTime = performance.now();
  handlePointer(event);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  const now = performance.now();
  if (now - lastSpawnTime >= dragSpawnIntervalMs) {
    lastSpawnTime = now;
    handlePointer(event);
  }
});

window.addEventListener("pointerup", () => {
  pointerDown = false;
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

const clock = new THREE.Clock();
function animate() {
  const delta = clock.getDelta();
  updateFireworks(delta);
  composer.render();
  requestAnimationFrame(animate);
}

animate();
