# Floating island portfolio

A low-poly island (Blender) shown with Three.js. Vite + vanilla JS.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve dist/ locally
```

Needs Node 18+ (Vite 6 is used because it still supports Node 20.18).

## Add the model

Put your file at **`public/models/scene.glb`** and reload. Until then a
placeholder island is shown, with blocks using the same object names, so
hover, click and camera flights can be tested.

Draco compression is already supported. Tick *Compression* in Blender's glTF
exporter and no code changes are needed.

## The little person

Click (or tap) anywhere on the island's grass or paths and the person walks
there. Clicks on water, buildings, trees or the sky are ignored. The overview
camera is fixed (no dragging or zooming); clicking a building still flies to it
and opens its panel.

## Where things are

| File | What it does |
|---|---|
| `src/content.js` | **All your text and links.** Edit this first. |
| `src/scene.js` | Renderer, fixed camera, lights, landmark positions |
| `src/loader.js` | Loads the glb (with Draco), loading screen, placeholder island |
| `src/interaction.js` | Hover highlight, click, camera fly-to |
| `src/player.js` | The person: body, walk cycle, click-to-walk, ground/wall collision |
| `src/animations.js` | Coffee cup bob/spin, waterfall |
| `src/water.js` | Running water on the stream and waterfall |
| `src/signs.js` | Big, bold text on the signs |
| `src/ui.js` | Panels, nav buttons, back button, hover label |
| `src/style.css` | All styles (panels become bottom sheets below 700px) |

In dev, the browser console has a `window.island` object (`scene`, `camera`,
`controls`, `root`, `player`, `THREE`) for poking around.
