import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ── Demo configurations ──
const DEMOS = [
  {
    name: "tokamak",
    coilIds: ["1","2","3","4","5","6","7","8"],
    dark: "demos/weblayers",
    light: "demos/weblayers-light",
  },
  {
    name: "solenoid",
    coilIds: ["1","2","3","4","5"],
    dark: "demos/weblayers-solenoid-dark",
    light: "demos/weblayers-solenoid-light",
  },
  {
    name: "wonky",
    coilIds: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20"],
    dark: "demos/weblayers-wonky-dark",
    light: "demos/weblayers-wonky-light",
  },
];

const demo = DEMOS[Math.floor(Math.random() * DEMOS.length)];

function isDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function baseDir() {
  return isDark() ? demo.dark : demo.light;
}

const container = document.getElementById("viewer3d");
if (!container) throw new Error("[viewer] #viewer3d not found");
const placeholder = container.querySelector(".viewer-placeholder");

// ── Renderer ──
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace || "srgb";
container.appendChild(renderer.domElement);

function applyThemeBg() {
  renderer.setClearColor(isDark() ? 0x0a0c14 : 0xf3f0e4, 1);
}
applyThemeBg();

// ── Scene + camera ──
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 2, 0.001, 100);

// ── Lighting ──
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const d1 = new THREE.DirectionalLight(0xffffff, 0.9);
d1.position.set(2, 3, 4);
scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffffff, 0.3);
d2.position.set(-2, -1, -2);
scene.add(d2);

// ── Controls ──
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 0.01;
controls.maxDistance = 50;

// ── Layer groups ──
const LAYER_KEYS = ["coils", "fieldlines", "baxis"];
const layerGroups = {};
for (const key of LAYER_KEYS) {
  layerGroups[key] = new THREE.Group();
  scene.add(layerGroups[key]);
}

const layerVisible = { coils: true, fieldlines: true, baxis: true };

// ── Coil color override ──
function colorizeCoils() {
  const gray = isDark() ? new THREE.Color(0.72, 0.72, 0.72) : new THREE.Color(0.55, 0.55, 0.55);
  layerGroups.coils.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.map = null;
      child.material.color.copy(gray);
      child.material.needsUpdate = true;
    }
  });
}

// ── Loader ──
const loader = new GLTFLoader();

function loadFile(url, groupKey) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => { layerGroups[groupKey].add(gltf.scene); resolve(); },
      undefined,
      () => { resolve(); }
    );
  });
}

function fileExists(url) {
  return fetch(url, { method: "HEAD" }).then(r => r.ok).catch(() => false);
}

function clearGroup(key) {
  const group = layerGroups[key];
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      }
    });
  }
}

function fitCamera() {
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));

  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.9);
  camera.near = maxDim * 0.001;
  camera.far = maxDim * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function syncButtons() {
  document.querySelectorAll(".layer-btn").forEach((btn) => {
    const key = btn.dataset.layer;
    btn.classList.toggle("active", layerVisible[key]);
    if (layerGroups[key]) layerGroups[key].visible = layerVisible[key];
  });
}

// ── Load scene ──
let firstLoad = true;

async function loadScene() {
  const base = baseDir();
  const ids = demo.coilIds;

  for (const key of LAYER_KEYS) clearGroup(key);

  // Phase 1: coils + b_axis
  const fastPromises = [
    ...ids.flatMap(id => [
      loadFile(`${base}/coil_coil_${id}_tube.gltf`, "coils"),
      loadFile(`${base}/coil_coil_${id}_wire.gltf`, "coils"),
    ]),
    ...ids.map(id => loadFile(`${base}/coil_${id}_b_axis.gltf`, "baxis")),
  ];
  await Promise.all(fastPromises);

  if (placeholder) placeholder.style.display = "none";
  colorizeCoils();
  if (firstLoad) { fitCamera(); firstLoad = false; }
  syncButtons();

  // Phase 2: field lines — global if available, otherwise per-coil
  const hasGlobal = await fileExists(`${base}/global_field_lines.gltf`);
  if (hasGlobal) {
    await loadFile(`${base}/global_field_lines.gltf`, "fieldlines");
  } else {
    await Promise.all(
      ids.map(id => loadFile(`${base}/coil_${id}_field_lines.gltf`, "fieldlines"))
    );
  }
  syncButtons();
}

loadScene();

// ── Theme switch: reload from correct directory ──
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  applyThemeBg();
  loadScene();
});

// ── Button toggles ──
document.querySelectorAll(".layer-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.layer;
    layerVisible[key] = !layerVisible[key];
    btn.classList.toggle("active", layerVisible[key]);
    if (layerGroups[key]) layerGroups[key].visible = layerVisible[key];
  });
});

// ── Resize ──
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(container);
resize();

// ── Render loop ──
(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();
