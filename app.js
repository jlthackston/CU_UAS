const LATEST_URL = "https://cdn.weatherstem.com/dashboard/data/dynamic/model/pickens/clemson/latest.json";
const OBSERVATION_URL = "https://data.weatherstem.com/v3/wx/observations/current?geocode=34.6786611119,-82.8431573231&format=json&language=en-US&units=e&apiKey=4898745f-d378-40d1-92a0-e79a3f4e3221";
const POINTS_URL = "https://api.weather.gov/points/34.6786611119,-82.8431573231";
const GUST_LIMIT = 15;

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
  popValue: document.querySelector("#popValue"),
  popNote: document.querySelector("#popNote"),
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
  const [latest, observation] = await Promise.all([
    fetchJson(LATEST_URL).catch(() => null),
    fetchJson(OBSERVATION_URL).catch(() => null)
  ]);
  const nws = await getNwsWeather().catch(() => ({ forecast: [], alerts: [] }));
  const data = {
    ...fallback,
    ...mergeDefined(parseLatest(latest), parseObservation(observation)),
    forecast: nws.forecast,
    currentAlerts: nws.alerts
  };

  render(data);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to fetch ${url}`);
  return response.json();
}

async function getNwsWeather() {
  const point = await fetchJson(POINTS_URL);
  const [forecast, alerts] = await Promise.all([
    fetchJson(point.properties.forecastHourly),
    fetchJson(`https://api.weather.gov/alerts/active?point=34.6786611119,-82.8431573231`)
  ]);

  return {
    forecast: (forecast.properties?.periods || []).slice(0, 12).map(period => ({
      time: new Date(period.startTime),
      temp: period.temperature,
      wind: period.windSpeed,
      gust: parseGust(period.detailedForecast || period.shortForecast || ""),
      pop: period.probabilityOfPrecipitation?.value ?? null,
      condition: period.shortForecast
    })),
    alerts: alerts.features || []
  };
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

function render(data) {
  const next12 = data.forecast;
  const next6 = next12.slice(0, 6);
  const maxForecastGust = Math.max(0, ...next12.map(item => item.gust || 0));
  const maxPop = Math.max(0, ...next6.map(item => item.pop || 0));
  const activeWeatherAlerts = data.currentAlerts.length;
  const rainyForecast = next6.find(item => item.pop >= 40 || /rain|storm|shower/i.test(item.condition || ""));
  const windRisk = data.gustMph >= GUST_LIMIT || maxForecastGust >= GUST_LIMIT;
  const rainNow = Number(data.rainRate) > 0;
  const visibilityRisk = data.visibilityMiles !== null && Number(data.visibilityMiles) < 3;
  const lowCeiling = data.cloudCeiling !== null && Number(data.cloudCeiling) < 500;
  const heatRisk = Number(data.wbgt) >= 90 || Number(data.heatIndex) >= 100;

  const risks = [];
  if (windRisk) {
    risks.push({ level: "bad", text: `No-go: wind gusts are at or forecast above ${GUST_LIMIT} mph.` });
  } else if (maxForecastGust >= 12) {
    risks.push({ level: "caution", text: `Caution: current gust is ${formatNumber(data.gustMph)} mph and forecast gusts are near the operating limit.` });
  } else {
    risks.push({ level: "good", text: `Wind gusts are below the 15 mph no-flight threshold. Current gust: ${formatNumber(data.gustMph)} mph.` });
  }

  if (rainNow) {
    risks.push({ level: "bad", text: `No-go: rain is occurring at ${formatNumber(data.rainRate)} in/hr.` });
  } else if (rainyForecast) {
    risks.push({ level: maxPop >= 70 ? "bad" : "caution", text: `Rain risk: ${maxPop}% precipitation probability in the next 6 hours.` });
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
    risks.push({ level: "caution", text: `Cloud ceiling is reported at ${formatNumber(data.cloudCeiling)} ft. Verify clearance before launch.` });
  } else {
    risks.push({ level: "good", text: `Visibility ${formatNumber(data.visibilityMiles)} miles; cloud cover ${formatNumber(data.cloudCover)}%.` });
  }

  if (heatRisk) {
    risks.push({ level: "caution", text: `Heat watch: heat index ${formatNumber(data.heatIndex)} F, WBGT ${formatNumber(data.wbgt)} F.` });
  }

  risks.push({ level: "caution", text: "Pilot should still verify launch-site visibility, cloud ceiling, battery temperature, and nearby people/obstructions." });

  const status = windRisk || rainNow || activeWeatherAlerts > 0 || visibilityRisk ? "NO-GO" : rainyForecast || heatRisk || lowCeiling ? "CAUTION" : "GO";
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
  els.gustNote.textContent = data.gustMph >= GUST_LIMIT ? "At or above no-flight limit" : `Forecast max ${maxForecastGust || "--"} mph`;
  els.windValue.textContent = valueWithUnit(data.windMph, "mph");
  els.windNote.textContent = data.windDirection === null ? "Direction unavailable" : `${data.windCardinal || degreesToCompass(data.windDirection)} (${Math.round(data.windDirection)} deg)`;
  els.rainValue.textContent = valueWithUnit(data.rainRate, "in/hr");
  els.rainNote.textContent = `${formatNumber(data.rainToday)} in last 24 hr`;
  els.popValue.textContent = `${maxPop}%`;
  els.popNote.textContent = "Next 6 hours";
  els.visibilityValue.textContent = valueWithUnit(data.visibilityMiles, "mi");
  els.visibilityNote.textContent = data.cloudCeiling === null ? `${data.condition || "Condition unavailable"}, cloud cover ${formatNumber(data.cloudCover)}%` : `Ceiling ${formatNumber(data.cloudCeiling)} ft`;
  els.alertValue.textContent = activeWeatherAlerts ? String(activeWeatherAlerts) : "None";
  els.alertNote.textContent = activeWeatherAlerts ? data.currentAlerts[0].properties.event : "Active NWS alerts";

  els.riskCount.textContent = `${watchCount} watch item(s)`;
  els.riskList.innerHTML = risks.map(risk => `<li class="${risk.level}">${risk.text}</li>`).join("");

  els.forecastStrip.innerHTML = next12.slice(0, 6).map(item => `
    <div class="forecast-card">
      <span>${item.time.toLocaleTimeString([], { hour: "numeric" })}</span>
      <strong>${escapeHtml(item.condition)}</strong>
      <small>${item.temp} F</small>
      <small>Wind ${escapeHtml(item.wind)}</small>
      <small>Rain ${item.pop ?? 0}%</small>
    </div>
  `).join("");

}

function parseGust(text) {
  const match = text.match(/gusts? (?:as high as |up to |to )?(\d+)/i);
  return match ? Number(match[1]) : null;
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
