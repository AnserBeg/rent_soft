const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");
const fromParam = params.get("from");

const pageMeta = document.getElementById("page-meta");
const tableEl = document.getElementById("rental-order-history-table");
const searchInput = document.getElementById("search");
const backToOrder = document.getElementById("back-to-order");

const auditModal = document.getElementById("audit-modal");
const closeAuditModalBtn = document.getElementById("close-audit-modal");
const auditJsonEl = document.getElementById("audit-json");
const auditModalMeta = document.getElementById("audit-modal-meta");
const auditDiffTableEl = document.getElementById("audit-diff-table");
const auditShowUnchangedEl = document.getElementById("audit-show-unchanged");
const toggleAuditRawBtn = document.getElementById("toggle-audit-raw");

let rowsCache = [];
let searchTerm = "";
let currentAuditRow = null;
let auditShowRaw = false;

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDateTime(v) {
  if (!v) return "--";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

function actorLabel(r) {
  const name = r.actor_name ? String(r.actor_name) : "Unknown";
  const email = r.actor_email ? String(r.actor_email) : "";
  return email ? `${name} <${email}>` : name;
}

function fmtAuditValue(v) {
  if (v === null || v === undefined) return "--";
  if (typeof v === "string") return v === "" ? '""' : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function renderAuditDetails(row) {
  if (!row) return;
  const changes = row.changes && typeof row.changes === "object" ? row.changes : {};
  const before = changes.before && typeof changes.before === "object" ? changes.before : {};
  const after = changes.after && typeof changes.after === "object" ? changes.after : {};
  const diff = changes.diff && typeof changes.diff === "object" ? changes.diff : null;
  const changedKeys = diff ? new Set(Object.keys(diff)) : null;
  const metaKeys = Object.keys(changes).filter((k) => k !== "before" && k !== "after" && k !== "diff");

  const showUnchanged = auditShowUnchangedEl ? !!auditShowUnchangedEl.checked : true;
  const keys = showUnchanged
    ? Array.from(new Set([...Object.keys(before), ...Object.keys(after), ...metaKeys.map((k) => `meta.${k}`)])).sort((a, b) =>
        a.localeCompare(b)
      )
    : diff
      ? [...Object.keys(diff), ...metaKeys.map((k) => `meta.${k}`)].sort((a, b) => a.localeCompare(b))
      : Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
          .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
          .concat(metaKeys.map((k) => `meta.${k}`))
          .sort((a, b) => a.localeCompare(b));

  if (auditDiffTableEl) {
    auditDiffTableEl.innerHTML = `
      <div class="table-row table-header">
        <span>Field</span>
        <span>Before</span>
        <span>After</span>
      </div>`;

    keys.forEach((key) => {
      const isMeta = key.startsWith("meta.");
      const rawKey = isMeta ? key.slice(5) : key;
      const beforeVal = isMeta ? null : Object.prototype.hasOwnProperty.call(before, rawKey) ? before[rawKey] : null;
      const afterVal = isMeta ? changes[rawKey] : Object.prototype.hasOwnProperty.call(after, rawKey) ? after[rawKey] : null;
      const changed = isMeta
        ? true
        : changedKeys
          ? changedKeys.has(rawKey)
          : JSON.stringify(beforeVal ?? null) !== JSON.stringify(afterVal ?? null);

      const div = document.createElement("div");
      div.className = `table-row${changed ? " audit-changed" : ""}`;
      div.innerHTML = `
        <span class="audit-field">${escapeHtml(key)}</span>
        <span class="audit-value">${escapeHtml(fmtAuditValue(beforeVal))}</span>
        <span class="audit-value">${escapeHtml(fmtAuditValue(afterVal))}</span>
      `;
      auditDiffTableEl.appendChild(div);
    });
  }

  if (auditJsonEl) auditJsonEl.textContent = JSON.stringify(changes || {}, null, 2);
  if (auditJsonEl) auditJsonEl.style.display = auditShowRaw ? "block" : "none";
  if (auditDiffTableEl) auditDiffTableEl.style.display = auditShowRaw ? "none" : "block";
}

function render(rows) {
  tableEl.innerHTML = `
    <div class="table-row table-header">
      <span>When</span>
      <span>Who</span>
      <span>Action</span>
      <span>Summary</span>
      <span></span>
    </div>`;

  rows.forEach((r) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = r.id;
    div.innerHTML = `
      <span>${escapeHtml(fmtDateTime(r.created_at))}</span>
      <span>${escapeHtml(actorLabel(r))}</span>
      <span>${escapeHtml(r.action || "--")}</span>
      <span>${escapeHtml(r.summary || "--")}</span>
      <span style="justify-self:end;">
        <button class="ghost small" type="button" data-view>View</button>
      </span>
    `;
    tableEl.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...rowsCache];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [r.actor_name, r.actor_email, r.action, r.summary, JSON.stringify(r.changes || {})]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }
  return rows;
}

function openAuditModal(arg) {
  const isLegacyPayload =
    arg &&
    typeof arg === "object" &&
    Object.prototype.hasOwnProperty.call(arg, "meta") &&
    Object.prototype.hasOwnProperty.call(arg, "json") &&
    !Object.prototype.hasOwnProperty.call(arg, "changes");

  if (isLegacyPayload) {
    const meta = String(arg.meta || "").replaceAll("Â·", "·");
    let changes = {};
    try {
      changes = JSON.parse(arg.json || "{}");
    } catch {
      changes = {};
    }
    currentAuditRow = { changes };
    if (auditModalMeta) auditModalMeta.textContent = meta;
  } else {
    const row = arg || null;
    currentAuditRow = row;
    if (auditModalMeta && row) {
      auditModalMeta.textContent = `${fmtDateTime(row.created_at)} - ${actorLabel(row)} - ${row.action || ""}`;
    }
  }

  if (toggleAuditRawBtn) toggleAuditRawBtn.textContent = auditShowRaw ? "Show diff" : "Raw JSON";
  renderAuditDetails(currentAuditRow);
  auditModal?.classList.add("show");
}

function closeAuditModal() {
  auditModal?.classList.remove("show");
}

async function init() {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    if (pageMeta) pageMeta.textContent = "Log in to view history.";
    return;
  }
  if (!orderId) {
    if (pageMeta) pageMeta.textContent = "Missing order id.";
    return;
  }

  const from = fromParam ? `&from=${encodeURIComponent(fromParam)}` : "";
  if (backToOrder) backToOrder.href = `rental-order-form.html?id=${encodeURIComponent(orderId)}&companyId=${encodeURIComponent(companyId)}${from}`;

  const res = await fetch(`/api/rental-orders/${encodeURIComponent(orderId)}/history?companyId=${encodeURIComponent(companyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load history");

  rowsCache = Array.isArray(data.rows) ? data.rows : [];
  if (pageMeta) pageMeta.textContent = `${rowsCache.length} entries`;
  render(applyFilters());

  searchInput?.addEventListener("input", () => {
    searchTerm = String(searchInput.value || "");
    render(applyFilters());
  });

  tableEl?.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-view]");
    if (!btn) return;
    const row = e.target.closest(".table-row");
    const id = row?.dataset?.id;
    const r = rowsCache.find((x) => String(x.id) === String(id));
    if (!r) return;
    openAuditModal({
      meta: `${fmtDateTime(r.created_at)} · ${actorLabel(r)} · ${r.action || ""}`,
      json: JSON.stringify(r.changes || {}, null, 2),
    });
  });
}

closeAuditModalBtn?.addEventListener("click", closeAuditModal);
auditModal?.addEventListener("click", (e) => {
  if (e.target === auditModal) closeAuditModal();
});

auditShowUnchangedEl?.addEventListener("change", () => {
  if (!auditModal?.classList?.contains("show")) return;
  renderAuditDetails(currentAuditRow);
});

toggleAuditRawBtn?.addEventListener("click", () => {
  auditShowRaw = !auditShowRaw;
  if (toggleAuditRawBtn) toggleAuditRawBtn.textContent = auditShowRaw ? "Show diff" : "Raw JSON";
  if (!auditModal?.classList?.contains("show")) return;
  renderAuditDetails(currentAuditRow);
});

init().catch((err) => {
  if (pageMeta) pageMeta.textContent = err.message || String(err);
});
