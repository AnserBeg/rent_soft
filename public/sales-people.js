function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const pageMeta = document.getElementById("page-meta");
const tableEl = document.getElementById("sales-people-table");
const searchInput = document.getElementById("search");

const openAdd = document.getElementById("open-add-sales");
const modal = document.getElementById("add-sales-modal");
const closeAdd = document.getElementById("close-add-sales");
const form = document.getElementById("add-sales-form");
const submit = document.getElementById("add-sales-submit");
const meta = document.getElementById("add-sales-meta");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let salesCache = [];
let sortField = "name";
let sortDir = "asc";
let searchTerm = "";

const LIST_STATE_KEY = "rentsoft.sales-people.listState";
const ALLOWED_SORT_FIELDS = new Set(["name", "email", "phone"]);

function loadListState() {
  const raw = localStorage.getItem(LIST_STATE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.searchTerm === "string") searchTerm = saved.searchTerm;
    if (typeof saved.sortField === "string" && ALLOWED_SORT_FIELDS.has(saved.sortField)) sortField = saved.sortField;
    if (saved.sortDir === "asc" || saved.sortDir === "desc") sortDir = saved.sortDir;
  } catch { }
}

function persistListState() {
  localStorage.setItem(
    LIST_STATE_KEY,
    JSON.stringify({
      searchTerm: String(searchTerm || ""),
      sortField,
      sortDir,
    })
  );
}


function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showModal() {
  if (!modal) return;
  modal.style.display = "flex";
}

function hideModal() {
  if (!modal) return;
  modal.style.display = "none";
  if (meta) meta.textContent = "";
  form?.reset?.();
}

function webpFileName(name) {
  const base = String(name || "image").replace(/\.[^/.]+$/, "");
  return `${base || "image"}.webp`;
}

async function decodeImageForCanvas(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch (_) {
      // fall through
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image."));
    };
    img.src = url;
  });
}

async function convertImageToWebpFile(file, quality = 0.88) {
  if (!file || !String(file.type || "").startsWith("image/")) return file;
  if (String(file.type || "").toLowerCase() === "image/webp") return file;
  let decoded;
  try {
    decoded = await decodeImageForCanvas(file);
  } catch (_) {
    return file;
  }
  const width = decoded?.width || decoded?.naturalWidth || 0;
  const height = decoded?.height || decoded?.naturalHeight || 0;
  if (!width || !height) return file;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.toBlob) return file;
  ctx.drawImage(decoded, 0, 0, width, height);
  if (typeof decoded?.close === "function") decoded.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") return file;
  return new File([blob], webpFileName(file.name), {
    type: "image/webp",
    lastModified: file.lastModified || Date.now(),
  });
}

async function uploadImage({ companyId, file }) {
  const prepared = await convertImageToWebpFile(file);
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", prepared);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload image");
  if (!data.url) throw new Error("Upload did not return an image url");
  return data.url;
}

async function deleteUploadedImage({ companyId, url }) {
  if (!url) return;
  const res = await fetch("/api/uploads/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete image");
}

function renderSalesPeople(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };

  tableEl.innerHTML = `
    <div class="table-row table-header">
      <span>Photo</span>
      <span class="sort ${sortField === "name" ? "active" : ""}" data-sort="name">Name ${indicator("name")}</span>
      <span class="sort ${sortField === "email" ? "active" : ""}" data-sort="email">Email ${indicator("email")}</span>
      <span class="sort ${sortField === "phone" ? "active" : ""}" data-sort="phone">Phone ${indicator("phone")}</span>
      <span></span>
    </div>`;

  rows.forEach((sp) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = sp.id;
    const thumb = sp.image_url
      ? `<img class="thumb" src="${sp.image_url}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="thumb placeholder">--</span>`;
    div.innerHTML = `
      <span class="thumb-cell">${thumb}</span>
      <span>${escapeHtml(sp.name || `#${sp.id}`)}</span>
      <span>${escapeHtml(sp.email || "--")}</span>
      <span>${escapeHtml(sp.phone || "--")}</span>
      <span style="justify-self:end; display:flex; gap:8px; align-items:center;">
        <button class="ghost small danger" type="button" data-delete>Delete</button>
      </span>
    `;
    tableEl.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...salesCache];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [r.name, r.email, r.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(term))
    );
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const sortKey = (row) => norm(row[sortField]);
  rows.sort((a, b) => {
    const av = sortKey(a);
    const bv = sortKey(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return rows;
}

async function loadSalesPeople() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/sales-people?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to fetch sales people");
  salesCache = data.sales || [];
  renderSalesPeople(applyFilters());
}

async function deleteSalesPersonById(id) {
  const res = await fetch(`/api/sales-people/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  });
  if (res.status === 204) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete sales person");
}

document.addEventListener("DOMContentLoaded", () => {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    if (pageMeta) pageMeta.textContent = "Log in and select a company to view sales people.";
    return;
  }
  activeCompanyId = Number(companyId);
  window.RentSoft?.setCompanyId?.(activeCompanyId);

  if (pageMeta) pageMeta.textContent = "";

  openAdd?.addEventListener("click", () => showModal());
  closeAdd?.addEventListener("click", () => hideModal());
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (meta) meta.textContent = "";
    if (submit) submit.disabled = true;
    try {
      const payload = getFormData(form);
      const imageFile = form?.imageFile?.files?.[0] || null;
      let imageUrl = null;
      if (imageFile) imageUrl = await uploadImage({ companyId: activeCompanyId, file: imageFile });
      const res = await fetch("/api/sales-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(activeCompanyId),
          name: payload.name,
          email: payload.email || null,
          phone: payload.phone || null,
          imageUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (imageUrl) await deleteUploadedImage({ companyId: activeCompanyId, url: imageUrl }).catch(() => { });
        throw new Error(data.error || "Unable to add sales person");
      }
      if (res.status !== 201 && imageUrl) await deleteUploadedImage({ companyId: activeCompanyId, url: imageUrl }).catch(() => { });
      hideModal();
      await loadSalesPeople();
    } catch (err) {
      if (meta) meta.textContent = err.message || String(err);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  searchInput?.addEventListener("input", () => {
    searchTerm = String(searchInput.value || "");
    renderSalesPeople(applyFilters());
    persistListState();
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
      renderSalesPeople(applyFilters());
      persistListState();
      return;
    }

    const del = e.target.closest?.("[data-delete]");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const row = e.target.closest(".table-row");
      const id = row?.dataset?.id;
      if (!id) return;
      const sp = salesCache.find((s) => String(s.id) === String(id));
      const name = sp?.name || `#${id}`;
      if (!window.confirm(`Delete sales person "${name}"?`)) return;
      try {
        await deleteSalesPersonById(id);
        await loadSalesPeople();
      } catch (err) {
        if (pageMeta) pageMeta.textContent = err.message || String(err);
      }
      return;
    }

    const row = e.target.closest(".table-row");
    if (!row || row.classList.contains("table-header")) return;
    const id = row.dataset.id;
    if (!id) return;
    window.location.href = `sales-person.html?id=${encodeURIComponent(id)}`;
  });

  loadListState();
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadSalesPeople().catch((err) => {
    if (pageMeta) pageMeta.textContent = err.message || String(err);
  });
});
