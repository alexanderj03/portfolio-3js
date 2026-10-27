// ---------------------------------------------------------------------------
// intro.js: the opening shot. When the loading screen fades away, the camera
// is right in front of the person, who waves hello (the greeting in
// avatar.js). Once the wave is over, the camera pulls back to the hero shot
// of the whole island.
//
// Any click, tap, key press or scroll skips ahead to the pull-back, so
// nobody has to sit through it. main.js leaves the intro out with reduced
// motion, or when there's no avatar.glb.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const CLOSE_UP_DISTANCE = 4.5; // metres from the camera to the point it looks at
// Narrow (portrait) screens back off until at least this many metres fit
// across, so a phone doesn't show just a torso with the feet behind the tab bar.
const CLOSE_UP_MIN_WIDTH = 2.2;
const CLOSE_UP_ELEVATION = 8; // degrees above the horizon, looking slightly down at them
const LOOK_HEIGHT = 1.1; // metres above the feet the camera aims at (about chest height)
const PAUSE_AFTER_WAVE = 0.3; // seconds to linger on the close-up after the wave
const PULL_BACK_DURATION = 3; // seconds for the zoom out to the hero shot (normal flights take 1.2)

// Anything that means "I want to get going": skip straight to the pull-back.
const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel'];

// `greeting` is avatar.greeting: a Promise that resolves when the wave ends.
// Call this before the loading screen fades out, so the close-up is the
// first thing the visitor sees.
export function createIntro({ camera, player, interaction, greeting }) {
  // Stand in front of the person, the way they're facing. They start out
  // facing the hero camera, so the pull-back is close to a straight line.
  // (0 = facing +Z. Read from the rotation itself: the world matrix isn't
  // up to date until the first frame has been drawn.)
  const yaw = player.object.rotation.y;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const elevation = THREE.MathUtils.degToRad(CLOSE_UP_ELEVATION);
  // How many metres the view spans from the middle to the side edge, per
  // metre of distance (tan of half the horizontal field of view).
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  const distance = Math.max(CLOSE_UP_DISTANCE, CLOSE_UP_MIN_WIDTH / 2 / tanH);
  const target = player.position.clone().add(new THREE.Vector3(0, LOOK_HEIGHT, 0));
  const position = target
    .clone()
    .addScaledVector(forward, Math.cos(elevation) * distance)
    .add(new THREE.Vector3(0, Math.sin(elevation) * distance, 0));
  interaction.holdView({ position, target });

  let done = false;
  function pullBack() {
    if (done) return;
    done = true;
    SKIP_EVENTS.forEach((type) => window.removeEventListener(type, pullBack, true));
    // Straight back (no arc) and slower than a normal flight, so it feels
    // like a reveal. (If a building was opened in the meantime the camera
    // has already left the close-up, and this does nothing.)
    interaction.releaseView({ duration: PULL_BACK_DURATION, arc: false });
  }

  // `true` = "capture": we hear about the event before anything else on the
  // page does. The press itself isn't swallowed, so a nav button still works;
  // a click on the island just starts the pull-back (clicks don't count
  // while the camera is moving).
  SKIP_EVENTS.forEach((type) => window.addEventListener(type, pullBack, true));
  greeting.then(() => setTimeout(pullBack, PAUSE_AFTER_WAVE * 1000));
}
