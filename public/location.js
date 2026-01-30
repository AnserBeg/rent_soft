const params = new URLSearchParams(window.location.search);
const locationId = params.get("id");

const companyMeta = document.getElementById("company-meta");
const titleEl = document.getElementById("loc-title");

const rangeStartInput = document.getElementById("range-start");
const rangeDaysSelect = document.getElementById("range-days");
const bucketSelect = document.getElementById("bucket");
const typeStockCanvas = document.getElementById("type-stock-chart");
const txCanvas = document.getElementById("tx-chart");

const nameInput = document.getElementById("loc-name");
const streetInput = document.getElementById("loc-street");
const cityInput = document.getElementById("loc-city");
const regionInput = document.getElementById("loc-region");
const countryInput = document.getElementById("loc-country");
const isBaseCheckbox = document.getElementById("loc-is-base");
const addressSearchInput = document.getElementById("loc-address-search");
const addressSuggestions = document.getElementById("loc-address-suggestions");
const mapStyleSelect = document.getElementById("loc-map-style");
const mapEl = document.getElementById("loc-map");
const saveBtn = document.getElementById("save-location");
const deleteBtn = document.getElementById("delete-location");
const formMeta = document.getElementById("loc-meta");

let chart = null;
let typeStockChart = null;
let typeStockRows = [];

let googleMap = null;
let googleMarker = null;
let mapStyle = "street";
let googleAutocompleteService = null;
let googlePlacesService = null;
let googleGeocoder = null;
let googleMapsApiKey = "";
let googleMapsLoadError = null;

const DAY_MS = 24 * 60 * 60 * 1000;

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

function normalizeMapStyle(value) {
  return value === "satellite" ? "satellite" : "street";
}

function applyMapStyle(nextStyle) {
  mapStyle = normalizeMapStyle(nextStyle ?? mapStyle);
  if (mapStyleSelect && mapStyleSelect.value !== mapStyle) {
    mapStyleSelect.value = mapStyle;
  }
  if (!googleMap || !isGoogleMapsReady()) return;
  googleMap.setMapTypeId(mapStyle === "satellite" ? "satellite" : "roadmap");
}

function ensureMap() {
  if (!mapEl) return;
  if (googleMap) {
    setTimeout(() => window.google?.maps?.event?.trigger?.(googleMap, "resize"), 50);
    return;
  }
  if (!isGoogleMapsReady()) return;

  googleMap = new window.google.maps.Map(mapEl, {
    center: { lat: 20, lng: 0 },
    zoom: 2,
    mapTypeId: mapStyle === "satellite" ? "satellite" : "roadmap",
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  googleAutocompleteService = new window.google.maps.places.AutocompleteService();
  googlePlacesService = new window.google.maps.places.PlacesService(googleMap);
  googleGeocoder = new window.google.maps.Geocoder();
  setTimeout(() => window.google?.maps?.event?.trigger?.(googleMap, "resize"), 50);
}

if (mapStyleSelect) {
  applyMapStyle(mapStyleSelect.value);
  mapStyleSelect.addEventListener("change", () => applyMapStyle(mapStyleSelect.value));
}

function setMapPoint(lat, lng, zoom = 17) {
  if (!googleMap || !isGoogleMapsReady()) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (!googleMarker) {
    googleMarker = new window.google.maps.Marker({ position: { lat, lng }, map: googleMap });
  } else {
    googleMarker.setPosition({ lat, lng });
  }
  googleMap.setCenter({ lat, lng });
  googleMap.setZoom(zoom);
}

function hideSuggestions() {
  if (!addressSuggestions) return;
  addressSuggestions.hidden = true;
  addressSuggestions.replaceChildren();
}

function renderSuggestions(results, onPick) {
  if (!addressSuggestions) return;
  addressSuggestions.replaceChildren();
  const rows = Array.isArray(results) ? results : [];
  if (!rows.length) {
    addressSuggestions.hidden = true;
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
    addressSuggestions.appendChild(btn);
  });
  addressSuggestions.hidden = false;
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

function requestPlacePredictions(input, map) {
  if (!googleAutocompleteService || !window.google?.maps?.places) {
    return Promise.reject(new Error("Google Places library not available."));
  }
  const locationBias = map?.getBounds?.() || undefined;
  return new Promise((resolve, reject) => {
    googleAutocompleteService.getPlacePredictions(
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

function fetchPlaceDetails(placeId, label) {
  if (!googlePlacesService || !window.google?.maps?.places) {
    return Promise.reject(new Error("Google Places library not available."));
  }
  return new Promise((resolve, reject) => {
    googlePlacesService.getDetails(
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

function geocodeAddress(query) {
  if (!googleGeocoder) return Promise.reject(new Error("Google Geocoder not available."));
  return new Promise((resolve, reject) => {
    googleGeocoder.geocode({ address: String(query || "") }, (results, status) => {
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

function buildAddressQuery() {
  const parts = [
    String(streetInput?.value || "").trim(),
    String(cityInput?.value || "").trim(),
    String(regionInput?.value || "").trim(),
    String(countryInput?.value || "").trim(),
  ].filter(Boolean);
  return parts.join(", ");
}

async function searchGeocode(query, limit = 6) {
  const q = String(query || "").trim();
  if (!q) return [];
  const results = await requestPlacePredictions(q, googleMap);
  return results.slice(0, limit);
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toLocalDateInputValue(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

function parseLocalDateInputValue(v) {
  if (!v) return null;
  const [y, m, d] = String(v).split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function bucketKey(d, bucket) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const b = String(bucket || "month").toLowerCase();
  if (b === "month") return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return dt.toISOString().slice(0, 10);
}

function startOfBucket(d, bucket) {
  const b = String(bucket || "month").toLowerCase();
  const x = startOfLocalDay(d);
  if (b === "month") return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
  if (b === "week") {
    const day = x.getDay();
    const offset = (day + 6) % 7;
    return new Date(x.getTime() - offset * DAY_MS);
  }
  return x;
}

function addBucket(d, bucket, n = 1) {
  const b = String(bucket || "month").toLowerCase();
  const x = new Date(d);
  if (b === "month") return new Date(x.getFullYear(), x.getMonth() + n, 1, 0, 0, 0, 0);
  if (b === "week") return new Date(x.getTime() + 7 * n * DAY_MS);
  return new Date(x.getTime() + n * DAY_MS);
}

function buildBucketKeys(from, to, bucket) {
  const keys = [];
  let cur = startOfBucket(from, bucket);
  const end = new Date(to);
  while (cur < end && keys.length < 2000) {
    keys.push(bucketKey(cur, bucket));
    cur = addBucket(cur, bucket, 1);
  }
  return keys;
}

async function init() {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    if (companyMeta) companyMeta.textContent = "Log in and select a company to view locations.";
    return;
  }
  if (!locationId) {
    if (titleEl) titleEl.textContent = "Location not found";
    return;
  }

  const companyName = session?.company?.name ? String(session.company.name) : null;
  if (companyMeta) companyMeta.textContent = companyName ? `${companyName} (Company #${companyId})` : `Company #${companyId}`;

  try {
    const config = await getPublicConfig().catch(() => ({}));
    googleMapsApiKey = config?.googleMapsApiKey ? String(config.googleMapsApiKey) : "";
    const hasGoogle = isGoogleMapsReady();
    if (!googleMapsApiKey && !hasGoogle) {
      throw new Error("Google Maps API key is required. Set GOOGLE_MAPS_API_KEY to use the map picker.");
    }
    if (!hasGoogle) await loadGoogleMaps(googleMapsApiKey);
  } catch (err) {
    googleMapsLoadError = err;
    if (formMeta) formMeta.textContent = err?.message || String(err);
  }

  const rangeDays = Number(rangeDaysSelect?.value) || 365;
  const rangeStart = startOfLocalDay(new Date(Date.now() - rangeDays * DAY_MS));
  if (rangeStartInput) rangeStartInput.value = toLocalDateInputValue(rangeStart);

  const locRes = await fetch(`/api/locations/${encodeURIComponent(locationId)}?companyId=${encodeURIComponent(companyId)}`);
  const locData = await locRes.json().catch(() => ({}));
  if (!locRes.ok) throw new Error(locData.error || "Unable to load location");
  const loc = locData.location || null;
  if (titleEl) titleEl.textContent = loc?.name || "Location";
  if (nameInput) nameInput.value = loc?.name || "";
  if (streetInput) streetInput.value = loc?.street_address || "";
  if (cityInput) cityInput.value = loc?.city || "";
  if (regionInput) regionInput.value = loc?.region || "";
  if (countryInput) countryInput.value = loc?.country || "";
  if (isBaseCheckbox) isBaseCheckbox.checked = loc?.is_base_location !== false;

  ensureMap();
  const initialLat = toCoord(loc?.latitude);
  const initialLng = toCoord(loc?.longitude);
  if (initialLat !== null && initialLng !== null) {
    setMapPoint(initialLat, initialLng, 15);
  }

  const addressState = {
    debounceTimer: null,
    previewTimer: null,
    abort: null,
    seq: 0,
  };

  addressSearchInput?.addEventListener("input", () => {
    const q = String(addressSearchInput.value || "").trim();
    if (!q || q.length < 3) {
      hideSuggestions();
      return;
    }
    if (addressState.debounceTimer) clearTimeout(addressState.debounceTimer);
    addressState.debounceTimer = setTimeout(async () => {
      const seq = (addressState.seq || 0) + 1;
      addressState.seq = seq;
      try {
        addressState.abort?.abort?.();
      } catch {}
      addressState.abort = new AbortController();
      try {
        const results = await searchGeocode(q, 6);
        if (seq !== addressState.seq) return;
        if (String(addressSearchInput.value || "").trim() !== q) return;
        renderSuggestions(results, async (picked) => {
          hideSuggestions();
          const placeId = picked?.place_id;
          if (!placeId) return;
          try {
            const details = await fetchPlaceDetails(placeId, picked?.description || "");
            const parts = parseAddressComponents(details.components);
            if (streetInput) streetInput.value = parts.street || "";
            if (cityInput) cityInput.value = parts.city || "";
            if (regionInput) regionInput.value = parts.region || "";
            if (countryInput) countryInput.value = parts.country || "";
            ensureMap();
            setMapPoint(details.lat, details.lng, 17);
            if (formMeta) formMeta.textContent = "Address selected (not saved yet).";
          } catch (err) {
            if (formMeta) formMeta.textContent = err?.message || String(err);
          }
        });
      } catch (err) {
        if (err?.name === "AbortError") return;
        hideSuggestions();
        if (formMeta) formMeta.textContent = err?.message || String(err);
      }
    }, 450);
  });

  addressSearchInput?.addEventListener("blur", () => setTimeout(() => hideSuggestions(), 150));

  [streetInput, cityInput, regionInput, countryInput].filter(Boolean).forEach((el) => {
    el.addEventListener("input", () => {
      if (addressState.previewTimer) clearTimeout(addressState.previewTimer);
      addressState.previewTimer = setTimeout(async () => {
        const query = buildAddressQuery();
        if (!query || query.length < 6) return;
        try {
          const details = await geocodeAddress(query);
          if (!Number.isFinite(details?.lat) || !Number.isFinite(details?.lng)) return;
          ensureMap();
          setMapPoint(details.lat, details.lng, 15);
        } catch {
          // ignore preview failures; user can still save and/or use search box.
        }
      }, 800);
    });
  });

  async function loadTypeStockChart() {
    if (!typeStockCanvas) return;
    if (typeof Chart === "undefined") return;

    const res = await fetch(`/api/locations/${encodeURIComponent(locationId)}/type-stock?companyId=${encodeURIComponent(companyId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load type stock");
    typeStockRows = Array.isArray(data.rows) ? data.rows : [];

    const labels = typeStockRows.map((r) => r.typeName || "--");
    const available = typeStockRows.map((r) => Number(r.available || 0));
    const unavailable = typeStockRows.map((r) => Number(r.unavailable || 0));

    if (typeStockChart) typeStockChart.destroy();
    typeStockChart = new Chart(typeStockCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Available",
            data: available,
            backgroundColor: "rgba(37, 99, 235, 0.65)",
            borderColor: "rgba(37, 99, 235, 0.9)",
            borderWidth: 1,
            stack: "stock",
          },
          {
            label: "Not available",
            data: unavailable,
            backgroundColor: "rgba(239, 68, 68, 0.55)",
            borderColor: "rgba(239, 68, 68, 0.9)",
            borderWidth: 1,
            stack: "stock",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt) => {
          const points = typeStockChart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, true);
          if (!points?.length) return;
          const idx = points[0].index;
          const row = typeStockRows[idx];
          if (!row) return;
          const qs = new URLSearchParams({ locationId: String(locationId) });
          if (row.typeId) qs.set("typeId", String(row.typeId));
          else if (row.typeName) qs.set("type", String(row.typeName));
          window.location.href = `equipment.html?${qs.toString()}`;
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              footer: (items) => {
                const i = items?.[0]?.dataIndex;
                const r = typeStockRows?.[i];
                if (!r) return "";
                return `Total: ${Number(r.total || 0)}`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  async function loadChart() {
    if (!txCanvas) return;
    if (typeof Chart === "undefined") return;

    const days = Number(rangeDaysSelect?.value) || 365;
    const dt = parseLocalDateInputValue(rangeStartInput?.value);
    const fromDate = dt ? startOfLocalDay(dt) : startOfLocalDay(new Date(Date.now() - days * DAY_MS));
    const from = fromDate.toISOString();
    const to = new Date(fromDate.getTime() + days * DAY_MS).toISOString();
    const bucket = String(bucketSelect?.value || "month");

    const qs = new URLSearchParams({
      companyId: String(companyId),
      from,
      to,
      bucket,
    });
    const res = await fetch(`/api/locations/${encodeURIComponent(locationId)}/transactions-closed-timeseries?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load transactions series");

    const rows = Array.isArray(data.rows) ? data.rows : [];
    const bucketKeys = buildBucketKeys(fromDate, new Date(fromDate.getTime() + days * DAY_MS), bucket);
    const valuesMap = new Map(rows.map((r) => [bucketKey(r.bucket, bucket), Number(r.transactions || 0)]));

    const labels = bucketKeys;
    const values = bucketKeys.map((k) => Number(valuesMap.get(k) || 0));

    if (chart) chart.destroy();
    chart = new Chart(txCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Closed",
            data: values,
            borderColor: "rgba(37, 99, 235, 0.9)",
            backgroundColor: "rgba(37, 99, 235, 0.2)",
            tension: 0.25,
            pointRadius: 0,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  [rangeStartInput, rangeDaysSelect, bucketSelect]
    .filter(Boolean)
    .forEach((el) =>
      el.addEventListener("change", () => loadChart().catch((e) => (companyMeta.textContent = e.message)))
    );
  await loadChart();
  await loadTypeStockChart();

  saveBtn?.addEventListener("click", async () => {
    if (formMeta) formMeta.textContent = "";
    const name = String(nameInput?.value || "").trim();
    if (!name) {
      if (formMeta) formMeta.textContent = "Name is required.";
      return;
    }
    saveBtn.disabled = true;
    try {
      const res = await fetch(`/api/locations/${encodeURIComponent(locationId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          name,
          streetAddress: String(streetInput?.value || "").trim() || null,
          city: String(cityInput?.value || "").trim() || null,
          region: String(regionInput?.value || "").trim() || null,
          country: String(countryInput?.value || "").trim() || null,
          isBaseLocation: Boolean(isBaseCheckbox?.checked),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to save location");
      if (titleEl) titleEl.textContent = data.location?.name || name;
      const savedLat = toCoord(data.location?.latitude);
      const savedLng = toCoord(data.location?.longitude);
      if (savedLat !== null && savedLng !== null) {
        ensureMap();
        setMapPoint(savedLat, savedLng, 15);
      }
      if (formMeta) formMeta.textContent = "Saved.";
    } catch (err) {
      if (formMeta) formMeta.textContent = err.message || String(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!window.confirm("Delete this location?")) return;
    if (formMeta) formMeta.textContent = "";
    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/locations/${encodeURIComponent(locationId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: Number(companyId) }),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unable to delete location");
      }
      window.location.href = "locations.html";
    } catch (err) {
      if (formMeta) formMeta.textContent = err.message || String(err);
      deleteBtn.disabled = false;
    }
  });
}

init().catch((err) => {
  if (companyMeta) companyMeta.textContent = err.message || String(err);
});
