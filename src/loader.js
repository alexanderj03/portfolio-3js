// ---------------------------------------------------------------------------
// loader.js: loads public/models/scene.glb (Draco-ready), drives the loading
// screen, and builds a simple placeholder island if the file is missing.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { LANDMARKS, PLAZA_POSITION } from './scene.js';

// import.meta.env.BASE_URL is filled in by Vite ("/" in dev, "./" in the build).
const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/scene.glb`;

// ---------------------------------------------------------------------------
// Finding objects by name
// ---------------------------------------------------------------------------
// Blender may rename duplicates to "About.001". Three.js then strips the dot
// ("About001"), and may add "_1" to keep names unique. So "About", "About.001",
// "About001" and "About_1" all count as a match for "About", but "AboutSign" doesn't.
export function nameMatches(name, baseName) {
  if (!name || !name.startsWith(baseName)) return false;
  const rest = name.slice(baseName.length);
  return /^(\.?\d+)?(_\d+)?$/.test(rest);
}

// First object under `root` whose name matches `baseName` (or null).
export function findObject(root, baseName) {
  let found = null;
  root.traverse((obj) => {
    if (!found && nameMatches(obj.name, baseName)) found = obj;
  });
  return found;
}

// ---------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------
const loadingEl = document.getElementById('loading');
const barEl = document.getElementById('loading-bar');
const textEl = document.getElementById('loading-text');

// `fraction` is 0..1, or null when we don't know the file size yet.
function setProgress(fraction) {
  if (fraction == null) {
    loadingEl.classList.add('indeterminate');
    return;
  }
  loadingEl.classList.remove('indeterminate');
  const percent = Math.round(fraction * 100);
  barEl.style.width = `${percent}%`;
  textEl.textContent = `Loading island… ${percent}%`;
}

// Resolves once the loading screen has faded out and been removed, so other
// code can wait until the island is actually visible (e.g. the avatar's
// greeting wave in avatar.js).
let markLoadingGone;
export const loadingScreenGone = new Promise((resolve) => (markLoadingGone = resolve));

// Fades the loading screen out, then removes it from the page. Called by
// main.js once everything is set up (island, person and opening camera
// shot), so the first thing the visitor sees is the finished scene.
export function hideLoading() {
  barEl.style.width = '100%';
  loadingEl.classList.add('done');
  const remove = () => {
    loadingEl.remove();
    markLoadingGone();
  };
  // Only the screen's own fade counts: the progress bar's width transition
  // also fires "transitionend", and that bubbles up to here too.
  loadingEl.addEventListener('transitionend', (e) => {
    if (e.target === loadingEl) remove();
  });
  setTimeout(remove, 1500); // fallback if no transition fires
}

// ---------------------------------------------------------------------------
// Main entry: load the island (or a placeholder) and add it to the scene.
// Resolves to { root, isPlaceholder }.
// ---------------------------------------------------------------------------
export async function loadIsland(scene) {
  let root;
  let isPlaceholder = false;

  try {
    // Check first that the file exists. (Vite's dev server answers missing
    // files with index.html instead of a 404, so we also check the type.)
    const head = await fetch(MODEL_URL, { method: 'HEAD' });
    const type = head.headers.get('content-type') || '';
    if (!head.ok || type.includes('text/html')) {
      throw new MissingModelError();
    }

    const gltf = await createGLTFLoader().loadAsync(MODEL_URL, (event) => {
      setProgress(event.lengthComputable && event.total ? event.loaded / event.total : null);
    });
    root = gltf.scene;
  } catch (error) {
    if (!(error instanceof MissingModelError)) {
      console.error('Could not load scene.glb:', error);
    }
    root = createPlaceholderIsland();
    isPlaceholder = true;
    showMissingModelNotice(error instanceof MissingModelError ? null : error);
  }

  // Every mesh casts and receives shadows. (We only touch shadow flags here,
  // the materials from Blender are left exactly as they are.)
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  scene.add(root);
  return { root, isPlaceholder };
}

// Also used by avatar.js, so both models load the same way.
export function createGLTFLoader() {
  // DRACOLoader decompresses Draco-compressed meshes. It's harmless when the
  // file isn't compressed, so you can turn compression on later in Blender
  // (Export glTF > Data > Compression) without changing any code.
  // DRACO_GLTF_CONFIG points at the decoder in three/examples/jsm/libs/draco/gltf/;
  // Vite bundles those files automatically, so there's nothing to copy.
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_GLTF_CONFIG);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}

class MissingModelError extends Error {
  constructor() {
    super('scene.glb not found');
  }
}

// Shows the friendly "add your model" banner.
function showMissingModelNotice(error) {
  const notice = document.getElementById('model-notice');
  if (!notice) return;
  notice.hidden = false;
  if (error) {
    notice.querySelector('.detail').textContent =
      `The file was found but could not be loaded (${error.message}). Check the browser console.`;
  }
}

// ---------------------------------------------------------------------------
// Placeholder island
// ---------------------------------------------------------------------------
// A rough stand-in so the site can be tested before the real model exists.
// Objects use the same names as the real model, so hover, click, the fly-to
// camera and the animations all work on it too.
function createPlaceholderIsland() {
  const group = new THREE.Group();
  group.name = 'PlaceholderIsland';

  // flatShading gives the faceted low-poly look.
  const mat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });

  // Grass top: a disc about 40 m across, squashed in Z to ~35 m.
  const top = new THREE.Mesh(new THREE.CylinderGeometry(20, 19, 0.8, 14), mat('#7cc26a'));
  top.name = 'Island_Top'; // same name as the real ground, so the person can walk on it
  top.scale.z = 35 / 40;
  group.add(top);

  // Rocky underside tapering to a point near y = -22.5.
  const rock = new THREE.Mesh(new THREE.ConeGeometry(19, 22.5, 10, 3), mat('#9a8478'));
  rock.rotation.x = Math.PI; // point downwards
  rock.scale.z = 35 / 40;
  rock.position.y = -0.4 - 22.5 / 2;
  group.add(rock);

  // One simple block per building, at the real positions.
  const colors = { about: '#c98b5b', projects: '#cfe6ef', contact: '#e8d8c3' };
  for (const [key, mark] of Object.entries(LANDMARKS)) {
    const building = new THREE.Group();
    building.name = mark.object;
    building.position.fromArray(mark.position);
    building.rotation.y = THREE.MathUtils.degToRad(mark.rotationY);
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 5), mat(colors[key]));
    box.position.y = 2.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 3, 4), mat('#8a5a8c'));
    roof.position.y = 6.5;
    roof.rotation.y = Math.PI / 4;
    building.add(box, roof);
    group.add(building);
  }

  // Coffee cup on the café roof, and the post box beside it.
  const contact = group.getObjectByName('Contact');
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.4, 8), mat('#ffffff'));
  cup.name = 'CafeCup';
  cup.position.set(0, 8.8, 0);
  contact.add(cup);
  const postBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), mat('#d63a32'));
  postBox.name = 'PostBox';
  postBox.position.set(4.5, 0.7, 2);
  contact.add(postBox);

  // Signpost in the plaza, with one arrow per building.
  const post = new THREE.Group();
  post.position.fromArray(PLAZA_POSITION);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), mat('#6b4a33'));
  pole.position.y = 1.5;
  post.add(pole);
  [['About', 2.6, 160], ['Projects', 2.1, 90], ['Contact', 1.6, 20]].forEach(([name, y, angle]) => {
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.08), mat('#f4e3c1'));
    arrow.name = `Signpost_${name}`;
    arrow.geometry.translate(0.8, 0, 0); // pivot at the pole
    arrow.position.y = y;
    arrow.rotation.y = THREE.MathUtils.degToRad(angle);
    post.add(arrow);
  });
  group.add(post);

  // Waterfall ribbon off the front-left edge.
  const waterfall = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 14),
    new THREE.MeshStandardMaterial({ color: '#9fd8f0', transparent: true, opacity: 0.85 }),
  );
  waterfall.name = 'Island_Waterfall';
  waterfall.position.set(-11, -6.5, 13.2);
  waterfall.rotation.y = THREE.MathUtils.degToRad(-35);
  group.add(waterfall);

  return group;
}
