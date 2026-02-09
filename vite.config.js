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
        // Listen on all interfaces when developing for iOS physical devices
        host: process.env.TAURI_DEV_HOST || false,
    },

    // Clear console on hot reload
    clearScreen: false,
});
