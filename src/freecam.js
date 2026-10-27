// ---------------------------------------------------------------------------
// freecam.js: the "look around" camera. Normally the overview camera is
// locked to the hero shot. The camera button (top left) unlocks it: drag to
// orbit, scroll/pinch to zoom, right-drag (or two fingers) to slide, and
// Q / E to turn. The button shows the current mode
// ("Locked" or "Look around"); pressing it while looking around
// flies back to the hero shot and locks the camera there.
//
// Clicks still walk the person around while unlocked: a press that moves
// more than a few pixels counts as a drag (see CLICK_MAX_MOVE in
// interaction.js), so dragging to look never sends them walking.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const TURN_SPEED = 90; // degrees per second for Q / E
// Zoom limits while looking around (metres from the point being looked at).
const FREE_MIN_DISTANCE = 8;
// The point the camera looks at can't wander more than this far from the
// island centre, so you can't lose the island off into the sky.
const MAX_TARGET_RADIUS = 24;

const TURN_KEYS = { KeyQ: 1, KeyE: -1 };
const TOGGLE_KEY = 'KeyL';

const ICON_UNLOCKED =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
const ICON_LOCKED =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

export function createFreeCam({ camera, controls, interaction }) {
  const button = document.getElementById('camera-btn');
  // Remember the locked settings from scene.js so locking restores them exactly.
  const locked = {
    minDistance: controls.minDistance,
    screenSpacePanning: controls.screenSpacePanning,
  };
  let free = false;

  // The look-at point is kept within MAX_TARGET_RADIUS of the island centre
  // (OrbitControls measures this from `controls.cursor`, which is 0,0,0).
  controls.maxTargetRadius = MAX_TARGET_RADIUS;

  function setFree(on) {
    const wasFree = free;
    free = on;
    controls.enableRotate = on;
    controls.enableZoom = on;
    controls.enablePan = on;
    // Slide along the ground (like a map) instead of up/down the screen.
    controls.screenSpacePanning = on ? false : locked.screenSpacePanning;
    controls.minDistance = on ? FREE_MIN_DISTANCE : locked.minDistance;
    interaction.freeLook = on; // so "Back" returns to where you were looking from
    document.body.classList.toggle('free-look', on);
    // The label shows the mode you're in now; the tooltip says what pressing it does.
    button.innerHTML = on ? `${ICON_UNLOCKED}<span>Look around</span>` : `${ICON_LOCKED}<span>Locked</span>`;
    button.title = on
      ? 'Lock the camera back to the original view (L)'
      : 'Unlock the camera to look around: drag to look, scroll to zoom, Q/E to turn (L)';
    button.setAttribute('aria-label', on ? 'Camera: looking around. Lock view' : 'Camera: locked. Look around');
    if (wasFree && !on) interaction.resetView(); // fly back to the hero shot
  }

  button.addEventListener('click', () => setFree(!free));
  setFree(false);
  button.hidden = false;

  // --- Keyboard -----------------------------------------------------------
  const held = new Set(); // key codes currently held down

  function isTyping(target) {
    return target.closest?.('input, textarea, select, [contenteditable]');
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (e.code === TOGGLE_KEY && !e.repeat) {
      setFree(!free);
      return;
    }
    if (!free || !interaction.controlsActive) return;
    if (e.code in TURN_KEYS) held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  // Letting go of a key while the window is in the background never fires
  // keyup, so forget everything when it loses focus.
  window.addEventListener('blur', () => held.clear());

  const offset = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // Called every frame from main.js, before controls.update(), which then
  // applies the zoom/angle limits to wherever the keys turned the camera.
  function update(dt) {
    if (!free || held.size === 0 || !interaction.controlsActive) return;

    let turn = 0;
    for (const code of held) turn += TURN_KEYS[code] ?? 0;

    // Turn by swinging the camera around the point it looks at.
    if (turn) {
      offset.subVectors(camera.position, controls.target);
      offset.applyAxisAngle(UP, THREE.MathUtils.degToRad(TURN_SPEED * turn * dt));
      camera.position.copy(controls.target).add(offset);
    }
  }

  return {
    update,
    get free() {
      return free;
    },
  };
}
