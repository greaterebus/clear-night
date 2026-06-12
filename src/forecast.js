import SunCalc from "suncalc";

// ---------------------------------------------------------------------------
// Data source: Open-Meteo (free, no key, CORS-enabled)
// Docs: https://open-meteo.com/en/docs
//
// Returns hourly data for 4 days with, per hour:
//   cloud_cover   0..100  (% sky covered)              lower is better
//   visibility    meters  (surface visibility)          higher is better
// ---------------------------------------------------------------------------

const OPEN_METEO_URL = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(
    3
  )}&hourly=cloud_cover,visibility&timezone=auto&forecast_days=4`;

export async function fetchForecast(lat, lon, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(OPEN_METEO_URL(lat, lon), { cache: "no-store" });
      if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
      const data = await res.json();
      if (!data?.hourly?.time?.length) {
        throw new Error("Open-Meteo response missing hourly data");
      }
      return data;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

// Build a lookup: for any Date, return the hourly forecast block covering it.
export function makeForecastLookup(data) {
  const { time, cloud_cover, visibility } = data.hourly;
  return (date) => {
    // Open-Meteo returns local-time strings like "2024-01-01T20:00" (no Z).
    // Construct the same format from the local Date fields.
    const localIso =
      [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-") +
      "T" +
      String(date.getHours()).padStart(2, "0") +
      ":00";
    const idx = time.indexOf(localIso);
    if (idx === -1) return null;
    return { cloudcover: cloud_cover[idx], visibility: visibility[idx] };
  };
}

export const PRESETS = {
  relaxed: {
    label: "Easygoing",
    blurb: "Worth setting up the scope",
    cloudMax: 31,   // <= 31% cloud cover
    visMin: 10000,  // >= 10 km visibility
  },
  strict: {
    label: "Picky",
    blurb: "Only genuinely great hours",
    cloudMax: 19,   // <= 19% cloud cover
    visMin: 15000,  // >= 15 km visibility
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
      block.visibility >= preset.visMin;

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
      avg("cloudcover") <= 10 && avg("visibility") >= 20000
        ? "excellent"
        : "good";
  }

  // Dark span (for the night arc): first to last dark hour we examined
  const darkSpan = hours.length
    ? { start: hours[0].start, end: new Date(hours[hours.length - 1].start.getTime() + 3.6e6) }
    : null;

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
