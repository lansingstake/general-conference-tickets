import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages under /repo-name/
// as well as at a domain root.
export default defineConfig({
  plugins: [react()],
  base: './',
});
