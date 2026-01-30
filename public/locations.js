function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const pageMeta = document.getElementById("page-meta");
const tableEl = document.getElementById("locations-table");
const searchInput = document.getElementById("search");
const viewTableBtn = document.getElementById("view-table");
const viewMapBtn = document.getElementById("view-map");
const mapShell = document.getElementById("locations-map-shell");
const mapEl = document.getElementById("locations-map");
const mapMeta = document.getElementById("map-meta");
const mapModeSelect = document.getElementById("locations-map-mode");
const mapStyleSelect = document.getElementById("locations-map-style");

const openAdd = document.getElementById("open-add-location");
const modal = document.getElementById("add-location-modal");
const closeAdd = document.getElementById("close-add-location");
const form = document.getElementById("add-location-form");
const submit = document.getElementById("add-location-submit");
const meta = document.getElementById("add-location-meta");
const addAddressSearchInput = document.getElementById("add-location-address-search");
const addAddressSuggestions = document.getElementById("add-location-address-suggestions");
const addMapStyleSelect = document.getElementById("add-location-map-style");
const addMapEl = document.getElementById("add-location-map");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let locationsCache = [];
let equipmentMapCache = [];
let equipmentMapCompanyId = null;
let sortField = "name";
let sortDir = "asc";
let searchTerm = "";
let activeView = (() => {
  try {
    return localStorage.getItem("locationsView") || "table";
  } catch {
    return "table";
  }
})();
let mapMode = (() => {
  try {
    return localStorage.getItem("locationsMapMode") || "units";
  } catch {
    return "units";
  }
})();

let googleMap = null;
let mapMarkers = [];
let mapInfoWindow = null;
let mapStyle = "street";

let addGoogleMap = null;
let addGoogleMarker = null;
let addPlacesService = null;
let addAutocompleteService = null;
let addGeocoder = null;
let addSelected = null;
let addMapStyle = "street";
const addAddressState = { debounceTimer: null, previewTimer: null, abort: null, seq: 0 };

let googleMapsApiKey = "";
let googleMapsLoadError = null;

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toCoord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isGoogleMapsReady() {
  return typeof window.google?.maps?.Map === "function";
}

function waitForGoogleMapsReady({ timeoutMs = 4000, intervalMs = 50 } = {}) {
  if (isGoogleMapsReady()) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (isGoogleMapsReady()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return reject(new Error("Google Maps not ready."));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.resolve(false);
  if (isGoogleMapsReady()) return Promise.resolve(true);
  if (window.__rentsoftGoogleMapsLoading) return window.__rentsoftGoogleMapsLoading;

  window.__rentsoftGoogleMapsLoading = new Promise((resolve, reject) => {
    const id = "rentsoft-google-maps";
    const existing = document.getElementById(id);
    if (existing) {
      waitForGoogleMapsReady().then(() => resolve(true)).catch(reject);
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    s.onload = () => {
      waitForGoogleMapsReady().then(() => resolve(true)).catch(reject);
    };
    s.onerror = () => reject(new Error("Failed to load Google Maps script (network/CSP)."));
    document.head.appendChild(s);
  });
  return window.__rentsoftGoogleMapsLoading;
}

async function getPublicConfig() {
  const res = await fetch("/api/public-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load config");
  return data || {};
}

function parsePredictionText(prediction) {
  const main = prediction?.structured_formatting?.main_text || prediction?.description || "";
  const secondary = prediction?.structured_formatting?.secondary_text || "";
  return { main: String(main || ""), secondary: String(secondary || "") };
}

function parseAddressComponents(components) {
  const parts = Array.isArray(components) ? components : [];
  const get = (type) => parts.find((c) => Array.isArray(c.types) && c.types.includes(type));
  const streetNumber = get("street_number")?.long_name || "";
  const route = get("route")?.long_name || "";
  const city =
    get("locality")?.long_name ||
    get("postal_town")?.long_name ||
    get("administrative_area_level_2")?.long_name ||
    "";
  const region = get("administrative_area_level_1")?.short_name || get("administrative_area_level_1")?.long_name || "";
  const country = get("country")?.long_name || "";
  const street = [streetNumber, route].filter(Boolean).join(" ").trim() || route || "";
  return { street, city, region, country };
}

function requestPlacePredictions(service, input, map) {
  if (!service || !window.google?.maps?.places) {
    return Promise.reject(new Error("Google Places library not available."));
  }
  const locationBias = map?.getBounds?.() || undefined;
  return new Promise((resolve, reject) => {
    service.getPlacePredictions(
      { input: String(input || ""), locationBias },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
        if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
          return reject(new Error(`Places predictions failed: ${status || "Unknown"}`));
        }
        resolve(predictions || []);
      }
    );
  });
}

function fetchPlaceDetails(service, placeId, label) {
  if (!service || !window.google?.maps?.places) {
    return Promise.reject(new Error("Google Places library not available."));
  }
  return new Promise((resolve, reject) => {
    service.getDetails(
      { placeId, fields: ["geometry", "formatted_address", "name", "address_component"] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          return reject(new Error(`Places details failed: ${status || "Unknown"}`));
        }
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        resolve({
          lat,
          lng,
          label: place.formatted_address || place.name || label || "Pinned location",
          components: place.address_components || [],
        });
      }
    );
  });
}

function geocodeAddress(geocoder, query) {
  if (!geocoder) return Promise.reject(new Error("Google Geocoder not available."));
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address: String(query || "") }, (results, status) => {
      if (status !== "OK" || !results?.length) return reject(new Error(`Geocode failed: ${status || "Unknown"}`));
      const first = results[0];
      const loc = first?.geometry?.location;
      if (!loc) return reject(new Error("Geocode returned no location."));
      resolve({
        lat: loc.lat(),
        lng: loc.lng(),
        label: first.formatted_address || query || "",
        components: first.address_components || [],
      });
    });
  });
}

function normalizeMapStyle(value) {
  return value === "satellite" ? "satellite" : "street";
}

function applyAddMapStyle(nextStyle) {
  addMapStyle = normalizeMapStyle(nextStyle ?? addMapStyle);
  if (addMapStyleSelect && addMapStyleSelect.value !== addMapStyle) {
    addMapStyleSelect.value = addMapStyle;
  }
  if (!addGoogleMap || !isGoogleMapsReady()) return;
  addGoogleMap.setMapTypeId(addMapStyle === "satellite" ? "satellite" : "roadmap");
}

function applyMainMapStyle(nextStyle) {
  mapStyle = normalizeMapStyle(nextStyle ?? mapStyle);
  if (mapStyleSelect && mapStyleSelect.value !== mapStyle) {
    mapStyleSelect.value = mapStyle;
  }
  if (!googleMap || !isGoogleMapsReady()) return;
  googleMap.setMapTypeId(mapStyle === "satellite" ? "satellite" : "roadmap");
}

function formatAddress(loc) {
  const parts = [loc.street_address, loc.city, loc.region, loc.country].filter(Boolean);
  return parts.join(", ");
}

function setView(nextView) {
  activeView = nextView === "map" ? "map" : "table";
  try {
    localStorage.setItem("locationsView", activeView);
  } catch { }

  const isTable = activeView === "table";
  if (tableEl) tableEl.style.display = isTable ? "" : "none";
  if (mapShell) mapShell.style.display = isTable ? "none" : "block";

  if (viewTableBtn) {
    viewTableBtn.classList.toggle("active", isTable);
    viewTableBtn.setAttribute("aria-selected", isTable ? "true" : "false");
  }
  if (viewMapBtn) {
    viewMapBtn.classList.toggle("active", !isTable);
    viewMapBtn.setAttribute("aria-selected", !isTable ? "true" : "false");
  }

  if (!isTable) {
    refreshMap().catch((err) => {
      if (mapMeta) mapMeta.textContent = err?.message || String(err);
    });
  }
}

function ensureAddMap() {
  if (!addMapEl) return;
  if (!isGoogleMapsReady()) {
    if (meta && googleMapsLoadError) meta.textContent = googleMapsLoadError.message || String(googleMapsLoadError);
    return;
  }
  if (addGoogleMap) {
    setTimeout(() => window.google?.maps?.event?.trigger?.(addGoogleMap, "resize"), 50);
    return;
  }

  addGoogleMap = new window.google.maps.Map(addMapEl, {
    center: { lat: 20, lng: 0 },
    zoom: 2,
    mapTypeId: addMapStyle === "satellite" ? "satellite" : "roadmap",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  addPlacesService = new window.google.maps.places.PlacesService(addGoogleMap);
  addAutocompleteService = new window.google.maps.places.AutocompleteService();
  addGeocoder = new window.google.maps.Geocoder();

  addGoogleMap.addListener("click", (e) => {
    const lat = e?.latLng?.lat?.();
    const lng = e?.latLng?.lng?.();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    addSelected = { lat, lng, label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, provider: "manual_pin" };
    setAddMapPoint(lat, lng, 17);
    if (meta) meta.textContent = "Pinned location (not saved yet).";
  });

  applyAddMapStyle(addMapStyle);
  setTimeout(() => window.google?.maps?.event?.trigger?.(addGoogleMap, "resize"), 50);
}

function setAddMapPoint(lat, lng, zoom = 16) {
  if (!addGoogleMap || !isGoogleMapsReady()) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (!addGoogleMarker) {
    addGoogleMarker = new window.google.maps.Marker({ position: { lat, lng }, map: addGoogleMap });
  } else {
    addGoogleMarker.setPosition({ lat, lng });
  }
  addGoogleMap.setCenter({ lat, lng });
  addGoogleMap.setZoom(zoom);
}

function hideAddSuggestions() {
  if (!addAddressSuggestions) return;
  addAddressSuggestions.hidden = true;
  addAddressSuggestions.replaceChildren();
}

function renderAddSuggestions(results, onPick) {
  if (!addAddressSuggestions) return;
  addAddressSuggestions.replaceChildren();
  const rows = Array.isArray(results) ? results : [];
  if (!rows.length) {
    addAddressSuggestions.hidden = true;
    return;
  }
  rows.slice(0, 8).forEach((r) => {
    const { main, secondary } = parsePredictionText(r);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `
      <div class="rs-autocomplete-primary">${escapeHtml(main)}</div>
      ${secondary ? `<div class="rs-autocomplete-secondary">${escapeHtml(secondary)}</div>` : ""}
    `;
    let picked = false;
    const pick = () => {
      if (picked) return;
      picked = true;
      onPick(r);
    };
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pick();
    });
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      pick();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      pick();
    });
    addAddressSuggestions.appendChild(btn);
  });
  addAddressSuggestions.hidden = false;
}

async function searchGeocode(query, limit = 6) {
  const q = String(query || "").trim();
  if (!q) return [];
  const preds = await requestPlacePredictions(addAutocompleteService, q, addGoogleMap);
  return preds.slice(0, limit);
}

function buildFormAddressQuery(payload) {
  const parts = [payload.streetAddress, payload.city, payload.region, payload.country]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function ensureMap() {
  if (!mapEl || !mapShell) return;
  if (!isGoogleMapsReady()) {
    if (mapMeta && googleMapsLoadError) mapMeta.textContent = googleMapsLoadError.message || String(googleMapsLoadError);
    return;
  }
  if (googleMap) {
    setTimeout(() => window.google?.maps?.event?.trigger?.(googleMap, "resize"), 50);
    return;
  }

  googleMap = new window.google.maps.Map(mapEl, {
    center: { lat: 20, lng: 0 },
    zoom: 2,
    mapTypeId: mapStyle === "satellite" ? "satellite" : "roadmap",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  mapInfoWindow = new window.google.maps.InfoWindow();
  applyMainMapStyle(mapStyle);
  setTimeout(() => window.google?.maps?.event?.trigger?.(googleMap, "resize"), 50);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterLatLng(lat, lng, seed) {
  const rand = mulberry32(seed);
  const rMeters = 10;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * rMeters;
  const dLat = (r * Math.cos(a)) / 111111;
  const dLng = (r * Math.sin(a)) / (111111 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

function applyUnitFilters() {
  let rows = [...equipmentMapCache];
  if (searchTerm) {
    const term = String(searchTerm).toLowerCase();
    rows = rows.filter((r) =>
      [r.type, r.model_name, r.serial_number, r.location, r.availability_status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }
  return rows;
}

async function loadEquipmentForMap() {
  if (!activeCompanyId) return;
  if (equipmentMapCompanyId === activeCompanyId && equipmentMapCache.length) return;
  const res = await fetch(`/api/equipment?companyId=${encodeURIComponent(activeCompanyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to fetch equipment");
  equipmentMapCache = data.equipment || [];
  equipmentMapCompanyId = activeCompanyId;
}

async function refreshMap() {
  if (activeView !== "map") return;
  ensureMap();
  if (mapMode === "units") await loadEquipmentForMap();
  renderMap();
  setTimeout(() => window.google?.maps?.event?.trigger?.(googleMap, "resize"), 50);
}

function renderUnitsMap(rows) {
  if (!googleMap || !isGoogleMapsReady()) return;

  const coordSource = (eq) => {
    const cLat = toCoord(eq?.current_location_latitude);
    const cLng = toCoord(eq?.current_location_longitude);
    if (cLat !== null && cLng !== null) return { lat: cLat, lng: cLng, source: "current" };
    const bLat = toCoord(eq?.location_latitude);
    const bLng = toCoord(eq?.location_longitude);
    if (bLat !== null && bLng !== null) return { lat: bLat, lng: bLng, source: "base" };
    return null;
  };

  const hasCoord = (eq) => Boolean(coordSource(eq));
  const mapped = rows.filter(hasCoord);
  const missing = rows.length - mapped.length;

  if (mapMeta) {
    if (!rows.length) mapMeta.textContent = "No units to show.";
    else if (!mapped.length) mapMeta.textContent = "No units have mapped locations yet. Assign a base/current location to a geocoded location.";
    else mapMeta.textContent = `${mapped.length} units mapped - ${missing} missing coordinates`;
  }

  const statusColors = {
    notRented: { stroke: "#6b7280", fill: "rgba(107, 114, 128, 0.30)" },
    rented: { stroke: "#16a34a", fill: "rgba(22, 163, 74, 0.30)" },
    overdue: { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.30)" },
  };

  const bounds = new window.google.maps.LatLngBounds();
  let hasBounds = false;
  mapped.forEach((eq) => {
    const src = coordSource(eq);
    if (!src) return;
    const lat = src.lat;
    const lng = src.lng;
    const [jLat, jLng] = jitterLatLng(lat, lng, Number(eq.id) || 1);
    bounds.extend({ lat: jLat, lng: jLng });
    hasBounds = true;

    const title = escapeHtml(`${eq.type || "Unit"} - ${eq.model_name || "--"}`);
    const serial = escapeHtml(eq.serial_number || "--");
    const baseLocation = escapeHtml(eq.location || "--");
    const currentLocation = escapeHtml(eq.current_location || "--");
    const status = escapeHtml(eq.availability_status || "Unknown");
    const href = `equipment.html?equipmentId=${encodeURIComponent(eq.id)}`;
    const locLine = src.source === "current" ? `Current: ${currentLocation}` : `Base: ${baseLocation}`;

    const isOverdue = eq?.is_overdue === true;
    const availability = String(eq.availability_status || "");
    const isRented = availability.toLowerCase().includes("rent") || availability.toLowerCase().includes("out");
    const palette = isOverdue ? statusColors.overdue : (isRented ? statusColors.rented : statusColors.notRented);
    const marker = new window.google.maps.Marker({
      position: { lat: jLat, lng: jLng },
      map: googleMap,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: palette.fill,
        fillOpacity: 1,
        strokeColor: palette.stroke,
        strokeWeight: 2,
      },
    });
    marker.addListener("click", () => {
      if (!mapInfoWindow) return;
      mapInfoWindow.setContent(
        `<div style="display:grid; gap:6px;">
          <div style="font-weight:800;">${title}</div>
          <div class="hint">Serial: ${serial}</div>
          <div class="hint">${locLine}</div>
          ${src.source === "current" ? `<div class="hint">Base: ${baseLocation}</div>` : `<div class="hint">Current: ${currentLocation}</div>`}
          <div class="hint">Status: ${isOverdue ? "Overdue" : status}</div>
          <div><a href="${href}">Open in Stock</a></div>
        </div>`
      );
      mapInfoWindow.open({ anchor: marker, map: googleMap });
    });
    mapMarkers.push(marker);
  });

  if (hasBounds) {
    googleMap.fitBounds(bounds, { padding: 30, maxZoom: 16 });
  } else {
    googleMap.setCenter({ lat: 20, lng: 0 });
    googleMap.setZoom(2);
  }
}

function renderMap() {
  if (activeView !== "map") return;
  if (!googleMap || !isGoogleMapsReady()) return;

  mapMarkers.forEach((m) => m.setMap(null));
  mapMarkers = [];

  if (mapMode === "units") {
    renderUnitsMap(applyUnitFilters());
    return;
  }
  renderLocationsMap(applyFilters());
}

function renderLocationsMap(rows) {
  if (activeView !== "map") return;
  if (!googleMap || !isGoogleMapsReady()) return;

  const hasCoord = (loc) => toCoord(loc?.latitude) !== null && toCoord(loc?.longitude) !== null;
  const mapped = rows.filter(hasCoord);
  const missing = rows.length - mapped.length;

  if (mapMeta) {
    if (!rows.length) mapMeta.textContent = "No locations to show.";
    else if (!mapped.length) mapMeta.textContent = "No mapped locations yet. Add an address, then click Geocode in the table view.";
    else mapMeta.textContent = `${mapped.length} mapped • ${missing} missing coordinates`;
  }

  const bounds = new window.google.maps.LatLngBounds();
  let hasBounds = false;
  mapped.forEach((loc) => {
    const lat = toCoord(loc?.latitude);
    const lng = toCoord(loc?.longitude);
    if (lat === null || lng === null) return;
    bounds.extend({ lat, lng });
    hasBounds = true;
    const name = escapeHtml(loc.name || `#${loc.id}`);
    const address = escapeHtml(formatAddress(loc) || "--");
    const href = `location.html?id=${encodeURIComponent(loc.id)}`;
    const marker = new window.google.maps.Marker({ position: { lat, lng }, map: googleMap });
    marker.addListener("click", () => {
      if (!mapInfoWindow) return;
      mapInfoWindow.setContent(
        `<div style="display:grid; gap:6px;">
          <div style="font-weight:800;">${name}</div>
          <div class="hint">${address}</div>
          <div><a href="${href}">Open</a></div>
        </div>`
      );
      mapInfoWindow.open({ anchor: marker, map: googleMap });
    });
    mapMarkers.push(marker);
  });

  if (hasBounds) {
    googleMap.fitBounds(bounds, { padding: 30, maxZoom: 14 });
  } else {
    googleMap.setCenter({ lat: 20, lng: 0 });
    googleMap.setZoom(2);
  }
}

function showModal() {
  if (!modal) return;
  modal.style.display = "flex";
  ensureAddMap();
  setTimeout(() => window.google?.maps?.event?.trigger?.(addGoogleMap, "resize"), 50);
}

function hideModal() {
  if (!modal) return;
  modal.style.display = "none";
  if (meta) meta.textContent = "";
  form?.reset?.();
  hideAddSuggestions();
  addSelected = null;
  try {
    addAddressState.abort?.abort?.();
  } catch { }
  if (addGoogleMarker) {
    try {
      addGoogleMarker.setMap(null);
    } catch { }
    addGoogleMarker = null;
  }
  if (addGoogleMap) {
    addGoogleMap.setCenter({ lat: 20, lng: 0 });
    addGoogleMap.setZoom(2);
  }
}

function renderLocations(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };

  tableEl.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "name" ? "active" : ""}" data-sort="name">Name ${indicator("name")}</span>
      <span class="sort ${sortField === "address" ? "active" : ""}" data-sort="address">Address ${indicator("address")}</span>
      <span></span>
    </div>`;

  rows.forEach((loc) => {
    const hasCoord = toCoord(loc?.latitude) !== null && toCoord(loc?.longitude) !== null;
    const hasAddress = Boolean(formatAddress(loc));
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = loc.id;
    div.innerHTML = `
      <span>${escapeHtml(loc.name || `#${loc.id}`)}</span>
      <span>${escapeHtml(formatAddress(loc) || "--")}</span>
      <span style="justify-self:end; display:flex; gap:8px; align-items:center;">
        ${!hasCoord && hasAddress ? `<button class="ghost small" type="button" data-geocode>Geocode</button>` : ""}
        <button class="ghost small danger" type="button" data-delete>Delete</button>
      </span>
    `;
    tableEl.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...locationsCache];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [r.name, formatAddress(r)].filter(Boolean).some((v) => String(v).toLowerCase().includes(term))
    );
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const sortKey = (row) => {
    if (sortField === "address") return norm(formatAddress(row));
    return norm(row[sortField]);
  };
  rows.sort((a, b) => {
    const av = sortKey(a);
    const bv = sortKey(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return rows;
}

async function loadLocations() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/locations?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to fetch locations");
  locationsCache = data.locations || [];
  renderLocations(applyFilters());
  renderMap();
}

async function deleteLocationById(id) {
  const res = await fetch(`/api/locations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  });
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete location");
}

async function geocodeLocationById(id) {
  const res = await fetch(`/api/locations/${encodeURIComponent(id)}/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to geocode location");
  return data.location;
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    if (pageMeta) pageMeta.textContent = "Log in and select a company to view locations.";
    return;
  }
    activeCompanyId = Number(companyId);
  window.RentSoft?.setCompanyId?.(activeCompanyId);

  try {
    const config = await getPublicConfig().catch(() => ({}));
    googleMapsApiKey = config?.googleMapsApiKey ? String(config.googleMapsApiKey) : "";
    const hasGoogle = isGoogleMapsReady();
    if (!googleMapsApiKey && !hasGoogle) {
      throw new Error("Google Maps API key is required. Set GOOGLE_MAPS_API_KEY to use maps.");
    }
    if (!hasGoogle) await loadGoogleMaps(googleMapsApiKey);
  } catch (err) {
    googleMapsLoadError = err;
    const msg = err?.message || String(err);
    if (mapMeta) mapMeta.textContent = msg;
    if (meta) meta.textContent = msg;
  }

  if (pageMeta) pageMeta.textContent = "";

  viewTableBtn?.addEventListener("click", () => setView("table"));
  viewMapBtn?.addEventListener("click", () => setView("map"));
  setView(activeView);

  if (mapStyleSelect) {
    applyMainMapStyle(mapStyleSelect.value);
    mapStyleSelect.addEventListener("change", () => applyMainMapStyle(mapStyleSelect.value));
  }

  if (addMapStyleSelect) {
    applyAddMapStyle(addMapStyleSelect.value);
    addMapStyleSelect.addEventListener("change", () => applyAddMapStyle(addMapStyleSelect.value));
  }

  if (mapModeSelect) {
    mapModeSelect.value = mapMode === "locations" ? "locations" : "units";
    mapModeSelect.addEventListener("change", () => {
      mapMode = mapModeSelect.value === "locations" ? "locations" : "units";
      try {
        localStorage.setItem("locationsMapMode", mapMode);
      } catch { }
      refreshMap().catch((err) => {
        if (mapMeta) mapMeta.textContent = err?.message || String(err);
      });
    });
  }

    openAdd?.addEventListener("click", () => showModal());
  closeAdd?.addEventListener("click", () => hideModal());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });

  addAddressSearchInput?.addEventListener("input", () => {
    const q = String(addAddressSearchInput.value || "").trim();
    if (!q || q.length < 3) {
      hideAddSuggestions();
      return;
    }
    if (addAddressState.debounceTimer) clearTimeout(addAddressState.debounceTimer);
    addAddressState.debounceTimer = setTimeout(async () => {
      const seq = (addAddressState.seq || 0) + 1;
      addAddressState.seq = seq;
      try {
        addAddressState.abort?.abort?.();
      } catch { }
      addAddressState.abort = new AbortController();
      try {
        const results = await searchGeocode(q, 6);
        if (seq !== addAddressState.seq) return;
        if (String(addAddressSearchInput.value || "").trim() !== q) return;
        renderAddSuggestions(results, async (picked) => {
          hideAddSuggestions();
          const placeId = picked?.place_id;
          if (!placeId) return;
          try {
            const details = await fetchPlaceDetails(addPlacesService, placeId, picked?.description || "");
            const parts = parseAddressComponents(details.components);
            addSelected = {
              lat: Number(details.lat),
              lng: Number(details.lng),
              label: details.label || null,
              provider: "google_places",
            };

            if (form?.elements?.namedItem) {
              const set = (name, value) => {
                const el = form.elements.namedItem(name);
                if (el && "value" in el) el.value = value || "";
              };
              set("streetAddress", parts.street || "");
              set("city", parts.city || "");
              set("region", parts.region || "");
              set("country", parts.country || "");
            }

            ensureAddMap();
            setAddMapPoint(addSelected.lat, addSelected.lng, 17);
            if (meta) meta.textContent = "Address selected (not saved yet).";
          } catch (err) {
            if (meta) meta.textContent = err?.message || String(err);
          }
        });
      } catch (err) {
        if (err?.name === "AbortError") return;
        hideAddSuggestions();
        if (meta) meta.textContent = err?.message || String(err);
      }
    }, 450);
  });

  addAddressSearchInput?.addEventListener("blur", () => setTimeout(() => hideAddSuggestions(), 150));

  form?.addEventListener("input", (e) => {
    const t = e.target;
    const name = t?.getAttribute?.("name");
    if (!name || !["streetAddress", "city", "region", "country"].includes(name)) return;
    if (addAddressState.previewTimer) clearTimeout(addAddressState.previewTimer);
    addAddressState.previewTimer = setTimeout(async () => {
      try {
        const payload = getFormData(form);
        const query = buildFormAddressQuery(payload);
        if (!query || query.length < 6) return;
        const details = await geocodeAddress(addGeocoder, query);
        if (!Number.isFinite(details?.lat) || !Number.isFinite(details?.lng)) return;
        addSelected = { lat: details.lat, lng: details.lng, label: details.label || null, provider: "google_geocode" };
        ensureAddMap();
        setAddMapPoint(details.lat, details.lng, 15);
      } catch {
        // ignore preview failures
      }
    }, 800);
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (meta) meta.textContent = "";
    if (submit) submit.disabled = true;
    try {
      const payload = getFormData(form);
      const hasSelected = Number.isFinite(addSelected?.lat) && Number.isFinite(addSelected?.lng);
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(activeCompanyId),
          name: payload.name,
          streetAddress: payload.streetAddress || null,
          city: payload.city || null,
          region: payload.region || null,
          country: payload.country || null,
          latitude: hasSelected ? addSelected.lat : null,
          longitude: hasSelected ? addSelected.lng : null,
          geocodeProvider: hasSelected ? (addSelected.provider || "google_maps") : null,
          geocodeQuery: hasSelected ? (addSelected.label || null) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to add location");
      hideModal();
      await loadLocations();
    } catch (err) {
      if (meta) meta.textContent = err.message || String(err);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to add location");
      hideModal();
      await loadLocations();
    } catch (err) {
      if (meta) meta.textContent = err.message || String(err);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  searchInput?.addEventListener("input", () => {
    searchTerm = String(searchInput.value || "");
    const rows = applyFilters();
    renderLocations(rows);
    renderMap();
  });

  tableEl?.addEventListener("click", async (e) => {
    const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
    if (sort) {
      e.preventDefault();
      if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortField = sort;
        sortDir = "asc";
      }
      renderLocations(applyFilters());
      return;
    }

    const geoBtn = e.target.closest?.("[data-geocode]");
    if (geoBtn) {
      e.preventDefault();
      e.stopPropagation();
      const row = e.target.closest(".table-row");
      const id = row?.dataset?.id;
      if (!id) return;
      if (pageMeta) pageMeta.textContent = "Geocoding...";
      try {
        await geocodeLocationById(id);
        await loadLocations();
        if (pageMeta) pageMeta.textContent = "";
      } catch (err) {
        if (pageMeta) pageMeta.textContent = err.message || String(err);
      }
      return;
    }

    const del = e.target.closest?.("[data-delete]");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const row = e.target.closest(".table-row");
      const id = row?.dataset?.id;
      if (!id) return;
      const loc = locationsCache.find((l) => String(l.id) === String(id));
      const name = loc?.name || `#${id}`;
      if (!window.confirm(`Delete location "${name}"?`)) return;
      try {
        await deleteLocationById(id);
        await loadLocations();
      } catch (err) {
        if (pageMeta) pageMeta.textContent = err.message || String(err);
      }
      return;
    }

    const row = e.target.closest(".table-row");
    if (!row || row.classList.contains("table-header")) return;
    const id = row.dataset.id;
    if (!id) return;
    window.location.href = `location.html?id=${encodeURIComponent(id)}`;
  });

  if (searchInput) searchTerm = String(searchInput.value || "");
  loadLocations().catch((err) => {
    if (pageMeta) pageMeta.textContent = err.message || String(err);
  });
});








