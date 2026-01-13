const params = new URLSearchParams(window.location.search);
const lastSelection = (() => {
  try {
    const raw = localStorage.getItem("rentSoft.dispatch.lastSelection");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();
const initialCompanyId =
  params.get("companyId") ||
  (lastSelection?.companyId ? String(lastSelection.companyId) : null) ||
  window.RentSoft?.getCompanyId?.();
const initialEquipmentId = params.get("equipmentId") || (lastSelection?.equipmentId ? String(lastSelection.equipmentId) : null);
const initialOrderId = params.get("orderId") || (lastSelection?.orderId ? String(lastSelection.orderId) : null);

const companyMeta = document.getElementById("company-meta");
const detailSummary = document.getElementById("dispatch-detail-summary");
const refreshBtn = document.getElementById("refresh-detail");

const detailEmpty = document.getElementById("dispatch-detail-empty");
const detailWrap = document.getElementById("dispatch-detail");
const unitDetails = document.getElementById("unit-details");
const orderDetails = document.getElementById("order-details");
const lineItemDetails = document.getElementById("line-item-details");
const guardNotes = document.getElementById("guard-notes");
const guardNotesSave = document.getElementById("guard-notes-save");
const guardNotesClear = document.getElementById("guard-notes-clear");
const guardNotesStatus = document.getElementById("guard-notes-status");
const openSiteAddressPickerBtn = document.getElementById("open-site-address-picker");
const siteAddressStatus = document.getElementById("site-address-status");
const siteAddressPickerModal = document.getElementById("site-address-picker-modal");
const closeSiteAddressPickerBtn = document.getElementById("close-site-address-picker");
const saveSiteAddressPickerBtn = document.getElementById("save-site-address-picker");
const siteAddressPickerSearch = document.getElementById("site-address-picker-search");
const siteAddressPickerInput = document.getElementById("site-address-picker-input");
const siteAddressPickerMapEl = document.getElementById("site-address-picker-map");
const siteAddressPickerMeta = document.getElementById("site-address-picker-meta");
const siteAddressPickerSuggestions = document.getElementById("site-address-picker-suggestions");
const siteAddressPickerMapStyle = document.getElementById("site-address-picker-map-style");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let selectedUnit = null;
let orderCache = new Map();
let currentOrderDetail = null;
let equipmentId = initialEquipmentId;
let orderId = initialOrderId;
let siteAddressPicker = {
  mode: "leaflet",
  mapStyle: "street",
  google: {
    map: null,
    marker: null,
    autocomplete: null,
    autocompleteService: null,
    placesService: null,
    debounceTimer: null,
  },
  leaflet: {
    map: null,
    marker: null,
    layers: null,
    debounceTimer: null,
    searchBound: false,
  },
  selected: null, // { lat, lng, provider, query }
};
let siteAddressInputBound = false;
let rentalInfoFields = null;

function fmtDate(value, withTime = false) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function docNumberFor(row) {
  const ro = row?.ro_number || row?.roNumber || null;
  const quote = row?.quote_number || row?.quoteNumber || null;
  const ext = row?.external_contract_number || row?.externalContractNumber || null;
  return ro || quote || ext || (row?.order_id ? `#${row.order_id}` : "--");
}

function equipmentLabel(eq) {
  if (!eq) return "--";
  const serial = eq.serial_number ? String(eq.serial_number).trim() : "";
  const model = eq.model_name ? String(eq.model_name).trim() : "";
  const type = eq.type_name || eq.type || "Equipment";
  if (serial && model) return `${type} Aú ${serial} Aú ${model}`;
  if (serial) return `${type} Aú ${serial}`;
  if (model) return `${type} Aú ${model}`;
  return `${type} #${eq.id}`;
}

function parseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function formatContactLines(label, contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return "--";
  return contacts
    .map((contact) => {
      const name = contact?.name || "--";
      const email = contact?.email || "--";
      const phone = contact?.phone || "--";
      return `${label}: ${name} | ${email} | ${phone}`;
    })
    .join("<br />");
}

function formatCoverageHours(coverage) {
  if (!coverage) return "--";
  let normalized = coverage;
  if (typeof coverage === "string") {
    try {
      normalized = JSON.parse(coverage);
    } catch {
      return "--";
    }
  }
  if (!normalized || typeof normalized !== "object") return "--";
  const dayLabels = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const lines = Object.keys(dayLabels)
    .map((key) => {
      const entry = normalized[key] || {};
      if (!entry.start && !entry.end) return null;
      return `${dayLabels[key]}: ${entry.start || "--"} - ${entry.end || "--"}`;
    })
    .filter(Boolean);
  return lines.length ? lines.join("<br />") : "--";
}

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  siteContacts: { enabled: true, required: true },
  coverageHours: { enabled: true, required: true },
};

function normalizeRentalInfoFields(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const normalized = {};
  Object.entries(DEFAULT_RENTAL_INFO_FIELDS).forEach(([key, defaults]) => {
    const entry = raw[key];
    const enabled =
      typeof entry === "boolean"
        ? entry
        : entry && typeof entry === "object" && entry.enabled !== undefined
          ? entry.enabled === true
          : defaults.enabled === true;
    const required =
      entry && typeof entry === "object" && entry.required !== undefined
        ? entry.required === true
        : defaults.required === true;
    normalized[key] = { enabled, required };
  });
  return normalized;
}

rentalInfoFields = normalizeRentalInfoFields(null);

function isRentalInfoEnabled(key) {
  return rentalInfoFields?.[key]?.enabled !== false;
}

function applyRentalInfoConfig() {
  const siteEnabled = isRentalInfoEnabled("siteAddress");
  if (openSiteAddressPickerBtn) openSiteAddressPickerBtn.style.display = siteEnabled ? "" : "none";
  if (siteAddressStatus) siteAddressStatus.style.display = siteEnabled ? "" : "none";
  if (siteAddressPickerModal) siteAddressPickerModal.style.display = siteEnabled ? "" : "none";
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value ?? "--"}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getPublicConfig() {
  const res = await fetch("/api/public-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load config");
  return data || {};
}

async function loadCompanySettings() {
  rentalInfoFields = normalizeRentalInfoFields(null);
  applyRentalInfoConfig();
  if (!activeCompanyId) return;
  const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    rentalInfoFields = normalizeRentalInfoFields(data.settings?.rental_info_fields || null);
    applyRentalInfoConfig();
  }
}

function openSiteAddressPickerModal() {
  siteAddressPickerModal?.classList.add("show");
}

function closeSiteAddressPickerModal() {
  siteAddressPickerModal?.classList.remove("show");
  if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "";
  if (siteAddressPickerSearch) siteAddressPickerSearch.value = "";
  if (siteAddressPickerInput) siteAddressPickerInput.value = "";
  if (siteAddressPickerSuggestions) siteAddressPickerSuggestions.hidden = true;
  if (siteAddressPickerSuggestions) siteAddressPickerSuggestions.replaceChildren();
  siteAddressPicker.selected = null;
}

function setSiteAddressSelected(lat, lng, { provider, query } = {}) {
  siteAddressPicker.selected = {
    lat: Number(lat),
    lng: Number(lng),
    provider: provider || "manual",
    query: query || null,
  };
  if (siteAddressPickerMeta) {
    siteAddressPickerMeta.textContent = `Selected: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  if (siteAddressPickerInput && query) {
    siteAddressPickerInput.value = String(query);
  }
}

function getUserGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not available."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function parsePredictionText(prediction) {
  const main = prediction?.structured_formatting?.main_text || prediction?.description || "";
  const secondary = prediction?.structured_formatting?.secondary_text || "";
  return { main: String(main || ""), secondary: String(secondary || "") };
}

function renderSiteAddressSuggestions(predictions, onPick) {
  if (!siteAddressPickerSuggestions) return;
  siteAddressPickerSuggestions.replaceChildren();
  const rows = Array.isArray(predictions) ? predictions : [];
  if (!rows.length) {
    siteAddressPickerSuggestions.hidden = true;
    return;
  }
  rows.slice(0, 8).forEach((p) => {
    const { main, secondary } = parsePredictionText(p);
    const btn = document.createElement("button");
    btn.type = "button";
    let picked = false;
    const pick = () => {
      if (picked) return;
      picked = true;
      onPick(p);
    };
    btn.innerHTML = `
      <div class="rs-autocomplete-primary">${escapeHtml(main)}</div>
      ${secondary ? `<div class="rs-autocomplete-secondary">${escapeHtml(secondary)}</div>` : ""}
    `;
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
    siteAddressPickerSuggestions.appendChild(btn);
  });
  siteAddressPickerSuggestions.hidden = false;
}

function hideSiteAddressSuggestions() {
  if (!siteAddressPickerSuggestions) return;
  siteAddressPickerSuggestions.hidden = true;
  siteAddressPickerSuggestions.replaceChildren();
}

function bindSiteAddressSearchMirror() {
  if (!siteAddressPickerInput || !siteAddressPickerSearch || siteAddressInputBound) return;
  siteAddressInputBound = true;
  siteAddressPickerInput.addEventListener("input", () => {
    const next = String(siteAddressPickerInput.value || "");
    if (siteAddressPickerSearch.value !== next) {
      siteAddressPickerSearch.value = next;
      siteAddressPickerSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

const MAP_TILE_SOURCES = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
};

function normalizeMapStyle(value) {
  return value === "satellite" ? "satellite" : "street";
}

function applyLeafletSiteAddressStyle(style) {
  const map = siteAddressPicker.leaflet.map;
  if (!map || !window.L) return;
  const normalized = normalizeMapStyle(style ?? siteAddressPicker.mapStyle);
  siteAddressPicker.mapStyle = normalized;
  if (!siteAddressPicker.leaflet.layers) siteAddressPicker.leaflet.layers = {};
  const layers = siteAddressPicker.leaflet.layers;
  if (!layers[normalized]) {
    const cfg = MAP_TILE_SOURCES[normalized];
    layers[normalized] = window.L.tileLayer(cfg.url, cfg.options);
  }
  Object.values(layers).forEach((layer) => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  layers[normalized].addTo(map);
}

function applyGoogleSiteAddressStyle(style) {
  const map = siteAddressPicker.google.map;
  if (!map) return;
  const normalized = normalizeMapStyle(style ?? siteAddressPicker.mapStyle);
  siteAddressPicker.mapStyle = normalized;
  map.setMapTypeId(normalized === "satellite" ? "satellite" : "roadmap");
}

function setSiteAddressPickerMapStyle(style) {
  const normalized = normalizeMapStyle(style ?? siteAddressPicker.mapStyle);
  siteAddressPicker.mapStyle = normalized;
  if (siteAddressPickerMapStyle && siteAddressPickerMapStyle.value !== normalized) {
    siteAddressPickerMapStyle.value = normalized;
  }
  if (siteAddressPicker.mode === "google") {
    applyGoogleSiteAddressStyle(normalized);
  } else {
    applyLeafletSiteAddressStyle(normalized);
  }
}

function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);
  if (window.__rentsoftGoogleMapsLoading) return window.__rentsoftGoogleMapsLoading;

  window.__rentsoftGoogleMapsLoading = new Promise((resolve, reject) => {
    const id = "rentsoft-google-maps";
    const existing = document.getElementById(id);
    if (existing) return resolve(true);
    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Failed to load Google Maps script (network/CSP)."));
    document.head.appendChild(s);
  });
  return window.__rentsoftGoogleMapsLoading;
}

function resetSiteAddressPickerMapContainer() {
  if (!siteAddressPickerMapEl) return;
  try {
    siteAddressPicker.leaflet.map?.remove?.();
  } catch {}
  siteAddressPicker.leaflet.map = null;
  siteAddressPicker.leaflet.marker = null;
  siteAddressPicker.leaflet.layers = null;

  siteAddressPicker.google.map = null;
  siteAddressPicker.google.marker = null;
  siteAddressPicker.google.autocomplete = null;

  if (siteAddressPickerMapEl._leaflet_id) {
    delete siteAddressPickerMapEl._leaflet_id;
  }
  siteAddressPickerMapEl.replaceChildren();
}

function initLeafletSiteAddressPicker(center) {
  if (!siteAddressPickerMapEl || !window.L) throw new Error("Map library not available.");
  if (!siteAddressPicker.leaflet.map) {
    const map = window.L.map(siteAddressPickerMapEl, { scrollWheelZoom: true });
    map.on("click", (e) => {
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!siteAddressPicker.leaflet.marker) {
        siteAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        siteAddressPicker.leaflet.marker.on("dragend", () => {
          const ll = siteAddressPicker.leaflet.marker?.getLatLng?.();
          if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
          setSiteAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
        });
      } else {
        siteAddressPicker.leaflet.marker.setLatLng([lat, lng]);
      }
      setSiteAddressSelected(lat, lng, { provider: "manual_pin" });
    });
    siteAddressPicker.leaflet.map = map;
  }
  applyLeafletSiteAddressStyle(siteAddressPicker.mapStyle);
  const map = siteAddressPicker.leaflet.map;
  map.setView([center.lat, center.lng], 16);
  setTimeout(() => map.invalidateSize?.(), 50);

  if (!siteAddressPicker.leaflet.searchBound && siteAddressPickerSearch) {
    siteAddressPicker.leaflet.searchBound = true;
    siteAddressPickerSearch.addEventListener("input", () => {
      const q = String(siteAddressPickerSearch.value || "").trim();
      if (!q) {
        hideSiteAddressSuggestions();
        return;
      }
      if (siteAddressPicker.leaflet.debounceTimer) clearTimeout(siteAddressPicker.leaflet.debounceTimer);
      siteAddressPicker.leaflet.debounceTimer = setTimeout(async () => {
        const seq = (siteAddressPicker.leaflet.searchSeq || 0) + 1;
        siteAddressPicker.leaflet.searchSeq = seq;
        try {
          siteAddressPicker.leaflet.searchAbort?.abort?.();
        } catch {}
        siteAddressPicker.leaflet.searchAbort = new AbortController();
        try {
          const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}&limit=6`, {
            signal: siteAddressPicker.leaflet.searchAbort.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Unable to search address.");
          if (seq !== siteAddressPicker.leaflet.searchSeq) return;
          if (String(siteAddressPickerSearch.value || "").trim() !== q) return;
          const results = (data.results || []).map((r) => ({
            place_id: null,
            description: r.label,
            __rs_lat: r.latitude,
            __rs_lng: r.longitude,
          }));
          renderSiteAddressSuggestions(results, (picked) => {
            const label = picked?.description || "";
            const lat = Number(picked?.__rs_lat);
            const lng = Number(picked?.__rs_lng);
            hideSiteAddressSuggestions();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            if (siteAddressPickerInput) siteAddressPickerInput.value = label || "";
            if (siteAddressPickerSearch) siteAddressPickerSearch.value = label || "";
            if (!siteAddressPicker.leaflet.marker) {
              siteAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
              siteAddressPicker.leaflet.marker.on("dragend", () => {
                const ll = siteAddressPicker.leaflet.marker?.getLatLng?.();
                if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
                setSiteAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
              });
            } else {
              siteAddressPicker.leaflet.marker.setLatLng([lat, lng]);
            }
            map.setView([lat, lng], 17);
            setSiteAddressSelected(lat, lng, { provider: "nominatim", query: label });
          });
        } catch (err) {
          hideSiteAddressSuggestions();
          const msg = err?.message || String(err);
          if (siteAddressPickerMeta) {
            siteAddressPickerMeta.textContent = `${msg}. You can still click the map to drop a pin.`;
          }
        }
      }, 300);
    });
    siteAddressPickerSearch.addEventListener("blur", () => setTimeout(() => hideSiteAddressSuggestions(), 150));
  }
}

function initGoogleSiteAddressPicker(center) {
  if (!siteAddressPickerMapEl || !window.google?.maps) throw new Error("Google Maps not available.");
  if (!siteAddressPicker.google.map) {
    const mapStyle = normalizeMapStyle(siteAddressPicker.mapStyle);
    const map = new window.google.maps.Map(siteAddressPickerMapEl, {
      center,
      zoom: 16,
      mapTypeId: mapStyle === "satellite" ? "satellite" : "roadmap",
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    map.addListener("click", (e) => {
      const lat = e?.latLng?.lat?.();
      const lng = e?.latLng?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!siteAddressPicker.google.marker) {
        siteAddressPicker.google.marker = new window.google.maps.Marker({ position: { lat, lng }, map, draggable: true });
        siteAddressPicker.google.marker.addListener("dragend", (evt) => {
          const dLat = evt?.latLng?.lat?.();
          const dLng = evt?.latLng?.lng?.();
          if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
          setSiteAddressSelected(dLat, dLng, { provider: "manual_pin" });
        });
      } else {
        siteAddressPicker.google.marker.setPosition({ lat, lng });
      }
      setSiteAddressSelected(lat, lng, { provider: "manual_pin" });
    });

    if (!window.google.maps.places?.AutocompleteService || !window.google.maps.places?.PlacesService) {
      if (siteAddressPickerMeta) {
        siteAddressPickerMeta.textContent = "Click the map to drop a pin (Places library missing).";
      }
    } else {
      siteAddressPicker.google.autocompleteService = new window.google.maps.places.AutocompleteService();
      siteAddressPicker.google.placesService = new window.google.maps.places.PlacesService(map);
      const requestPredictions = (input) =>
        new Promise((resolve, reject) => {
          siteAddressPicker.google.autocompleteService.getPlacePredictions(
            { input: String(input || ""), locationBias: map.getBounds?.() || undefined },
            (preds, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
              if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
                return reject(new Error(`Places error: ${status}`));
              }
              resolve(preds || []);
            }
          );
        });
      const fetchPlaceDetails = (placeId, label) =>
        new Promise((resolve, reject) => {
          siteAddressPicker.google.placesService.getDetails(
            { placeId, fields: ["geometry", "formatted_address", "name"] },
            (place, status) => {
              if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                return reject(new Error(`Places error: ${status}`));
              }
              const details = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                label: place.formatted_address || label || place.name || "Pinned location",
              };
              resolve(details);
            }
          );
        });

      siteAddressPickerSearch?.addEventListener("input", () => {
        const q = String(siteAddressPickerSearch.value || "").trim();
        if (!q) {
          hideSiteAddressSuggestions();
          return;
        }
        if (siteAddressPicker.google.debounceTimer) clearTimeout(siteAddressPicker.google.debounceTimer);
        siteAddressPicker.google.debounceTimer = setTimeout(async () => {
          try {
            const preds = await requestPredictions(q);
            renderSiteAddressSuggestions(preds, async (p) => {
              hideSiteAddressSuggestions();
              const placeId = p?.place_id;
              if (!placeId) return;
              const label = p?.description || "";
              try {
                const details = await fetchPlaceDetails(placeId, label);
                if (siteAddressPickerInput) siteAddressPickerInput.value = details.label;
                if (siteAddressPickerSearch) siteAddressPickerSearch.value = details.label;
                if (!siteAddressPicker.google.marker) {
                  siteAddressPicker.google.marker = new window.google.maps.Marker({
                    position: { lat: details.lat, lng: details.lng },
                    map,
                    draggable: true,
                  });
                  siteAddressPicker.google.marker.addListener("dragend", (evt) => {
                    const dLat = evt?.latLng?.lat?.();
                    const dLng = evt?.latLng?.lng?.();
                    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
                    setSiteAddressSelected(dLat, dLng, { provider: "manual_pin" });
                  });
                } else {
                  siteAddressPicker.google.marker.setPosition({ lat: details.lat, lng: details.lng });
                }
                map.setCenter({ lat: details.lat, lng: details.lng });
                map.setZoom(17);
                setSiteAddressSelected(details.lat, details.lng, { provider: "google_places", query: details.label });
              } catch (err) {
                if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
              }
            });
          } catch (err) {
            hideSiteAddressSuggestions();
            if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
          }
        }, 250);
      });

      siteAddressPickerSearch?.addEventListener("blur", () => {
        setTimeout(() => hideSiteAddressSuggestions(), 150);
      });
    }

    siteAddressPicker.google.map = map;
  }

  applyGoogleSiteAddressStyle(siteAddressPicker.mapStyle);
  siteAddressPicker.google.map.setCenter(center);
  siteAddressPicker.google.map.setZoom(16);
}

async function openSiteAddressPicker() {
  if (!activeCompanyId) {
    if (siteAddressStatus) siteAddressStatus.textContent = "No active company session.";
    return;
  }
  openSiteAddressPickerModal();
  if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "Loading map...";
  hideSiteAddressSuggestions();
  bindSiteAddressSearchMirror();

  if (siteAddressPickerInput && currentOrderDetail?.order) {
    const existing = currentOrderDetail.order.site_address || currentOrderDetail.order.siteAddress || "";
    if (existing && !String(siteAddressPickerInput.value || "").trim()) siteAddressPickerInput.value = String(existing);
  }

  let center = { lat: 20, lng: 0 };
  try {
    center = await getUserGeolocation();
  } catch {
    // ignore
  }

  const config = await getPublicConfig().catch(() => ({}));
  const key = config?.googleMapsApiKey ? String(config.googleMapsApiKey) : "";

  if (key) {
    try {
      if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "Loading Google Maps...";
      await loadGoogleMaps(key);
      resetSiteAddressPickerMapContainer();
      siteAddressPicker.mode = "google";
      initGoogleSiteAddressPicker(center);
      if (siteAddressPickerMeta) {
        const places = window.google?.maps?.places;
        const hasSvc = !!places?.AutocompleteService;
        const msg = hasSvc ? "Search (Google Places) or click to drop a pin." : "Click to drop a pin (Places library missing).";
        siteAddressPickerMeta.textContent = msg;
      }
      return;
    } catch (err) {
      if (siteAddressPickerMeta) {
        siteAddressPickerMeta.textContent =
          `Google Maps failed to load: ${err?.message || String(err)}. ` +
          "Falling back to pin-drop. Check browser console for: InvalidKeyMapError / RefererNotAllowedMapError / ApiNotActivatedMapError / BillingNotEnabledMapError.";
      }
    }
  }

  resetSiteAddressPickerMapContainer();
  siteAddressPicker.mode = "leaflet";
  initLeafletSiteAddressPicker(center);
  if (siteAddressPickerMeta) {
    siteAddressPickerMeta.textContent =
      key
        ? "Search (OpenStreetMap) or click the map to drop a pin (Google failed to load)."
        : "Search (OpenStreetMap) or click the map to drop a pin.";
  }
}

async function saveSiteAddressFromPicker() {
  const orderIdValue = selectedUnit?.assignment?.order_id || orderId;
  if (!activeCompanyId || !orderIdValue) {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "No rental order selected.";
    return;
  }
  const manual = String(siteAddressPickerInput?.value || "").trim();
  const fallbackQuery = siteAddressPicker.selected?.query ? String(siteAddressPicker.selected.query) : "";
  const fallbackCoords = siteAddressPicker.selected
    ? `${Number(siteAddressPicker.selected.lat).toFixed(6)}, ${Number(siteAddressPicker.selected.lng).toFixed(6)}`
    : "";
  const siteAddress = manual || fallbackQuery || fallbackCoords;
  if (!siteAddress) {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "Enter a site address or pick a point on the map.";
    return;
  }

  saveSiteAddressPickerBtn.disabled = true;
  try {
    const res = await fetch(`/api/rental-orders/${orderIdValue}/site-address`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, siteAddress }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to update site address.");
    const updatedAddress = data?.order?.site_address ?? siteAddress;
    if (currentOrderDetail?.order) currentOrderDetail.order.site_address = updatedAddress;
    if (orderCache.has(String(orderIdValue))) {
      const cached = orderCache.get(String(orderIdValue));
      if (cached?.order) cached.order.site_address = updatedAddress;
    }
    renderOrderDetail(selectedUnit, currentOrderDetail);
    if (siteAddressStatus) siteAddressStatus.textContent = `Site address updated at ${new Date().toLocaleTimeString()}`;
    closeSiteAddressPickerModal();
  } catch (err) {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
  } finally {
    saveSiteAddressPickerBtn.disabled = false;
  }
}

function updateDetailEmpty(show) {
  if (detailEmpty) detailEmpty.hidden = !show;
  if (detailWrap) detailWrap.hidden = show;
}

function renderUnitDetail(row) {
  const eq = row?.equipment || {};
  unitDetails.innerHTML = `
    ${detailItem("Unit", equipmentLabel(eq))}
    ${detailItem("Unit ID", eq.id ?? "--")}
    ${detailItem("Serial", eq.serial_number || "--")}
    ${detailItem("Model", eq.model_name || "--")}
    ${detailItem("Type", eq.type_name || eq.type || "--")}
  `;
}

function renderOrderDetail(row, detail) {
  const order = detail?.order || {};

  const emergencyContacts = parseContacts(order.emergency_contacts || order.emergencyContacts || []);
  const siteContacts = parseContacts(order.site_contacts || order.siteContacts || []);
  const coverageHours = order.coverage_hours || order.coverageHours || {};
  const siteAddress = order.site_address || order.siteAddress || "--";
  const criticalAreas = order.critical_areas || order.criticalAreas || "--";
  const generalNotes = order.general_notes || order.generalNotes || "--";

  const orderDetailItems = [];
  if (isRentalInfoEnabled("siteContacts")) {
    orderDetailItems.push(detailItem("Site contacts", formatContactLines("Site contact", siteContacts)));
  }
  if (isRentalInfoEnabled("emergencyContacts")) {
    orderDetailItems.push(detailItem("Emergency contacts", formatContactLines("Emergency contact", emergencyContacts)));
  }
  orderDetails.innerHTML = orderDetailItems.join("");

  const lineDetailItems = [];
  if (isRentalInfoEnabled("coverageHours")) {
    lineDetailItems.push(detailItem("Hours of coverage", formatCoverageHours(coverageHours)));
  }
  if (isRentalInfoEnabled("siteAddress")) {
    lineDetailItems.push(detailItem("Site address", siteAddress || "--"));
  }
  if (isRentalInfoEnabled("criticalAreas")) {
    lineDetailItems.push(detailItem("Critical areas on site", criticalAreas || "--"));
  }
  if (isRentalInfoEnabled("generalNotes")) {
    lineDetailItems.push(detailItem("General notes", generalNotes || "--"));
  }
  lineItemDetails.innerHTML = lineDetailItems.join("");
}

function guardNotesKey(row) {
  const equipmentIdValue = row?.assignment?.equipment_id ?? "0";
  const orderIdValue = row?.assignment?.order_id ?? "0";
  return `rentSoft.dispatch.guardNotes.${equipmentIdValue}.${orderIdValue}`;
}

function loadGuardNotes(row) {
  if (!guardNotes) return;
  const key = guardNotesKey(row);
  guardNotes.value = localStorage.getItem(key) || "";
  if (guardNotesStatus) guardNotesStatus.textContent = "";
}

function saveGuardNotes(row) {
  if (!guardNotes) return;
  const key = guardNotesKey(row);
  const text = guardNotes.value.trim();
  if (text) {
    localStorage.setItem(key, text);
    if (guardNotesStatus) guardNotesStatus.textContent = `Saved locally at ${new Date().toLocaleTimeString()}`;
  } else {
    localStorage.removeItem(key);
    if (guardNotesStatus) guardNotesStatus.textContent = "Notes cleared.";
  }
}

async function loadOrderDetail(orderIdValue) {
  if (!activeCompanyId || !orderIdValue) return null;
  const key = String(orderIdValue);
  if (orderCache.has(key)) return orderCache.get(key);
  try {
    const res = await fetch(`/api/rental-orders/${orderIdValue}?companyId=${activeCompanyId}`);
    const detail = await res.json().catch(() => null);
    if (!res.ok || !detail) return null;
    orderCache.set(key, detail);
    return detail;
  } catch {
    return null;
  }
}

function normalizeOrderCustomerName(order) {
  return (
    order?.customer_name ||
    order?.customerName ||
    order?.customer_company_name ||
    order?.customerCompanyName ||
    order?.customer?.company_name ||
    order?.customer?.name ||
    "--"
  );
}

async function buildFallbackRowFromOrder() {
  if (!activeCompanyId || !orderId) return { row: null, detail: null };
  const detail = await loadOrderDetail(orderId);
  if (!detail) return { row: null, detail: null };

  const order = detail.order || {};
  const lineItems = Array.isArray(detail.lineItems) ? detail.lineItems : [];
  let equipmentIdValue = equipmentId || null;

  if (!equipmentIdValue) {
    const withInventory = lineItems.find((li) => Array.isArray(li.inventoryIds) && li.inventoryIds.length);
    if (withInventory) equipmentIdValue = withInventory.inventoryIds[0];
  }

  let equipment = null;
  if (equipmentIdValue) {
    try {
      const res = await fetch(`/api/equipment?companyId=${activeCompanyId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        equipment = (data.equipment || []).find((e) => String(e.id) === String(equipmentIdValue)) || null;
      }
    } catch {}
  }

  const firstLine = lineItems[0] || {};
  const assignment = {
    equipment_id: equipmentIdValue || null,
    order_id: order.id || orderId,
    ro_number: order.ro_number || order.roNumber || null,
    quote_number: order.quote_number || order.quoteNumber || null,
    external_contract_number: order.external_contract_number || order.externalContractNumber || null,
    customer_name: normalizeOrderCustomerName(order),
    start_at: firstLine.startAt || firstLine.start_at || null,
    end_at: firstLine.endAt || firstLine.end_at || null,
    pickup_location_name: order.pickup_location_name || order.pickupLocationName || "--",
  };

  const fallbackEquipment =
    equipment ||
    (equipmentIdValue
      ? { id: equipmentIdValue, type_name: "Equipment", model_name: "", serial_number: "" }
      : { id: "--", type_name: "Equipment", model_name: "", serial_number: "" });

  return { row: { equipment: fallbackEquipment, assignment }, detail };
}

async function loadTimelineUnit() {
  if (!activeCompanyId) return null;
  if (!equipmentId && !orderId) return null;

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `/api/rental-orders/timeline?companyId=${activeCompanyId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&statuses=ordered`
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || "Unable to load timeline data.");

  const equipmentById = new Map((data.equipment || []).map((e) => [String(e.id), e]));
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  const assignment = assignments.find((a) => {
    if (equipmentId && String(a.equipment_id) === String(equipmentId)) return true;
    if (orderId && String(a.order_id) === String(orderId)) return true;
    return false;
  });

  if (!assignment) return null;
  const equipment = equipmentById.get(String(assignment.equipment_id));
  if (!equipment) return null;
  return { equipment, assignment };
}

async function loadDetail() {
  if (!activeCompanyId) {
    if (companyMeta) companyMeta.textContent = "No active company session.";
    if (detailSummary) detailSummary.textContent = "Missing active company context.";
    updateDetailEmpty(true);
    return;
  }
  if (!equipmentId && !orderId) {
    if (detailSummary) detailSummary.textContent = "Select a unit from the dispatch table.";
    updateDetailEmpty(true);
    return;
  }

  if (companyMeta) {
    const session = window.RentSoft?.getSession?.();
    const companyName =
      session?.company?.name ||
      session?.company?.company_name ||
      session?.user?.companyName ||
      session?.user?.company_name ||
      null;
    companyMeta.textContent = companyName ? `${companyName} (ID ${activeCompanyId})` : `Company #${activeCompanyId}`;
  }
  if (detailSummary) detailSummary.textContent = "Loading unit detail...";

  try {
    let timelineError = null;
    let row = null;
    try {
      row = await loadTimelineUnit();
    } catch (err) {
      timelineError = err;
    }
    let detail = null;
    if (!row) {
      const fallback = await buildFallbackRowFromOrder();
      row = fallback.row;
      detail = fallback.detail;
    }
    if (!row) {
      const msg = timelineError?.message || "No active dispatch found for this unit.";
      if (detailSummary) detailSummary.textContent = msg;
      updateDetailEmpty(true);
      return;
    }

    selectedUnit = row;
    equipmentId = row.assignment?.equipment_id || equipmentId;
    orderId = row.assignment?.order_id || orderId;
    if (openSiteAddressPickerBtn) openSiteAddressPickerBtn.disabled = !orderId;
    if (siteAddressStatus) siteAddressStatus.textContent = "";
    updateDetailEmpty(false);
    renderUnitDetail(row);
    orderDetails.innerHTML = detailItem("Loading", "Fetching rental order data...");
    lineItemDetails.innerHTML = "";
    loadGuardNotes(row);

    if (!detail) {
      detail = await loadOrderDetail(row.assignment.order_id);
    }
    if (!detail) {
      currentOrderDetail = null;
      orderDetails.innerHTML = detailItem("Unavailable", "Unable to load rental order detail.");
      return;
    }
    currentOrderDetail = detail;
    renderOrderDetail(row, detail);

    if (detailSummary) {
      detailSummary.textContent = `${equipmentLabel(row.equipment)} on ${docNumberFor(row.assignment)}`;
    }
  } catch (err) {
    if (detailSummary) detailSummary.textContent = err?.message || "Unable to load dispatch detail.";
    updateDetailEmpty(true);
  }
}

refreshBtn?.addEventListener("click", () => loadDetail());

guardNotesSave?.addEventListener("click", () => {
  if (!selectedUnit) return;
  saveGuardNotes(selectedUnit);
});

guardNotesClear?.addEventListener("click", () => {
  if (!guardNotes) return;
  guardNotes.value = "";
  if (selectedUnit) saveGuardNotes(selectedUnit);
});

openSiteAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openSiteAddressPicker().catch((err) => {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
  });
});

closeSiteAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeSiteAddressPickerModal();
});

siteAddressPickerModal?.addEventListener("click", (e) => {
  if (e.target === siteAddressPickerModal) closeSiteAddressPickerModal();
});

if (siteAddressPickerMapStyle) {
  setSiteAddressPickerMapStyle(siteAddressPickerMapStyle.value);
  siteAddressPickerMapStyle.addEventListener("change", () => {
    setSiteAddressPickerMapStyle(siteAddressPickerMapStyle.value);
  });
}

saveSiteAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveSiteAddressFromPicker();
});

document.addEventListener("DOMContentLoaded", () => {
  loadCompanySettings().finally(() => loadDetail());
});
