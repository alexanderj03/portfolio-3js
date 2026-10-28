// ---------------------------------------------------------------------------
// player.js: the person who walks around the island.
// Click the ground and they walk there. Before setting off they plan a
// route around buildings, trees and the island's edge (an A* search over a
// grid), testing each step with rays against the island's meshes, then
// follow it. The body is the rigged character from avatar.js: this file
// moves and turns it, and avatar.js plays its Walk / Idle / Wave clips.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { findObject, nameMatches } from './loader.js';
import { LANDMARKS, PLAZA_POSITION } from './scene.js';

// Where the person starts: on the plaza just in front of the signpost
// (0.5, 4.0), facing the camera.
const SPAWN = [PLAZA_POSITION[0], PLAZA_POSITION[2] + 2]; // x, z

// Metres per second. The avatar's Walk clip was animated for 1.4 (a calm
// stroll), which made visits feel slow; avatar.js speeds the clip up to
// match whatever this is (about 2x at 3), so the feet don't slide.
const WALK_SPEED = 3;
const TURN_SPEED = 12; // how quickly they turn to face where they're going
const RADIUS = 0.3; // how close to a wall they can get
const STEP_UP = 0.45; // tallest ledge they can step onto
const MAX_DROP = 1.0; // furthest they'll step down; more than this = edge of the island
// Knee, waist and chest height (above the feet). The waist one catches
// counters and tables (e.g. the pizza oven stand) that the others pass under or over.
const WALL_RAY_HEIGHTS = [STEP_UP + 0.1, 1.0, 1.5];
// Nothing may hang lower than this over where they stand. (They're about
// 1.8 m; going higher would rule out the café door, under its awning.)
const HEADROOM = 1.7;

// Route finding: the island is treated as a grid of square cells, and the
// person searches for a chain of cells they can step between (the "A*"
// search), so they walk around buildings instead of into them.
const CELL = 0.5; // metres per grid cell
const MAX_SEARCH = 2000; // cells to try before settling for the closest spot found (real routes need a few hundred)
// Walking to a building sticks to the paths: every metre off them counts as
// this many metres on them, so the route only leaves the path near the
// start and the door. (Clicking the ground takes the shortest way instead.)
const OFF_PATH_COST = 3;
const PATH_SURFACES = ['Path', 'Paving']; // material names of the paths in the model

// Before the camera zooms in on a building, the person walks to its door and
// stops just in front of it. The doors were measured from the Blender model,
// in the building mesh's own coordinates (metres, front = +Z): `x` is the
// middle of the door and `z` its front face. Each one has a little step in
// front, centred on the same `x`. If the mesh isn't found (e.g. on the
// placeholder island) they stop in front of the middle of the building instead.
const DOORS = {
  about: { mesh: 'AFrame', x: -0.78, z: 1.6 }, // the purple door under the glass gable
  projects: { mesh: 'Studio', x: 2.25, z: 1.5 }, // right of the big window
  contact: { mesh: 'Cafe', x: 1.45, z: 0.94 }, // the glass-panel door right of the serving hatch
};
const DOOR_DISTANCE = 0.7; // metres in front of the door

// Meshes the person walks straight through (not walls and not ground).
// Water isn't ground either, so they wade through the stream on its bed.
const NOT_SOLID = ['Island_Water', 'Island_Waterfall', 'Flowers', 'LampGlow', 'PizzaOven_Fire'];
// Things that block the way but are never stood on (no stepping up onto a
// bush top, a bench or a signpost's plinth).
const OBSTACLES = ['Bush', 'GumTree', 'GumTreeTall', 'Jacaranda', 'Lamp', 'Bench', 'RockA', 'RockB', 'Signpost', 'Sign_Welcome'];
// The ground itself. Hills and kerbs are handled by stepping up and down,
// so these never block the way like a wall would.
const TERRAIN = ['Island_Top', 'Island_Stones', 'Island_RockPool', 'Island_Cliffs', 'Island_Underside'];
// What you can click to walk to: the grass, paths and paving. Clicks on
// water, buildings, trees, the cliffs or the sky are ignored.
const WALKABLE = ['Island_Top', 'Island_Stones', 'Island_RockPool'];
const NOT_WALKABLE_MATERIALS = ['PondBed']; // part of Island_Top, under the water

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// `root` is the island; `avatar` is the body, from loadAvatar() in avatar.js.
// The body is in `scene` (not in the island), so clicking on them never
// counts as clicking a building, and they never collide with themselves.
export function createPlayer(scene, root, avatar) {
  const body = avatar.object;

  // --- Collision meshes --------------------------------------------------
  const ground = []; // meshes you can stand on (the island, plus building decks and steps)
  const walls = []; // meshes that block the way
  root.updateWorldMatrix(true, true);
  root.traverse((mesh) => {
    if (!mesh.isMesh || !isShown(mesh) || hasAncestorNamed(mesh, NOT_SOLID)) return;
    if (!hasAncestorNamed(mesh, OBSTACLES)) ground.push(mesh);
    if (!hasAncestorNamed(mesh, TERRAIN)) walls.push(mesh);
  });
  // Each wall's bounding box, so a ray only tests the walls whose box it
  // actually passes through. (Route finding tests thousands of steps.)
  const wallBoxes = walls.map((mesh) => new THREE.Box3().setFromObject(mesh));
  // Triangles sorted by where they are seen from above (see binTriangles):
  // the floor ones for ground heights, and anything not vertical on the walls
  // for headroom (bench seats, counter tops, signboards...). On buildings only
  // near-flat surfaces count as floor (decks, steps), never a sloping roof:
  // walked across at an angle, the cabin's roof is a gentle enough ramp.
  const isWall = new Set(walls);
  const floorBins = binTriangles(ground, (n, mesh) => n.y > (isWall.has(mesh) ? BUILDING_FLOOR_MIN_NORMAL_Y : FLOOR_MIN_NORMAL_Y));
  const overheadBins = binTriangles(walls, (n) => Math.abs(n.y) > 0.05);
  // Middle of the body plus four points around its edge, for the headroom check.
  const BODY_POINTS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => [x * RADIUS, z * RADIUS]);

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const boxHit = new THREE.Vector3();
  const sweep = new THREE.Box3();

  // Height of the ground below (x, z), looking down from `fromY` at most
  // `far` metres. Returns null if there's nothing there (off the edge).
  // Same answer as casting a ray straight down, but much quicker: it only
  // checks the floor triangles sorted into this spot's square of the grid.
  function groundAt(x, z, fromY, far) {
    let highest = null;
    for (const triangle of floorBins.get(binKey(x, z)) ?? []) {
      const y = heightOnTriangle(triangle, x, z);
      if (y != null && y <= fromY && y >= fromY - far && (highest == null || y > highest)) highest = y;
    }
    return highest;
  }

  // How much a metre of walking at (x, z) counts for, with the ground at
  // height `y`: 1 on the paths, OFF_PATH_COST anywhere else.
  function walkCost(x, z, y) {
    for (const triangle of floorBins.get(binKey(x, z)) ?? []) {
      const h = heightOnTriangle(triangle, x, z);
      if (h != null && Math.abs(h - y) < 1e-4) {
        const material = triangle[9];
        return PATH_SURFACES.some((m) => material.startsWith(m)) ? 1 : OFF_PATH_COST;
      }
    }
    return OFF_PATH_COST;
  }

  // True if nothing hangs over the body at (x, z) between knee and head
  // height, so they can stand there. The wall rays can slip between a bench's
  // legs or under a counter top; this stops them squeezing in underneath.
  function hasHeadroom(x, z, feetY) {
    for (const [ox, oz] of BODY_POINTS) {
      for (const triangle of overheadBins.get(binKey(x + ox, z + oz)) ?? []) {
        const y = heightOnTriangle(triangle, x + ox, z + oz);
        if (y != null && y > feetY + STEP_UP && y < feetY + HEADROOM) return false;
      }
    }
    return true;
  }

  // Casts a few rays from the person's body in the direction of `step`
  // (left side, middle, right side, at knee, waist and chest height) and
  // returns true if any of them hits something within reach.
  // Walls hidden from the camera (e.g. the signpost while looking at the
  // studio) still count: they're out of sight, not gone.
  function hitWall(from, step) {
    const length = step.length();
    const dir = step.clone().divideScalar(length);
    const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(RADIUS * 0.7);
    const far = length + RADIUS;
    raycaster.far = far;
    // First a quick pass: only walls whose box overlaps the space all the
    // rays sweep through (from knee to chest height, a body's width across).
    sweep.makeEmpty().expandByPoint(from).expandByPoint(origin.copy(from).addScaledVector(dir, far));
    sweep.expandByVector(origin.set(RADIUS, 0, RADIUS));
    sweep.min.y = from.y + WALL_RAY_HEIGHTS[0];
    sweep.max.y = from.y + WALL_RAY_HEIGHTS[WALL_RAY_HEIGHTS.length - 1];
    const nearby = [];
    walls.forEach((mesh, i) => wallBoxes[i].intersectsBox(sweep) && nearby.push(i));
    if (!nearby.length) return false;

    for (const height of WALL_RAY_HEIGHTS) {
      for (const s of [-1, 0, 1]) {
        origin.copy(from).addScaledVector(side, s);
        origin.y += height;
        raycaster.set(origin, dir);
        // Then per ray: only walls whose box it passes through within reach.
        // (A ray that starts inside a box counts too: it can hit what's in there.)
        const near = [];
        for (const i of nearby) {
          const box = wallBoxes[i];
          const crosses = box.containsPoint(origin) || (raycaster.ray.intersectBox(box, boxHit) && boxHit.distanceTo(origin) <= far);
          if (crosses) near.push(walls[i]);
        }
        if (near.length && raycaster.intersectObjects(near, false).length) return true;
      }
    }
    return false;
  }

  // --- Route finding ------------------------------------------------------
  // Ground height after one straight step from `from` (feet) to (x, z), or
  // null if a wall, something overhead or the island's edge is in the way.
  function stepTo(from, x, z) {
    const step = new THREE.Vector3(x - from.x, 0, z - from.z);
    if (step.lengthSq() > 1e-8 && hitWall(from, step)) return null;
    const y = groundAt(x, z, from.y + STEP_UP, STEP_UP + MAX_DROP);
    return y == null || !hasHeadroom(x, z, y) ? null : y;
  }

  // Walks a straight line from `a` to `b` in small steps. Returns its length
  // (counting off-path metres extra if `preferPaths`), or Infinity if
  // something's in the way.
  function lineCost(a, b, preferPaths) {
    const steps = Math.ceil(flatDistance(a, b) / CELL);
    const stepLength = flatDistance(a, b) / steps;
    const at = a.clone();
    let cost = 0;
    for (let i = 1; i <= steps; i++) {
      const x = THREE.MathUtils.lerp(a.x, b.x, i / steps);
      const z = THREE.MathUtils.lerp(a.z, b.z, i / steps);
      const y = stepTo(at, x, z);
      if (y == null) return Infinity;
      cost += stepLength * (preferPaths ? walkCost(x, z, y) : 1);
      at.set(x, y, z);
    }
    return cost;
  }

  // Results of steps between grid cells, kept between searches since the
  // island never changes. "fromCell>toCell" -> ground height, or null if blocked.
  const stepCache = new Map();
  const cellKey = (ix, iz) => `${ix},${iz}`;

  // The cells next to `node` (plus the goal itself once it's close), as
  // [key, x, z]. The start isn't on the grid, so its "neighbours" are the
  // cells around it, including the one it's in.
  function neighbours(node, goal) {
    const list = [];
    const cx = Math.round(node.point.x / CELL);
    const cz = Math.round(node.point.z / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0 && node.key !== 'start') continue;
        list.push([cellKey(cx + dx, cz + dz), (cx + dx) * CELL, (cz + dz) * CELL]);
      }
    }
    if (flatDistance(node.point, goal) <= CELL * 1.5) list.push(['goal', goal.x, goal.z]);
    return list;
  }

  // Finds a way from `start` to `goal` around buildings, trees and the
  // island's edge. Returns the corners to walk through, ending at the goal.
  // If the goal can't be reached, the route ends at the closest spot that can.
  // `preferPaths`: stay on the paths where possible (see OFF_PATH_COST).
  // `escape`: let the very first step ignore walls, for when they're somehow
  // boxed in where they stand (better to step out through a bench than be stuck).
  function findRoute(start, goal, { preferPaths = false, escape = false } = {}) {
    if (!preferPaths && !escape && lineCost(start, goal, false) < Infinity) return [goal.clone()];

    // A* search. Each node remembers the node it was reached from and the
    // distance walked so far (`g`, with off-path metres counting extra if
    // `preferPaths`). The search always continues from the node with the
    // smallest `g` + straight-line distance still to go, so it heads for the
    // goal first and only spreads out when something's in the way.
    const nodes = new Map(); // key -> { key, point, g, from, done }
    const open = createHeap(); // nodes waiting to be explored, as { node, f }
    const first = { key: 'start', point: start.clone(), g: 0, from: null, done: false };
    nodes.set(first.key, first);
    open.push({ node: first, f: flatDistance(start, goal) });
    let best = first; // closest to the goal so far
    let searched = 0;

    while (open.size && searched < MAX_SEARCH) {
      const node = open.pop().node;
      if (node.done) continue; // already explored via a shorter way
      node.done = true;
      searched++;
      if (node.key === 'goal' || flatDistance(node.point, goal) < flatDistance(best.point, goal)) best = node;
      if (node.key === 'goal') break;

      for (const [key, x, z] of neighbours(node, goal)) {
        let next = nodes.get(key);
        if (next?.done) continue;
        // Steps between two grid cells are remembered; ones to or from the
        // exact start/goal points are worked out every time.
        let y;
        const cacheable = node.key !== 'start' && key !== 'goal';
        const stepKey = `${node.key}>${key}`;
        if (escape && node.key === 'start') y = groundAt(x, z, start.y + STEP_UP, STEP_UP + MAX_DROP);
        else if (cacheable && stepCache.has(stepKey)) y = stepCache.get(stepKey);
        else {
          y = stepTo(node.point, x, z);
          if (cacheable) stepCache.set(stepKey, y);
        }
        if (y == null) continue;

        const g = node.g + Math.hypot(x - node.point.x, z - node.point.z) * (preferPaths ? walkCost(x, z, y) : 1);
        if (next && g >= next.g) continue;
        if (!next) {
          next = { key, point: new THREE.Vector3(x, y, z), done: false };
          nodes.set(key, next);
        }
        next.point.y = y;
        next.g = g;
        next.from = node;
        open.push({ node: next, f: g + Math.hypot(goal.x - x, goal.z - z) });
      }
    }

    // Couldn't take a single step? Try again, stepping out of whatever they're in.
    if (best === first && !escape) return findRoute(start, goal, { preferPaths, escape: true });

    // Follow the `from` links back to the start to get the route.
    const route = [];
    for (let n = best; n.from; n = n.from) route.unshift(n);
    if (escape) return route.map((n) => n.point);
    return smoothRoute(first, route, preferPaths);
  }

  // Grid routes zig-zag in 45° steps. Skip any corner where a straight line
  // to a later one is clear, so the person cuts across open ground. With
  // `preferPaths`, only if the shortcut doesn't count for more than the way
  // round (so it won't cut a bend in the path across the grass).
  function smoothRoute(first, route, preferPaths) {
    // Drop the points in the middle of straight runs first (cheap), so there
    // are fewer lines to check.
    const corners = route.filter((n, i) => {
      if (i === 0 || i === route.length - 1) return true;
      const [a, p, b] = [route[i - 1].point, n.point, route[i + 1].point];
      return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 1e-6;
    });
    const fine = (from, to) => lineCost(from.point, to.point, preferPaths) <= (preferPaths ? to.g - from.g + 1e-6 : Infinity);
    const result = [];
    let from = first;
    for (let i = 0; i < corners.length; ) {
      let j = i;
      while (j + 1 < corners.length && fine(from, corners[j + 1])) j++;
      result.push(corners[j].point);
      from = corners[j];
      i = j + 1;
    }
    return result;
  }

  // Splits the route's straight lines into CELL-long steps and works out the
  // ground height at each, the same way findRoute() checked them. The walker
  // follows these heights rather than looking for the ground as it goes,
  // which could have it step up onto a bush top and keep climbing.
  function withHeights(start, corners) {
    const points = [];
    let from = start;
    for (const corner of corners) {
      const steps = Math.ceil(flatDistance(from, corner) / CELL);
      let y = from.y;
      for (let i = 1; i <= steps; i++) {
        const x = THREE.MathUtils.lerp(from.x, corner.x, i / steps);
        const z = THREE.MathUtils.lerp(from.z, corner.z, i / steps);
        // (If there's no ground in reach, which the route check rules out
        // except when escaping, drop to whatever is below rather than float.)
        y = groundAt(x, z, y + STEP_UP, STEP_UP + MAX_DROP) ?? groundAt(x, z, y + STEP_UP, 30) ?? y;
        points.push(new THREE.Vector3(x, y, z));
      }
      if (steps) from = points[points.length - 1];
    }
    return points;
  }

  // --- State --------------------------------------------------------------
  // `position` is where the feet are. The visible body follows it, with the
  // height smoothed so steps up and down don't look jerky.
  const position = new THREE.Vector3(SPAWN[0], 0, SPAWN[1]);
  position.y = groundAt(position.x, position.z, 30, 60) ?? PLAZA_POSITION[1];
  body.position.copy(position);
  let yaw = 0; // which way they face (0 = +Z, toward the hero camera)
  let targetYaw = 0;
  let target = null; // where they're walking to (a Vector3), or null
  let route = []; // points still to walk through on the way (with ground heights), ending at `target`
  let lastPoint = null; // the route point they've just passed (or where they set off)
  let onArrive = null; // called when they get there (used for building visits)
  let faceOnArrive = null; // direction (yaw) to turn to on arrival, e.g. out from a building's door

  const doors = {}; // section -> { point, center, faceYaw }
  for (const section of Object.keys(LANDMARKS)) {
    const door = findDoor(root, section);
    if (!door) continue;
    // Look for the ground from just above the doorstep, not from the sky:
    // the spot is under the café awning and the studio's roof overhang.
    door.point.y = groundAt(door.point.x, door.point.z, door.point.y + 1, 2) ?? door.point.y;
    // Which way to face at the door: straight out from it, along the
    // building's front. That's where the camera is when it zooms in on the
    // building, so they end up facing the camera rather than the door.
    door.faceYaw = Math.atan2(door.point.x - door.center.x, door.point.z - door.center.z);
    doors[section] = door;
  }

  // A ring on the ground showing where you clicked.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.34, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }),
  );
  marker.visible = false;
  scene.add(marker);

  // Called with a raycaster hit from a click. If it's on the island's ground,
  // start walking there. Returns true if they're on their way.
  function walkToClick(hit) {
    const material = hit.object.material?.name ?? '';
    const flat = normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > 0.5;
    if (!flat || !hasAncestorNamed(hit.object, WALKABLE) || NOT_WALKABLE_MATERIALS.some((m) => material.startsWith(m))) {
      return false;
    }
    setTarget(hit.point);
    return true;
  }

  // Walk to any point (a THREE.Vector3), around whatever's in the way. For
  // calling from other code, e.g. `island.player.walkTo(new THREE.Vector3(3, 0, 2))`
  // in the console. The height doesn't matter: they stay on the ground.
  // `arrived` (optional) is called when they get there.
  function walkTo(point, arrived = null) {
    setTarget(point);
    onArrive = arrived;
  }

  // Walk to a building's door, then call `arrived()` (which zooms the camera
  // in). It's called even if the door can't be reached (they stop as close
  // as they can get), so the visit always happens.
  function walkToDoor(section, arrived) {
    const door = doors[section];
    if (!door) {
      arrived();
      return;
    }
    setTarget(door.point, { preferPaths: true });
    onArrive = arrived;
    faceOnArrive = door.faceYaw;
  }

  // Put them straight at a building's door, facing the camera, with no walk. Used
  // when the phone tab bar opens a section, so the panel doesn't have to wait.
  function jumpToDoor(section) {
    stop();
    const door = doors[section];
    if (!door) return;
    position.copy(door.point);
    body.position.copy(position);
    yaw = targetYaw = door.faceYaw;
    body.rotation.y = yaw;
  }

  function setTarget(point, options) {
    stop();
    target = point.clone();
    route = withHeights(position, findRoute(position, target, options));
    lastPoint = position.clone();
    marker.position.copy(target).y += 0.03;
    marker.visible = true;
  }

  // Stop walking (without calling onArrive).
  function stop() {
    target = null;
    route = [];
    onArrive = null;
    faceOnArrive = null;
    marker.visible = false;
  }

  // Got there (or as close as they can get): turn to face the camera, if
  // it's a building visit, and run the callback.
  function arrive() {
    const callback = onArrive;
    if (faceOnArrive != null) targetYaw = faceOnArrive;
    stop();
    callback?.();
  }

  // Stop and play an animation clip from avatar.js (e.g. 'Wave') `times`
  // times, then go back to standing (Idle).
  function play(name, times) {
    stop();
    avatar.play(name, times);
  }

  // Called every frame. `time` (seconds) makes the click marker pulse.
  function update(dt, time) {
    let moved = 0;
    if (target && reduceMotion.matches) {
      // Reduced motion: no walking. They appear at the end of the route
      // straight away (still a spot they could have walked to).
      const end = route[route.length - 1] ?? position;
      if (flatDistance(position, end) > 1e-6) targetYaw = Math.atan2(end.x - position.x, end.z - position.z);
      position.copy(end);
      body.position.copy(end);
      route = [];
    }
    if (target) {
      // Walk along the route. findRoute() has already checked every part of
      // it for walls and edges, so they just follow it, point to point.
      let left = WALK_SPEED * dt; // distance to cover this frame
      while (route.length && left > 0) {
        const corner = route[0];
        const dx = corner.x - position.x;
        const dz = corner.z - position.z;
        const distance = Math.hypot(dx, dz);
        const step = Math.min(left, distance);
        if (distance > 1e-6) {
          position.x += (dx / distance) * step;
          position.z += (dz / distance) * step;
          targetYaw = Math.atan2(dx, dz); // face the way they're going
        }
        left -= step;
        moved += step;
        // Height: part-way between the last point and this one.
        const length = flatDistance(lastPoint, corner);
        const t = length > 1e-6 ? 1 - (distance - step) / length : 1;
        position.y = THREE.MathUtils.lerp(lastPoint.y, corner.y, THREE.MathUtils.clamp(t, 0, 1));
        if (step === distance) lastPoint = route.shift(); // reached this point
      }
      if (!route.length) arrive();
    }
    if (marker.visible) marker.scale.setScalar(1 + Math.sin(time * 6) * 0.08);

    // Turn smoothly toward the target direction (the short way round).
    // With reduced motion, turn all at once.
    const turn = THREE.MathUtils.euclideanModulo(targetYaw - yaw + Math.PI, Math.PI * 2) - Math.PI;
    yaw += turn * (reduceMotion.matches ? 1 : Math.min(1, TURN_SPEED * dt));
    body.rotation.y = yaw;

    // The body follows `position`, with the height smoothed so steps up and
    // down don't look jerky.
    body.position.x = position.x;
    body.position.z = position.z;
    body.position.y += (position.y - body.position.y) * Math.min(1, 15 * dt);

    // Plays the clips: Walk while moving, Idle when standing.
    avatar.update(dt, dt > 0 ? moved / dt : 0);
  }

  return {
    object: body, // the character (THREE.Object3D)
    hitBox: avatar.hitBox, // invisible box for hover/click rays
    position, // where the feet are (a THREE.Vector3; don't change it directly)
    update,
    walkTo, // walkTo(point, arrived?)
    walkToClick, // used by main.js for clicks on the ground
    walkToDoor,
    jumpToDoor,
    stop,
    play, // play('Wave'), play('Wave', 3)
    idle: () => play('Idle'),
    wave() {
      stop();
      avatar.wave(); // CLICK_WAVES times (avatar.js)
    },
  };
}

// Where to stand to visit a section's building (`point`, just in front of the
// door) and the middle of the door itself (`center`). Null if it's missing.
function findDoor(root, section) {
  const building = findObject(root, LANDMARKS[section].object);
  if (!building) return null;
  root.updateWorldMatrix(true, true);
  const door = DOORS[section];
  const mesh = door && findObject(building, door.mesh);
  if (mesh) {
    // y = 0 is the building's ground level; the exact height is found later.
    const center = mesh.localToWorld(new THREE.Vector3(door.x, 0, door.z));
    const point = mesh.localToWorld(new THREE.Vector3(door.x, 0, door.z + DOOR_DISTANCE));
    return { point, center };
  }
  // Fallback: measure in the building group's own coordinates, where the front is +Z.
  const box = localBox(building, building);
  const local = box.getCenter(new THREE.Vector3());
  const center = building.localToWorld(local.clone());
  const point = building.localToWorld(local.set(local.x, box.min.y, box.max.z + DOOR_DISTANCE));
  return { point, center };
}

// Bounding box of the meshes under `object`, in `space`'s local coordinates.
function localBox(space, object) {
  const box = new THREE.Box3();
  const toLocal = space.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  object.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData.isHighlight) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    matrix.multiplyMatrices(toLocal, mesh.matrixWorld);
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
  });
  return box;
}

// ---------------------------------------------------------------------------
// Fast lookups from above. Asking "how high is the ground here?" with a
// raycast tests every triangle of the big island meshes, and route finding
// asks thousands of times. So, once at the start, triangles are sorted into a
// grid of FLOOR_BIN-sized squares (by their outline seen from above), and a
// lookup only checks the few triangles in its square.
// ---------------------------------------------------------------------------
const FLOOR_BIN = 1; // metres
const FLOOR_MIN_NORMAL_Y = 0.3; // ground steeper than this (about 73°) is a wall, not floor
const BUILDING_FLOOR_MIN_NORMAL_Y = 0.95; // on buildings, steeper than about 18° isn't floor

function binKey(x, z) {
  return `${Math.floor(x / FLOOR_BIN)},${Math.floor(z / FLOOR_BIN)}`;
}

// Returns a Map from bin key to the triangles over that square, each as
// world-space corners plus its material's name
// [ax, ay, az, bx, by, bz, cx, cy, cz, material]. Only triangles
// whose facing direction (normal) passes `keep(normal, mesh)` are included.
function binTriangles(meshes, keep) {
  const bins = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      // Which way the triangle faces (from the order of its corners).
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      if (!keep(n, mesh)) continue;
      const triangle = [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, mesh.material.name];
      // Add it to every square its outline overlaps.
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / FLOOR_BIN);
      const x1 = Math.floor(Math.max(a.x, b.x, c.x) / FLOOR_BIN);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / FLOOR_BIN);
      const z1 = Math.floor(Math.max(a.z, b.z, c.z) / FLOOR_BIN);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const key = `${ix},${iz}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(triangle);
        }
      }
    }
  }
  return bins;
}

// Height of `triangle` at (x, z), or null if (x, z) isn't inside it when
// seen from above. Uses "barycentric" weights: how much each corner counts
// at that spot (all three between 0 and 1 means it's inside).
function heightOnTriangle([ax, ay, az, bx, by, bz, cx, cy, cz], x, z) {
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-12) return null; // seen edge-on from above
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
  const w = 1 - u - v;
  if (u < -1e-6 || v < -1e-6 || w < -1e-6) return null;
  return u * ay + v * by + w * cy;
}

// Distance between two points, ignoring height.
function flatDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

// A tiny "priority queue" for the route search: items go in with a score
// `f`, and pop() always takes out the one with the lowest score. It's a
// binary heap: an array kept arranged so each item scores no higher than the
// two items "below" it, which makes both push and pop quick.
function createHeap() {
  const items = [];
  const swap = (i, j) => ([items[i], items[j]] = [items[j], items[i]]);
  return {
    get size() {
      return items.length;
    },
    push(item) {
      items.push(item);
      // Bubble up while it scores lower than its parent.
      for (let i = items.length - 1; i > 0; ) {
        const parent = (i - 1) >> 1;
        if (items[parent].f <= items[i].f) break;
        swap(i, parent);
        i = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length) {
        // Put the last item at the top, then sink it below any lower-scoring child.
        items[0] = last;
        for (let i = 0; ; ) {
          const left = 2 * i + 1;
          const right = left + 1;
          let lowest = i;
          if (left < items.length && items[left].f < items[lowest].f) lowest = left;
          if (right < items.length && items[right].f < items[lowest].f) lowest = right;
          if (lowest === i) break;
          swap(i, lowest);
          i = lowest;
        }
      }
      return top;
    },
  };
}

// True if `object` or one of its parents has one of the given names.
function hasAncestorNamed(object, names) {
  for (let o = object; o; o = o.parent) {
    if (names.some((name) => nameMatches(o.name, name))) return true;
  }
  return false;
}

// True if `object` and all of its parents are visible.
function isShown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}
