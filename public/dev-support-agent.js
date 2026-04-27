(() => {
  const uploadForm = document.getElementById("manual-upload-form");
  const uploadInput = document.getElementById("manual-zip-file");
  const uploadButton = document.getElementById("manual-upload-button");
  const uploadStatus = document.getElementById("manual-upload-status");
  const refreshButton = document.getElementById("manuals-refresh");
  const logoutButton = document.getElementById("manuals-logout");
  const manualsMeta = document.getElementById("manuals-meta");
  const manualsCount = document.getElementById("manuals-count");
  const manualsTable = document.getElementById("manuals-table");

  let manuals = [];
  let uploading = false;
  let activatingManualId = 0;
  let refreshTimer = 0;

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  }

  function setUploadState(message, isError = false) {
    if (!uploadStatus) return;
    uploadStatus.textContent = message;
    uploadStatus.style.color = isError ? "var(--danger)" : "";
  }

  function stopRefreshTimer() {
    if (!refreshTimer) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = 0;
  }

  function scheduleRefresh() {
    stopRefreshTimer();
    if (!manuals.some((manual) => manual.status === "processing")) return;
    refreshTimer = window.setTimeout(() => {
      loadManuals();
    }, 5000);
  }

  function renderManuals() {
    if (!manualsTable) return;
    manualsTable.innerHTML = `
      <div class="table-row table-header">
        <span>Manual</span>
        <span>Status</span>
        <span>Screenshots</span>
        <span>Created</span>
        <span>Activated</span>
        <span>Action</span>
      </div>
    `;

    if (!manuals.length) {
      const empty = document.createElement("div");
      empty.className = "table-row";
      empty.innerHTML = `
        <span>No manuals uploaded</span>
        <span>--</span>
        <span>--</span>
        <span>--</span>
        <span>--</span>
        <span>--</span>
      `;
      manualsTable.appendChild(empty);
      if (manualsCount) manualsCount.textContent = "Manuals (0)";
      return;
    }

    manuals.forEach((manual) => {
      const row = document.createElement("div");
      row.className = "table-row";
      const statusLabel = manual.isActive ? `${manual.status} / active` : manual.status;
      const actionDisabled = manual.status !== "ready" || manual.isActive || activatingManualId === manual.id;
      row.innerHTML = `
        <span>
          <strong>${manual.name || "--"}</strong>
          <div class="hint" style="margin-top:4px;">${manual.originalFilename || "--"}</div>
          ${manual.errorMessage ? `<div class="hint" style="margin-top:6px;color:var(--danger);">${manual.errorMessage}</div>` : ""}
        </span>
        <span>${statusLabel}</span>
        <span>${manual.screenshotCount ?? 0}</span>
        <span>${formatDate(manual.createdAt)}</span>
        <span>${formatDate(manual.activatedAt)}</span>
        <span><button class="ghost" type="button" data-activate-manual="${manual.id}" ${actionDisabled ? "disabled" : ""}>${activatingManualId === manual.id ? "Activating..." : manual.isActive ? "Active" : "Activate"}</button></span>
      `;
      manualsTable.appendChild(row);
    });

    if (manualsCount) manualsCount.textContent = `Manuals (${manuals.length})`;
  }

  async function loadManuals() {
    if (!window.RentSoftDev) return;
    const ok = await window.RentSoftDev.requireDevAuth();
    if (!ok) return;
    try {
      const res = await window.RentSoftDev.devFetch("/api/dev/support-manuals");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load manuals.");
      manuals = Array.isArray(data.manuals) ? data.manuals : [];
      renderManuals();
      if (manualsMeta) {
        const active = manuals.find((manual) => manual.isActive);
        manualsMeta.textContent = active
          ? `Active manual: ${active.name} (${active.originalFilename})`
          : "No active manual yet.";
      }
      scheduleRefresh();
    } catch (error) {
      stopRefreshTimer();
      if (manualsMeta) manualsMeta.textContent = error?.message ? String(error.message) : "Unable to load manuals.";
    }
  }

  async function uploadManual(event) {
    event.preventDefault();
    if (!window.RentSoftDev || uploading) return;
    const file = uploadInput?.files?.[0];
    if (!file) {
      setUploadState("Choose a ZIP file first.", true);
      return;
    }

    uploading = true;
    if (uploadButton) uploadButton.disabled = true;
    setUploadState("Uploading ZIP. Indexing will continue in the background after the file is accepted.");

    try {
      const formData = new FormData();
      formData.append("manualZip", file);
      const res = await window.RentSoftDev.devFetch("/api/dev/support-manuals/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadState(data.message || "Manual uploaded. Indexing is running in the background.");
      if (uploadInput) uploadInput.value = "";
      await loadManuals();
    } catch (error) {
      setUploadState(error?.message ? String(error.message) : "Upload failed.", true);
    } finally {
      uploading = false;
      if (uploadButton) uploadButton.disabled = false;
    }
  }

  async function activateManual(manualId) {
    if (!window.RentSoftDev || activatingManualId) return;
    activatingManualId = manualId;
    renderManuals();
    try {
      const res = await window.RentSoftDev.devFetch(`/api/dev/support-manuals/${manualId}/activate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to activate manual.");
      setUploadState(`Active manual changed to ${data.manual?.name || "Support Manual"}.`);
      await loadManuals();
    } catch (error) {
      setUploadState(error?.message ? String(error.message) : "Unable to activate manual.", true);
    } finally {
      activatingManualId = 0;
      renderManuals();
    }
  }

  uploadForm?.addEventListener("submit", uploadManual);
  refreshButton?.addEventListener("click", () => loadManuals());
  manualsTable?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-activate-manual]");
    if (!button) return;
    const manualId = Number(button.getAttribute("data-activate-manual"));
    if (!Number.isFinite(manualId) || manualId <= 0) return;
    activateManual(manualId);
  });
  logoutButton?.addEventListener("click", async () => {
    stopRefreshTimer();
    if (!window.RentSoftDev) return;
    try {
      await window.RentSoftDev.devFetch("/api/dev/logout", { method: "POST" });
    } catch (_error) {
      // Ignore.
    }
    window.RentSoftDev.clearDevToken();
    window.location.href = "dev-login.html";
  });

  loadManuals();
})();
