// ---------------------------------------------------------------------------
// scene.js: the basic "stage": renderer, scene, camera, lights, orbit controls
// and window-resize handling. Nothing here knows about the island model.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Colours and numbers you might want to tweak, all in one place.
export const SKY_COLOR = '#bfe3f5';

// The "hero" shot: where the camera starts and returns to.
// Where the buildings are on the island (world positions, from Blender).
// `rotationY` is in degrees; buildings face +Z before rotation.
// Used for camera framing and for the placeholder island.
// `view: 'front'` = when opened, look at the building straight on (front wall
// parallel to the screen) instead of from above at an angle.
// `hideWhileFocused` = objects standing between the camera and the building in
// that view; they're hidden while you look at it and come back afterwards.
export const LANDMARKS = {
  about: { object: 'About', position: [-12.4, 0.34, -2.6], rotationY: 12, view: 'front' },
  projects: {
    object: 'Projects',
    position: [0.8, 0.39, -9.9],
    rotationY: 3,
    view: 'front',
    hideWhileFocused: ['Signpost', 'Sign_Welcome'],
  },
  contact: {
    object: 'Contact',
    position: [13.1, 0.49, -3.9],
    rotationY: -27,
    view: 'front',
    hideWhileFocused: ['Sign_Welcome'], // blocks the café on narrow (phone) screens
  },
};
export const PLAZA_POSITION = [0.5, 0.4, 2.0]; // central hub with the signpost

export const HERO_POSITION = new THREE.Vector3(2.5, 21.9, 57.5);
export const HERO_TARGET = new THREE.Vector3(0.25, -4.5, -1.25);
const HERO_FOV = 34; // vertical field of view, in degrees

// The hero shot was framed for a landscape screen. On a narrow (portrait)
// screen the island would be cut off at the sides, so we back the camera off.
// Below this aspect ratio (width / height) the camera starts moving back.
const HERO_MIN_ASPECT = 1.3;
const HERO_MAX_PULLBACK = 2.4; // never back off more than 2.4x the normal distance

// Light strengths. Three.js uses physically based light units, so these
// numbers look "big", but they are roughly what matches Blender's Standard view.
const HEMI_INTENSITY = 1.3;
const SUN_INTENSITY = 2.4;

export function createStage(container) {
  // --- Renderer -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // Retina screens can have a pixel ratio of 3+; capping at 2 keeps it fast.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // These two settings make the colours match Blender's "Standard" view transform.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // Shadows. PCFShadowMap gives slightly soft edges.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  // --- Scene --------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);

  // --- Camera -------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(
    HERO_FOV,
    window.innerWidth / window.innerHeight,
    0.1, // near clipping plane (metres)
    500, // far clipping plane (metres)
  );
  camera.position.copy(getHeroPosition(camera.aspect));
  camera.lookAt(HERO_TARGET);

  // --- Lights -------------------------------------------------------------
  // Hemisphere light: soft light from everywhere. White from the sky,
  // green-tinted bounce light from below (as if reflected off grass).
  const hemi = new THREE.HemisphereLight('#ffffff', '#8fc46a', HEMI_INTENSITY);
  scene.add(hemi);

  // Directional light = the sun. Its rays are parallel, coming from
  // `position` toward `target` (upper right-front, toward the island centre).
  const sun = new THREE.DirectionalLight('#fff3dc', SUN_INTENSITY);
  sun.position.set(30, 45, 35);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  // Shadows from the sun. A directional light renders shadows with an
  // orthographic "shadow camera": a box that must contain the whole island.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); // shadow texture resolution
  const s = 32; // half-size of the shadow box (island + trees is ~44 x 38 m)
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  // Small offsets that stop "shadow acne" (stripy self-shadowing) on flat faces.
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;

  // --- Orbit controls -----------------------------------------------------
  // The overview camera starts locked: dragging and zooming are switched off,
  // so clicks on the island are free for walking the person around. The
  // "Look around" button (freecam.js) switches them on and off again.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.target.copy(HERO_TARGET);
  controls.enableDamping = true; // smooth "coasting" after you let go
  controls.dampingFactor = 0.08;
  controls.enablePan = false; // no sliding sideways
  controls.minDistance = 25;
  controls.maxDistance = 90;
  // Polar angle = angle down from straight above. 0 = top view, 90° = side view.
  // Stopping a bit before 90° keeps the camera from going under the island.
  controls.minPolarAngle = THREE.MathUtils.degToRad(10);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);

  // --- Resize handling ----------------------------------------------------
  // Callbacks other modules can register to hear about resizes.
  const resizeListeners = [];
  let pullback = getPullback(camera.aspect);
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    // On the overview (controls enabled), move the camera in or out to keep
    // the island fitting the new screen shape, e.g. when a phone is rotated.
    const newPullback = getPullback(camera.aspect);
    if (controls.enabled) {
      camera.position.sub(controls.target).multiplyScalar(newPullback / pullback).add(controls.target);
    }
    pullback = newPullback;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Make sure the user can still zoom out far enough to see the whole island.
    controls.maxDistance = Math.max(90, getHeroPosition(camera.aspect).distanceTo(HERO_TARGET) + 5);
    resizeListeners.forEach((fn) => fn());
  }
  window.addEventListener('resize', onResize);
  onResize();
  // Only now, after onResize() has set maxDistance for this screen shape, so
  // the camera isn't pulled in too close on a phone.
  controls.update();

  return {
    renderer,
    scene,
    camera,
    controls,
    hemi,
    sun,
    onResize: (fn) => resizeListeners.push(fn),
  };
}

// Returns the hero camera position, pulled back along the same viewing
// direction on narrow screens so the whole island still fits.
export function getHeroPosition(aspect) {
  return HERO_POSITION.clone().sub(HERO_TARGET).multiplyScalar(getPullback(aspect)).add(HERO_TARGET);
}

// How much further back than normal the camera sits for this screen shape (1 = normal).
function getPullback(aspect) {
  return THREE.MathUtils.clamp(HERO_MIN_ASPECT / aspect, 1, HERO_MAX_PULLBACK);
}
