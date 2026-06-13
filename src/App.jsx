import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchForecast,
  makeForecastLookup,
  evaluateNight,
  nightLabel,
  nightSentence,
  PRESETS,
  blockQuality,
  seeingLevel,
} from "./forecast.js";

const DEFAULT_LOCATION = {
  name: "Austin, TX",
  lat: 30.2672,
  lon: -97.7431,
};

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`,
      { headers: { 'User-Agent': 'ClearNight/1.0' } }
    );
    const d = await res.json();
    const a = d.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.hamlet;
    const region = a.state;
    if (city) return [city, region].filter(Boolean).join(', ');
  } catch {}
  return 'your location';
}

// --- Logo -------------------------------------------------------------------

function Logo({ size = 28 }) {
  // Classic cartoon crescent: two circles of equal radius (R=13), offset horizontally.
  // Outer circle center (17,16), shadow circle center (27,16) — both r=13.
  // Horns meet at (22,4) and (22,28); crescent width ≈10px at equator.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Clear Night">
      <path
        d="M22 4 A13 13 0 1 0 22 28 A13 13 0 0 1 22 4Z"
        fill="#f5c76b"
        transform="rotate(-35, 16, 16)"
      />
    </svg>
  );
}

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

function CameraIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="1.5" y="5.5" width="15" height="10.5" rx="2" strokeWidth="1.3" />
      <circle cx="9" cy="11" r="3" strokeWidth="1.3" />
      <path d="M6.2 5.5 L7.2 3 L10.8 3 L11.8 5.5" strokeWidth="1.1" />
    </svg>
  );
}

// MoonPhaseIcon renders the exact lit fraction as an SVG using arc math.
// phase 0 = new moon, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
function MoonPhaseIcon({ phase, size = 18 }) {
  const r = (size - 4) / 2;
  const cx = size / 2, cy = size / 2;

  if (phase < 0.02 || phase > 0.98) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <circle cx={cx} cy={cy} r={r} opacity="0.35" />
      </svg>
    );
  }

  // termRxRaw: x-radius of the terminator ellipse, signed to encode its curvature.
  // Positive → crescent side; negative → gibbous side.
  const termRxRaw = r * Math.cos(phase * 2 * Math.PI);
  const termRx = Math.max(0.01, Math.abs(termRxRaw));
  const waxing = phase <= 0.5;

  // Build the lit-area path:
  //   1. Major semicircle (always-lit half of the moon)
  //   2. Terminator ellipse back to start (defines the shadow boundary)
  // Return arc goes from bottom (cx, cy+r) back to top (cx, cy-r).
  // In SVG (y-axis down): CCW (sweep=0) from the bottom goes via the RIGHT side;
  //                        CW  (sweep=1) from the bottom goes via the LEFT side.
  // Crescent needs the return to stay on the SAME side as the lit half (thin sliver).
  // Gibbous needs the return to cross to the DARK side (enclose the large lit area).
  let litPath;
  if (waxing) {
    // Lit on right. Main arc: top → CW (sweep 1) → bottom via RIGHT.
    // Crescent (termRxRaw > 0): return stays RIGHT → sweep 0 (CCW)
    // Gibbous  (termRxRaw < 0): return crosses LEFT → sweep 1 (CW)
    const ts = termRxRaw < 0 ? 1 : 0;
    litPath = `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${termRx} ${r} 0 0 ${ts} ${cx} ${cy - r}Z`;
  } else {
    // Lit on left. Main arc: top → CCW (sweep 0) → bottom via LEFT.
    // Crescent (termRxRaw > 0): return stays LEFT → sweep 1 (CW)
    // Gibbous  (termRxRaw < 0): return crosses RIGHT → sweep 0 (CCW)
    const ts = termRxRaw >= 0 ? 1 : 0;
    litPath = `M${cx} ${cy - r} A${r} ${r} 0 1 0 ${cx} ${cy + r} A${termRx} ${r} 0 0 ${ts} ${cx} ${cy - r}Z`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {/* Dark side — dim fill so the unlit portion is visible against the background */}
      <circle cx={cx} cy={cy} r={r} fill="currentColor" opacity="0.12" />
      {/* Lit side */}
      <path d={litPath} fill="currentColor" opacity="0.9" />
      {/* Outline */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
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
    checkHour(block, moonFraction) {
      if (block.cloudcover > 30 || block.visibility < 10000) return "Too cloudy";
      if (moonFraction > 0.25) return "Moon too bright";
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
    checkHour(block) {
      if (block.cloudcover > 55 || block.visibility < 6000) return "Too cloudy";
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
    checkHour(block) {
      if (block.cloudcover > 50 || block.visibility < 6000) return "Too cloudy";
      if (seeingLevel(block) === "turbulent") return "Atmosphere too turbulent for detail";
      return null;
    },
  },
  {
    id: "clusters",
    label: "Clusters",
    Icon: ClusterIcon,
    check(night) {
      if (!night.covered || night.windows.length === 0) return "Too cloudy";
      if (night.moon.fraction > 0.7) return "Moon too bright";
      return null;
    },
    checkHour(block, moonFraction) {
      if (block.cloudcover > 50 || block.visibility < 6000) return "Too cloudy";
      if (moonFraction > 0.7) return "Moon too bright";
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
    checkHour(block, moonFraction) {
      if (moonFraction < 0.1) return "Moon too dim";
      if (block.cloudcover > 60 || block.visibility < 6000) return "Too cloudy";
      if (seeingLevel(block) === "turbulent") return "Atmosphere too turbulent for detail";
      return null;
    },
  },
];

function ObjectGrid({ night, hoveredHour }) {
  return (
    <div>
      <div className="targets-label">
        <CameraIcon size={13} />
        Targets
      </div>
      <div className="object-grid" aria-label="Imaging targets">
        {IMAGING_OBJECTS.map(({ id, label, Icon, check, checkHour }) => {
          const reason = hoveredHour
            ? checkHour(hoveredHour.block, night.moon.fraction)
            : check(night);
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
    </div>
  );
}

// --- Hour detail card (shown on pill hover) ---------------------------------

function hourNote(block) {
  const cloud = block.cloudcover;
  const vis = block.visibility / 1000;
  const q = blockQuality(block);
  const seeing = seeingLevel(block);
  if (q >= 0.75) {
    if (seeing === 'turbulent') return 'Clear sky but rough upper atmosphere — great for deep sky, skip planets.';
    if (seeing === 'unsteady') return 'Clear sky, mildly unsteady — deep sky is excellent, planets may wobble.';
    return 'Clear and steady — ideal for any target.';
  }
  if (q >= 0.5) {
    if (cloud > 25 && vis < 15) return `${cloud}% clouds and ${vis.toFixed(0)} km visibility thin out the faintest targets.`;
    if (cloud > 25) return `${cloud}% cloud cover will dim extended nebulae and galaxies.`;
    return `Visibility at ${vis.toFixed(0)} km — acceptable but not ideal.`;
  }
  if (q >= 0.25) {
    if (cloud > 45) return `${cloud}% cloud cover — only the brightest objects punch through.`;
    return `${vis.toFixed(0)} km visibility kills contrast for anything faint.`;
  }
  return cloud > 60
    ? `${cloud}% cloud cover — overcast, not worth setting up.`
    : `Only ${vis.toFixed(0)} km visibility — too murky to observe.`;
}

function HourDetail({ hour }) {
  const block = hour.block;
  const level = qualityLevel(blockQuality(block));
  const visKm = (block.visibility / 1000).toFixed(0);
  const seeing = seeingLevel(block);
  return (
    <div className="hour-detail">
      <div className="hour-detail-head">
        <span className="hour-detail-time">{fmtHour(hour.start)}</span>
        <span className={`hour-detail-badge hour-pill-${level}`}>{level}</span>
      </div>
      <div className="hour-detail-metrics">
        <div className="hour-detail-metric">
          <span className="hour-detail-key">Cloud cover</span>
          <span className="hour-detail-val">{block.cloudcover}%</span>
        </div>
        <div className="hour-detail-metric">
          <span className="hour-detail-key">Visibility</span>
          <span className="hour-detail-val">{visKm} km</span>
        </div>
        {seeing && (
          <div className="hour-detail-metric">
            <span className="hour-detail-key">Atmosphere</span>
            <span className={`hour-detail-val seeing-${seeing}`}>{seeing}</span>
          </div>
        )}
      </div>
      <p className="hour-detail-note">{hourNote(block)}</p>
    </div>
  );
}

// --- Hour pill bar: one pill per dark hour, colored by viewing quality ---

function fmtHour(date) {
  const h = date.getHours();
  if (h === 0)  return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function qualityLevel(q) {
  if (q < 0.25) return 'poor';
  if (q < 0.5)  return 'marginal';
  if (q < 0.75) return 'good';
  return 'excellent';
}

function HourBar({ night, onHover }) {
  if (night.hours.length === 0) return null;
  return (
    <div className="hour-bar">
      {night.hours.map((h, i) => {
        const level = qualityLevel(blockQuality(h.block));
        return (
          <span
            key={i}
            className={`hour-pill hour-pill-${level}`}
            onMouseEnter={() => onHover(h)}
            onMouseLeave={() => onHover(null)}
          >
            {fmtHour(h.start)}
          </span>
        );
      })}
    </div>
  );
}

function NightRow({ night, big }) {
  const [hoveredHour, setHoveredHour] = useState(null);
  const [shownHour, setShownHour] = useState(null);
  const timerRef = useRef(null);

  const handleHover = (hour) => {
    setHoveredHour(hour);
    clearTimeout(timerRef.current);
    if (!hour) {
      setShownHour(null);
      return;
    }
    // If the card is already visible, swap its content immediately so it
    // doesn't flicker away and back as the user moves between pills.
    setShownHour(prev => prev !== null ? hour : null);
    timerRef.current = setTimeout(() => setShownHour(hour), 700);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const sentence = nightSentence(night);
  const verdict =
    !night.covered ? "unknown" : night.windows.length > 0 ? "go" : "no";

  return (
    <section className={`night ${big ? "night-big" : ""}`}>
      <div className="night-header">
        <div className="night-title">
          <span
            className="moon-indicator"
            title={`${Math.round(night.moon.fraction * 100)}% illuminated`}
          >
            <MoonPhaseIcon phase={night.moon.phase} size={18} />
            <span className="moon-pct">{Math.round(night.moon.fraction * 100)}%</span>
          </span>
          <h2 className="night-name">{nightLabel(night.offsetDays)}</h2>
        </div>
      </div>
      <p className={`night-sentence verdict-${verdict}`}>{sentence}</p>
      {night.windows.some((w) => w.brightMoon) && (
        <p className="night-note">
          Bright moon up — great for the Moon and planets, washed out for
          galaxies and nebulae.
        </p>
      )}
      <div className="hour-bar-wrap">
        <HourBar night={night} onHover={handleHover} />
        {shownHour && <HourDetail hour={shownHour} />}
      </div>
      <ObjectGrid night={night} hoveredHour={hoveredHour} />
    </section>
  );
}

function PinIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor"
         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 1.5 C4.5 1.5, 2.5 3.5, 2.5 6 C2.5 9, 7 12.5, 7 12.5 C7 12.5, 11.5 9, 11.5 6 C11.5 3.5, 9.5 1.5, 7 1.5Z"/>
      <circle cx="7" cy="6" r="1.6" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function LocationPicker({ location, onSelect }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError]     = useState(false);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const close = () => { setOpen(false); setQuery(''); setResults([]); setGeoLoading(false); setGeoError(false); };

  const handleQuery = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch { setResults([]); }
    }, 300);
  };

  const handleSelect = (r) => {
    onSelect({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    });
    close();
  };

  const handleUseMyLocation = () => {
    setGeoLoading(true);
    setGeoError(false);
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const name = await reverseGeocode(lat, lon);
        onSelect({ name, lat, lon });
        close();
      },
      () => { setGeoLoading(false); setGeoError(true); },
      { timeout: 8000 }
    );
  };

  return (
    <div className="location-picker" ref={wrapRef}>
      {open ? (
        <>
          <input
            ref={inputRef}
            className="location-input"
            value={query}
            onChange={handleQuery}
            placeholder="Search city…"
            onKeyDown={(e) => e.key === 'Escape' && close()}
          />
          <div className="location-results">
            {navigator.geolocation && (
              <button
                className="location-result location-result-geo"
                onClick={handleUseMyLocation}
                disabled={geoLoading}
              >
                <PinIcon size={11} />
                {geoLoading ? 'Locating…' : geoError ? 'Location access denied' : 'Use my location'}
              </button>
            )}
            {results.map((r, i) => (
              <button key={i} className="location-result" onClick={() => handleSelect(r)}>
                {r.name}{r.admin1 ? `, ${r.admin1}` : ''}{r.country ? `, ${r.country}` : ''}
              </button>
            ))}
          </div>
        </>
      ) : (
        <button className="location-display" onClick={() => setOpen(true)}>
          {location.name}
          <span className="location-edit-icon"><PinIcon size={13} /></span>
        </button>
      )}
    </div>
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

  // Silently attempt geolocation on first load; fall back to Austin if denied.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const name = await reverseGeocode(lat, lon);
        setLocation({ name, lat, lon });
      },
      () => {},
      { timeout: 5000 }
    );
  }, []);

  return (
    <main className="page">
      <header className="masthead">
        <span className="wordmark">
          <Logo size={18} />
          Clear Night
        </span>
        <LocationPicker location={location} onSelect={setLocation} />
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
