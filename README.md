# Nutrition Tracker

An offline-first personal tracker for calories, protein and body composition. The app is static and stores its data in IndexedDB on the current device.

## Use on iPhone

Open the published GitHub Pages address in Safari. Tap Share, then Add to Home Screen, and leave Open as Web App enabled if shown. Launch the app from its Home Screen icon. Load it once online so the service worker can cache the app before using it offline.

Start in Settings to add targets and saved foods. Today opens on the current tracking date, which changes at 04:00 by default. The date controls let you log or edit a previous day. Leave protein blank when you don't know it. The body composition check-in accepts weight and skeletal muscle mass in kg or lb, and body fat in percent. Switch between kg and lb in Today or Trends. Earlier skeletal muscle percentages remain in the original entries.

Export a JSON backup from Settings before clearing browser data or switching device. Importing a backup replaces the existing local records after confirmation. Devices do not synchronise automatically.

## Development

Serve the repository directory over localhost, for example with `python3 -m http.server 8000`, and open http://localhost:8000. Run `TZ=Europe/Helsinki node --test` from the repository root.

For GitHub Pages, select GitHub Actions in Settings → Pages and run the Deploy Nutrition Tracker workflow. The workflow tests the app and publishes the app files. Relative paths support the GitHub Pages project subdirectory. Update the service worker cache version when shipping asset changes. Keep personal backups outside the source tree.
