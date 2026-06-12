import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// In dev (vite dev), index.html loads test-utils.js / blocking-tests.js /
// integration-tests.js so the developer can call runBlockingTests() and
// runIntegrationTests() from the console. In production we don't want to
// ship ~120 KB of test runners, so strip those <script> tags during build.
const stripDevTestScripts = () => ({
    name: 'strip-dev-test-scripts',
    apply: 'build',
    transformIndexHtml(html) {
        return html.replace(
            /\s*<script src="\.\/(test-utils|blocking-tests|integration-tests)\.js"><\/script>/g,
            '',
        );
    },
});

export default defineConfig({
    plugins: [stripDevTestScripts()],

    // Root directory is src/
    root: 'src',

    // Output to dist/ for production builds. Two entry pages: index.html
    // (desktop + iOS) and android.html (Android-specific frontend).
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL('./src/index.html', import.meta.url)),
                android: fileURLToPath(new URL('./src/android.html', import.meta.url)),
            },
        },
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
