# Clear Night

Plain-language astronomy forecasting. One question: is tonight worth going out?

Live at **https://greaterebus.github.io/clear-night/**

---

## What it does

Fetches hourly cloud cover and visibility from [Open-Meteo](https://open-meteo.com) (free, no API key, CORS-enabled), computes civil/astronomical darkness with [SunCalc](https://github.com/mourner/suncalc), and scores each dark hour of the next three nights. The result is a plain-English verdict, an hour-by-hour pill bar, and an imaging target grid that updates as you hover.

---

## Forecast criteria

### Presets

| Preset | Cloud cover | Visibility | Rationale |
|---|---|---|---|
| **Easygoing** | ≤ 31% | ≥ 10 km | Sits at the 7Timer cloud level-3/4 boundary and the Clear Dark Sky transparency cutoff — the community-recognised edge of "marginal but worth trying" |
| **Picky** | ≤ 19% | ≥ 15 km | Firmly within the community "go" zone (0–20% is the most common stated hard limit on Cloudy Nights) |

### Per-target thresholds

| Target | Cloud limit | Visibility limit | Moon limit | Notes |
|---|---|---|---|---|
| **Galaxies** | 30% | 10 km | 25% illumination | Low surface brightness — any sky brightening competes directly with signal. 30% cloud and 25% moon match the tightest community consensus (telescope.live explicitly states 25% as the galaxy moon ceiling) |
| **Narrowband nebulae** | 55% | 6 km | — (moon-tolerant) | Narrowband filters (Hα, SII, OIII) isolate specific wavelengths and reject broadband moonlight. Community practitioners routinely shoot at full moon. 55% cloud is at the outer edge of what is reported as "worth trying" |
| **Planets** | 50% | 6 km | — (moon-tolerant) | High-contrast targets — haze matters far less than for DSOs. The real limiting factor is atmospheric *seeing* (turbulence), which is not yet modelled. Visibility floor set at 6 km because planets can be fruitfully imaged through moderate haze |
| **Star clusters** | 50% | 6 km | 70% illumination | Bright, high-contrast targets that tolerate significant moonlight. Globular clusters are visually enjoyable even at full moon. Moon limit relaxed from 50% to 70% based on Cloudy Nights community reports |
| **Lunar** | 60% | 6 km | ≥ 10% required | Inverted logic — the Moon is the target. Fine detail depends on *seeing*, not transparency. Minimum 10% illumination to have meaningful surface features lit |

### Quality scoring

Each dark hour gets a continuous score 0–1:

```
score = (1 − cloud_cover/100) × 0.7  +  min(visibility/20_000, 1) × 0.3
```

Cloud cover is weighted more heavily (70%) because it is the primary binary blocker. Visibility contributes the remaining 30% as a transparency proxy.

Scores map to pill colours:

| Score | Level | Pill colour |
|---|---|---|
| ≥ 0.75 | Excellent | Bright gold |
| 0.50–0.75 | Good | Gold |
| 0.25–0.50 | Marginal | Dim gold |
| < 0.25 | Poor | Grey |

---

## What is not yet modelled

**Atmospheric seeing** — turbulence in the atmosphere — is the dominant quality factor for planetary and lunar work. A crystal-clear but turbulent night makes planets look like they're boiling; a slightly hazy but steady night can yield stunning planetary detail. Seeing is measured in arc-seconds FWHM (≤ 0.75" excellent, 1–1.5" good, > 2" poor for planets) and rated on the Pickering scale (1–10). Open-Meteo does not provide a seeing estimate; the [7Timer ASTRO API](https://7timer.info/doc.php) does if this is ever added.

**Light pollution / Bortle scale** — fixed per location, not per night. A dark-sky site dramatically lowers the effective cloud and moon thresholds for faint DSOs.

**Dew point / humidity** — relevant for whether optics will dew over, especially for refractors and SCTs at high humidity. Not currently factored in.

---

## Research sources

Thresholds were calibrated against the following community resources:

- [Cloudy Nights — "What's your max cloud coverage?"](https://www.cloudynights.com/forums/topic/883901-whats-your-maximum-cloud-coverage-amount-eg-42-for-you-to-still-have-a-session/)
- [Cloudy Nights — "How much cloud cover do you tolerate?" (imaging)](https://www.cloudynights.com/topic/529936-whats-your-max-cloud-cover-tolerance/)
- [Telescope Live — Role of Moon Illumination in Deep Sky Astrophotography](https://telescope.live/blog/role-moon-illumination-deep-sky-astrophotography)
- [Milky Way Forecast — Cloud Cover Stargazing Guide](https://milkywayforecast.com/guides/cloud-cover-stargazing)
- [7Timer Documentation — ASTRO product scales](https://7timer.info/doc.php)
- [Clear Dark Sky — Seeing Categories](https://www.cleardarksky.com/csk/faq/seeing_catagories.html)
- [AstroBackyard — Astrophotography During Full Moon](https://astrobackyard.com/astrophotography-full-moon/)
- [Sky at Night Magazine — Astrophotography During Full Moon](https://www.skyatnightmagazine.com/astrophotography/astrophoto-tips/astrophotography-during-full-moon)

---

## Run it locally

```bash
nvm use 22
npm install
npm run dev
```

## Deploy

Pushing to `main` triggers the GitHub Actions workflow which builds and deploys to GitHub Pages automatically. Enable Pages under **Settings → Pages → Source → GitHub Actions** on first use.

---

## Stack

- [React](https://react.dev) + [Vite](https://vitejs.dev)
- [Open-Meteo](https://open-meteo.com) — hourly `cloud_cover` + `visibility`
- [SunCalc](https://github.com/mourner/suncalc) — sun altitude, moon illumination, moon position
- Deployed via GitHub Actions → GitHub Pages
