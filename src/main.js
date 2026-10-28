// ---------------------------------------------------------------------------
// main.js: the entry point. Creates the stage, loads the island, then wires
// interaction, animations and UI together and runs the render loop.
// ---------------------------------------------------------------------------
import './style.css';
import * as THREE from 'three';
import { createStage } from './scene.js';
import { loadIsland, hideLoading } from './loader.js';
import { createInteraction } from './interaction.js';
import { createAnimations } from './animations.js';
import { createUI, SECTIONS, NARROW_SCREEN } from './ui.js';
import { createSigns } from './signs.js';
import { createPlayer } from './player.js';
import { createScreens } from './screens.js';
import { createFreeCam } from './freecam.js';
import { createNight } from './night.js';
import { createSky } from './sky.js';
import { createIntro } from './intro.js';
import { loadAvatar } from './avatar.js';
import { avatar as avatarText } from './content.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// 1. Renderer, camera, lights, controls.
const stage = createStage(document.getElementById('app'));
const { renderer, scene, camera, controls } = stage;
// The gradient sky, clouds and stars behind the island.
const sky = createSky(stage);
// Day / night switch (moon button). Only needs the lights and the sky, so it
// works while the model is still loading.
const night = createNight({ ...stage, sky });

// 2. HTML panels and buttons. `interaction` doesn't exist until the model has
//    loaded, hence the `?.` (do nothing if it's not ready yet).
let interaction = null;
let player = null;
let animate = null;
let screens = null;
const ui = createUI({
  onNavigate: (section) => visit(section, { fromNav: true }),
  onBack: () => {
    player?.stop(); // cancel a visit that's still on its way
    interaction?.goHome();
  },
  // A project card was hovered/focused/tapped: show it on the studio monitors.
  onPreviewProject: (index) => screens?.show(index),
});

// Opening a section: the person walks to the building's door first, and the
// camera only zooms in once they've arrived.
// `fromNav` = it came from a nav button or a link in a panel, not a tap on
// the island. On phones those open straight away: waiting several seconds
// for the walk feels like the site isn't responding. Tapping a building
// still walks, since that's the playful way in.
function visit(section, { fromNav = false } = {}) {
  if (!interaction) return; // still loading
  if (!player) {
    interaction.focus(section); // no avatar.glb, so no one to walk: just open it
    return;
  }
  if (fromNav && NARROW_SCREEN.matches) {
    player.jumpToDoor(section);
    interaction.focus(section); // flies straight there, even from another building
    return;
  }
  // Already looking at a different building? Zoom back out to the overview
  // first, so you can watch the person walk over before zooming in again.
  // (Focus stays where it is: a new panel is about to open anyway.)
  const current = interaction.section;
  if (current && current !== section) interaction.goHome({ returnFocus: false });
  player.walkToDoor(section, () => interaction.focus(section));
}

// 3. Load the model (or the placeholder), then hook everything up.
//    The person who walks around (avatar.glb, a separate file with its own
//    animation clips) starts loading at the same time. It's the smaller
//    file, so it's usually ready first. If it's missing, loadAvatar() logs
//    a warning and gives null, and the site works without a walker.
const avatarReady = loadAvatar(scene);
loadIsland(scene).then(async ({ root }) => {
  createSigns(root, renderer); // big readable text on the signs
  const labels = Object.fromEntries(Object.entries(SECTIONS).map(([key, s]) => [key, s.title]));
  const avatar = await avatarReady;
  if (avatar) player = createPlayer(scene, root, avatar);
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
    // If you were looking at a building, that also closes its panel and
    // zooms back out, so you can watch them go. (goHome() does nothing if
    // you're already on the overview.) Focus isn't sent back to the nav
    // button: this was a click on the island, not on the panel.
    onMiss: (hit) => {
      if (player?.walkToClick(hit)) interaction.goHome({ returnFocus: false });
    },
  });
  // Hovering over the person shows "Hi!"; clicking them makes them wave.
  if (player) interaction.addClickable(player.hitBox, { label: avatarText.label, onClick: player.wave });
  // The "Look around" / "Lock view" camera button (top left).
  createFreeCam({ controls, interaction });
  animate = createAnimations(root);
  stage.onResize(() => interaction.onResize());
  // The opening shot: a close-up of the person waving, then the camera
  // pulls back to the whole island. Reduced motion: start on the hero shot.
  if (player && !reduceMotion.matches) createIntro({ camera, player, interaction, greeting: avatar.greeting });

  // Handy for poking around in the browser console while developing,
  // e.g. `island.root.getObjectByName('CafeCup')` or `island.player.play('Wave')`.
  if (import.meta.env.DEV) window.island = { scene, camera, controls, root, player, THREE };
})
  // Only now fade the loading screen out, with everything (including the
  // opening close-up) in place. `finally` = even if something above failed,
  // so the page is never stuck behind the loading screen.
  .finally(hideLoading);

// 4. Render loop: runs once per screen refresh (usually 60 times a second).
const timer = new THREE.Timer();
timer.connect(document); // pauses the clock while the tab is hidden

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  // Cap the time step so a slow frame doesn't make things jump.
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = timer.getElapsed();

  interaction?.update(dt);
  player?.update(dt, time); // walks toward the last clicked spot, and plays the avatar's clips
  night.update(dt); // fades the lights when switching between day and night
  if (!reduceMotion.matches) sky.update(time); // drifting clouds, twinkling stars
  // OrbitControls only drive the camera on the overview; during a flight or
  // while looking at a building the interaction code is in charge.
  if (!interaction || interaction.controlsActive) controls.update();
  if (animate && !reduceMotion.matches) animate(time, dt);

  renderer.render(scene, camera);
});
