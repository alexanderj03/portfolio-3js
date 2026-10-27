// ---------------------------------------------------------------------------
// signs.js: big, bold, readable text on the welcome sign and signpost arrows.
//
// In the model the sign text is real 3D geometry, which is small and hard to
// read from a distance. Here we hide that text and put a flat panel on each
// face of each sign board instead, with the text drawn on it (big and bold)
// using an HTML canvas. The panel is painted the board's own colour and lit
// like the board, so it looks like the text was painted on the wood.
// The wording comes from `signs` in content.js.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { findObject } from './loader.js';
import { signs as signText } from './content.js';

// Which object in the model goes with which entry in content.js.
const SIGNS = [
  { object: 'Sign_Welcome', key: 'welcome' },
  { object: 'Signpost_About', key: 'about' },
  { object: 'Signpost_Projects', key: 'projects' },
  { object: 'Signpost_Contact', key: 'contact' },
];

// Tweak these to change the look.
const FONT = "800 100px 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const PIXELS_PER_METRE = 400; // texture sharpness
const MARGIN = 0.14; // empty border around the text, as a fraction of the board height
const OUTLINE = 0.09; // outline thickness, as a fraction of the font size (0 = none)

export function createSigns(root, renderer) {
  root.updateWorldMatrix(true, true);
  const anisotropy = renderer.capabilities.getMaxAnisotropy(); // keeps text sharp at an angle

  for (const sign of SIGNS) {
    const group = findObject(root, sign.object);
    const lines = signText[sign.key];
    if (!group || !lines) continue;

    // The sign is made of a board, a frame, a post and the text. Find them by
    // material name. (Names may end in ".001", so match the start.)
    const meshes = [];
    group.traverse((o) => o.isMesh && meshes.push(o));
    const board = meshes.find((m) => m.material.name.startsWith('SignBoard'));
    const text = meshes.find((m) => m.material.name.startsWith('SignText'));
    const frame = meshes.find((m) => m.material.name.startsWith('SignFrame'));
    if (!board) continue;

    const panels = makePanels(board, text, lines, {
      boardColor: '#' + board.material.color.getHexString(),
      textColor: '#' + (text?.material.color.getHexString() ?? 'ffffff'),
      outlineColor: '#' + (frame?.material.color.getHexString() ?? '000000'),
      roughness: board.material.roughness ?? 0.9,
      anisotropy,
    });
    // attach() keeps the panel where it is in the world while making it a child
    // of the sign, so hovering/clicking a signpost arrow still works.
    panels.forEach((panel) => group.attach(panel));
    if (text) text.visible = false; // hide the original small 3D text
  }
}

// Builds a text panel for the front and the back of `board`.
function makePanels(board, text, lines, style) {
  // 1. Work out which way the board faces: the normal (facing direction) of
  //    its biggest upright triangle.
  const normal = biggestUprightNormal(board);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();

  // 2. Measure the board (and the original text) along right / up / normal.
  const b = extents(board, right, up, normal);
  const t = text ? extents(text, right, up, normal) : b;

  // 3. Panel size. Signpost arrows are pointy at one end, so keep the panel
  //    centred where the original text was and only as wide as fits on both
  //    sides of that point.
  const height = b.up[1] - b.up[0];
  const margin = height * MARGIN;
  const centreRight = (t.right[0] + t.right[1]) / 2;
  const halfWidth = Math.min(centreRight - b.right[0], b.right[1] - centreRight) - margin;
  const panelW = halfWidth * 2;
  const panelH = height - margin * 2;
  const centreUp = (b.up[0] + b.up[1]) / 2;

  const texture = drawText(lines, panelW, panelH, style);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: style.roughness,
    metalness: 0,
    // Nudge it toward the camera so it never flickers against the board.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const geometry = new THREE.PlaneGeometry(panelW, panelH);

  // 4. One panel just in front of each face, both facing outward.
  const gap = 0.008; // metres
  return [
    { side: 1, depth: b.normal[1] + gap },
    { side: -1, depth: b.normal[0] - gap },
  ].map(({ side, depth }) => {
    const panel = new THREE.Mesh(geometry, material);
    panel.name = 'SignTextPanel';
    panel.receiveShadow = true;
    panel.position
      .copy(right).multiplyScalar(centreRight)
      .addScaledVector(up, centreUp)
      .addScaledVector(normal, depth);
    // Rotate the panel so its front faces `normal * side` and its text reads
    // left-to-right when you look at it.
    const facing = normal.clone().multiplyScalar(side);
    const panelRight = new THREE.Vector3().crossVectors(up, facing);
    panel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(panelRight, up, facing));
    return panel;
  });
}

// Draws the sign's lines on a canvas and returns it as a texture.
function drawText(lines, widthM, heightM, style) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthM * PIXELS_PER_METRE);
  canvas.height = Math.round(heightM * PIXELS_PER_METRE);
  const ctx = canvas.getContext('2d');

  // Background: the board's colour, so the panel blends into the wood.
  ctx.fillStyle = style.boardColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Every line except the last is drawn at 55% size (e.g. the small "Hi, I'm").
  const scales = lines.map((_, i) => (i === lines.length - 1 ? 1 : 0.55));
  const totalScale = scales.reduce((a, s) => a + s, 0);

  // Find the biggest font size that fits both the width and the height.
  ctx.font = FONT;
  const widest = Math.max(...lines.map((line, i) => ctx.measureText(line).width * scales[i]));
  const sizeForWidth = (canvas.width * 0.94) / (widest / 100);
  const sizeForHeight = (canvas.height * 0.9) / (totalScale * 1.05);
  const size = Math.min(sizeForWidth, sizeForHeight);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let y = (canvas.height - size * totalScale * 1.05) / 2;
  lines.forEach((line, i) => {
    const lineSize = size * scales[i];
    y += (lineSize * 1.05) / 2;
    ctx.font = FONT.replace('100px', `${lineSize}px`);
    // Dark outline first, then the light text on top: easier to read.
    if (OUTLINE > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = lineSize * OUTLINE;
      ctx.strokeText(line, canvas.width / 2, y);
    }
    ctx.fillStyle = style.textColor;
    ctx.fillText(line, canvas.width / 2, y);
    y += (lineSize * 1.05) / 2;
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // canvas colours are normal (sRGB) colours
  texture.anisotropy = style.anisotropy;
  return texture;
}

// Facing direction (horizontal) of the largest upright triangle in `mesh`.
function biggestUprightNormal(mesh) {
  const pos = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const count = index ? index.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const best = new THREE.Vector3(0, 0, 1);
  let bestArea = 0;
  for (let i = 0; i < count; i += 3) {
    const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
    n.crossVectors(b.sub(a), c.sub(a));
    const area = n.length();
    n.normalize();
    if (Math.abs(n.y) < 0.3 && area > bestArea) {
      bestArea = area;
      best.set(n.x, 0, n.z).normalize();
    }
  }
  return best;
}

// Min/max of the mesh's corners measured along three directions.
function extents(mesh, right, up, normal) {
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  const out = { right: [Infinity, -Infinity], up: [Infinity, -Infinity], normal: [Infinity, -Infinity] };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    for (const [key, dir] of [['right', right], ['up', up], ['normal', normal]]) {
      const d = v.dot(dir);
      out[key][0] = Math.min(out[key][0], d);
      out[key][1] = Math.max(out[key][1], d);
    }
  }
  return out;
}
