import { defineConfig } from 'vite';

export default defineConfig({
    // Root directory is src/
    root: 'src',

    // Output to dist/ for production builds
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },

    // Dev server config
    server: {
        port: 5173,
        strictPort: true,
    },

    // Clear console on hot reload
    clearScreen: false,
});
