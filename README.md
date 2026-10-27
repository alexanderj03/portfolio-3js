# Floating island portfolio

My portfolio site, built as a small 3D world instead of a page. It's a
low-poly floating island that I modelled in Blender and render in the browser
with Three.js. You explore it by walking a little person around, and each
building on the island is a section of the portfolio.

## What you'll see

The island floats in the sky, with a stream that runs across it and spills off
the edge as a waterfall. A welcome sign at the plaza says "Hi, I'm Alexander",
and signposts point to three buildings:

- **The A-frame cabin: About.** Who I am, my experience as a timeline, my
  skills and hobbies. The cabin has a climbing wall on it, and there's a pizza
  oven out the front, because those are my hobbies.
- **The Studio: Projects.** Cards for the things I've built, each with links
  to the code and the live site. While you browse, the two monitors inside the
  studio show whichever project you're looking at: a screenshot or title card
  on the left and its tech stack as a little code editor on the right.
- **The Café: Contact.** Email (with a copy button), GitHub, LinkedIn and my
  résumé. The post box out the front leads here too.

Around them are gum trees, a jacaranda, benches, lamps, rocks, a rock pool and
a coffee cup that bobs and spins on the café.

## How it works

- **Click the ground** and the person walks there. Each walk is planned with
  A* pathfinding over the model's own geometry, so they go around trees,
  benches and buildings, step up and down slopes, and prefer the paths.
- **Click a building, a signpost or the post box** (or use the nav buttons).
  The person walks to its door, the camera flies in, and that section's panel
  opens. Back, Esc or the close button returns you to the island.
- **Look around** (the camera button, or `L`) unlocks the camera: drag to
  orbit, scroll to zoom and right-drag to slide.
- **Day / night** (the moon button, or `N`) fades the sky, light and water to
  a moonlit scene. Your choice is remembered.
- On phones, the panels become bottom sheets and the nav becomes a tab bar.
  With "reduce motion" switched on, the ambient animations are skipped.

The running water is drawn with custom GLSL shaders, the sign text is painted
onto canvas textures, and there's no framework: just Vite, vanilla JavaScript
and Three.js.

## Run it

Needs Node 18 or newer.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve dist/ locally
```

The build uses relative paths, so `dist/` can be hosted from a sub-folder
(e.g. GitHub Pages).

## Editing it

- **Text and links:** everything visitors read, on the panels and the 3D signs,
  lives in [`src/content.js`](src/content.js). Project images go in
  `public/images/`, and the résumé is `public/resume/Alex_Resume.pdf`.
- **The model:** `public/models/scene.glb`, exported from Blender (Draco
  compression is supported). If it's missing, a placeholder island with the
  same object names is shown, so walking, clicking and camera flights can
  still be tested.

## Where things are

| File | What it does |
|---|---|
| `src/content.js` | All the site's text and links |
| `src/main.js` | Wires everything together and runs the render loop |
| `src/scene.js` | Renderer, camera, lights, shadows, building positions |
| `src/loader.js` | Loads the glb, loading screen, placeholder island |
| `src/interaction.js` | Hover highlight, clicks, camera flights to buildings |
| `src/player.js` | The person: walk cycle, click-to-walk, route planning |
| `src/freecam.js` | The "look around" camera mode |
| `src/night.js` | Day / night switch |
| `src/screens.js` | Projects on the studio monitors |
| `src/signs.js` | Big, readable text on the signs |
| `src/water.js` | Running water on the stream and waterfall |
| `src/animations.js` | Coffee cup, waterfall |
| `src/ui.js` | Panels, nav, back button, hover label |
| `src/style.css` | All styles |

In dev, the browser console has a `window.island` object (`scene`, `camera`,
`controls`, `root`, `player`, `THREE`) for poking around.
