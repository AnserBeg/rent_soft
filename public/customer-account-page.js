function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search || "");
  const value = params.get(name);
  return value ? String(value) : null;
}

function normalizeCompanyId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAccountInfo(customer) {
  if (!customer) return "Unable to load your account.";
  const bits = [];
  if (customer.name) bits.push(`<div><strong>Name:</strong> ${escapeHtml(customer.name)}</div>`);
  if (customer.email) bits.push(`<div><strong>Email:</strong> ${escapeHtml(customer.email)}</div>`);
  if (customer.businessName) bits.push(`<div><strong>Business:</strong> ${escapeHtml(customer.businessName)}</div>`);
  const addr = [customer.streetAddress, customer.city, customer.region, customer.postalCode, customer.country]
    .filter(Boolean)
    .map((v) => String(v));
  if (addr.length) bits.push(`<div><strong>Address:</strong> ${escapeHtml(addr.join(", "))}</div>`);
  if (customer.phone) bits.push(`<div><strong>Phone:</strong> ${escapeHtml(customer.phone)}</div>`);
  if (customer.ccLast4) bits.push(`<div><strong>Card:</strong> &bull;&bull;&bull;&bull; ${escapeHtml(customer.ccLast4)}</div>`);
  return bits.length ? bits.join("") : "Signed in.";
}

function renderDocuments(docs) {
  if (!docs || typeof docs !== "object") return `<span class="hint">No documents uploaded yet.</span>`;
  const entries = Object.entries(docs)
    .filter(([, doc]) => doc && typeof doc === "object" && String(doc.url || "").trim())
    .map(([key, doc]) => {
      const url = String(doc.url || "").trim();
      const label = String(doc.fileName || key || "document").trim() || "document";
      return `<div><a class="ghost small" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a> <span class="hint">${escapeHtml(key)}</span></div>`;
    });
  if (!entries.length) return `<span class="hint">No documents uploaded yet.</span>`;
  return entries.join("");
}

function renderOrderHistory(orders, companyId) {
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) return `<span class="hint">No rentals yet.</span>`;

  function normalizeHistoryStatus(status) {
    const raw = String(status || "").trim().toLowerCase();
    if (!raw) return "unknown";
    if (["request_rejected", "requested_rejected", "quote_rejected", "rejected", "rejected_quote"].includes(raw)) return "rejected";
    if (raw.includes("reject")) return "rejected";
    if (["reservation", "reserved"].includes(raw) || raw.includes("reserv")) return "reserved";
    if (["requested", "request", "booking_request"].includes(raw) || raw.includes("request")) return "requested";
    if (raw === "ordered") return "ordered";
    if (["received", "recieved"].includes(raw)) return "received";
    if (raw === "closed") return "closed";
    return raw;
  }

  function titleCase(value) {
    return String(value || "")
      .split(/[\s_]+/g)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function formatShortDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw.slice(0, 10);
    try {
      return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(dt);
    } catch {
      return raw.slice(0, 10);
    }
  }

  function formatDateRange(startAt, endAt) {
    const start = formatShortDate(startAt);
    const end = formatShortDate(endAt);
    if (start && end) return `${start} to ${end}`;
    return start || end || "";
  }

  const header = `
    <div class="table-row table-header">
      <span>Reference</span>
      <span>Status</span>
      <span>Rental dates</span>
      <span>Placed</span>
      <span></span>
    </div>
  `;

  const rows = list
    .map((o) => {
      const ref = o?.roNumber ? String(o.roNumber) : o?.quoteNumber ? String(o.quoteNumber) : o?.id ? `#${o.id}` : "—";
      const normalizedStatus = normalizeHistoryStatus(o?.status);
      const statusLabel = titleCase(normalizedStatus);
      const dateRange = formatDateRange(o?.startAt, o?.endAt) || "—";
      const placed = formatShortDate(o?.createdAt) || "—";
      const downloadId = o?.id ? String(o.id) : "";
      const downloadCompanyId = companyId ? String(companyId) : "";
      return `
        <div class="table-row">
          <span><strong>${escapeHtml(ref)}</strong></span>
          <span><span class="order-status order-status-${escapeHtml(normalizedStatus)}">${escapeHtml(statusLabel)}</span></span>
          <span>${escapeHtml(dateRange)}</span>
          <span>${escapeHtml(placed)}</span>
          <span>${
            downloadId && downloadCompanyId
              ? `<button type="button" class="ghost small" data-order-pdf="${escapeHtml(downloadId)}" data-company-id="${escapeHtml(downloadCompanyId)}" data-ref="${escapeHtml(ref)}">PDF</button>`
              : ""
          }</span>
        </div>
      `;
    })
    .join("");

  return `<div class="table-shell" id="customer-order-history-table"><div class="table">${header}${rows}</div></div>`;
}

function parseFieldsParam(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    const parsed = safeJsonParse(raw);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v || "").trim()).filter(Boolean);
  }
  return raw
    .split(",")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

document.addEventListener("DOMContentLoaded", () => {
  const info = $("customer-account-info");
  const docsEl = $("customer-account-docs");
  const historyEl = $("customer-account-history");
  const requiredEl = $("customer-account-required");
  const meta = $("customer-account-meta");
  const back = $("customer-account-back");
  const saveBtn = $("customer-account-save");
  const logoutBtn = $("customer-account-logout");
  const createCompanyLink = $("create-company-link");

  const returnTo = getQueryParam("returnTo");
  const companyIdQuery = normalizeCompanyId(getQueryParam("companyId"));
  if (back && returnTo) back.href = returnTo;

  const token = window.CustomerAccount?.getToken?.() || "";
  if (!token) {
    if (info) info.innerHTML = `Please <a class="ghost" href="customer-login.html${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}">log in</a> first.`;
    if (docsEl) docsEl.textContent = "";
    if (historyEl) historyEl.textContent = "";
    if (saveBtn) saveBtn.disabled = true;
    return;
  }

  const missingFields = parseFieldsParam(getQueryParam("fields"));
  if (requiredEl) {
    requiredEl.textContent = missingFields.length ? `Needed to reserve: ${missingFields.join(", ")}` : "";
  }

  function setForm(customer) {
    const set = (id, value) => {
      const el = $(id);
      if (!el) return;
      el.value = value || "";
    };
    set("businessName", customer?.businessName ? String(customer.businessName) : "");
    set("phone", customer?.phone ? String(customer.phone) : "");
    set("streetAddress", customer?.streetAddress ? String(customer.streetAddress) : "");
    set("city", customer?.city ? String(customer.city) : "");
    set("region", customer?.region ? String(customer.region) : "");
    set("postalCode", customer?.postalCode ? String(customer.postalCode) : "");
    set("country", customer?.country ? String(customer.country) : "");
    const cc = $("creditCardNumber");
    if (cc) cc.value = "";
  }

  function readLastCompanyId() {
    const raw = localStorage.getItem("rentSoft.customerLastCompanyId");
    const cid = Number(raw);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    return cid;
  }


  async function loadHistory(customer) {
    if (!historyEl) return;
    const companyId = companyIdQuery || (customer?.companyId ? Number(customer.companyId) : null) || readLastCompanyId();
    if (!companyId) {
      historyEl.innerHTML = `<span class="hint">Reserve something first to see your rental history.</span>`;
      return;
    }

    historyEl.textContent = "Loading...";
    const res = await fetch(`/api/customers/orders?companyId=${encodeURIComponent(String(companyId))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load rental history.");
    historyEl.innerHTML = renderOrderHistory(data.orders, data.companyId || companyId);
  }

  async function downloadOrderPdf({ orderId, companyId, ref }) {
    const id = Number(orderId);
    const cid = Number(companyId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid order id.");
    if (!Number.isFinite(cid) || cid <= 0) throw new Error("Invalid company id.");

    const url = `/api/customers/orders/${encodeURIComponent(String(id))}/pdf?companyId=${encodeURIComponent(String(cid))}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Unable to download PDF.");
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${String(ref || `order-${id}`).replace(/[^\w\-().\s]/g, "").trim() || `order-${id}`}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 250);
  }

  async function load() {
    setMeta(meta, "Loading...");
    const res = await fetch("/api/customers/me", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load account.");
    const customer = data.customer || null;
    if (info) info.innerHTML = renderAccountInfo(customer);
    if (docsEl) docsEl.innerHTML = renderDocuments(customer?.documents);
    setForm(customer);
    window.CustomerAccount?.setSession?.({ token, customer });

    if (createCompanyLink) {
      const params = new URLSearchParams();
      params.set("prefillOwnerName", String(customer?.name || ""));
      params.set("prefillOwnerEmail", String(customer?.email || ""));
      params.set("prefillContactEmail", String(customer?.email || ""));
      createCompanyLink.href = `signup.html?${params.toString()}`;
    }


    await loadHistory(customer);
    setMeta(meta, "");
  }

  saveBtn?.addEventListener("click", async () => {
    setMeta(meta, "");
    saveBtn.disabled = true;
    try {
      const form = new FormData();
      const addText = (id) => {
        const el = $(id);
        if (!el) return;
        form.set(id, String(el.value || ""));
      };
      ["businessName", "phone", "streetAddress", "city", "region", "postalCode", "country", "creditCardNumber"].forEach(addText);

      const addFile = (id) => {
        const el = $(id);
        const file = el?.files?.[0] || null;
        if (file) form.append(id, file);
      };
      ["reference1", "reference2", "proofOfInsurance", "driversLicense"].forEach(addFile);

      const res = await fetch("/api/customers/profile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to save.");

      const updated = data.customer || null;
      if (updated) {
        window.CustomerAccount?.setSession?.({ token, customer: updated });
        if (info) info.innerHTML = renderAccountInfo(updated);
        if (docsEl) docsEl.innerHTML = renderDocuments(updated?.documents);
        setForm(updated);
      }

      setMeta(meta, "Saved.");
      if (missingFields.length && returnTo) window.location.href = returnTo;
    } catch (err) {
      setMeta(meta, err?.message ? String(err.message) : String(err));
    } finally {
      saveBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener("click", () => {
    fetch("/api/customers/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    fetch("/api/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("rentSoft.session");
    localStorage.removeItem("rentSoft.companyId");
    window.CustomerAccount?.clearSession?.();
    window.location.href = returnTo || "index.html";
  });

  historyEl?.addEventListener("click", async (e) => {
    const btn = e?.target?.closest?.("[data-order-pdf]");
    if (!btn) return;
    try {
      const orderId = btn.getAttribute("data-order-pdf");
      const companyId = btn.getAttribute("data-company-id");
      const ref = btn.getAttribute("data-ref") || "";
      await downloadOrderPdf({ orderId, companyId, ref });
    } catch (err) {
      setMeta(meta, err?.message ? String(err.message) : "Unable to download PDF.");
    }
  });

  load().catch((err) => {
    if (info) info.textContent = "Unable to load your account.";
    setMeta(meta, err?.message ? String(err.message) : String(err));
  });
});
