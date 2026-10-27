import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built site also works from a sub-folder (e.g. GitHub Pages).
  base: './',
  optimizeDeps: {
    // Don't pre-bundle three.js in dev. DRACOLoader finds its decoder files
    // relative to its own location (three/examples/jsm/libs/draco/), and
    // pre-bundling moves the code so that lookup breaks.
    exclude: ['three'],
  },
  build: {
    // three.js alone is ~650 kB minified; that's expected, so don't warn about it.
    chunkSizeWarningLimit: 1000,
  },
});
