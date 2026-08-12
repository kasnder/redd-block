# App-watcher fixture

`DigitalHabitsTestTarget.swift` is a visible, local-only AppKit application
for the macOS system-test app watcher. Build it with:

```bash
APP_WATCHER_FIXTURE_OUTPUT_DIR="$SYSTEM_TEST_ARTIFACTS_DIR/app-watcher-fixture" \
  e2e/fixtures/build-app-watcher-target.sh
```

The resulting executable is inside the `.app` bundle at:

```text
Digital Habits Test Target.app/Contents/MacOS/Digital Habits Test Target
```

The runner passes the exact executable path as
`APP_WATCHER_FIXTURE_BINARY`. `APP_WATCHER_FIXTURE_MODE=normal` accepts
AppKit's polite terminate request; `APP_WATCHER_FIXTURE_MODE=stubborn` logs
`POLITE_QUIT_IGNORED` and returns `.terminateCancel`, so the production
watcher's ten-second force-close path is exercised. The fixture is unsigned,
never installed in `/Applications`, and is cleaned up by the runner using the
exact PID returned by `spawn`.
