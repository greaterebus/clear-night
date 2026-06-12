import SunCalc from "suncalc";

// ---------------------------------------------------------------------------
// Data source: 7Timer! ASTRO product (free, no key, non-commercial use OK)
// Docs: https://www.7timer.info/doc.php
//
// Returns 72h of 3-hour steps with, per step:
//   cloudcover   1..9   (1 = <6% sky covered ... 9 = >94%)  lower is better
//   seeing       1..8   (1 = <0.5 arcsec ... 8 = >2.5")     lower is better
//   transparency 1..8   (1 = crystal ... 8 = milky)         lower is better
// ---------------------------------------------------------------------------

const SEVEN_TIMER_URL = (lat, lon) =>
  `https://www.7timer.info/bin/astro.php?lon=${lon.toFixed(3)}&lat=${lat.toFixed(
    3
  )}&ac=0&unit=metric&output=json&tzshift=0`;

// 7Timer occasionally returns malformed JSON (missing values), roughly 1 in
// 3-5 requests. Retry a few times before giving up.
export async function fetchSevenTimer(lat, lon, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(SEVEN_TIMER_URL(lat, lon), { cache: "no-store" });
      if (!res.ok) throw new Error(`7Timer responded ${res.status}`);
      const text = await res.text();
      const data = JSON.parse(text); // throws on the known malformed responses
      if (!data?.dataseries?.length || !data.init) {
        throw new Error("7Timer response missing dataseries");
      }
      return data;
    } catch (err) {
      lastError = err;
      // brief backoff before retrying
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

// "2026061206" (UTC) -> Date
export function parseInitTime(init) {
  const y = +init.slice(0, 4);
  const m = +init.slice(4, 6) - 1;
  const d = +init.slice(6, 8);
  const h = +init.slice(8, 10);
  return new Date(Date.UTC(y, m, d, h));
}

// Build a lookup: for any Date, return the 3h forecast block covering it.
export function makeForecastLookup(data) {
  const initMs = parseInitTime(data.init).getTime();
  const series = data.dataseries;
  const lastTimepoint = series[series.length - 1].timepoint;
  return (date) => {
    const hoursOut = (date.getTime() - initMs) / 3.6e6;
    if (hoursOut < 0) return series[0]; // model run slightly in the future-past gap
    if (hoursOut > lastTimepoint) return null; // beyond forecast coverage
    // timepoints are 3, 6, 9 ... block N covers (timepoint-3, timepoint]
    const idx = Math.ceil(hoursOut / 3) - 1;
    return series[Math.max(0, idx)] ?? null;
  };
}

export const PRESETS = {
  relaxed: {
    label: "Easygoing",
    blurb: "Worth setting up the scope",
    cloudMax: 3, // <= ~31% cloud
    seeingMax: 5,
    transparencyMax: 6,
  },
  strict: {
    label: "Picky",
    blurb: "Only genuinely great hours",
    cloudMax: 2, // <= ~19% cloud
    seeingMax: 3,
    transparencyMax: 4,
  },
};

// Sun altitude below this counts as "dark enough". Astronomical darkness is
// -18°; -15° is a pragmatic cutoff that keeps usable late-twilight hours.
const DARK_ALTITUDE_DEG = -15;

const deg = (rad) => (rad * 180) / Math.PI;

function isDark(date, lat, lon) {
  return deg(SunCalc.getPosition(date, lat, lon).altitude) < DARK_ALTITUDE_DEG;
}

function moonStatus(date, lat, lon) {
  const up = SunCalc.getMoonPosition(date, lat, lon).altitude > 0;
  const fraction = SunCalc.getMoonIllumination(date).fraction;
  return { up, fraction };
}

// A "night" is labeled by the evening it starts. Night 0 = tonight (or the
// night currently in progress).
export function nightStart(offsetDays = 0) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(12, 0, 0, 0); // anchor at noon to avoid DST edge cases
  // If it's after midnight but before noon, "tonight" actually started yesterday.
  if (now.getHours() < 12) start.setDate(start.getDate() - 1);
  start.setDate(start.getDate() + offsetDays);
  return start; // noon of the day the night begins
}

// Evaluate one night: walk hour by hour from noon to next noon, keep hours
// that are dark + meet thresholds, merge consecutive hours into windows.
export function evaluateNight(lookup, lat, lon, offsetDays, preset) {
  const anchor = nightStart(offsetDays);
  const now = new Date();
  const hours = [];

  for (let h = 0; h < 24; h++) {
    const t = new Date(anchor.getTime() + h * 3.6e6);
    const tEnd = new Date(t.getTime() + 3.6e6);
    if (tEnd <= now) continue; // hour fully in the past
    if (!isDark(new Date(t.getTime() + 30 * 60e3), lat, lon)) continue;

    const block = lookup(t);
    if (!block) continue;

    const good =
      block.cloudcover <= preset.cloudMax &&
      block.seeing <= preset.seeingMax &&
      block.transparency <= preset.transparencyMax;

    hours.push({ start: t, good, block });
  }

  // Merge consecutive good hours into windows
  const windows = [];
  for (const hour of hours) {
    if (!hour.good) continue;
    const last = windows[windows.length - 1];
    if (last && hour.start.getTime() === last.end.getTime()) {
      last.end = new Date(hour.start.getTime() + 3.6e6);
      last.blocks.push(hour.block);
    } else {
      windows.push({
        start: hour.start,
        end: new Date(hour.start.getTime() + 3.6e6),
        blocks: [hour.block],
      });
    }
  }

  // Annotate windows with moon status at their midpoint
  for (const w of windows) {
    const mid = new Date((w.start.getTime() + w.end.getTime()) / 2);
    const moon = moonStatus(mid, lat, lon);
    w.brightMoon = moon.up && moon.fraction > 0.55;
    const avg = (key) =>
      w.blocks.reduce((s, b) => s + b[key], 0) / w.blocks.length;
    w.quality =
      avg("cloudcover") <= 2 && avg("seeing") <= 3 && avg("transparency") <= 3
        ? "excellent"
        : "good";
  }

  // Dark span (for the night arc): first to last dark hour we examined
  const darkSpan = hours.length
    ? { start: hours[0].start, end: new Date(hours[hours.length - 1].start.getTime() + 3.6e6) }
    : null;

  // Does the forecast actually cover this night? (7Timer = 72h)
  const covered = hours.some((h) => h.block != null);

  return { offsetDays, windows, darkSpan, covered, hours };
}

export function formatHour(date) {
  let h = date.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h} ${suffix}`;
}

export function formatWindow(w) {
  return `${formatHour(w.start)} – ${formatHour(w.end)}`;
}

export function nightLabel(offsetDays) {
  if (offsetDays === 0) return "Tonight";
  if (offsetDays === 1) return "Tomorrow night";
  const d = nightStart(offsetDays);
  return (
    d.toLocaleDateString(undefined, { weekday: "long" }) + " night"
  );
}

// One plain-language sentence per night.
export function nightSentence(night) {
  if (!night.covered) return "Too far out for a reliable forecast yet.";
  if (night.windows.length === 0) return "Not worth it. Keep the scope inside.";
  const parts = night.windows.map(formatWindow);
  let times;
  if (parts.length === 1) times = parts[0];
  else if (parts.length === 2) times = `${parts[0]} and ${parts[1]}`;
  else times = parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
  return `Good ${times}.`;
}
