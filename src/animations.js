// ---------------------------------------------------------------------------
// animations.js: small ambient animations. Each one has its own setup
// function that finds its object and returns an `update(time, dt)` function
// (or null if the object isn't in the model). Tweak the numbers freely.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { findObject } from './loader.js';
import { createRunningWater } from './water.js';

export function createAnimations(root) {
  const updaters = [setupCafeCup(root), setupWaterfall(root)].filter(Boolean);

  // Called every frame from main.js. `time` and `dt` are in seconds.
  return function update(time, dt) {
    for (const fn of updaters) fn(time, dt);
  };
}

// Giant coffee cup on the café roof: bobs up and down and slowly spins.
function setupCafeCup(root) {
  const cup = findObject(root, 'CafeCup');
  if (!cup) return null;

  const BOB_HEIGHT = 0.15; // metres up/down
  const BOB_SPEED = 1.6; // radians per second (higher = faster)
  const SPIN_SPEED = 0.4; // radians per second

  const basePosition = cup.position.clone();
  const baseQuaternion = cup.quaternion.clone();

  // The cup's origin in Blender is at the café's base, not in the cup itself,
  // so spinning around the origin would swing the cup in a circle. Instead we
  // spin around a vertical line through the middle of the cup (`pivot`,
  // measured in the parent's coordinates, the same space as cup.position).
  root.updateWorldMatrix(true, true);
  const pivot = new THREE.Box3().setFromObject(cup).getCenter(new THREE.Vector3());
  cup.parent.worldToLocal(pivot);

  const up = new THREE.Vector3(0, 1, 0);
  const spin = new THREE.Quaternion();
  const offset = new THREE.Vector3();

  return (time) => {
    const angle = time * SPIN_SPEED;
    // Rotate the origin's offset from the pivot around the vertical axis…
    offset.subVectors(basePosition, pivot).applyAxisAngle(up, angle);
    cup.position.copy(pivot).add(offset);
    cup.position.y = basePosition.y + Math.sin(time * BOB_SPEED) * BOB_HEIGHT;
    // …and turn the cup by the same angle.
    spin.setFromAxisAngle(up, angle);
    cup.quaternion.multiplyQuaternions(spin, baseQuaternion);
  };
}

// Running water: streaks flowing down the stream and waterfall, and rings
// in the pool. All the details (and speed/brightness settings) are in water.js.
function setupWaterfall(root) {
  return createRunningWater(root);
}
