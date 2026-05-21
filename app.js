const LATEST_URL = "https://cdn.weatherstem.com/dashboard/data/dynamic/model/pickens/clemson/latest.json";
const OBSERVATION_URL = "https://data.weatherstem.com/v3/wx/observations/current?geocode=34.6786611119,-82.8431573231&format=json&language=en-US&units=e&apiKey=4898745f-d378-40d1-92a0-e79a3f4e3221";
const FORECAST_URL = "https://data.weatherstem.com/v3/wx/forecast/hourly/15day?geocode=34.6786611119,-82.8431573231&format=json&units=e&language=en-US&apiKey=4898745f-d378-40d1-92a0-e79a3f4e3221";
const METAR_URL = "https://aviationweather.gov/api/data/metar?ids=KCEU&format=json";
const DECODED_METAR_URL = "https://tgftp.nws.noaa.gov/data/observations/metar/decoded/KCEU.TXT";
const AIRPORT_OBSERVATION_URL = "https://api.weather.gov/stations/KCEU/observations/latest";
const REALTIME_URL = "wss://websockets.weatherstem.com?target=001D0A718DB3";
const POINTS_URL = "https://api.weather.gov/points/34.6786611119,-82.8431573231";
const GUST_LIMIT = 15;
const METAR_CACHE_KEY = "kceu-metar-cache-v1";
const DECODED_METAR_CACHE_KEY = "kceu-decoded-metar-cache-v1";
const METAR_REFRESH_MS = 30 * 60 * 1000;

const fallback = {
  stationName: "Clemson University",
  windMph: null,
  gustMph: null,
  windDirection: null,
  rainRate: null,
  rainToday: null,
  precip1Hour: null,
  condition: null,
  cloudCover: null,
  cloudCeiling: null,
  airportCeiling: null,
  airportVisibility: null,
  airportSky: null,
  airportObservedAt: null,
  humidity: null,
  heatIndex: null,
  wbgt: null,
  pressure: null,
  pressureTrend: null,
  uv: null,
  observedAt: null,
  visibilityMiles: null,
  currentAlerts: [],
  forecast: []
};

const els = {
  stationName: document.querySelector("#stationName"),
  lastUpdated: document.querySelector("#lastUpdated"),
  decisionPanel: document.querySelector("#decisionPanel"),
  flightStatus: document.querySelector("#flightStatus"),
  watchSummary: document.querySelector("#watchSummary"),
  flightReason: document.querySelector("#flightReason"),
  gustValue: document.querySelector("#gustValue"),
  gustNote: document.querySelector("#gustNote"),
  windValue: document.querySelector("#windValue"),
  windNote: document.querySelector("#windNote"),
  rainValue: document.querySelector("#rainValue"),
  rainNote: document.querySelector("#rainNote"),
  visibilityValue: document.querySelector("#visibilityValue"),
  visibilityNote: document.querySelector("#visibilityNote"),
  alertValue: document.querySelector("#alertValue"),
  alertNote: document.querySelector("#alertNote"),
  riskList: document.querySelector("#riskList"),
  riskCount: document.querySelector("#riskCount"),
  forecastStrip: document.querySelector("#forecastStrip")
};

init();

async function init() {
  const [latest, observation, airportObservation, metarObservation, decodedMetar, forecast] = await Promise.all([
    fetchJson(LATEST_URL).catch(() => null),
    fetchJson(OBSERVATION_URL).catch(() => null),
    fetchJson(AIRPORT_OBSERVATION_URL).catch(() => null),
    getCachedMetar().catch(() => null),
    getCachedText(DECODED_METAR_URL, DECODED_METAR_CACHE_KEY).catch(() => null),
    fetchJson(FORECAST_URL).catch(() => null)
  ]);
  const nws = await getNwsWeather().catch(() => ({ alerts: [] }));
  const data = {
    ...fallback,
    ...mergeDefined(
      mergeDefined(
        mergeDefined(
          mergeDefined(parseLatest(latest), parseObservation(observation)),
          parseAirportObservation(airportObservation)
        ),
        parseMetarObservation(metarObservation)
      ),
      parseDecodedMetar(decodedMetar)
    ),
    forecast: parseHourlyForecast(forecast),
    currentAlerts: nws.alerts
  };

  render(data);
  connectRealtime(data);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to fetch ${url}`);
  return response.json();
}

async function getNwsWeather() {
  const alerts = await fetchJson(`https://api.weather.gov/alerts/active?point=34.6786611119,-82.8431573231`);

  return {
    alerts: alerts.features || []
  };
}

function parseHourlyForecast(forecast) {
  const times = forecast?.validTimeLocal || [];
  return times.slice(0, 12).map((time, index) => ({
    time: parseWeatherStemTime(time),
    temp: forecast.temperature?.[index] ?? null,
    windSpeed: forecast.windSpeed?.[index] ?? null,
    windDirection: forecast.windDirectionCardinal?.[index] ?? null,
    wind: formatForecastWind(forecast.windSpeed?.[index], forecast.windDirectionCardinal?.[index]),
    gust: forecast.windGust?.[index] ?? null,
    pop: forecast.precipChance?.[index] ?? null,
    qpf: forecast.qpf?.[index] ?? null,
    condition: forecast.wxPhraseLong?.[index] || forecast.wxPhraseShort?.[index] || "Forecast unavailable"
  }));
}

async function getCachedMetar() {
  const cached = readMetarCache();
  if (cached && Date.now() - cached.fetchedAt < METAR_REFRESH_MS) {
    return cached.data;
  }

  const data = await fetchJson(METAR_URL);
  writeMetarCache(data);
  return data;
}

async function getCachedText(url, key) {
  const cached = readCache(key);
  if (cached && Date.now() - cached.fetchedAt < METAR_REFRESH_MS) {
    return cached.data;
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to fetch ${url}`);
  const data = await response.text();
  writeCache(key, data);
  return data;
}

function readMetarCache() {
  return readCache(METAR_CACHE_KEY);
}

function readCache(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeMetarCache(data) {
  writeCache(METAR_CACHE_KEY, data);
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({
      fetchedAt: Date.now(),
      data
    }));
  } catch {
    // Ignore storage failures; the dashboard can still use the current fetch.
  }
}

function parseObservation(observation) {
  return {
    observedAt: observation?.validTimeLocal || null,
    windMph: observation?.windSpeed ?? null,
    gustMph: observation?.windGust ?? null,
    windDirection: observation?.windDirection ?? null,
    windCardinal: observation?.windDirectionCardinal ?? null,
    rainRate: observation?.precip1Hour > 0 ? observation.precip1Hour : 0,
    rainToday: observation?.precip24Hour ?? null,
    precip1Hour: observation?.precip1Hour ?? null,
    condition: observation?.wxPhraseLong || observation?.cloudCoverPhrase || null,
    cloudCover: observation?.cloudCover ?? null,
    cloudCeiling: observation?.cloudCeiling ?? null,
    visibilityMiles: observation?.visibility ?? null,
    humidity: observation?.relativeHumidity ?? null,
    heatIndex: observation?.temperatureHeatIndex ?? observation?.temperatureFeelsLike ?? null,
    wbgt: observation?.wbgt ?? observation?.temperatureWetBulbGlobe ?? null,
    pressure: observation?.pressureAltimeter ?? null,
    pressureTrend: observation?.pressureTendencyTrend ?? null,
    uv: observation?.uvIndex ?? null
  };
}

function parseDecodedMetar(text) {
  if (!text) return {};

  const visibility = Number((text.match(/Visibility:\s*([\d.]+)/i) || [])[1]);
  const ceilingMatch = text.match(/ceiling (?:is )?(\d+)\s*ft/i) || text.match(/broken clouds at (\d+)\s*ft/i) || text.match(/overcast at (\d+)\s*ft/i);
  const skyMatch = text.match(/Sky conditions:\s*([^\r\n]+)/i);
  const obMatch = text.match(/^ob:\s*(.+)$/im);

  return {
    airportCeiling: ceilingMatch ? Number(ceilingMatch[1]) : null,
    airportVisibility: Number.isNaN(visibility) ? null : visibility,
    airportSky: skyMatch ? skyMatch[1].trim() : null,
    decodedMetar: obMatch ? obMatch[1].trim() : null
  };
}

function parseMetarObservation(metar) {
  const observation = Array.isArray(metar) ? metar[0] : metar?.value?.[0] || null;
  if (!observation) return {};

  return {
    airportCeiling: getMetarCeiling(observation),
    airportVisibility: parseMetarVisibility(observation.visib),
    airportSky: getMetarSky(observation),
    airportObservedAt: observation.reportTime || (observation.obsTime ? new Date(observation.obsTime * 1000).toISOString() : null)
  };
}

function getMetarCeiling(observation) {
  const ceilingLayer = (observation.clouds || []).find(layer => ["BKN", "OVC", "VV"].includes(layer.cover || layer.amount));
  if (ceilingLayer?.base !== null && ceilingLayer?.base !== undefined) return Number(ceilingLayer.base);

  const match = String(observation.rawOb || "").match(/\b(?:BKN|OVC)(\d{3})\b|\bVV(\d{3})\b/);
  const hundreds = match ? Number(match[1] || match[2]) : null;
  return hundreds === null ? null : hundreds * 100;
}

function getMetarSky(observation) {
  if (observation.cover) return observation.cover;
  const covers = (observation.clouds || []).map(layer => layer.cover || layer.amount).filter(Boolean);
  return covers.length ? covers.join(" ") : observation.rawOb?.includes("CLR") ? "CLR" : null;
}

function parseMetarVisibility(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace("+", "");
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseAirportObservation(observation) {
  const properties = observation?.properties || {};
  const layers = properties.cloudLayers || [];
  const ceilingLayer = layers.find(layer => ["BKN", "OVC", "VV"].includes(layer.amount));
  const visibilityMeters = properties.visibility?.value;

  return {
    airportCeiling: ceilingLayer?.base?.value === null || ceilingLayer?.base?.value === undefined
      ? null
      : Math.round(ceilingLayer.base.value * 3.28084),
    airportVisibility: visibilityMeters === null || visibilityMeters === undefined
      ? null
      : Number((visibilityMeters / 1609.344).toFixed(1)),
    airportSky: layers.map(layer => layer.amount).join(" ") || properties.textDescription || null,
    airportObservedAt: properties.timestamp || null
  };
}

function parseLatest(latest) {
  const records = latest?.records || [];
  const byName = name => records.find(record => record.sensor_name === name)?.value ?? null;
  const byProperty = property => records.find(record => record.property === property)?.value ?? null;

  return {
    observedAt: latest?.time || null,
    windMph: byName("Anemometer"),
    gustMph: byName("10 Minute Wind Gust"),
    windDirection: byName("Wind Vane"),
    rainRate: byName("Rain: Instantanous rate"),
    rainToday: byName("Rain: Accum last 24 hr"),
    humidity: byName("Hygrometer"),
    heatIndex: byName("Heat Index"),
    wbgt: byName("Wet Bulb Globe Temperature"),
    pressure: byName("Barometer"),
    pressureTrend: byName("Barometer Tendency") || byProperty("Barometric Pressure Tendency"),
    uv: byName("UV Radiation Sensor")
  };
}

function parseRealtime(message) {
  const primary = (message?.conditions || []).find(condition => condition.txid === 1);
  if (!primary) return null;

  return {
    observedAt: message.ts ? new Date(message.ts * 1000).toISOString() : null,
    windMph: primary.wind_speed_last,
    gustMph: primary.wind_speed_hi_last_10_min,
    windDirection: primary.wind_dir_last,
    rainRate: primary.rain_rate_last,
    rainToday: primary.rainfall_last_24_hr,
    humidity: primary.hum,
    heatIndex: primary.heat_index,
    wbgt: primary.wet_bulb,
    uv: primary.uv_index
  };
}

function connectRealtime(data) {
  if (!("WebSocket" in window)) return;

  const socket = new WebSocket(REALTIME_URL);
  socket.addEventListener("message", event => {
    try {
      const realtime = parseRealtime(JSON.parse(event.data));
      if (!realtime) return;
      Object.assign(data, mergeDefined(data, realtime));
      render(data);
    } catch (error) {
      console.warn("Unable to parse WeatherSTEM realtime update", error);
    }
  });
}

function render(data) {
  const next12 = data.forecast;
  const hasForecast = next12.length > 0;
  const next1 = next12.slice(0, 1);
  const next6 = next12.slice(0, 6);
  const forecastGusts = next12.map(item => item.gust).filter(value => value !== null && value !== undefined && !Number.isNaN(Number(value)));
  const forecastWinds = next12.map(item => item.windSpeed).filter(value => value !== null && value !== undefined && !Number.isNaN(Number(value)));
  const maxForecastGust = forecastGusts.length ? Math.max(...forecastGusts.map(Number)) : null;
  const maxForecastWind = forecastWinds.length ? Math.max(...forecastWinds.map(Number)) : null;
  const maxForecastWindDisplay = maxForecastGust ?? maxForecastWind;
  const windForecastLabel = maxForecastGust === null ? "Forecast wind max" : "Forecast gust max";
  const maxPop = Math.max(0, ...next6.map(item => item.pop || 0));
  const nextHourPop = Math.max(0, ...next1.map(item => item.pop || 0));
  const activeWeatherAlerts = data.currentAlerts.length;
  const rainyForecast = next6.find(item => item.pop >= 40 || /rain|storm|shower/i.test(item.condition || ""));
  const rainNextHour = next1.find(item => item.pop >= 40 || Number(item.qpf) > 0 || /rain|storm|shower/i.test(item.condition || ""));
  const stormNextHour = next1.find(item => /thunder|storm/i.test(item.condition || ""));
  const windRisk = data.gustMph >= GUST_LIMIT || (maxForecastGust !== null && maxForecastGust >= GUST_LIMIT);
  const rainStatus = getRainStatus(data, { rainNextHour, rainyForecast, stormNextHour, nextHourPop });
  const rainNow = ["DRIZZLE", "RAINING"].includes(rainStatus.label);
  const rainImminent = ["STORM RISK", "IMMINENT"].includes(rainStatus.label);
  const visibilityRisk = data.visibilityMiles !== null && Number(data.visibilityMiles) < 3;
  const ceiling = data.cloudCeiling ?? data.airportCeiling;
  const lowCeiling = ceiling !== null && Number(ceiling) < 500;
  const heatRisk = Number(data.wbgt) >= 90 || Number(data.heatIndex) >= 100;

  const risks = [];
  if (windRisk) {
    risks.push({ level: "bad", text: `No-go: wind gusts are at or forecast above ${GUST_LIMIT} mph.` });
  } else if (maxForecastGust !== null && maxForecastGust >= 12) {
    risks.push({ level: "caution", text: `Caution: current gust is ${formatNumber(data.gustMph)} mph and forecast gusts are near the operating limit.` });
  } else {
    risks.push({ level: "good", text: `Wind gusts are below the 15 mph no-flight threshold. Current gust: ${formatNumber(data.gustMph)} mph.` });
  }

  if (rainNow) {
    risks.push({ level: rainStatus.label === "DRIZZLE" ? "caution" : "bad", text: `${rainStatus.label === "DRIZZLE" ? "Caution" : "No-go"}: ${rainStatus.note}.` });
  } else if (rainImminent) {
    risks.push({ level: rainStatus.label === "STORM RISK" || nextHourPop >= 70 ? "bad" : "caution", text: `${rainStatus.label}: ${rainStatus.note}.` });
  } else if (rainyForecast) {
    risks.push({ level: "caution", text: `Rain risk later: ${maxPop}% precipitation probability in the next 6 hours.` });
  } else {
    risks.push({ level: "good", text: `No current rain. Last 24 hours: ${formatNumber(data.rainToday)} in.` });
  }

  if (activeWeatherAlerts > 0) {
    risks.push({ level: "bad", text: `${activeWeatherAlerts} active NWS alert(s) near Clemson. Review before launch.` });
  } else {
    risks.push({ level: "good", text: "No active NWS alerts for the Clemson station point." });
  }

  if (visibilityRisk) {
    risks.push({ level: "bad", text: `No-go: visibility is ${formatNumber(data.visibilityMiles)} miles.` });
  } else if (lowCeiling) {
    risks.push({ level: "caution", text: `KCEU ceiling is reported at ${formatNumber(ceiling)} ft. Verify clearance before launch.` });
  } else {
    risks.push({ level: "good", text: `Visibility ${formatNumber(data.visibilityMiles)} miles; KCEU ceiling ${ceiling === null ? "not reported" : `${formatNumber(ceiling)} ft`}.` });
  }

  if (heatRisk) {
    risks.push({ level: "caution", text: `Heat watch: heat index ${formatNumber(data.heatIndex)} F, WBGT ${formatNumber(data.wbgt)} F.` });
  }

  risks.push({ level: "caution", text: "Pilot should still verify launch-site visibility, cloud ceiling, battery temperature, and nearby people/obstructions." });

  const status = windRisk || rainNow || activeWeatherAlerts > 0 || visibilityRisk ? "NO-GO" : rainImminent || rainyForecast || heatRisk || lowCeiling ? "CAUTION" : "GO";
  const statusClass = status === "NO-GO" ? "no-go" : status === "CAUTION" ? "caution" : "go";

  els.stationName.textContent = data.stationName;
  els.lastUpdated.textContent = data.observedAt
    ? `WeatherSTEM reading ${formatStationTime(data.observedAt)}`
    : `Updated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  els.decisionPanel.className = `decision-panel ${statusClass}`;
  els.flightStatus.textContent = status;
  const watchCount = risks.filter(risk => risk.level !== "good").length;
  els.watchSummary.textContent = `${watchCount} risk factor${watchCount === 1 ? "" : "s"} being watched`;
  els.flightReason.textContent = status === "NO-GO"
    ? "Conditions include a hard-stop factor for drone operations. Delay launch until the risk clears."
    : status === "CAUTION"
      ? "No hard-stop factor is present, but forecast weather calls for an on-scene pilot review."
      : "Available wind, rain, alert, and visibility indicators are favorable for flight.";

  els.gustValue.textContent = valueWithUnit(data.gustMph, "mph");
  els.gustNote.textContent = data.gustMph >= GUST_LIMIT
    ? "At or above no-flight limit"
    : `${windForecastLabel}: ${valueWithUnit(maxForecastWindDisplay, "mph")}`;
  els.windValue.textContent = valueWithUnit(data.windMph, "mph");
  els.windNote.textContent = data.windDirection === null ? "Direction unavailable" : `${data.windCardinal || degreesToCompass(data.windDirection)} (${Math.round(data.windDirection)} deg)`;
  els.rainValue.className = `rain-state ${rainStatus.className}`;
  els.rainValue.textContent = rainStatus.label;
  els.rainNote.textContent = rainStatus.note;
  els.visibilityValue.textContent = valueWithUnit(data.visibilityMiles, "mi");
  els.visibilityNote.textContent = ceiling === null
    ? `KCEU: no ceiling reported (${data.airportSky || "sky unavailable"})`
    : `KCEU ceiling ${formatNumber(ceiling)} ft`;
  els.alertValue.textContent = activeWeatherAlerts ? String(activeWeatherAlerts) : "None";
  els.alertNote.textContent = activeWeatherAlerts ? data.currentAlerts[0].properties.event : "Active NWS alerts";

  els.riskCount.textContent = `${watchCount} watch item(s)`;
  els.riskList.innerHTML = risks.map(risk => `<li class="${risk.level}">${risk.text}</li>`).join("");

  els.forecastStrip.innerHTML = hasForecast ? next12.slice(0, 6).map(item => `
    <div class="forecast-card">
      <span>${item.time.toLocaleTimeString([], { hour: "numeric" })}</span>
      <strong>${escapeHtml(item.condition)}</strong>
      <small>${item.temp} F</small>
      <small>Wind ${escapeHtml(item.wind)}</small>
      <small>Rain ${item.pop ?? 0}%</small>
    </div>
  `).join("") : `
    <div class="forecast-card forecast-unavailable">
      <span>Forecast</span>
      <strong>Unavailable</strong>
      <small>WeatherSTEM hourly forecast did not load.</small>
    </div>
  `;

}

function decodeUnit(unit) {
  const element = document.createElement("textarea");
  element.innerHTML = unit;
  return element.value.replace(/\s+/g, " ").trim();
}

function mergeDefined(primary, secondary) {
  const merged = { ...primary };
  Object.entries(secondary).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      merged[key] = value;
    }
  });
  return merged;
}

function formatForecastWind(speed, direction) {
  if (speed === null || speed === undefined || Number.isNaN(Number(speed))) return "--";
  return `${formatNumber(speed)} mph${direction ? ` ${direction}` : ""}`;
}

function parseWeatherStemTime(value) {
  if (!value) return new Date();
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(value) : date;
}

function getRainStatus(data, forecast) {
  const rainRate = Number(data.rainRate);
  const rainToday = Number(data.rainToday);
  const hasRainRate = data.rainRate !== null && data.rainRate !== undefined && !Number.isNaN(rainRate);

  if (!hasRainRate && !forecast.rainNextHour && !forecast.rainyForecast) {
    return { label: "UNKNOWN", className: "rain-unknown", note: "Rain feeds unavailable" };
  }

  if (rainRate >= 0.04) {
    return { label: "RAINING", className: "rain-now", note: `${formatNumber(rainRate)} in/hr now` };
  }

  if (rainRate > 0) {
    return { label: "DRIZZLE", className: "rain-drizzle", note: `${formatNumber(rainRate)} in/hr now` };
  }

  if (forecast.stormNextHour) {
    return { label: "STORM RISK", className: "rain-storm", note: `${forecast.nextHourPop}% chance in next hour` };
  }

  if (forecast.rainNextHour) {
    return { label: "IMMINENT", className: "rain-imminent", note: `${forecast.nextHourPop}% chance in next hour` };
  }

  if (forecast.rainyForecast) {
    return { label: "RAIN LATER", className: "rain-later", note: "Possible within 6 hours" };
  }

  if (!Number.isNaN(rainToday) && rainToday > 0) {
    return { label: "WET RECENTLY", className: "rain-recent", note: `${formatNumber(rainToday)} in last 24 hr` };
  }

  return { label: "CLEAR", className: "rain-clear", note: "No rain signal next hour" };
}

function valueWithUnit(value, unit) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? "--" : `${formatNumber(value)} ${unit}`;
}

function formatNumber(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? "--" : Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1);
}

function formatStationTime(value) {
  const normalized = value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function degreesToCompass(degrees) {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[Math.round(Number(degrees) / 22.5) % 16] || "--";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
