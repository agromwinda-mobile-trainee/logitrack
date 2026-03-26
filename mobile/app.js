const API_BASE = document.body.dataset.apiBase || "http://localhost:8000/api";

// Offline cache (simple) pour stocker des positions quand le réseau tombe.
const LS_VEHICLE_ID = "logitrack_mobile_vehicle_id";
const LS_QUEUE = "logitrack_mobile_offline_queue";
const LS_LAST_POSITION = "logitrack_mobile_lastPosition";
const LS_LAST_GEOFENCE = "logitrack_mobile_lastGeofence";

function lsQueue() {
  try {
    const raw = localStorage.getItem(LS_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLsQueue(q) {
  localStorage.setItem(LS_QUEUE, JSON.stringify(q));
}

async function fetchJson(path, init) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  // Some endpoints (e.g. POST batch) return JSON.
  return await res.json();
}

const el = {
  vehicleSelect: document.getElementById("vehicleSelect"),
  vehicleIdInput: document.getElementById("vehicleIdInput"),
  fuelInput: document.getElementById("fuelInput"),
  assignedVehicleText: document.getElementById("assignedVehicleText"),
  mapBox: document.getElementById("mapBox"),
  netDot: document.getElementById("netDot"),
  netText: document.getElementById("netText"),
  latLon: document.getElementById("latLon"),
  speed: document.getElementById("speed"),
  fuel: document.getElementById("fuel"),
  updatedAt: document.getElementById("updatedAt"),
  offlineHint: document.getElementById("offlineHint"),
  geoText: document.getElementById("geoText"),
  geoBadge: document.getElementById("geoBadge"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
};

let selectedVehicleId = null;
let watchId = null;
let tracking = false;

// Carte conducteur (Leaflet)
let map = null;
let marker = null;
let accuracyCircle = null;
let mapReady = false;

function initMapIfPossible() {
  try {
    if (mapReady) return;
    if (!el.mapBox) return;
    if (typeof window.L === "undefined") return;

    map = window.L.map(el.mapBox, { zoomControl: true });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    map.setView([33.5731, -7.5898], 12);
    mapReady = true;
  } catch {
    // ignore
  }
}

function updateMap(lat, lon, accuracyM) {
  if (!mapReady) return;
  const ll = [lat, lon];
  if (!marker) {
    marker = window.L.circleMarker(ll, {
      radius: 7,
      color: "#0974B0",
      weight: 2,
      fillColor: "#0974B0",
      fillOpacity: 0.22,
    }).addTo(map);
    map.setView(ll, 15);
  } else {
    marker.setLatLng(ll);
  }

  if (typeof accuracyM === "number" && Number.isFinite(accuracyM)) {
    if (!accuracyCircle) {
      accuracyCircle = window.L.circle(ll, {
        radius: accuracyM,
        color: "#0974B0",
        weight: 1,
        fillOpacity: 0.06,
      }).addTo(map);
    } else {
      accuracyCircle.setLatLng(ll);
      accuracyCircle.setRadius(accuracyM);
    }
  }
}

function setNetworkOnline(online) {
  if (online) {
    el.netDot.classList.remove("dotBad");
    el.netDot.classList.add("dotOk");
    el.netText.textContent = "En ligne";
    el.offlineHint.style.display = "none";
  } else {
    el.netDot.classList.remove("dotOk");
    el.netDot.classList.add("dotBad");
    el.netText.textContent = "Offline";
    el.offlineHint.style.display = "block";
  }
}

function renderPosition(pos) {
  if (!pos) {
    el.latLon.textContent = "—";
    el.speed.textContent = "—";
    el.fuel.textContent = "—";
    el.updatedAt.textContent = "—";
    return;
  }

  el.latLon.textContent = `${pos.lat.toFixed(5)} / ${pos.lon.toFixed(5)}`;
  el.speed.textContent = `${Math.round(pos.speed_kmh)} km/h`;
  el.fuel.textContent = `${pos.fuel_l_per_100km.toFixed(1)} L/100km`;
  el.updatedAt.textContent = new Date(pos.timestamp).toLocaleString("fr-FR");
}

function renderGeofence(checkOut) {
  if (!checkOut) {
    el.geoText.textContent = "—";
    el.geoBadge.textContent = "—";
    el.geoBadge.style.borderColor = "rgba(238,247,242,0.08)";
    return;
  }

  const inside = checkOut.inside || [];
  if (inside.length > 0) {
    el.geoBadge.textContent = `OK (${inside.length})`;
    el.geoBadge.style.borderColor = "rgba(46,255,157,0.35)";
    el.geoBadge.style.color = "#2eff9d";
    el.geoText.textContent = `Dans: ${inside.map((g) => g.name).join(", ")}`;
  } else {
    el.geoBadge.textContent = "Hors zone";
    el.geoBadge.style.borderColor = "rgba(255,59,74,0.25)";
    el.geoBadge.style.color = "#ff3b4a";
    el.geoText.textContent = "Aucun géofence actif.";
  }
}

function loadLastPosition() {
  try {
    const raw = localStorage.getItem(LS_LAST_POSITION);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLastPosition(pos) {
  localStorage.setItem(LS_LAST_POSITION, JSON.stringify(pos));
}

function loadLastGeofence() {
  try {
    const raw = localStorage.getItem(LS_LAST_GEOFENCE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLastGeofence(checkOut) {
  localStorage.setItem(LS_LAST_GEOFENCE, JSON.stringify(checkOut));
}

async function bootstrapVehicles() {
  const cachedVehicleId = localStorage.getItem(LS_VEHICLE_ID);

  let vehicles = [];
  try {
    setNetworkOnline(true);
    vehicles = await fetchJson("/vehicles");
  } catch {
    setNetworkOnline(false);
    vehicles = [];
  }

  el.vehicleSelect.innerHTML = "";
  if (vehicles.length > 0) {
    for (const v of vehicles) {
      const opt = document.createElement("option");
      opt.value = String(v.id);
      opt.textContent = `${v.label} — ${v.plate_number}`;
      el.vehicleSelect.appendChild(opt);
    }
    if (cachedVehicleId) {
      el.vehicleSelect.value = String(cachedVehicleId);
      selectedVehicleId = Number(el.vehicleSelect.value);
    } else {
      // Affectation aléatoire (si pas de cache) : on choisit un véhicule existant.
      const idx = Math.floor(Math.random() * vehicles.length);
      const chosen = vehicles[idx];
      el.vehicleSelect.value = String(chosen.id);
      selectedVehicleId = Number(chosen.id);
    }
  } else {
    // Sans liste véhicules (offline) on se base sur le cache.
    if (cachedVehicleId) selectedVehicleId = Number(cachedVehicleId);
  }

  if (selectedVehicleId) localStorage.setItem(LS_VEHICLE_ID, String(selectedVehicleId));

  // Affichage affectation (propre)
  try {
    const selectedOpt = el.vehicleSelect?.selectedOptions?.[0];
    if (selectedVehicleId && selectedOpt?.textContent) {
      el.assignedVehicleText.textContent = selectedOpt.textContent;
    } else if (selectedVehicleId) {
      el.assignedVehicleText.textContent = `Véhicule #${selectedVehicleId}`;
    } else {
      el.assignedVehicleText.textContent = "—";
    }
  } catch {
    // ignore
  }
}

el.vehicleSelect.addEventListener("change", () => {
  selectedVehicleId = Number(el.vehicleSelect.value);
  localStorage.setItem(LS_VEHICLE_ID, String(selectedVehicleId));

  if (el.assignedVehicleText) {
    const selectedOpt = el.vehicleSelect?.selectedOptions?.[0];
    el.assignedVehicleText.textContent = selectedOpt?.textContent ?? `Véhicule #${selectedVehicleId}`;
  }

  renderPosition(loadLastPosition());
  renderGeofence(loadLastGeofence());
});

function readVehicleIdInput() {
  const raw = el.vehicleIdInput?.value;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

el.vehicleIdInput?.addEventListener("change", () => {
  const id = readVehicleIdInput();
  if (!id) return;
  selectedVehicleId = id;
  localStorage.setItem(LS_VEHICLE_ID, String(selectedVehicleId));
});

function coordsToPositionPayload(vehicleId, coords) {
  // Geolocation fournit la vitesse en m/s.
  const speedKmh = typeof coords.speed === "number" && Number.isFinite(coords.speed) ? coords.speed * 3.6 : undefined;
  const headingDeg = typeof coords.heading === "number" && Number.isFinite(coords.heading) ? coords.heading : undefined;

  const payload = {
    vehicle_id: vehicleId,
    lat: coords.latitude,
    lon: coords.longitude,
    timestamp: new Date().toISOString(),
  };

  if (speedKmh !== undefined) payload.speed_kmh = speedKmh;
  if (headingDeg !== undefined) payload.heading_deg = headingDeg;
  // Le carburant (L/100km) vient de la saisie conducteur, pas du GPS.
  const rawFuel = el.fuelInput?.value;
  const fuel = rawFuel ? Number(rawFuel) : NaN;
  if (Number.isFinite(fuel)) payload.fuel_l_per_100km = fuel;

  return payload;
}

async function flushQueue() {
  if (!selectedVehicleId) return;

  const q = lsQueue();
  if (q.length === 0) return;

  try {
    setNetworkOnline(true);
    const batch = { positions: q.map((p) => ({ ...p, vehicle_id: selectedVehicleId })) };
    await fetchJson("/tracking/positions/batch", { method: "POST", body: JSON.stringify(batch) });
    setLsQueue([]);
  } catch (e) {
    setNetworkOnline(false);
  }
}

async function sendPositionOrQueue(payload) {
  try {
    setNetworkOnline(true);
    await fetchJson("/tracking/positions", { method: "POST", body: JSON.stringify(payload) });
    saveLastPosition(payload);
    return true;
  } catch {
    setNetworkOnline(false);
    const q = lsQueue();
    q.push(payload);
    setLsQueue(q);
    return false;
  }
}

let lastGeofenceCheckAt = 0;

async function periodicGeofenceCheck() {
  if (!selectedVehicleId) return;
  const now = Date.now();
  if (now - lastGeofenceCheckAt < 30_000) return;
  lastGeofenceCheckAt = now;

  try {
    const out = await fetchJson(`/geofences/check/${selectedVehicleId}`);
    renderGeofence(out);
    saveLastGeofence(out);
  } catch {
    // Offline: on garde le cache.
    renderGeofence(loadLastGeofence());
  }
}

async function startTracking() {
  if (tracking) return;
  if (!selectedVehicleId) selectedVehicleId = readVehicleIdInput();

  if (!selectedVehicleId) {
    alert("Saisis un ID véhicule (ou sélectionne un véhicule).");
    return;
  }
  tracking = true;

  // Flush queue dès le départ (si réseau).
  await flushQueue();

  let lastSentAt = 0;
  const minIntervalMs = 5000; // on envoie au max toutes les 5s

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const now = Date.now();
      if (now - lastSentAt < minIntervalMs) return;
      lastSentAt = now;

      const payload = coordsToPositionPayload(selectedVehicleId, pos.coords);
      await sendPositionOrQueue(payload);

      initMapIfPossible();
      updateMap(payload.lat, payload.lon, pos.coords.accuracy);

      renderPosition({
        lat: payload.lat,
        lon: payload.lon,
        speed_kmh: payload.speed_kmh ?? 0,
        fuel_l_per_100km: payload.fuel_l_per_100km ?? 24.0,
        timestamp: payload.timestamp,
      });
      await periodicGeofenceCheck();

      // si offline->online, on vide la queue régulièrement
      await flushQueue();
    },
    (err) => {
      setNetworkOnline(false);
      el.geoText.textContent = `GPS: erreur (${err.code}).`;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10_000,
    }
  );
}

function stopTracking() {
  tracking = false;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

el.startBtn.addEventListener("click", () => void startTracking());
el.stopBtn.addEventListener("click", () => stopTracking());

async function start() {
  setNetworkOnline(false);
  await bootstrapVehicles();

  initMapIfPossible();
  // Rendu cache immédiat
  const cached = loadLastPosition();
  renderPosition(cached);
  if (cached) updateMap(cached.lat, cached.lon, undefined);
  renderGeofence(loadLastGeofence());
}

void start();

