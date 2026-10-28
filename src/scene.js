// ---------------------------------------------------------------------------
// scene.js: the basic "stage": renderer, scene, camera, lights, orbit controls
// and window-resize handling. Nothing here knows about the island model.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Colours and numbers you might want to tweak, all in one place.
// (The sky behind the island is in sky.js.)

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
// At this aspect and wider (desktop, landscape tablets) the hero shot above is
// used exactly as it is.
const HERO_MIN_ASPECT = 1.3;
const HERO_MAX_PULLBACK = 2.4; // never back off more than 2.4x the normal distance

// Phone framing. Fitting the whole island across a portrait screen makes it
// tiny, so phones fit just the buildings instead (the island's rocky tips get
// cut off at the sides) and look down more steeply, which makes the island
// taller on screen and fills the empty sky. Screens between HERO_MIN_ASPECT
// and PHONE_ASPECT blend smoothly between the two framings.
const PHONE_ASPECT = 0.6; // this narrow or narrower = full phone framing
const PHONE_FIT_WIDTH = 36; // metres across the screen (the buildings span ~33 m)
const PHONE_ELEVATION = 29; // degrees above the horizon (the hero shot is ~24°)
// Slides the island up the screen, as a fraction of the screen height, to
// clear the tab bar along the bottom. 0 = centred.
const PHONE_LIFT = 0;

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
  // No background colour: sky.js puts a gradient sky around everything.
  const scene = new THREE.Scene();

  // --- Camera -------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(
    HERO_FOV,
    window.innerWidth / window.innerHeight,
    0.1, // near clipping plane (metres)
    500, // far clipping plane (metres)
  );
  const heroView = getHeroView(camera.aspect);
  camera.position.copy(heroView.position);
  camera.lookAt(heroView.target);

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
  controls.target.copy(heroView.target);
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
  let lastHero = heroView;
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    // On the overview (controls enabled), keep the island fitting the new
    // screen shape, e.g. when a phone is rotated. Sitting on the hero shot:
    // jump to the hero shot for the new shape. Looking around somewhere else:
    // just move in or out by the same amount the hero shot did.
    const hero = getHeroView(camera.aspect);
    if (controls.enabled) {
      const onHeroShot =
        camera.position.distanceTo(lastHero.position) < 0.01 && controls.target.distanceTo(lastHero.target) < 0.01;
      if (onHeroShot) {
        camera.position.copy(hero.position);
        controls.target.copy(hero.target);
      } else {
        const scale = hero.position.distanceTo(hero.target) / lastHero.position.distanceTo(lastHero.target);
        camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);
      }
    }
    lastHero = hero;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Make sure the user can still zoom out far enough to see the whole island.
    controls.maxDistance = Math.max(90, hero.position.distanceTo(hero.target) + 5);
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

// The hero camera ({ position, target }) for a screen of this shape
// (width / height). Landscape screens get the hero shot unchanged; narrower
// ones are pulled back to fit, and phones get the closer, steeper framing.
export function getHeroView(aspect) {
  // 0 = landscape framing, 1 = full phone framing.
  const phone = THREE.MathUtils.clamp((HERO_MIN_ASPECT - aspect) / (HERO_MIN_ASPECT - PHONE_ASPECT), 0, 1);

  // The hero shot's direction, split into a compass heading and an elevation.
  const heroOffset = HERO_POSITION.clone().sub(HERO_TARGET);
  const heroDistance = heroOffset.length();
  const heading = Math.atan2(heroOffset.x, heroOffset.z);
  const heroElevation = Math.asin(heroOffset.y / heroDistance);
  const elevation = THREE.MathUtils.lerp(heroElevation, THREE.MathUtils.degToRad(PHONE_ELEVATION), phone);

  // Distance at which `fitWidth` metres just fit across the screen. At
  // HERO_MIN_ASPECT the hero shot shows `heroWidth` metres, so keeping that
  // width on narrower screens matches the old "back off to fit" behaviour,
  // and phones shrink it to PHONE_FIT_WIDTH to zoom in.
  const tanV = Math.tan(THREE.MathUtils.degToRad(HERO_FOV / 2));
  const heroWidth = 2 * heroDistance * tanV * HERO_MIN_ASPECT;
  const fitWidth = THREE.MathUtils.lerp(heroWidth, PHONE_FIT_WIDTH, phone);
  const distance = THREE.MathUtils.clamp(fitWidth / 2 / (tanV * aspect), heroDistance, heroDistance * HERO_MAX_PULLBACK);

  const direction = new THREE.Vector3(
    Math.sin(heading) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(heading) * Math.cos(elevation),
  );

  // Lift: look a little lower, so the island sits higher on the screen.
  const forward = direction.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  const target = HERO_TARGET.clone().addScaledVector(up, -PHONE_LIFT * phone * 2 * distance * tanV);

  return { position: target.clone().addScaledVector(direction, distance), target };
}
