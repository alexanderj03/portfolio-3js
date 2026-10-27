// ---------------------------------------------------------------------------
// screens.js: shows your projects on the two monitors inside the Studio.
//
// The monitors in the model (StudioScreens, the cyan `Screen` material) are
// plain glowing boxes. Like signs.js, we don't change them: we put a flat
// panel just in front of each screen and draw on it with an HTML canvas.
//   - left monitor:  the project's screenshot (`image` in content.js), or a
//                    title card if it has none
//   - right monitor: a little "code editor" listing the project's tech tags
// Hovering, focusing or tapping a project card in the Projects panel calls
// `show(index)` to switch what's on screen (see ui.js and main.js).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { findObject } from './loader.js';
import { projects } from './content.js';

const BASE = import.meta.env.BASE_URL;

// Tweak these to change the look.
const CANVAS_WIDTH = 512; // texture width in pixels (height follows the screen's shape)
const RIM = 0.015; // metres of the model's cyan screen left showing around the panel, like a glow
const GAP = 0.004; // metres in front of the screen, so the panel never flickers against it
const COLORS = {
  navy: '#2b3f66', // Solar, the studio's main colour
  navyDark: '#1a2640',
  editor: '#1b2130',
  screen: '#7fd6ff', // Screen
  green: '#4dff9a', // LedGreen
  purple: '#b48cff', // LedPurple
  white: '#f4f7fb',
  dim: '#6f7d96',
};
const FONT_SANS = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "ui-monospace, Menlo, Consolas, 'Courier New', monospace";

export function createScreens(root) {
  // StudioScreens is a group holding the screens plus the LEDs and the pendant
  // lamp, so pick out the screens by their material. (Names may end in ".001".)
  let screenMesh = null;
  findObject(root, 'StudioScreens')?.traverse((o) => {
    if (!screenMesh && o.isMesh && o.material.name.startsWith('Screen')) screenMesh = o;
  });
  const building = findObject(root, 'Projects');
  // No model (placeholder island) or no monitors: do nothing, quietly.
  if (!screenMesh || !building) return { show() {} };

  root.updateWorldMatrix(true, true);

  // Which way the monitors face: the building's front (+Z before rotation),
  // flattened so "up" stays straight up.
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(building.getWorldQuaternion(new THREE.Quaternion()));
  normal.y = 0;
  normal.normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  // The two monitors are one mesh, so split it into its separate boxes, then
  // build a panel for each, left to right.
  const monitors = splitAlong(screenMesh, right, up, normal).map((box) => makePanel(box, right, up, normal));
  monitors.forEach((m) => screenMesh.parent.attach(m.mesh));
  const [left, rightMonitor] = monitors;

  // Each project's screenshot, once loaded (index -> HTMLImageElement).
  const images = new Map();
  let current = -1;

  function show(index) {
    const project = projects.items[index];
    if (!project || index === current) return;
    current = index;
    if (left) drawTitleOrImage(left, project, index, images.get(index));
    if (rightMonitor) drawCode(rightMonitor, project, index);

    // Load the screenshot the first time this project is shown, then redraw
    // if it's still the one on screen.
    if (left && project.image && !images.has(index)) {
      images.set(index, null); // "loading", so we only ask once
      const img = new Image();
      img.onload = () => {
        images.set(index, img);
        if (current === index) drawTitleOrImage(left, project, index, img);
      };
      img.src = BASE + project.image;
    }
  }

  show(0);
  return { show };
}

// ---------------------------------------------------------------------------
// Building the panels
// ---------------------------------------------------------------------------

// Splits the mesh into its separate boxes and returns each box's min/max
// along right / up / normal, ordered left to right.
// Corners belong to the same box if a triangle joins them, or if they sit at
// the same spot (each box face has its own copy of its corners).
function splitAlong(mesh, right, up, normal) {
  const pos = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;

  // "Union-find": every corner starts in its own group; join() merges groups.
  const parent = Array.from({ length: pos.count }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => (parent[find(a)] = find(b));

  const count = index ? index.count : pos.count;
  const corner = (i) => (index ? index.getX(i) : i);
  for (let i = 0; i < count; i += 3) {
    join(corner(i), corner(i + 1));
    join(corner(i), corner(i + 2));
  }
  const seen = new Map(); // rounded position -> first corner there
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(4)).join();
    if (seen.has(key)) join(i, seen.get(key));
    else seen.set(key, i);
  }

  // Measure each group in world space.
  const boxes = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const id = find(i);
    if (!boxes.has(id)) boxes.set(id, { right: [Infinity, -Infinity], up: [Infinity, -Infinity], normal: [Infinity, -Infinity] });
    const box = boxes.get(id);
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    for (const [key, dir] of [['right', right], ['up', up], ['normal', normal]]) {
      const d = v.dot(dir);
      box[key][0] = Math.min(box[key][0], d);
      box[key][1] = Math.max(box[key][1], d);
    }
  }
  return [...boxes.values()].sort((a, b) => a.right[0] - b.right[0]);
}

// A flat panel covering the front of one monitor, with its own canvas.
function makePanel(box, right, up, normal) {
  const width = box.right[1] - box.right[0] - RIM * 2;
  const height = box.up[1] - box.up[0] - RIM * 2;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.round((CANVAS_WIDTH * height) / width);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // canvas colours are normal (sRGB) colours

  // MeshBasicMaterial ignores the lights, so the picture glows like a real screen.
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = 'StudioScreenPanel';
  mesh.position
    .copy(right).multiplyScalar((box.right[0] + box.right[1]) / 2)
    .addScaledVector(up, (box.up[0] + box.up[1]) / 2)
    .addScaledVector(normal, box.normal[1] + GAP);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));

  return { mesh, canvas, ctx: canvas.getContext('2d'), texture };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// Left monitor: the screenshot, cropped to fill the screen, or a title card.
function drawTitleOrImage(monitor, project, index, image) {
  const { canvas, ctx } = monitor;
  const w = canvas.width;
  const h = canvas.height;

  if (image) {
    // "cover": scale so the image fills the screen, cropping the overflow.
    const scale = Math.max(w / image.width, h / image.height);
    const iw = image.width * scale;
    const ih = image.height * scale;
    ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
    monitor.texture.needsUpdate = true;
    return;
  }

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, COLORS.navy);
  bg.addColorStop(1, COLORS.navyDark);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  drawScanlines(ctx, w, h);

  const pad = w * 0.08;
  // "01" like the numbers on the cards.
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.purple;
  ctx.font = `700 ${Math.round(h * 0.1)}px ${FONT_MONO}`;
  ctx.fillText(projectNumber(index), pad, pad + h * 0.08);

  // The title, as big as fits on one line.
  ctx.fillStyle = COLORS.white;
  const size = fitFont(ctx, project.title, w - pad * 2, h * 0.24, (s) => `800 ${s}px ${FONT_SANS}`);
  ctx.font = `800 ${size}px ${FONT_SANS}`;
  const titleY = h * 0.6;
  ctx.fillText(project.title, pad, titleY);

  // Short cyan bar under the title, then the first few tags.
  ctx.fillStyle = COLORS.screen;
  ctx.fillRect(pad, titleY + h * 0.07, w * 0.12, h * 0.025);
  ctx.font = `600 ${Math.round(h * 0.075)}px ${FONT_SANS}`;
  ctx.fillText(project.tags.slice(0, 3).join(' · '), pad, h - pad * 0.9);

  monitor.texture.needsUpdate = true;
}

// Right monitor: a tiny code editor, with line numbers and colours.
function drawCode(monitor, project, index) {
  const { canvas, ctx } = monitor;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = COLORS.editor;
  ctx.fillRect(0, 0, w, h);

  // Each line is a list of [text, colour] pieces.
  const lines = [
    [[`// ${projectNumber(index)} ${project.title}`, COLORS.dim]],
    [['const ', COLORS.purple], ['stack', COLORS.white], [' = [', COLORS.white]],
    ...project.tags.slice(0, 5).map((tag) => [[`  '${tag}'`, COLORS.green], [',', COLORS.white]]),
    [['];', COLORS.white]],
    [['ship', COLORS.screen], ['(stack);', COLORS.white]],
  ];

  const lineHeight = h / (lines.length + 1.5);
  const fontSize = Math.round(lineHeight * 0.68);
  const gutter = fontSize * 2.4; // room for the line numbers
  ctx.font = `600 ${fontSize}px ${FONT_MONO}`;
  ctx.textBaseline = 'middle';

  lines.forEach((pieces, i) => {
    const y = lineHeight * (i + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(String(i + 1), gutter - fontSize * 0.8, y);
    ctx.textAlign = 'left';
    let x = gutter;
    for (const [text, color] of pieces) {
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width;
    }
  });
  // A blinking cursor would need redrawing every frame; a still one is enough.
  ctx.fillStyle = COLORS.screen;
  ctx.fillRect(gutter, lineHeight * (lines.length + 0.75), fontSize * 0.55, fontSize * 0.12);

  monitor.texture.needsUpdate = true;
}

// Faint horizontal lines, like the header band on the Projects panel.
function drawScanlines(ctx, w, h) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
}

// The biggest font size (up to `max`) at which `text` fits in `width`.
function fitFont(ctx, text, width, max, font) {
  ctx.font = font(100);
  return Math.min(max, (width / ctx.measureText(text).width) * 100);
}

// 0 -> "01"
function projectNumber(index) {
  return String(index + 1).padStart(2, '0');
}
