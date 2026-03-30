(() => {
  const accessHint = document.getElementById("admin-import-access");
  const importForm = document.getElementById("admin-import-form");
  const importFileInput = document.getElementById("admin-import-file");
  const importTextInput = document.getElementById("admin-import-text");
  const importStatus = document.getElementById("admin-import-status");
  const importBtn = document.getElementById("run-admin-import");

  function setStatus(message, isError = false) {
    if (!importStatus) return;
    importStatus.textContent = message || "";
    importStatus.style.color = isError ? "#b42318" : "";
  }

  function setAccess(allowed) {
    const canUse = !!allowed;
    if (accessHint) {
      accessHint.textContent = canUse
        ? "Developer access confirmed."
        : "Developer access required to run this import.";
    }
    if (importBtn) importBtn.disabled = !canUse;
    if (importForm) importForm.style.opacity = canUse ? "1" : "0.5";
    if (importForm) importForm.style.pointerEvents = canUse ? "auto" : "none";
    return canUse;
  }

  async function ensureAccess() {
    if (!window.RentSoftDev) return false;
    const ok = await window.RentSoftDev.requireDevAuth({
      redirectTo: "dev-login.html?returnTo=admin-import.html",
    });
    setAccess(ok);
    return ok;
  }

  async function runImport() {
    const ok = await ensureAccess();
    if (!ok) return;

    const file = importFileInput?.files?.[0] || null;
    const text = String(importTextInput?.value || "").trim();

    if (!file && !text) {
      setStatus("Choose a file or paste data to import.", true);
      return;
    }

    const body = new FormData();
    if (file) {
      body.append("file", file);
    } else {
      const blob = new Blob([text], { type: "text/plain" });
      body.append("file", blob, "import.txt");
    }

    if (importBtn) importBtn.disabled = true;
    setStatus("Importing...");

    try {
      const res = await window.RentSoftDev.devFetch("/api/admin/company-equipment/import", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          await ensureAccess();
          return;
        }
        throw new Error(data.error || "Import failed.");
      }

      const summary = `Import complete: companies created ${data.companiesCreated || 0}, matched ${data.companiesMatched || 0}, equipment types created ${data.typesCreated || 0}, updated ${data.typesUpdated || 0}, skipped ${data.rowsSkipped || 0}.`;
      const errorTail = data.errors?.length ? ` Errors ${data.errors.length}.` : "";
      setStatus(`${summary}${errorTail}`);
    } catch (err) {
      const message = err?.message ? String(err.message) : "Import failed.";
      setStatus(message, true);
    } finally {
      if (importBtn) importBtn.disabled = false;
      if (importFileInput) importFileInput.value = "";
    }
  }

  ensureAccess();

  importBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    runImport();
  });
})();
