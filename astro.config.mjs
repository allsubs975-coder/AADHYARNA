// @ts-check
import { defineConfig } from 'astro/config';

// AADHYARNA — static site configuration.
// `site` (canonical base URL) is intentionally NOT set until the production
// domain is confirmed. See README > "Setting the production domain".
export default defineConfig({
  output: 'static',
  build: {
    format: 'directory', // generates /diamonds/<STONE-ID>/index.html
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  server: {
    port: 4321,
  },
});
