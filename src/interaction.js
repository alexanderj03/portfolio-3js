// ---------------------------------------------------------------------------
// interaction.js: figures out what's under the mouse/finger (raycasting),
// highlights buildings on hover, and flies the camera to a building on click.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { findObject, nameMatches } from './loader.js';
import { LANDMARKS, getHeroView } from './scene.js';

// Which named objects are clickable, and which section each one opens.
const HOTSPOTS = [
  { name: 'About', section: 'about' },
  { name: 'Signpost_About', section: 'about' },
  { name: 'Projects', section: 'projects' },
  { name: 'Signpost_Projects', section: 'projects' },
  { name: 'Contact', section: 'contact' },
  { name: 'Signpost_Contact', section: 'contact' },
  { name: 'PostBox', section: 'contact' },
];

// Glowing parts we never touch (you'll handle their lighting yourself).
const DO_NOT_TOUCH = ['LampGlow', 'PizzaOven_Fire'];

const FLY_DURATION = 1.2; // seconds
const FOCUS_ELEVATION = 22; // degrees above the horizon when looking at a building
// Straight-on views (landmarks with view: 'front'):
const FRONT_PADDING = 1.12; // 1 = building touches the edges; higher = more space around it
const FRONT_HEIGHT_OFFSET = 0.25; // camera height above the building's middle, as a fraction of its height
const CLICK_MAX_MOVE = 6; // pixels; moving more than this between press and release = drag, not click

// The highlight is a see-through copy of each mesh drawn on top of it with
// "additive" blending, which brightens it slightly. This way the model's own
// materials are never changed. Tweak colour/opacity to taste.
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: '#fff4d6',
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  // Pull the copy very slightly toward the camera so it doesn't flicker
  // ("z-fight") with the original surface.
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Optional hooks:
// `onSelect(section)`: a hotspot was clicked (default: fly there straight away).
// `onMiss(hit)`: something that isn't a hotspot was clicked, e.g. the ground.
//   `hit` is the raycaster hit (point, object, face).
export function createInteraction({ camera, controls, renderer, root, ui, labels, onSelect, onMiss }) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(); // mouse position in "normalised device coordinates" (-1..1)

  // --- Find the hotspot objects in the model ---------------------------
  // Map from a 3D object to the section it opens.
  const hotspotSection = new Map();
  for (const spot of HOTSPOTS) {
    const obj = findObject(root, spot.name);
    if (obj) hotspotSection.set(obj, spot.section);
    else console.warn(`[interaction] No object named "${spot.name}" found in the model.`);
  }
  // The building group for each section (what gets highlighted and framed).
  const buildings = {};
  for (const [section, mark] of Object.entries(LANDMARKS)) {
    buildings[section] = findObject(root, mark.object);
  }

  // Clickable things that aren't part of the island model (e.g. the avatar),
  // added with addClickable(). Map from object to { label, onClick }.
  const extras = new Map();
  const rayTargets = [root]; // what castRay() tests: the island plus the extras

  // Walks up from the mesh that was hit until it finds a hotspot.
  // Returns { section, object } for a building hotspot, { extra, object }
  // for an extra clickable, or null.
  function hotspotFromHit(object) {
    for (let o = object; o; o = o.parent) {
      if (hotspotSection.has(o)) return { section: hotspotSection.get(o), object: o };
      if (extras.has(o)) return { extra: extras.get(o), object: o };
    }
    return null;
  }

  // Shoots a ray from the camera through the pointer and returns the closest
  // visible hit (so you can't click through walls), or undefined.
  function castRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(rayTargets, true).find((h) => isShown(h.object));
  }

  // The hotspot under the pointer, or null.
  function pick(clientX, clientY) {
    const hit = castRay(clientX, clientY);
    return hit ? hotspotFromHit(hit.object) : null;
  }

  // --- Hover highlight --------------------------------------------------
  const overlays = new WeakMap(); // mesh -> its highlight copy
  let highlighted = []; // overlay meshes currently shown

  function isDoNotTouch(obj) {
    for (let o = obj; o; o = o.parent) {
      if (DO_NOT_TOUCH.some((name) => nameMatches(o.name, name))) return true;
    }
    return false;
  }

  // Creates (once) and returns highlight copies for every mesh under `object`.
  function overlaysFor(object) {
    const result = [];
    object.traverse((mesh) => {
      // Skip special mesh types (they'd need a matching special copy) and our own copies.
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return;
      if (mesh.userData.isHighlight || isDoNotTouch(mesh)) return;
      let overlay = overlays.get(mesh);
      if (!overlay) {
        overlay = new THREE.Mesh(mesh.geometry, highlightMaterial);
        overlay.name = 'HighlightOverlay';
        overlay.userData.isHighlight = true;
        overlay.raycast = () => {}; // invisible to the raycaster
        overlay.visible = false;
        overlays.set(mesh, overlay);
        mesh.add(overlay); // as a child it follows the mesh exactly
      }
      result.push(overlay);
    });
    return result;
  }

  function setHighlight(objects) {
    highlighted.forEach((o) => (o.visible = false));
    highlighted = objects.flatMap(overlaysFor);
    highlighted.forEach((o) => (o.visible = true));
  }

  let hovered = null; // { section, object } currently under the mouse
  let lastPointer = null; // latest mouse position, processed once per frame

  function updateHover() {
    if (!lastPointer || state === 'flying') return;
    const { x, y } = lastPointer;
    lastPointer = null;
    const hit = pick(x, y);
    const changed = hit?.object !== hovered?.object;
    hovered = hit;
    if (hit) {
      if (changed && hit.extra) {
        // Extras get the cursor and label but no glow: the highlight copy
        // wouldn't follow an animated (skinned) mesh like the avatar.
        setHighlight([]);
      } else if (changed) {
        // Highlight the building, plus the arrow/post box if that's what was hovered.
        const building = buildings[hit.section];
        setHighlight(building && building !== hit.object ? [building, hit.object] : [hit.object]);
      }
      canvas.style.cursor = 'pointer';
      ui.showLabel(hit.extra ? hit.extra.label : labels[hit.section], x, y);
    } else if (changed) {
      clearHover();
    }
  }

  function clearHover() {
    hovered = null;
    setHighlight([]);
    canvas.style.cursor = '';
    ui.hideLabel();
  }

  // --- Pointer events ---------------------------------------------------
  let downAt = null;

  canvas.addEventListener('pointermove', (e) => {
    // Touch screens have no hover, so only mice/pens get the highlight.
    if (e.pointerType !== 'touch') lastPointer = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerleave', clearHover);
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > CLICK_MAX_MOVE || state === 'flying') return; // it was a drag
    const hit = castRay(e.clientX, e.clientY);
    const spot = hit && hotspotFromHit(hit.object);
    if (spot?.extra) spot.extra.onClick();
    else if (spot) (onSelect ?? focus)(spot.section);
    else if (hit) onMiss?.(hit);
  });

  // --- Camera flights ---------------------------------------------------
  let state = 'home'; // 'home' | 'flying' | 'focused' | 'held' (the opening close-up, see holdView)
  let focusedSection = null;
  let flight = null;
  let freeLook = false; // camera unlocked? (set by freecam.js)
  let leftHomeFrom = null; // { position, target } of the overview before the last flight
  const lookTarget = new THREE.Vector3().copy(controls.target);
  // How far the picture is slid sideways/upward (as a fraction of the screen
  // size) to make room for the panel. See applyViewShift().
  const viewShift = new THREE.Vector2(0, 0);

  // Slides the whole picture without turning the camera, using
  // camera.setViewOffset(): it renders as if the screen were a window cut out
  // of a bigger image, moved right by x and down by y. Moving the window right
  // makes the scene appear further left (away from a side panel); moving it
  // down makes the scene appear higher (above a bottom sheet).
  function applyViewShift(shift) {
    viewShift.copy(shift);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (shift.x === 0 && shift.y === 0) camera.clearViewOffset();
    else camera.setViewOffset(w, h, shift.x * w, shift.y * h, w, h);
  }

  // Starts a smooth camera move to `view` ({ position, target, shift }).
  // `onDone` runs when it arrives. `duration` is in seconds; `arc: false`
  // flies in a straight line instead of lifting over the island.
  function flyTo(view, onDone, { duration = FLY_DURATION, arc = true } = {}) {
    if (reduceMotion.matches) duration = 0;
    if (state === 'home') {
      // A drag that's still "coasting" (damping) would carry on after the
      // flight and nudge the camera off its spot. One update without damping
      // finishes the coast right now, before the flight starts from here.
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = damping;
      lookTarget.copy(controls.target);
      // Remember where the overview camera was, so with the camera unlocked
      // "Back" returns there instead of to the hero shot.
      leftHomeFrom = { position: camera.position.clone(), target: controls.target.clone() };
    }
    const { position, target } = view;
    flight = {
      fromPos: camera.position.clone(),
      toPos: position.clone(),
      fromTarget: lookTarget.clone(),
      toTarget: target.clone(),
      fromShift: viewShift.clone(),
      toShift: view.shift.clone(),
      hide: view.hide ?? [],
      halfwayDone: false,
      // Lift the camera a little mid-flight so it arcs over the island.
      lift: arc ? camera.position.distanceTo(position) * 0.12 : 0,
      elapsed: 0,
      duration,
      onDone,
    };
    state = 'flying';
    controls.enabled = false;
    clearHover();
  }

  // Called every frame from main.js.
  function update(dt) {
    updateHover();
    if (!flight) return;

    flight.elapsed += dt;
    const t = flight.duration > 0 ? Math.min(flight.elapsed / flight.duration, 1) : 1;
    const e = easeInOutCubic(t);

    camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
    camera.position.y += Math.sin(Math.PI * e) * flight.lift;
    lookTarget.lerpVectors(flight.fromTarget, flight.toTarget, e);
    camera.lookAt(lookTarget);
    applyViewShift(new THREE.Vector2().lerpVectors(flight.fromShift, flight.toShift, e));

    // Half-way, swap which objects are hidden: by then the camera has passed
    // (or hasn't yet reached) the things that would block the view.
    if (!flight.halfwayDone && t >= 0.5) {
      flight.halfwayDone = true;
      setHidden(flight.hide);
    }

    if (t >= 1) {
      const done = flight.onDone;
      flight = null;
      done();
    }
  }

  // Objects hidden because they'd block the current view (see hideWhileFocused).
  let hiddenObjects = [];
  function setHidden(objects) {
    hiddenObjects.forEach((o) => (o.visible = true));
    hiddenObjects = objects;
    hiddenObjects.forEach((o) => (o.visible = false));
  }

  // Works out a nice camera position for looking at a building.
  function computeFocusView(section) {
    const mark = LANDMARKS[section];
    const view = mark.view === 'front' ? computeFrontView(section) : computeAngledView(section);
    view.hide = (mark.hideWhileFocused ?? []).map((name) => findObject(root, name)).filter(Boolean);
    return view;
  }

  // View from above at an angle, onto the building's front.
  function computeAngledView(section) {
    const mark = LANDMARKS[section];
    const sphere = new THREE.Sphere();
    const building = buildings[section];
    if (building) {
      new THREE.Box3().setFromObject(building).getBoundingSphere(sphere);
    } else {
      sphere.set(new THREE.Vector3().fromArray(mark.position).setY(3), 6);
    }
    const radius = THREE.MathUtils.clamp(sphere.radius, 4, 15);

    // The panel covers part of the screen; these are the covered fractions.
    const inset = ui.getPanelInset(); // { right: 0..1, bottom: 0..1 }

    // Distance so the building's bounding sphere fits in the uncovered area.
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const distance = THREE.MathUtils.clamp(
      Math.max(
        radius / Math.sin(vHalf) / (1 - inset.bottom),
        radius / Math.sin(hHalf) / (1 - inset.right),
      ),
      12,
      70,
    );

    // Buildings face +Z, rotated by their Y rotation. Look at the front, from a bit above.
    const yaw = THREE.MathUtils.degToRad(mark.rotationY);
    const pitch = THREE.MathUtils.degToRad(FOCUS_ELEVATION);
    const direction = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const position = sphere.center.clone().addScaledVector(direction, distance);

    // Shift where we look so the building sits in the middle of the uncovered
    // area: look further right to push the building left (side panel), or
    // further down to push it up (bottom sheet).
    const forward = direction.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const halfHeight = distance * Math.tan(vHalf);
    const target = sphere.center
      .clone()
      .addScaledVector(right, inset.right * halfHeight * camera.aspect)
      .addScaledVector(up, -inset.bottom * halfHeight);

    return { position, target, shift: new THREE.Vector2(0, 0) };
  }

  // Straight-on view: the camera sits directly in front of the building's
  // front wall and looks square at it, so the wall runs parallel to the screen.
  function computeFrontView(section) {
    const building = buildings[section];
    const up = new THREE.Vector3(0, 1, 0);

    // Which way the building faces, from its actual rotation in the scene:
    // buildings face +Z before rotation, so turn +Z by the building's world rotation.
    const front = new THREE.Vector3(0, 0, 1);
    if (building) {
      front.applyQuaternion(building.getWorldQuaternion(new THREE.Quaternion()));
    } else {
      front.applyAxisAngle(up, THREE.MathUtils.degToRad(LANDMARKS[section].rotationY));
    }
    front.setY(0).normalize();
    // "Right" as seen by someone standing in front of the building, facing it.
    const right = new THREE.Vector3().crossVectors(up, front);

    // Measure the building along its own right / up / front directions.
    const size = building ? measureAlong(building, right, up, front) : null;
    const r = size?.right ?? [-4, 4];
    const u = size?.up ?? [0, 6];
    const f = size?.front ?? [-3, 3];
    const width = r[1] - r[0];
    const height = u[1] - u[0];

    // Middle of the front face (horizontally centred, half-way up).
    const frontCentre = new THREE.Vector3()
      .addScaledVector(right, (r[0] + r[1]) / 2)
      .addScaledVector(up, (u[0] + u[1]) / 2)
      .addScaledVector(front, f[1]);

    // Distance at which the building (plus padding) just fits in the part of
    // the screen the panel doesn't cover. tan(half field of view) tells us how
    // wide/tall the view is per metre of distance.
    const inset = ui.getPanelInset(); // { right: 0..1, bottom: 0..1 }
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const distance = Math.max(
      ((width / 2) * FRONT_PADDING) / (tanH * (1 - inset.right)),
      ((height / 2) * FRONT_PADDING) / (tanV * (1 - inset.bottom)),
    );

    const position = frontCentre
      .clone()
      .addScaledVector(front, distance)
      .addScaledVector(up, height * FRONT_HEIGHT_OFFSET);

    // Slide the picture so the building is centred in the uncovered area,
    // without turning the camera (turning would put the wall at an angle).
    // Half the covered fraction puts it in the middle of what's left.
    const shift = new THREE.Vector2(inset.right / 2, inset.bottom / 2);

    return { position, target: frontCentre, shift };
  }

  // Fly to a building and open its panel.
  // If a flight is already under way, the new one simply starts from wherever
  // the camera is right now.
  function focus(section) {
    if (state !== 'home' && focusedSection === section) return;
    focusedSection = section;
    ui.openPanel(section); // open first so its size can be measured
    flyTo(computeFocusView(section), () => {
      state = 'focused';
    });
  }

  // Close panels and fly back to the starting view.
  // `returnFocus: false` is for switching sections: don't send keyboard focus
  // back to the old nav button, since another panel will open shortly.
  function goHome({ returnFocus = true } = {}) {
    if (state === 'home') return;
    focusedSection = null;
    ui.closePanels({ returnFocus });
    // Unlocked camera: go back to wherever you were looking from.
    const home = freeLook && leftHomeFrom
      ? { position: leftHomeFrom.position, target: leftHomeFrom.target, shift: new THREE.Vector2(0, 0) }
      : heroView();
    flyHome(home);
  }

  // Fly from the overview back to the hero shot, e.g. when the camera is
  // locked again after looking around. Panels aren't involved.
  function resetView() {
    if (state !== 'home') return; // goHome() will land on the hero shot anyway
    flyHome(heroView());
  }

  // The opening shot (intro.js): puts the camera at `view` ({ position,
  // target }) and keeps it there, with OrbitControls off, until
  // releaseView() flies it out to the hero shot. Opening a building or
  // pressing Back before then simply flies from the close-up instead.
  function holdView(view) {
    camera.position.copy(view.position);
    lookTarget.copy(view.target);
    camera.lookAt(lookTarget);
    state = 'held';
    controls.enabled = false;
  }

  // Ends holdView(): flies to the hero shot. `options` are flyTo()'s
  // ({ duration, arc }). Does nothing if the camera has already moved on.
  function releaseView(options) {
    if (state === 'held') flyHome(heroView(), options);
  }

  function heroView() {
    return { ...getHeroView(camera.aspect), shift: new THREE.Vector2(0, 0) };
  }

  // Fly to an overview `view` and hand the camera back to OrbitControls there.
  function flyHome(view, options) {
    flyTo(
      view,
      () => {
        state = 'home';
        controls.target.copy(view.target);
        controls.enabled = true;
        controls.update();
      },
      options,
    );
  }

  // Makes `object` (something outside the island, like the avatar) clickable:
  // hovering shows a pointer and `label`, clicking calls `onClick()`.
  function addClickable(object, { label, onClick }) {
    extras.set(object, { label, onClick });
    rayTargets.push(object);
  }

  // If the window changes size while looking at a building, re-frame it.
  function onResize() {
    if (state !== 'focused') {
      applyViewShift(viewShift); // keep the slide in step with the new size
      return;
    }
    const view = computeFocusView(focusedSection);
    camera.position.copy(view.position);
    lookTarget.copy(view.target);
    camera.lookAt(lookTarget);
    applyViewShift(view.shift);
  }

  return {
    update,
    focus,
    goHome,
    resetView,
    holdView,
    releaseView,
    onResize,
    addClickable,
    // True while the camera is unlocked for looking around (freecam.js).
    get freeLook() {
      return freeLook;
    },
    set freeLook(on) {
      freeLook = on;
    },
    // The building being looked at (or flown to), or null on the overview.
    get section() {
      return focusedSection;
    },
    // While flying or focused, main.js must not call controls.update().
    get controlsActive() {
      return state === 'home';
    },
  };
}

// True if `object` and all of its parents are visible.
function isShown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Min/max of all the corners of the meshes under `object`, measured along
// three directions. Returns { right: [min, max], up: [...], front: [...] }.
function measureAlong(object, right, up, front) {
  const out = { right: [Infinity, -Infinity], up: [Infinity, -Infinity], front: [Infinity, -Infinity] };
  const v = new THREE.Vector3();
  object.updateWorldMatrix(true, true);
  object.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData.isHighlight) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      for (const [key, dir] of [['right', right], ['up', up], ['front', front]]) {
        const d = v.dot(dir);
        out[key][0] = Math.min(out[key][0], d);
        out[key][1] = Math.max(out[key][1], d);
      }
    }
  });
  return out;
}

// Starts slow, speeds up, ends slow. t goes 0..1.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
