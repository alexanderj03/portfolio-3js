// ---------------------------------------------------------------------------
// main.js: the entry point. Creates the stage, loads the island, then wires
// interaction, animations and UI together and runs the render loop.
// ---------------------------------------------------------------------------
import './style.css';
import * as THREE from 'three';
import { createStage } from './scene.js';
import { loadIsland } from './loader.js';
import { createInteraction } from './interaction.js';
import { createAnimations } from './animations.js';
import { createUI, SECTIONS } from './ui.js';
import { createSigns } from './signs.js';
import { createPlayer } from './player.js';
import { createScreens } from './screens.js';
import { createFreeCam } from './freecam.js';
import { createNight } from './night.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// 1. Renderer, camera, lights, controls.
const stage = createStage(document.getElementById('app'));
const { renderer, scene, camera, controls } = stage;
// Day / night switch (moon button). Only needs the lights, so it works while
// the model is still loading.
const night = createNight(stage);

// 2. HTML panels and buttons. `interaction` doesn't exist until the model has
//    loaded, hence the `?.` (do nothing if it's not ready yet).
let interaction = null;
let player = null;
let animate = null;
let screens = null;
let freeCam = null;
const ui = createUI({
  onNavigate: (section) => visit(section),
  onBack: () => {
    player?.stop(); // cancel a visit that's still on its way
    interaction?.goHome();
  },
  // A project card was hovered/focused/tapped: show it on the studio monitors.
  onPreviewProject: (index) => screens?.show(index),
});

// Opening a section: the person walks to the building's door first, and the
// camera only zooms in once they've arrived.
function visit(section) {
  if (!player) return;
  // Already looking at a different building? Zoom back out to the overview
  // first, so you can watch the person walk over before zooming in again.
  // (Focus stays where it is: a new panel is about to open anyway.)
  const current = interaction.section;
  if (current && current !== section) interaction.goHome({ returnFocus: false });
  player.walkToDoor(section, () => interaction.focus(section));
}

// 3. Load the model (or the placeholder), then hook everything up.
loadIsland(scene).then(({ root }) => {
  createSigns(root, renderer); // big readable text on the signs
  const labels = Object.fromEntries(Object.entries(SECTIONS).map(([key, s]) => [key, s.title]));
  player = createPlayer(scene, root);
  // After the player, so the walker's collision checks never see the panels.
  screens = createScreens(root); // projects on the studio monitors
  interaction = createInteraction({
    camera,
    controls,
    renderer,
    root,
    ui,
    labels,
    onSelect: visit, // clicking a building (or its signpost arrow / the post box)
    // Clicking the island's ground (not a building) walks the person there.
    onMiss: (hit) => player.walkTo(hit),
  });
  // The "Look around" / "Lock view" camera button (top left).
  freeCam = createFreeCam({ camera, controls, interaction });
  animate = createAnimations(root);
  stage.onResize(() => interaction.onResize());

  // Handy for poking around in the browser console while developing,
  // e.g. `island.root.getObjectByName('CafeCup')`.
  if (import.meta.env.DEV) window.island = { scene, camera, controls, root, player, THREE };
});

// 4. Render loop: runs once per screen refresh (usually 60 times a second).
const timer = new THREE.Timer();
timer.connect(document); // pauses the clock while the tab is hidden

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  // Cap the time step so a slow frame doesn't make things jump.
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = timer.getElapsed();

  interaction?.update(dt);
  player?.update(dt, time); // walks toward the last clicked spot
  freeCam?.update(dt); // Q / E turning while the camera is unlocked
  night.update(dt); // fades the lights when switching between day and night
  // OrbitControls only drive the camera on the overview; during a flight or
  // while looking at a building the interaction code is in charge.
  if (!interaction || interaction.controlsActive) controls.update();
  if (animate && !reduceMotion.matches) animate(time, dt);

  renderer.render(scene, camera);
});
