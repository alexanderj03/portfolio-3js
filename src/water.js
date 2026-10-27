// ---------------------------------------------------------------------------
// water.js: makes the stream and waterfall look like flowing water.
//
// The model's water has no textures or UVs (UVs = the coordinates a texture
// would use), so there's nothing to scroll. Instead we draw a copy of each
// water mesh on top of the original, using a small custom shader. The
// original materials are never touched.
//
//  - Stream + pool: soft see-through streaks added on top of the water,
//    a bit of white-water just before the edge, and faint rings in the pool.
//  - Waterfall: painted fully by the copy, because being vertical, the real
//    waterfall gets almost no sun and lots of green bounce light, which made
//    it look grey-teal. The copy uses the colours from your Blender materials:
//    it starts in the stream's blue at the lip, fades to the waterfall colour,
//    has foam (the foam material's colour) flowing down it, speeds up as it
//    falls like real water, and turns into mist at the bottom.
//    The static foam bands from the model are painted as water, so the only
//    foam you see is the moving foam.
//
// The patterns use "noise": smooth random values that look natural, stretched
// along the direction of flow so they read as streaks.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { findObject } from './loader.js';

// Tweak these to change the look.
const SETTINGS = {
  streamSpeed: 0.7, // how fast the stream flows (metres per second)
  fallSpeed: 2.2, // how fast the waterfall flows (it also speeds up as it falls)
  streamStreaks: 0.3, // brightness of the streaks on the stream (0 = none)
  fallStreaks: 0.3, // brightness of the streaks on the waterfall (0 = none)
  foamAmount: 0.5, // how much foam flows down the waterfall (0 = none, 1 = lots)
  poolRipples: 0.1, // brightness of the rings in the pool (0 = off)
  // Over how many metres below the lip the waterfall fades from the stream's
  // blue into its own (lighter) Blender colour. Make it huge (e.g. 1000) to
  // keep the whole waterfall the same blue as the stream.
  fallFadeLength: 6,
  // Brightness of the painted waterfall. The lit stream shows up at roughly
  // 80% of its Blender colour, so this keeps the two looking alike.
  fallBrightness: 0.8,
  mistLength: 7, // metres at the bottom of the waterfall that turn into mist
  mistColor: '#e4f3fb', // close to the sky colour, so the end blends in
};

const MODE_STREAM = 0;
const MODE_FALL = 1;

// --- The shader -------------------------------------------------------------
// A shader is a tiny program that runs on the graphics card. The vertex shader
// runs once per corner of each triangle, the fragment shader once per pixel.

const vertexShader = /* glsl */ `
  varying vec3 vWorld; // this pixel's position in the world, in metres

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uMode;        // 0 = flat water (pool + stream), 1 = waterfall
  uniform vec2  uFlowDir;     // which way the stream runs (horizontal)
  uniform vec2  uPoolCenter;
  uniform float uPoolRadius;
  uniform vec2  uLip;         // where the stream goes over the edge (x, z)
  uniform float uSpeed;
  uniform float uStreaks;
  uniform float uFoam;
  uniform float uRipples;
  // Waterfall colours:
  uniform vec3  uTopColor;    // colour at the lip (the stream's colour)
  uniform vec3  uColor;       // colour further down (the waterfall's own colour)
  uniform vec3  uFoamColor;
  uniform vec3  uMistColor;
  uniform float uLipY;        // height of the lip
  uniform float uBottomY;     // height of the bottom of the waterfall
  uniform float uFadeLength;
  uniform float uMistLength;
  uniform float uBrightness;
  uniform vec3  uLight;       // tint for night time (white = daylight), see setWaterLight()
  varying vec3 vWorld;

  // Random number 0..1 for a 2D point (same input = same output).
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Smooth "value noise": random values on a grid, blended smoothly between.
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // Soft streaks: noise that changes quickly across the flow and slowly along
  // it, so it's stretched into lines. Two layers at different sizes and speeds
  // make it less regular.
  float streaks(float across, float flow) {
    float n = noise(vec2(across * 4.0, flow * 0.5)) * 0.6
            + noise(vec2(across * 9.0 + 7.0, flow * 1.1 + 3.0)) * 0.4;
    return smoothstep(0.55, 0.85, n);
  }

  // Foam: chunkier noise, wider across the flow, so it looks like patches of
  // white-water rather than lines. Higher 'amount' = more foam.
  float foam(float across, float flow, float amount) {
    float n = noise(vec2(across * 2.5, flow * 0.9)) * 0.55
            + noise(vec2(across * 6.0 + 13.0, flow * 2.2 + 5.0)) * 0.45;
    float threshold = mix(0.85, 0.45, amount);
    return smoothstep(threshold, threshold + 0.12, n);
  }

  void main() {
    vec2 xz = vWorld.xz;
    vec2 side = vec2(uFlowDir.y, -uFlowDir.x); // across the flow
    float across = dot(xz, side);

    if (uMode > 0.5) {
      // ---- Waterfall ----
      float drop = max(uLipY - vWorld.y, 0.0); // metres below the lip

      // Falling water speeds up. Using the square root of the drop as the
      // "distance along the flow" makes the pattern move slowly at the top and
      // faster further down, just like something falling.
      float flow = sqrt(drop + 0.3) * 3.0 - uTime * uSpeed;

      // Colour: stream blue at the lip, fading into the waterfall colour.
      float fade = smoothstep(0.0, uFadeLength, drop);
      vec3 color = mix(uTopColor, uColor, fade) * uBrightness;

      // Gentle shading per flat face, so the low-poly facets still show.
      // (The face direction is worked out from how the position changes across pixels.)
      vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      color *= mix(0.9, 1.05, abs(dot(normal, normalize(vec3(0.5, 0.4, 0.75)))));

      // Light streaks.
      color = mix(color, vec3(1.0), streaks(across, flow) * uStreaks);

      // Flowing foam: most just after the lip, where the water churns.
      float churn = mix(1.0, 0.75, smoothstep(0.5, 5.0, drop));
      color = mix(color, uFoamColor * uBrightness * 1.1, foam(across, flow, uFoam * churn) * 0.9);

      // Mist: the last few metres break up into pale spray.
      float mist = smoothstep(uBottomY + uMistLength, uBottomY, vWorld.y);
      float spray = noise(vec2(across * 3.0, flow * 0.7 + 21.0));
      color = mix(color, uMistColor, clamp(mist * (0.6 + 0.6 * spray), 0.0, 1.0));

      gl_FragColor = vec4(color * uLight, 1.0);
    } else {
      // ---- Stream and pool ----
      float dist = distance(xz, uPoolCenter);
      float channel = smoothstep(uPoolRadius, uPoolRadius + 0.8, dist);
      float flow = dot(xz, uFlowDir) - uTime * uSpeed;

      float alpha = streaks(across * 1.5, flow * 1.5) * uStreaks * channel;

      // A little white-water just before the edge, where the water speeds up.
      float nearLip = 1.0 - smoothstep(0.0, 1.8, distance(xz, uLip));
      alpha += foam(across, flow * 2.0, 0.6) * nearLip * 0.6;

      // Pool: faint rings spreading out from the middle, like a spring.
      float ring = smoothstep(0.85, 1.0, sin(dist * 5.0 - uTime * 1.2) * 0.5 + 0.5);
      alpha += ring * (1.0 - channel) * uRipples;

      gl_FragColor = vec4(uLight, alpha);
    }
    #include <colorspace_fragment>
  }
`;

// Shared clock value, so every water material moves in sync.
const time = { value: 0 };
// Shared light tint. This shader ignores the scene's lights (it paints fixed
// colours), so at night night.js darkens it by hand to match the moonlight.
const light = { value: new THREE.Color('#ffffff') };

// `color` multiplies everything the water overlays draw: white = unchanged.
export function setWaterLight(color) {
  light.value.copy(color);
}

function createWaterMaterial(options) {
  const isFall = options.mode === MODE_FALL;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: time,
      uMode: { value: options.mode },
      uFlowDir: { value: options.flowDir },
      uPoolCenter: { value: options.poolCenter },
      uPoolRadius: { value: options.poolRadius },
      uLip: { value: options.lip },
      uSpeed: { value: isFall ? SETTINGS.fallSpeed : SETTINGS.streamSpeed },
      uStreaks: { value: isFall ? SETTINGS.fallStreaks : SETTINGS.streamStreaks },
      uFoam: { value: SETTINGS.foamAmount },
      uRipples: { value: SETTINGS.poolRipples },
      uTopColor: { value: options.topColor ?? new THREE.Color() },
      uColor: { value: options.color ?? new THREE.Color() },
      uFoamColor: { value: options.foamColor ?? new THREE.Color('#ffffff') },
      uMistColor: { value: new THREE.Color(SETTINGS.mistColor) },
      uLipY: { value: options.lipY ?? 0 },
      uBottomY: { value: options.bottomY ?? -25 },
      uFadeLength: { value: SETTINGS.fallFadeLength },
      uMistLength: { value: SETTINGS.mistLength },
      uBrightness: { value: SETTINGS.fallBrightness },
      uLight: light,
    },
    // Stream: see-through, added on top ("additive") so it only brightens.
    // Waterfall: solid, painting over the original completely.
    transparent: !isFall,
    blending: isFall ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Pull the copy slightly toward the camera so it doesn't flicker with the original.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

// Adds a copy on top of `mesh`, drawn with `material`.
function addOverlay(mesh, material, renderOrder) {
  const overlay = new THREE.Mesh(mesh.geometry, material);
  overlay.name = 'WaterOverlay';
  overlay.raycast = () => {}; // ignore for mouse picking
  overlay.renderOrder = renderOrder; // draw after the original water underneath
  mesh.add(overlay);
}

function meshesOf(object) {
  const meshes = [];
  object.traverse((o) => {
    if (o.isMesh && o.name !== 'WaterOverlay') meshes.push(o);
  });
  return meshes;
}

// --- Setup --------------------------------------------------------------
// Returns an update(time) function, or null if there's no water in the model.
export function createRunningWater(root) {
  const stream = findObject(root, 'Island_Water'); // pool + stream channel
  const fall = findObject(root, 'Island_Waterfall');
  if (!stream && !fall) return null;

  root.updateWorldMatrix(true, true);

  // Work out the flow from the model itself, so it still works if you move
  // things in Blender: the pool centre comes from the rock pool's rim, and the
  // stream runs from there toward the top of the waterfall.
  const poolCenter = new THREE.Vector2(-6.2, 11.4);
  let poolRadius = 2.2;
  const rim = findObject(root, 'Island_RockPool');
  if (rim) {
    const box = new THREE.Box3().setFromObject(rim);
    poolCenter.set((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
    poolRadius = (Math.min(box.max.x - box.min.x, box.max.z - box.min.z) / 2) * 0.85;
  }
  const lip = fall ? topCentre(fall) : new THREE.Vector2(-9.7, 17.9);
  const flowDir = lip.clone().sub(poolCenter).normalize();
  const shared = { flowDir, poolCenter, poolRadius, lip };

  // The stream's colour, read from its Blender material (used at the waterfall's lip).
  let streamColor = new THREE.Color('#2f9bd6');
  if (stream) {
    const streamMeshes = meshesOf(stream);
    if (streamMeshes[0]?.material?.color) streamColor = streamMeshes[0].material.color;
    const material = createWaterMaterial({ ...shared, mode: MODE_STREAM });
    streamMeshes.forEach((mesh) => addOverlay(mesh, material, 1));
  }

  if (fall) {
    // The waterfall has a water mesh and a foam mesh (told apart by material
    // name). Both get the same look, so the foam bands blend into the water,
    // and the foam material's colour is used for the moving foam instead.
    const fallMeshes = meshesOf(fall);
    const foamMesh = fallMeshes.find((m) => /foam/i.test(m.material.name));
    const waterMesh = fallMeshes.find((m) => m !== foamMesh);
    const box = new THREE.Box3().setFromObject(fall);
    const material = createWaterMaterial({
      ...shared,
      mode: MODE_FALL,
      topColor: streamColor,
      color: waterMesh?.material.color ?? new THREE.Color('#8fd3f5'),
      foamColor: foamMesh?.material.color ?? new THREE.Color('#eefaff'),
      lipY: box.max.y,
      bottomY: box.min.y,
    });
    fallMeshes.forEach((mesh) => addOverlay(mesh, material, mesh === foamMesh ? 3 : 2));
  }

  return (t) => {
    time.value = t;
  };
}

// Average horizontal position of the highest vertices of `object` (the lip
// where the water goes over the edge).
function topCentre(object) {
  const top = new THREE.Box3().setFromObject(object).max.y;
  const sum = new THREE.Vector2();
  let count = 0;
  const v = new THREE.Vector3();
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      if (v.y > top - 0.5) {
        sum.x += v.x;
        sum.y += v.z;
        count++;
      }
    }
  });
  return count ? sum.divideScalar(count) : new THREE.Vector2(-9.7, 17.9);
}
