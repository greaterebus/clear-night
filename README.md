# Clear Night 🔭

One plain answer to one question: **is tonight good for astronomy?**

No hourly grids, no color-coded boxes. Just sentences like *"Good 2 AM – 5 AM."*
for tonight and the next two nights, plus a single quiet bar showing where the
good windows fall between dusk and dawn.

## How it decides

For each dark hour (sun more than 15° below the horizon), the hour counts as
**good** when all three pass the threshold:

| Metric        | Source   | Easygoing | Picky |
| ------------- | -------- | --------- | ----- |
| Cloud cover   | 7Timer!  | ≤ 3 (~31%) | ≤ 2 (~19%) |
| Seeing        | 7Timer!  | ≤ 5       | ≤ 3   |
| Transparency  | 7Timer!  | ≤ 6       | ≤ 4   |

Consecutive good hours merge into windows. If a bright moon (>55% lit) is up
during a window, you get a note — still great for the Moon and planets, less
so for faint fuzzies.

- **Weather data:** [7Timer!](https://www.7timer.info) ASTRO product — free,
  no API key, 72-hour forecast in 3-hour steps. Non-commercial use only.
- **Sun & moon:** computed in the browser with
  [SunCalc](https://github.com/mourner/suncalc). No API needed.

Tune the thresholds in `src/forecast.js` (`PRESETS`). The default location is
set in `src/App.jsx` (`DEFAULT_LOCATION`).

## Run it locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

This repo ships with a workflow that builds and publishes automatically.

1. Create a new repository on GitHub (any name works).
2. Push this code to it:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Source → GitHub Actions**.
4. Push (or re-run the workflow). Your app appears at
   `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

Every future push to `main` redeploys automatically.

## Honest caveats

Seeing is the hardest thing in meteorology to forecast — treat it as a
tendency, not a promise. 7Timer's API also occasionally returns malformed
JSON; the app retries automatically, but if you see "couldn't reach the
forecast service," it usually fixes itself in a few seconds.
