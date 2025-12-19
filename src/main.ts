import "./style.css";
import * as THREE from "three";

type FireworkStyle = "burst" | "ring" | "spray";

interface Firework {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  velocities: Float32Array;
  age: number;
  life: number;
  baseSize: number;
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

const fireworks: Firework[] = [];
const gravity = new THREE.Vector3(0, -6, 0);
const drag = 0.985;
const maxFireworks = 60;
let pointerDown = false;
let lastSpawnTime = 0;
const dragSpawnIntervalMs = 60;

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
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

function spawnFirework(worldPosition: THREE.Vector3) {
  const style = pickStyle();
  const particleCount = Math.floor(randomInRange(60, 140));
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const baseColor = randomColor();
  const radius = randomInRange(2.5, 4.6);
  const life = randomInRange(1.5, 2.8);
  const baseSize = randomInRange(0.06, 0.14);

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    positions[idx] = worldPosition.x;
    positions[idx + 1] = worldPosition.y;
    positions[idx + 2] = worldPosition.z;

    const dir = makeDirection(style);
    const speed = radius * randomInRange(0.6, 1.2);
    dir.multiplyScalar(speed);
    velocities[idx] = dir.x;
    velocities[idx + 1] = dir.y;
    velocities[idx + 2] = dir.z;

    const tint = baseColor.clone().offsetHSL(randomInRange(-0.05, 0.05), 0, randomInRange(-0.08, 0.08));
    colors[idx] = tint.r;
    colors[idx + 1] = tint.g;
    colors[idx + 2] = tint.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: baseSize,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  fireworks.push({
    points,
    velocities,
    age: 0,
    life,
    baseSize
  });

  if (fireworks.length > maxFireworks) {
    disposeFireworkAt(0);
  }
}

function updateFireworks(delta: number) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const fw = fireworks[i];
    const geometry = fw.points.geometry;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const positionsArray = positions.array as Float32Array;
    const velocities = fw.velocities;

    fw.age += delta;
    const lifeProgress = Math.min(1, fw.age / fw.life);

    for (let p = 0; p < positions.count; p++) {
      const idx = p * 3;
      velocities[idx] *= drag;
      velocities[idx + 1] *= drag;
      velocities[idx + 2] *= drag;

      velocities[idx] += gravity.x * delta;
      velocities[idx + 1] += gravity.y * delta;
      velocities[idx + 2] += gravity.z * delta;

      positionsArray[idx] += velocities[idx] * delta;
      positionsArray[idx + 1] += velocities[idx + 1] * delta;
      positionsArray[idx + 2] += velocities[idx + 2] * delta;
    }

    positions.needsUpdate = true;
    const fade = 1 - lifeProgress;
    const material = fw.points.material as THREE.PointsMaterial;
    material.opacity = Math.max(0, fade);
    material.size = fw.baseSize * (0.5 + 0.5 * fade);

    if (fw.age >= fw.life) {
      disposeFireworkAt(i);
    }
  }
}

function disposeFireworkAt(index: number) {
  const fw = fireworks[index];
  scene.remove(fw.points);
  fw.points.geometry.dispose();
  fw.points.material.dispose();
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
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
