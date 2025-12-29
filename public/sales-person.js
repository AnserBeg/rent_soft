const params = new URLSearchParams(window.location.search);
const salesPersonId = params.get("id");

const companyMeta = document.getElementById("company-meta");
const titleEl = document.getElementById("sp-title");

const rangeStartInput = document.getElementById("range-start");
const rangeDaysSelect = document.getElementById("range-days");
const bucketSelect = document.getElementById("bucket");
const txCanvas = document.getElementById("tx-chart");
const imageWrap = document.getElementById("sp-image-wrap");
const imageEl = document.getElementById("sp-image");

const nameInput = document.getElementById("sp-name");
const emailInput = document.getElementById("sp-email");
const phoneInput = document.getElementById("sp-phone");
const imageFileInput = document.getElementById("sp-image-file");
const saveBtn = document.getElementById("save-sp");
const deleteBtn = document.getElementById("delete-sp");
const formMeta = document.getElementById("sp-meta");

let chart = null;
let currentImageUrl = null;

const DAY_MS = 24 * 60 * 60 * 1000;

async function uploadImage({ companyId, file }) {
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", file);
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

function syncSalesPersonImage(url) {
  if (!imageWrap || !imageEl) return;
  const next = url ? String(url) : "";
  if (!next) {
    imageEl.removeAttribute("src");
    imageWrap.hidden = true;
    return;
  }
  imageEl.src = next;
  imageWrap.hidden = false;
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
    if (companyMeta) companyMeta.textContent = "Log in and select a company to view sales people.";
    return;
  }
  if (!salesPersonId) {
    if (titleEl) titleEl.textContent = "Sales person not found";
    return;
  }

  const companyName = session?.company?.name ? String(session.company.name) : null;
  if (companyMeta) companyMeta.textContent = companyName ? `${companyName} (Company #${companyId})` : `Company #${companyId}`;

  const rangeDays = Number(rangeDaysSelect?.value) || 365;
  const rangeStart = startOfLocalDay(new Date(Date.now() - rangeDays * DAY_MS));
  if (rangeStartInput) rangeStartInput.value = toLocalDateInputValue(rangeStart);

  const spRes = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}?companyId=${encodeURIComponent(companyId)}`);
  const spData = await spRes.json().catch(() => ({}));
  if (!spRes.ok) throw new Error(spData.error || "Unable to load sales person");
  const sp = spData.salesPerson || null;
  if (titleEl) titleEl.textContent = sp?.name || "Sales person";
  if (nameInput) nameInput.value = sp?.name || "";
  if (emailInput) emailInput.value = sp?.email || "";
  if (phoneInput) phoneInput.value = sp?.phone || "";
  currentImageUrl = sp?.image_url || null;
  syncSalesPersonImage(currentImageUrl);

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
    const res = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}/transactions-closed-timeseries?${qs.toString()}`);
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

  [rangeStartInput, rangeDaysSelect, bucketSelect].filter(Boolean).forEach((el) => el.addEventListener("change", () => loadChart().catch((e) => (companyMeta.textContent = e.message))));
  await loadChart();

  saveBtn?.addEventListener("click", async () => {
    if (formMeta) formMeta.textContent = "";
    const name = String(nameInput?.value || "").trim();
    if (!name) {
      if (formMeta) formMeta.textContent = "Name is required.";
      return;
    }
    saveBtn.disabled = true;
    try {
      const imageFile = imageFileInput?.files?.[0] || null;
      const previousImageUrl = currentImageUrl;
      let imageUrl = currentImageUrl;
      if (imageFile) imageUrl = await uploadImage({ companyId, file: imageFile });

      const res = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          name,
          email: String(emailInput?.value || "").trim() || null,
          phone: String(phoneInput?.value || "").trim() || null,
          imageUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (imageFile && imageUrl) await deleteUploadedImage({ companyId, url: imageUrl }).catch(() => {});
        throw new Error(data.error || "Unable to save sales person");
      }
      if (titleEl) titleEl.textContent = data.salesPerson?.name || name;
      currentImageUrl = data.salesPerson?.image_url ?? imageUrl ?? null;
      syncSalesPersonImage(currentImageUrl);
      if (imageFileInput) imageFileInput.value = "";
      if (imageFile && previousImageUrl && previousImageUrl !== currentImageUrl) {
        await deleteUploadedImage({ companyId, url: previousImageUrl }).catch(() => {});
      }
      if (formMeta) formMeta.textContent = "Saved.";
    } catch (err) {
      if (formMeta) formMeta.textContent = err.message || String(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!window.confirm("Delete this sales person?")) return;
    if (formMeta) formMeta.textContent = "";
    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: Number(companyId) }),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unable to delete sales person");
      }
      window.location.href = "sales-people.html";
    } catch (err) {
      if (formMeta) formMeta.textContent = err.message || String(err);
      deleteBtn.disabled = false;
    }
  });
}

init().catch((err) => {
  if (companyMeta) companyMeta.textContent = err.message || String(err);
});
