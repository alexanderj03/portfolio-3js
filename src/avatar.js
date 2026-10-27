// ---------------------------------------------------------------------------
// avatar.js: the person who walks around the island, a rigged character
// from Blender (public/models/avatar.glb). This file is just the body: it
// loads the model and plays its animation clips ("Idle", "Walk", "Wave")
// with a THREE.AnimationMixer, blending smoothly from one to the next.
// Where they go and how they get there (route finding, building visits) is
// player.js, which moves `object` around and tells us how fast it's going.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { createGLTFLoader, loadingScreenGone } from './loader.js';

// import.meta.env.BASE_URL is filled in by Vite ("/" in dev, "./" in the build).
const MODEL_URL = `${import.meta.env.BASE_URL}models/avatar.glb`;

// The "Walk" clip walks on the spot; player.js moves the model. At this
// speed (metres per second) the feet match the ground exactly. If the
// player walks faster or slower, the clip is sped up or slowed down to
// match, so the feet never slide.
const WALK_CLIP_SPEED = 1.4;
const MOVING = 0.1; // faster than this (m/s) counts as walking

const FADE = 0.4; // seconds to crossfade from one clip to the next
const GREETING_WAVES = 2; // times the Wave clip plays when the site opens (the clip itself waves twice)
const CLICK_WAVES = 1; // times it plays when they're clicked

// An invisible box around the body that hover/click rays test against.
// Much easier to hit than thin animated arms and legs, and cheaper than
// testing the skinned mesh itself. (Metres; the avatar is about 1.8 m tall.)
const HIT_BOX = { width: 0.8, height: 2.1, depth: 0.5 };

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Loads the model and resolves to the avatar, or to null if the file is
// missing or broken. (Then it just logs a warning and the site carries on
// without anyone walking around.)
export async function loadAvatar(scene) {
  let gltf;
  try {
    gltf = await createGLTFLoader().loadAsync(MODEL_URL);
  } catch (error) {
    console.warn(`[avatar] Could not load ${MODEL_URL}, so there's no one to walk around.`, error);
    return null;
  }
  return createAvatar(scene, gltf);
}

function createAvatar(scene, gltf) {
  // `object` is the "AvatarRig" armature with the "Avatar" mesh inside.
  // Its origin is between the feet and it faces +Z, so player.js can move
  // and turn it as it is.
  const object = gltf.scene;
  object.name = 'Player';

  // Shadows only. The materials from Blender are left exactly as they are.
  object.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });

  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(HIT_BOX.width, HIT_BOX.height, HIT_BOX.depth),
    // visible: false = never drawn, but rays still hit it.
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitBox.name = 'AvatarHitBox';
  hitBox.position.y = HIT_BOX.height / 2; // the model's origin is between its feet
  object.add(hitBox);

  scene.add(object);

  // --- Animation clips -----------------------------------------------------
  // The mixer is the "playback engine" for one character. Each clip gets an
  // "action" (play/stop/fade/loop controls for that clip). Several actions
  // can play at once with different weights, which is how crossfades work:
  // one fades from weight 1 to 0 while the next fades from 0 to 1.
  const mixer = new THREE.AnimationMixer(object);
  const actions = {};
  for (const name of ['Idle', 'Walk', 'Wave']) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (clip) actions[name] = mixer.clipAction(clip);
    else console.warn(`[avatar] No animation clip named "${name}" in avatar.glb.`);
  }
  let current = null; // the action that's playing (or fading in) right now

  // Fades from whatever is playing into the clip `name`. It plays `times`
  // times and then holds its last pose (Infinity = loop forever).
  function fadeTo(name, times = Infinity) {
    const next = actions[name];
    if (!next || next === current) return;
    // reset() rewinds it to the start and clears any old fade.
    next.reset();
    next.setLoop(THREE.LoopRepeat, times);
    // Hold the last pose instead of snapping back to the rest pose, so
    // there's something to fade out from when Idle takes over.
    next.clampWhenFinished = true;
    next.play();
    if (current) current.crossFadeTo(next, FADE, false);
    current = next;
  }

  // A clip that plays a set number of times (like Wave) fires "finished"
  // when it's done: go back to Idle.
  mixer.addEventListener('finished', (event) => {
    if (event.action === current) fadeTo('Idle');
  });

  fadeTo('Idle'); // breathe while the loading screen is still up

  // The greeting: wave once the loading screen has faded out, so the
  // visitor actually sees it. Skipped with reduced motion, or if they've
  // already been clicked somewhere and are walking.
  loadingScreenGone.then(() => {
    if (!reduceMotion.matches && current === actions.Idle) play('Wave', GREETING_WAVES);
  });

  // Play a clip `times` times, then go back to Idle. play('Wave') waves;
  // `times: Infinity` loops it. (player.js stops walking first.)
  function play(name, times = 1) {
    if (!actions[name]) return console.warn(`[avatar] No animation clip named "${name}".`);
    if (name === 'Idle') return fadeTo('Idle');
    // Reduced motion: never more than one go of a clip.
    fadeTo(name, reduceMotion.matches ? Math.min(times, 1) : times);
  }

  // Called every frame by player.js with the time step and how fast the
  // body is moving (metres per second): walking blends into "Walk",
  // stopping blends back into "Idle".
  function update(dt, speed) {
    if (speed > MOVING) {
      fadeTo('Walk'); // (cuts a wave short if they set off mid-wave)
      if (actions.Walk) actions.Walk.timeScale = speed / WALK_CLIP_SPEED;
    } else if (current === actions.Walk) {
      fadeTo('Idle');
    }
    mixer.update(dt); // moves the bones for the clips that are playing
  }

  return {
    object, // the character itself (THREE.Object3D): move and turn this
    hitBox, // the invisible box for hover/click rays
    update,
    play,
    idle: () => fadeTo('Idle'),
    wave: () => play('Wave', CLICK_WAVES),
  };
}
