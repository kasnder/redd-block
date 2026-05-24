import { defineConfig } from 'vite';

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
