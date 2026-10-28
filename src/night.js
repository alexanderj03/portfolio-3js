// ---------------------------------------------------------------------------
// night.js: the day / night switch. The moon button (top left) and the N key
// toggle it.
//
// Night fades the 3D scene over a second or so: the sky turns deep blue and
// the stars come out (sky.js), the soft hemisphere light dims, and the sun
// becomes a weaker, cooler moonlight (same direction, so the shadows stay
// put; the clouds dim with it). The glb's materials are never
// touched; lamps and the pizza oven keep their own glow, which is what makes
// them stand out once it's dark.
//
// The HTML side is plain CSS: this sets <html data-theme="night">, and
// style.css swaps its colour variables, so the buttons and section panels go
// dark too. The choice is remembered in localStorage; a tiny script in
// index.html applies it before the page first paints, so there's no flash of
// the day colours on reload.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { setWaterLight } from './water.js';

// The night look. The day values aren't listed here: they're read from the
// lights scene.js creates, so that file stays the one place to tweak the day.
// The sky's colours (day and night) live in sky.js.
const NIGHT = {
  hemiSky: '#7f9cd6', // soft light from above: moonlit blue
  hemiGround: '#2c4a3a', // bounce light from below: dark grass
  hemiIntensity: 0.55,
  sunColor: '#a9bfff', // the sun becomes cool moonlight...
  sunIntensity: 0.8, // ...and much weaker
  // The water overlays (water.js) ignore the lights, so they're tinted by
  // hand to sit at about the same brightness as the moonlit stream.
  water: '#53648c',
  themeColor: '#14213d', // browser UI colour on phones (<meta name="theme-color">)
};
const FADE_SECONDS = 1.2; // how long the switch takes
const TOGGLE_KEY = 'KeyN';
// Keep in step with the inline script in index.html.
const STORAGE_KEY = 'island-theme';

const ICON_MOON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const ICON_SUN =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

export function createNight({ hemi, sun, sky }) {
  const button = document.getElementById('theme-btn');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Snapshot of the day look, taken before anything changes it.
  const day = {
    hemiSky: hemi.color.clone(),
    hemiGround: hemi.groundColor.clone(),
    hemiIntensity: hemi.intensity,
    sunColor: sun.color.clone(),
    sunIntensity: sun.intensity,
    water: new THREE.Color('#ffffff'), // white = untinted
    themeColor: themeMeta?.content ?? '#bfe3f5',
  };
  const night = {
    ...NIGHT,
    hemiSky: new THREE.Color(NIGHT.hemiSky),
    hemiGround: new THREE.Color(NIGHT.hemiGround),
    sunColor: new THREE.Color(NIGHT.sunColor),
    water: new THREE.Color(NIGHT.water),
  };

  // 0 = full day, 1 = full night. `amount` eases toward `target` in update().
  let target = document.documentElement.dataset.theme === 'night' ? 1 : 0;
  let amount = target;
  const waterTint = new THREE.Color();

  // Blends every light setting between day and night (t from 0 to 1).
  function apply(t) {
    // Ease in and out, so the change starts and ends gently.
    const k = t * t * (3 - 2 * t);
    sky.setNight(k);
    hemi.color.lerpColors(day.hemiSky, night.hemiSky, k);
    hemi.groundColor.lerpColors(day.hemiGround, night.hemiGround, k);
    hemi.intensity = THREE.MathUtils.lerp(day.hemiIntensity, night.hemiIntensity, k);
    sun.color.lerpColors(day.sunColor, night.sunColor, k);
    sun.intensity = THREE.MathUtils.lerp(day.sunIntensity, night.sunIntensity, k);
    setWaterLight(waterTint.lerpColors(day.water, night.water, k));
  }

  function setNight(on, { save = true } = {}) {
    target = on ? 1 : 0;
    // No fade for people who've asked their system for less motion.
    if (reduceMotion.matches) {
      amount = target;
      apply(amount);
    }
    // The HTML switches straight away; only the 3D scene fades.
    document.documentElement.dataset.theme = on ? 'night' : 'day';
    if (themeMeta) themeMeta.content = on ? night.themeColor : day.themeColor;
    // The icon shows what pressing it does (moon = go to night), and
    // aria-pressed tells screen readers whether night mode is on.
    button.innerHTML = on ? ICON_SUN : ICON_MOON;
    button.setAttribute('aria-pressed', on);
    button.title = on ? 'Switch to day (N)' : 'Switch to night (N)';
    if (save) {
      // Can throw in private windows or with storage blocked; it's only a nicety.
      try {
        localStorage.setItem(STORAGE_KEY, on ? 'night' : 'day');
      } catch {}
    }
  }

  button.setAttribute('aria-label', 'Night mode');
  button.addEventListener('click', () => setNight(target === 0));
  window.addEventListener('keydown', (e) => {
    if (e.code !== TOGGLE_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    setNight(target === 0);
  });
  setNight(target === 1, { save: false });
  apply(amount);
  button.hidden = false;

  // Called every frame from main.js.
  function update(dt) {
    if (amount === target) return;
    const step = dt / FADE_SECONDS;
    amount = target > amount ? Math.min(amount + step, target) : Math.max(amount - step, target);
    apply(amount);
  }

  return {
    update,
    get isNight() {
      return target === 1;
    },
  };
}
