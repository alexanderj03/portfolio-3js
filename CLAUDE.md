# CLAUDE.md

Alexander's 3D portfolio: a low-poly floating island modelled in Blender (`public/models/scene.glb`) and rendered with Three.js. Visitors click the ground to walk a little person around, and click buildings to fly the camera in and open a section panel (About / Projects / Contact).

## Commands

```bash
npm install
npm run dev      # Vite dev server, http://localhost:5173
npm run build    # production build -> dist/
npm run preview  # serve dist/
```

No tests, linter or formatter are configured. Verify changes by running the dev server and checking the browser. In dev, `window.island` exposes `{ scene, camera, controls, root, player, THREE }` for console debugging.

## Stack and constraints

- Vite 6 + vanilla JS (ES modules) + `three`. **No framework, no extra runtime dependencies.** Tweening and animation are hand-written (`easeInOutCubic` in `interaction.js`).
- `vite.config.js`: `base: './'` (the build works from a sub-folder, e.g. GitHub Pages), and `three` is excluded from `optimizeDeps` because pre-bundling breaks DRACOLoader's decoder path lookup. Keep both.
- Build asset URLs from `import.meta.env.BASE_URL` (see `loader.js`, `ui.js`), never from a leading `/`.
- The owner is learning Three.js. Match the existing style: a header comment block per file, plenty of plain-English comments explaining *why*, tweakable numbers as named `UPPER_CASE` constants at the top of each module.

## Hard rules about the model

- **Never override or replace the glb's materials.** Visual effects go on *overlay copies* drawn on top of the original mesh: the hover highlight (`interaction.js`, additive `MeshBasicMaterial` child mesh), running water (`water.js`, custom shader copy), and sign text (`signs.js`, canvas-textured panels). Only shadow flags are set on loaded meshes.
- **Leave `LampGlow` and `PizzaOven_Fire` alone.** The owner handles their lighting. They're listed in `DO_NOT_TOUCH` / `NOT_SOLID`.
- Colour management must stay `outputColorSpace = SRGBColorSpace` + `toneMapping = NoToneMapping`, which matches Blender's "Standard" view transform.
- Units are metres, Y-up. Buildings face +Z before rotation.
- Look objects up with `findObject(root, baseName)` / `nameMatches()` from `loader.js`, not `getObjectByName`. Blender and Three.js add suffixes (`About.001` → `About001`, `About_1`).

Key object names: `About`, `Projects`, `Contact` (building groups); `AFrame`, `Studio`, `Cafe` (building meshes used to find doors); `Signpost_About|Projects|Contact`; `Sign_Welcome`; `PostBox`; `CafeCup`; `Island_Waterfall`, `Island_Water`; `Island_Top`, `Island_Stones`, `Island_RockPool` (walkable); `StudioScreens` (project monitors, `screens.js`); `AFrameHolds` (reserved for a future feature).

## Architecture

`main.js` wires everything together: `createStage` → `createSky` → `createNight` → `createUI` → `loadIsland(scene)`. `loadAvatar(scene)` starts loading `avatar.glb` at the same time. Once the island resolves it calls `createSigns`, awaits the avatar, then `createPlayer(scene, root, avatar)` (skipped if the avatar is missing; `visit()` then just focuses), `createScreens`, `createInteraction` (+ `addClickable(player.hitBox, …)`), `createFreeCam`, `createAnimations` and `createIntro` (if there's a player and no reduced motion). Only then does `.finally(hideLoading)` fade the loading screen out. A single `renderer.setAnimationLoop` drives the loop with a `THREE.Timer` (dt capped at 0.1 s). Modules expose `createX(...)` factories that return objects or `update` functions; there are no classes, apart from `MissingModelError`.

| File | Role |
|---|---|
| `content.js` | **All user-facing text and links** (site name, sign text, about/projects/contact). Panels and 3D signs both read from it. Placeholder text is marked `TODO`. |
| `scene.js` | Renderer, scene, hero camera, hemisphere + sun lights, shadows, OrbitControls, resize. Exports `LANDMARKS` (building positions, `view`, `hideWhileFocused`), `PLAZA_POSITION`, `HERO_POSITION/TARGET`, `getHeroView(aspect)` → `{ position, target }`: the hero shot unchanged at aspect ≥ `HERO_MIN_ASPECT`; narrower screens pull back to fit, blending to a closer, steeper phone framing at ≤ `PHONE_ASPECT` (`PHONE_FIT_WIDTH` m across, `PHONE_ELEVATION`°, optional `PHONE_LIFT`). |
| `sky.js` | Everything behind the island (not part of the glb, not raycast or walkable): a gradient sky sphere (`SKY_RADIUS` 250 m, shader colours by view direction: `top`/`horizon`/`bottom` in `SKY_DAY`/`SKY_NIGHT`; the hero shot mostly sees the below-horizon half), a seeded ring of low-poly flat-shaded Lambert clouds below the island (`CLOUD_*`; lit by the scene lights, plus `WATERFALL_CLOUD` under the waterfall), and twinkling star points. `setNight(k)` (from `night.js`) fades sky, cloud colour/glow and stars; `update(time)` drifts the ring, bobs clouds and twinkles stars (skipped with reduced motion). `scene.background` is not used. |
| `loader.js` | Loads the glb via GLTFLoader + DRACOLoader. Drives the `#loading` overlay (`hideLoading()` is called by `main.js`, not by `loadIsland`; `loadingScreenGone` resolves once it has faded). If the model is missing (it HEAD-checks first, since Vite returns `index.html` for missing files) it builds a placeholder island with the same object names and shows `#model-notice`. |
| `avatar.js` | The walker's body: the rigged character `public/models/avatar.glb` (skinned mesh `Avatar` on armature `AvatarRig`, origin between the feet, faces +Z; clips `Idle`/`Walk`/`Wave`), loaded with loader.js's `createGLTFLoader()`. A missing file only logs a warning (`loadAvatar` resolves to null). Materials untouched, `castShadow` only. One `AnimationMixer`; `fadeTo()` crossfades (`FADE` 0.4 s). `update(dt, speed)` (called by `player.js`) blends Walk/Idle from the speed and time-scales Walk to `speed / WALK_CLIP_SPEED` (1.4 m/s) so the feet never slide. Waves `GREETING_WAVES` times once `loadingScreenGone` (loader.js) resolves (`greeting` promise resolves when that wave ends), `CLICK_WAVES` on click (invisible `hitBox`, "Hi!" from `content.avatar`). Reduced motion: no greeting, one wave at most. |
| `interaction.js` | Raycast hover/click. `HOTSPOTS` maps object names to sections. Has a state machine (`home` / `flying` / `focused` / `held`; `held` = the intro close-up via `holdView(view)`, ended by `releaseView(opts)`), `flyTo(view, onDone, { duration, arc })`, camera fly-to (front or angled framing, offset to leave room for the panel), hides `hideWhileFocused` objects, and `goHome()`. Drags beyond `CLICK_MAX_MOVE` px aren't clicks. `addClickable(object, { label, onClick })` adds things outside the island (the avatar) to the raycast: pointer + label on hover, no highlight. |
| `player.js` | Moves the avatar (`avatar.js`) around: spawns at (0.5, ground, 4.0) in front of the signpost, `WALK_SPEED` 3 m/s, turns smoothly, smooths step heights, and passes its speed to `avatar.update`. Click-to-walk (clicks only count on `WALKABLE` meshes). Each walk plans a route first: A* over a 0.5 m grid (`findRoute`), where a step is allowed if wall rays (knee/waist/chest) hit nothing, the ground is within `STEP_UP`/`MAX_DROP`, and there's headroom. Ground and headroom use triangles binned by x/z (`binTriangles`) instead of raycasts, for speed. `OBSTACLES` (trees, bushes, rocks, benches, lamps, signs) block but are never ground, and building surfaces only count as floor when near-flat. Building visits prefer the paths (`OFF_PATH_COST`, `PATH_SURFACES` = the `Path`/`Paving` materials); ground clicks take the shortest way. The walker then follows the checked route and its height samples exactly. `walkToDoor(section, cb)` walks to the door (`DOORS`, measured in each building mesh's local space) before the camera focuses, then turns to face straight out from the door (`faceYaw`), i.e. toward the close-up camera; `jumpToDoor` does the same. API (also `island.player` in dev): `walkTo(point, cb?)`, `walkToClick(hit)`, `walkToDoor`, `jumpToDoor`, `stop`, `play(clip, times)`, `idle`, `wave`, plus `object`/`hitBox`. Reduced motion: routes are still planned, but the person appears at the end straight away. |
| `ui.js` | Builds nav buttons + dialog panels from `SECTIONS` (title + render fn). Back button, Esc, focus return, hover label. Panels become bottom sheets at ≤700px (`NARROW_SCREEN`); there the nav becomes a bottom tab bar with icons (`NAV_ICONS`), which slides away while a sheet is open, and the camera/day-night buttons sit in the top corners. Sheets close with a downward swipe from the top of their scroll (`addSwipeToClose`, `SHEET_CLOSE_DRAG`/`SPEED`, `.panel.dragging`). DOM is built with the small `el()` helper. Each panel has `data-section`; All three are themed via `--section-accent/-tint` vars in `style.css` (header band, Nunito display font self-hosted in `src/fonts/`, staggered entrance via `--i`); the shared rules list both `[data-section]`s. Contact = café: awning-striped header with scalloped edge (CSS `mask`), airmail "postcard" email card with a copy button (on phones `placePostcard()` moves it above `.contact-intro` so it's above the fold), link rows. Projects = studio: navy "screen" header band (scanlines, LEDs, blinking cursor), numbered cards with Live site / Code buttons (`repo`/`live` in `content.js`, empty ones are left out), optional `featured` card and `status` line; on phones descriptions clamp to 3 lines with a "More" toggle shown only when the text is cut (`watchClamped`). `[data-goto]` buttons in panels navigate, `[data-back]` goes home. |
| `screens.js` | Puts projects on the Studio's two monitors: canvas-textured `MeshBasicMaterial` panels in front of the `Screen`-material boxes inside `StudioScreens` (left = `image` or a title card, right = a mini code editor of the tags). `show(index)` is called through `onPreviewProject` when a project card is hovered, focused or tapped; opening the panel resets it to the first card. Created after `createPlayer` so the walker never collides with the panels. |
| `intro.js` | Opening shot: `createIntro({ camera, player, interaction, greeting })` holds the camera on a close-up in front of the person (`CLOSE_UP_DISTANCE`, widened to `CLOSE_UP_MIN_WIDTH` on narrow screens) while they wave, then `releaseView` pulls back to the hero shot (`PULL_BACK_DURATION`, no arc). Any pointerdown/keydown/wheel skips to the pull-back. |
| `freecam.js` | The camera mode button, labelled with the current mode ("Locked" / "Look around"), (`#camera-btn`, top left, hidden while a panel is open) and the `L` key. Unlocked: OrbitControls rotate/zoom/pan on (ground-plane panning, `FREE_MIN_DISTANCE`, look-at point kept within `MAX_TARGET_RADIUS` via `controls.maxTargetRadius`), `body.free-look` swaps the hint and cursor. Locking calls `interaction.resetView()` to fly back to the hero shot. Sets `interaction.freeLook`, so Back returns to the pose you left from instead of the hero shot. |
| `night.js` | Day/night switch (`#theme-btn` in `#corner-buttons` top left, and the `N` key). Created right after `createStage`. Fades the sky (`sky.setNight()`), the hemisphere light and the sun (moonlight) between the day values read from `scene.js` and the `NIGHT` preset, and tints the unlit water overlays via `setWaterLight()` (`water.js`). The HTML side is `<html data-theme="night">`: `style.css` redefines its colour tokens (`--panel-bg`, `--raised`, `--card`…) and each panel's `--section-*` vars under `:root[data-theme='night']`. Saved in `localStorage` (`island-theme`); an inline script in `index.html` applies it before first paint. |
| `signs.js` | Hides the model's 3D sign text and adds canvas-texture panels with big bold text from `content.signs`. |
| `animations.js` | One `setupX(root)` per ambient effect, each returning `update(time, dt)` or null: café cup bob/spin around its bbox centre, waterfall (delegates to `water.js`). Skipped when `prefers-reduced-motion` is on. |
| `water.js` | Shader overlays for the stream/pool (streaks, white-water, rings) and the waterfall. The model's water has no UVs. |
| `style.css` | All styles. |
| `index.html` | Static shell: `#app` canvas container, `#loading`, `#model-notice`, `#nav`, `#back-btn`, `#hover-label`, `#panels`, skip link. |

### Click flow
Clicking a hotspot (building, signpost arrow, post box) or a nav button calls `visit(section)`. The person walks to the door (`player.walkToDoor`), then `interaction.focus(section)` opens the panel and flies the camera in. On phones (`NARROW_SCREEN`), nav buttons and `[data-goto]` links (`visit(section, { fromNav: true })`) skip the walk: `player.jumpToDoor` puts the person at the door and the panel opens at once; tapping a building still walks. Back, Esc or the close button calls `player.stop()` and then `interaction.goHome()`. Clicking non-hotspot geometry goes to `onMiss(hit)` → `player.walkToClick(hit)`, which ignores anything that isn't walkable.

The overview camera starts locked: OrbitControls has rotate, zoom and pan disabled so clicks are free for walking. `freecam.js` unlocks it; drags still never count as clicks, so walking works either way. Controls only update while `interaction.controlsActive`. `flyTo` flushes any leftover damping "coast" before a flight so it can't nudge the camera after landing.

## Adding things

- **Content:** edit `content.js` only. Project images go in `public/images/` and are referenced as `'images/x.png'`. The résumé is `public/resume/Alex_Resume.pdf` (path set in `contact.resume`).
- **New clickable object:** add it to `HOTSPOTS` in `interaction.js`, and to the placeholder in `loader.js` if it should work without the model.
- **New section:** add an entry to `LANDMARKS` (`scene.js`), `SECTIONS` + a render fn (`ui.js`), content (`content.js`), `DOORS` (`player.js`) and `HOTSPOTS`.
- **New ambient animation:** add a `setupX(root)` to `animations.js` that returns an updater or null, and include it in the `updaters` list.

## Known gaps / TODO

- `plain.html` (a recruiter-friendly plain version rendering `content.js`) was in the original spec (`WEB_PROJECT_PROMPT.md`) but doesn't exist yet.
- `content.js` is still mostly `TODO` placeholders.
- `AFrameHolds` (skill routes) isn't used yet.
- Not a git repo yet.
