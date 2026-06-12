import { useEffect, useMemo, useState } from "react";
import {
  fetchSevenTimer,
  makeForecastLookup,
  evaluateNight,
  nightLabel,
  nightSentence,
  formatWindow,
  PRESETS,
} from "./forecast.js";

const DEFAULT_LOCATION = {
  name: "Pflugerville, TX",
  lat: 30.439,
  lon: -97.62,
};

// --- Night arc: ONE bar per night (dusk -> dawn), gold where it's good. ---
function NightArc({ night }) {
  if (!night.darkSpan || night.windows.length === 0) return null;
  const { start, end } = night.darkSpan;
  const span = end.getTime() - start.getTime();
  const pct = (t) => ((t - start.getTime()) / span) * 100;

  return (
    <div
      className="arc"
      role="img"
      aria-label={`Dark from ${formatWindow(night.darkSpan)}, good windows highlighted`}
    >
      <div className="arc-track" />
      {night.windows.map((w, i) => (
        <div
          key={i}
          className={`arc-window ${w.quality}`}
          style={{
            left: `${pct(w.start.getTime())}%`,
            width: `${pct(w.end.getTime()) - pct(w.start.getTime())}%`,
          }}
        />
      ))}
      <span className="arc-label arc-label-start">dusk</span>
      <span className="arc-label arc-label-end">dawn</span>
    </div>
  );
}

function NightRow({ night, big }) {
  const sentence = nightSentence(night);
  const verdict =
    !night.covered ? "unknown" : night.windows.length > 0 ? "go" : "no";

  return (
    <section className={`night ${big ? "night-big" : ""}`}>
      <h2 className="night-name">{nightLabel(night.offsetDays)}</h2>
      <p className={`night-sentence verdict-${verdict}`}>{sentence}</p>
      {night.windows.some((w) => w.brightMoon) && (
        <p className="night-note">
          Bright moon up — great for the Moon and planets, washed out for
          galaxies and nebulae.
        </p>
      )}
      <NightArc night={night} />
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
    fetchSevenTimer(location.lat, location.lon)
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
          Clouds, seeing &amp; transparency from{" "}
          <a href="https://www.7timer.info" target="_blank" rel="noreferrer">
            7Timer!
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
