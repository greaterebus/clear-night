import { useEffect, useMemo, useState } from "react";
import {
  fetchForecast,
  makeForecastLookup,
  evaluateNight,
  nightLabel,
  nightSentence,
  PRESETS,
  blockQuality,
} from "./forecast.js";

const DEFAULT_LOCATION = {
  name: "Pflugerville, TX",
  lat: 30.439,
  lon: -97.62,
};

// --- Target icons -----------------------------------------------------------

function GalaxyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <ellipse cx="9" cy="9" rx="7.5" ry="2.6" transform="rotate(-25 9 9)" strokeWidth="1" opacity="0.55" />
      <circle cx="9" cy="9" r="1.9" fill="currentColor" stroke="none" />
      <path d="M7 7.8 C6 6, 8 4, 11.5 5.2" strokeWidth="1.1" />
      <path d="M11 10.2 C12 12, 10 14, 6.5 12.8" strokeWidth="1.1" />
    </svg>
  );
}

function NebulaIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" aria-hidden>
      <path d="M3.5 11 C3.5 8.5, 5 6.5, 7 7.2 C7.2 5.2, 9 3.5, 11 4.5 C12 2.8, 15.5 3.2, 15.5 6.5 C17.2 7.5, 17 11, 15 11.5 C14.5 13.8, 12.5 15, 10.5 14 C9.5 16, 7 15.5, 6 14 C4 13.5, 3.5 12.2, 3.5 11Z" />
    </svg>
  );
}

function PlanetIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="9" r="4.5" strokeWidth="1.5" />
      <ellipse cx="9" cy="9" rx="8.5" ry="2.8" transform="rotate(-18 9 9)" strokeWidth="1" />
    </svg>
  );
}

function ClusterIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <circle cx="9"    cy="4.5"  r="1.1" />
      <circle cx="13"   cy="6.5"  r="0.9" />
      <circle cx="14"   cy="10.5" r="1"   />
      <circle cx="12"   cy="14"   r="0.9" />
      <circle cx="8.5"  cy="14.5" r="1"   />
      <circle cx="5"    cy="12.5" r="0.9" />
      <circle cx="4"    cy="9"    r="1"   />
      <circle cx="5.5"  cy="5.5"  r="0.9" />
      <circle cx="9.5"  cy="9"    r="1.3" />
      <circle cx="7.5"  cy="10.5" r="0.7" />
      <circle cx="11"   cy="9.5"  r="0.7" />
    </svg>
  );
}

function LunarIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      {/* Right-lit crescent: outer arc sweeps right, inner arc returns via narrower path */}
      <path d="M9 2 C12.5 2, 16 5.1, 16 9 C16 12.9, 12.5 16, 9 16 C11 14, 12.5 11.5, 12.5 9 C12.5 6.5, 11 4, 9 2Z" />
    </svg>
  );
}

// --- Imaging target grid ----------------------------------------------------

const IMAGING_OBJECTS = [
  {
    id: "galaxies",
    label: "Galaxies",
    Icon: GalaxyIcon,
    check(night) {
      if (!night.covered || night.windows.length === 0) return "Too cloudy";
      if (night.moon.fraction > 0.25) return "Moon too bright";
      return null;
    },
  },
  {
    id: "narrowband",
    label: "Narrowband",
    Icon: NebulaIcon,
    check(night) {
      if (!night.covered || night.windows.length === 0) return "Too cloudy";
      return null;
    },
  },
  {
    id: "planets",
    label: "Planets",
    Icon: PlanetIcon,
    check(night) {
      if (!night.covered || night.windows.length === 0) return "Too cloudy";
      return null;
    },
  },
  {
    id: "clusters",
    label: "Clusters",
    Icon: ClusterIcon,
    check(night) {
      if (!night.covered || night.windows.length === 0) return "Too cloudy";
      if (night.moon.fraction > 0.5) return "Moon too bright";
      return null;
    },
  },
  {
    id: "lunar",
    label: "Lunar",
    Icon: LunarIcon,
    check(night) {
      if (night.moon.fraction < 0.1) return "Moon too dim";
      if (!night.covered || night.windows.length === 0) return "Too cloudy";
      return null;
    },
  },
];

function ObjectGrid({ night }) {
  return (
    <div className="object-grid" aria-label="Imaging targets">
      {IMAGING_OBJECTS.map(({ id, label, Icon, check }) => {
        const reason = check(night);
        const good = reason === null;
        return (
          <span
            key={id}
            className={`object-chip${good ? "" : " object-chip-dim"}`}
            title={good ? undefined : reason}
            aria-label={`${label}: ${good ? "good conditions" : reason}`}
          >
            <Icon size={15} />
            {label}
          </span>
        );
      })}
    </div>
  );
}

// --- Dome arc: semicircle from dusk (left) to dawn (right), per-hour quality coloring ---

const ARC_W = 280, ARC_H = 110;
const ARC_CX = ARC_W / 2, ARC_CY = 90;
const ARC_RX = 126, ARC_RY = 60;

function arcPt(frac, rx = ARC_RX, ry = ARC_RY) {
  const θ = Math.PI * (1 - frac);
  return [ARC_CX + rx * Math.cos(θ), ARC_CY - ry * Math.sin(θ)];
}

function segPath(f1, f2) {
  const [x1, y1] = arcPt(f1);
  const [x2, y2] = arcPt(f2);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${ARC_RX} ${ARC_RY} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function qualityStroke(q) {
  if (q < 0.25) return ['#8C93AD', 0.22];
  if (q < 0.5)  return ['#F5C76B', 0.42];
  if (q < 0.75) return ['#F5C76B', 0.78];
  return ['#FFE3A1', 1.0];
}

function fmtHour(date) {
  const h = date.getHours();
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function NightArc({ night }) {
  if (!night.darkSpan || night.hours.length === 0) return null;
  const { start, end } = night.darkSpan;
  const spanMs = end.getTime() - start.getTime();
  const frac = (ms) => (ms - start.getTime()) / spanMs;

  // Even-hour tick labels every 2 h, not too close to dusk/dawn endpoints
  const ticks = [];
  const cur = new Date(start.getTime());
  cur.setMinutes(0, 0, 0);
  if (cur.getTime() < start.getTime()) cur.setHours(cur.getHours() + 1);
  while (cur.getHours() % 2 !== 0) cur.setHours(cur.getHours() + 1);
  while (cur.getTime() <= end.getTime()) {
    const f = frac(cur.getTime());
    if (f > 0.08 && f < 0.92) ticks.push(new Date(cur));
    cur.setHours(cur.getHours() + 2);
  }

  return (
    <svg viewBox={`0 0 ${ARC_W} ${ARC_H}`} className="arc-svg" aria-hidden="true">
      {/* Faint full-night track */}
      <path d={segPath(0, 1)} fill="none" stroke="rgba(237,232,218,0.08)" strokeWidth="3" />

      {/* Per-hour quality-colored segments */}
      {night.hours.map((h, i) => {
        const f1 = frac(h.start.getTime());
        const f2 = Math.min(frac(h.start.getTime() + 3.6e6), 1);
        const [color, opacity] = qualityStroke(blockQuality(h.block));
        return (
          <path
            key={i}
            d={segPath(f1, f2)}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="butt"
            opacity={opacity}
          />
        );
      })}

      {/* Hour tick marks + labels */}
      {ticks.map((t) => {
        const f = frac(t.getTime());
        const [ax, ay] = arcPt(f);
        const [lx, ly] = arcPt(f, ARC_RX + 14, ARC_RY + 14);
        const θ = Math.PI * (1 - f);
        const anchor = θ > Math.PI * 0.6 ? 'end' : θ < Math.PI * 0.4 ? 'start' : 'middle';
        return (
          <g key={t.getTime()}>
            <line x1={ax} y1={ay} x2={lx} y2={ly} stroke="rgba(237,232,218,0.18)" strokeWidth="1" />
            <text x={lx} y={ly + 4} textAnchor={anchor} className="arc-tick-label">
              {fmtHour(t)}
            </text>
          </g>
        );
      })}

      {/* Dusk / dawn endpoint labels */}
      <text x={ARC_CX - ARC_RX} y={ARC_CY + 14} textAnchor="middle" className="arc-tick-label">dusk</text>
      <text x={ARC_CX + ARC_RX} y={ARC_CY + 14} textAnchor="middle" className="arc-tick-label">dawn</text>
    </svg>
  );
}

function NightRow({ night, big }) {
  const sentence = nightSentence(night);
  const verdict =
    !night.covered ? "unknown" : night.windows.length > 0 ? "go" : "no";

  return (
    <section className={`night ${big ? "night-big" : ""}`}>
      <div className="night-header">
        <h2 className="night-name">{nightLabel(night.offsetDays)}</h2>
        <span className="moon-badge" title={`${Math.round(night.moon.fraction * 100)}% illuminated`}>
          {night.moon.emoji} {Math.round(night.moon.fraction * 100)}%
        </span>
      </div>
      <p className={`night-sentence verdict-${verdict}`}>{sentence}</p>
      {night.windows.some((w) => w.brightMoon) && (
        <p className="night-note">
          Bright moon up — great for the Moon and planets, washed out for
          galaxies and nebulae.
        </p>
      )}
      <NightArc night={night} />
      <ObjectGrid night={night} />
    </section>
  );
}

export default function App() {
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [presetKey, setPresetKey] = useState("relaxed");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetchForecast(location.lat, location.lon)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setUpdatedAt(new Date());
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [location]);

  const nights = useMemo(() => {
    if (!data) return [];
    const lookup = makeForecastLookup(data);
    const preset = PRESETS[presetKey];
    return [0, 1, 2].map((d) =>
      evaluateNight(lookup, location.lat, location.lon, d, preset)
    );
  }, [data, presetKey, location]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocation({
        name: "your location",
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      });
    });
  };

  return (
    <main className="page">
      <header className="masthead">
        <span className="wordmark">Clear Night</span>
        <span className="place">
          {location.name}
          {location.name !== "your location" && (
            <button className="link-btn" onClick={useMyLocation}>
              use my location
            </button>
          )}
        </span>
      </header>

      {status === "loading" && (
        <p className="big-status">Reading the sky&hellip;</p>
      )}

      {status === "error" && (
        <div className="big-status">
          <p>Couldn&rsquo;t reach the forecast service.</p>
          <button
            className="retry-btn"
            onClick={() => setLocation({ ...location })}
          >
            Try again
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <NightRow night={nights[0]} big />
          <div className="later-nights">
            <NightRow night={nights[1]} />
            <NightRow night={nights[2]} />
          </div>

          <div className="mood" role="radiogroup" aria-label="How picky are you">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button
                key={key}
                role="radio"
                aria-checked={presetKey === key}
                className={`mood-btn ${presetKey === key ? "active" : ""}`}
                onClick={() => setPresetKey(key)}
              >
                <strong>{p.label}</strong>
                <span>{p.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <footer className="colophon">
        <p>
          Cloud cover &amp; visibility from{" "}
          <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{" "}
          &middot; sun &amp; moon computed locally
          {updatedAt &&
            ` · checked ${updatedAt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`}
        </p>
        <p className="fine">
          Seeing forecasts are honest guesses, not promises. When in doubt,
          step outside and look up.
        </p>
      </footer>
    </main>
  );
}
