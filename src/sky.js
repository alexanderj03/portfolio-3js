// ---------------------------------------------------------------------------
// sky.js: everything behind the island.
//
//  - A gradient sky: a huge sphere around the scene, painted by a small
//    shader. Pale near the horizon, deeper blue straight up and straight
//    down. From the hero shot you're looking down at the island, so most of
//    what you see is the "below the horizon" half: pale at the top of the
//    screen, bluer toward the bottom.
//  - Low-poly clouds drifting slowly around and below the island, so it
//    reads as floating high up in the air. They're lit by the scene's own
//    sun and hemisphere lights, so they dim to moonlit blue at night by
//    themselves.
//  - Stars that fade in at night and twinkle gently.
//
// None of this is part of the island model, and none of it is clickable:
// interaction.js only raycasts the island (and the person), and the walker
// only collides with the island.
//
// night.js calls setNight(amount) while it fades between day and night.
// main.js calls update(time) every frame (not with reduced motion: then the
// clouds stand still and the stars don't twinkle).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Sky colours: `top` = straight up, `horizon` = level with your eyes,
// `bottom` = straight down. The sky owns both its day and night colours
// (night.js only says how far between them to be).
const SKY_DAY = { top: '#7cbde6', horizon: '#eaf6fa', bottom: '#86c6ea' };
const SKY_NIGHT = { top: '#070d22', horizon: '#2b3c69', bottom: '#0c1632' };
// How quickly the colour moves away from the horizon colour. Smaller = the
// pale horizon band is thinner and the deep colour takes over sooner.
const SKY_SPREAD_UP = 0.5;
const SKY_SPREAD_DOWN = 0.6;
// Radius of the sky sphere (metres). It has to stay inside the camera's far
// plane (500 m, scene.js) even when the camera is pulled right back
// (~155 m from the centre on a phone): 250 + 155 < 500.
const SKY_RADIUS = 250;

// Clouds. They sit in a ring around the island, all below it, so they never
// get between the camera and the island. Positions come from a fixed random
// "seed", so the sky looks the same on every visit; change CLOUD_SEED for a
// different arrangement.
const CLOUD_SEED = 7;
const CLOUD_COUNT = 18;
const CLOUD_RING_INNER = 34; // metres from the island centre (the island is ~22 m across from centre)
const CLOUD_RING_OUTER = 95;
const CLOUD_HEIGHT_HIGH = -12; // metres; the island's top is at ~0, its rocky bottom at ~-22
const CLOUD_HEIGHT_LOW = -40;
const CLOUD_SIZE_MIN = 3; // rough radius of a cloud's middle puff (metres)
const CLOUD_SIZE_MAX = 6;
const CLOUD_COLOR = '#ffffff';
// White clouds catch so much moonlight they'd outshine the island, so
// they're greyed down at night.
const CLOUD_COLOR_NIGHT = '#7f8db0';
// A little light of their own, so the undersides (which only get the green
// "grass bounce" from the hemisphere light) stay cloud-coloured, not grey-green.
// Much less at night, or they'd shine in the dark.
const CLOUD_GLOW = '#9aa8ba';
const CLOUD_GLOW_NIGHT = '#05070d';
// A cloud the waterfall pours into, just under where it ends
// (Island_Waterfall in the model ends at about x -10, y -25, z 19).
const WATERFALL_CLOUD = { position: [-10.2, -27.5, 19], size: 4.5 };
const CLOUD_DRIFT_SPEED = 0.004; // radians per second the ring turns (a full lap takes ~26 minutes)
const CLOUD_BOB_HEIGHT = 0.5; // metres each cloud rises and falls
const CLOUD_BOB_SPEED = 0.25; // radians per second

// Stars, scattered over a sphere just inside the sky. All the way round,
// not just overhead: from the hero shot you mostly see the sky below the
// horizon, and the island is floating in the sky anyway.
const STAR_COUNT = 1400;
const STAR_RADIUS = 230;
const STAR_SIZE_MIN = 1.5; // pixels (before the screen's pixel ratio)
const STAR_SIZE_MAX = 4;
const STAR_TWINKLE_SPEED = 1.4;

export function createSky({ scene, renderer, onResize }) {
  const random = seededRandom(CLOUD_SEED);

  // --- Gradient sky -------------------------------------------------------
  const skyColors = {
    uTop: { value: new THREE.Color(SKY_DAY.top) },
    uHorizon: { value: new THREE.Color(SKY_DAY.horizon) },
    uBottom: { value: new THREE.Color(SKY_DAY.bottom) },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyColors,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide, // we're inside the sphere, looking at its inner faces
      depthWrite: false, // never hides anything...
    }),
  );
  dome.renderOrder = -1; // ...and is drawn first, so everything else draws over it
  dome.name = 'Sky';
  scene.add(dome);

  // --- Clouds -------------------------------------------------------------
  const cloudMaterial = new THREE.MeshLambertMaterial({
    color: CLOUD_COLOR,
    emissive: CLOUD_GLOW,
    flatShading: true, // faceted, to match the low-poly island
  });
  // The ring turns as a whole; each cloud also bobs on its own.
  const ring = new THREE.Group();
  ring.name = 'Clouds';
  scene.add(ring);
  const clouds = [];

  function addCloud(parent, position, size) {
    const cloud = new THREE.Mesh(makeCloudGeometry(size, random), cloudMaterial);
    cloud.position.copy(position);
    cloud.rotation.y = random() * Math.PI * 2;
    parent.add(cloud);
    clouds.push({ cloud, baseY: position.y, phase: random() * Math.PI * 2 });
  }

  for (let i = 0; i < CLOUD_COUNT; i++) {
    // Spread evenly around the circle, with some wobble, so there are no
    // big gaps or clumps.
    const angle = ((i + random() * 0.7) / CLOUD_COUNT) * Math.PI * 2;
    const distance = THREE.MathUtils.lerp(CLOUD_RING_INNER, CLOUD_RING_OUTER, random());
    const height = THREE.MathUtils.lerp(CLOUD_HEIGHT_HIGH, CLOUD_HEIGHT_LOW, random());
    // Farther clouds are a bit bigger, so they still show up.
    const size = THREE.MathUtils.lerp(CLOUD_SIZE_MIN, CLOUD_SIZE_MAX, random()) * (0.7 + (0.6 * distance) / CLOUD_RING_OUTER);
    addCloud(ring, new THREE.Vector3(Math.sin(angle) * distance, height, Math.cos(angle) * distance), size);
  }
  // The waterfall cloud isn't in the ring: it has to stay under the waterfall.
  addCloud(scene, new THREE.Vector3(...WATERFALL_CLOUD.position), WATERFALL_CLOUD.size);

  // --- Stars --------------------------------------------------------------
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starSizes = new Float32Array(STAR_COUNT);
  const starPhases = new Float32Array(STAR_COUNT);
  const direction = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    // A random direction, evenly spread over the sphere: pick random points
    // in a cube until one lands inside the ball, then push it out to the
    // sphere's surface. (Using the cube's points directly would bunch the
    // stars up toward the cube's corners.)
    do {
      direction.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    } while (direction.lengthSq() > 1 || direction.lengthSq() < 0.01);
    direction.setLength(STAR_RADIUS).toArray(starPositions, i * 3);
    // Mostly small stars and a few bright ones.
    starSizes[i] = THREE.MathUtils.lerp(STAR_SIZE_MIN, STAR_SIZE_MAX, random() ** 3);
    starPhases[i] = random() * Math.PI * 2;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
  const starUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };
  const stars = new THREE.Points(
    starGeometry,
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );
  stars.name = 'Stars';
  stars.visible = false; // daytime
  scene.add(stars);
  onResize(() => (starUniforms.uPixelRatio.value = renderer.getPixelRatio()));

  // --- Day / night --------------------------------------------------------
  const day = { ...mapColors(SKY_DAY), cloud: new THREE.Color(CLOUD_COLOR), glow: new THREE.Color(CLOUD_GLOW) };
  const night = {
    ...mapColors(SKY_NIGHT),
    cloud: new THREE.Color(CLOUD_COLOR_NIGHT),
    glow: new THREE.Color(CLOUD_GLOW_NIGHT),
  };
  // 0 = day, 1 = night (night.js has already eased it).
  function setNight(amount) {
    skyColors.uTop.value.lerpColors(day.top, night.top, amount);
    skyColors.uHorizon.value.lerpColors(day.horizon, night.horizon, amount);
    skyColors.uBottom.value.lerpColors(day.bottom, night.bottom, amount);
    cloudMaterial.color.lerpColors(day.cloud, night.cloud, amount);
    cloudMaterial.emissive.lerpColors(day.glow, night.glow, amount);
    // Stars only start to show in the second half of the fade, once the
    // sky is dark enough for them.
    starUniforms.uOpacity.value = THREE.MathUtils.smoothstep(amount, 0.4, 1);
    stars.visible = amount > 0.4;
  }

  // --- Every frame ----------------------------------------------------------
  function update(time) {
    ring.rotation.y = time * CLOUD_DRIFT_SPEED;
    for (const { cloud, baseY, phase } of clouds) {
      cloud.position.y = baseY + Math.sin(time * CLOUD_BOB_SPEED + phase) * CLOUD_BOB_HEIGHT;
    }
    starUniforms.uTime.value = time;
  }

  return { update, setNight };
}

// One cloud: a row of squashed low-poly balls, biggest in the middle,
// merged into a single mesh. The bottom is flattened, like real fair-weather
// clouds.
function makeCloudGeometry(size, random) {
  const puffs = 3 + Math.floor(random() * 3); // 3 to 5 balls
  const parts = [];
  for (let i = 0; i < puffs; i++) {
    // -1 at one end of the row, +1 at the other.
    const along = puffs === 1 ? 0 : (i / (puffs - 1)) * 2 - 1;
    const radius = size * (1 - 0.45 * Math.abs(along)) * (0.85 + random() * 0.3);
    // Detail 1 = 80 triangles: chunky but still round-ish.
    const puff = new THREE.IcosahedronGeometry(radius, 1);
    puff.translate(along * size * 1.3, radius * 0.25, (random() - 0.5) * size * 0.6);
    parts.push(puff);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());

  // Squash it: a bit flatter overall, and much flatter underneath.
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    position.setY(i, y > 0 ? y * 0.7 : y * 0.25);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Same seed = same sequence of "random" numbers (0 to 1) every time.
// (Three.js has one shared seeded generator; passing a number restarts it.)
function seededRandom(seed) {
  THREE.MathUtils.seededRandom(seed);
  return () => THREE.MathUtils.seededRandom();
}

function mapColors(colors) {
  return {
    top: new THREE.Color(colors.top),
    horizon: new THREE.Color(colors.horizon),
    bottom: new THREE.Color(colors.bottom),
  };
}

// --- Shaders ---------------------------------------------------------------
// The sky's colour depends only on which way you're looking: the direction
// from the camera to the point on the sphere. `y` of that direction is +1
// straight up, 0 at the horizon and -1 straight down.
const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  varying vec3 vWorld;
  void main() {
    float y = normalize(vWorld - cameraPosition).y;
    vec3 color = y > 0.0
      ? mix(uHorizon, uTop, pow(y, ${SKY_SPREAD_UP.toFixed(2)}))
      : mix(uHorizon, uBottom, pow(-y, ${SKY_SPREAD_DOWN.toFixed(2)}));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Each star is a round, soft dot whose brightness slowly pulses.
const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.6 + 0.4 * sin(uTime * ${STAR_TWINKLE_SPEED.toFixed(2)} + aPhase);
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    float fromCentre = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.1, fromCentre) * vTwinkle * uOpacity;
    gl_FragColor = vec4(1.0, 0.97, 0.9, alpha);
  }
`;
