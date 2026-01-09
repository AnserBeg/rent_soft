const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const editingVendorId = params.get("id");
const returnTo = params.get("returnTo");

const modeLabel = document.getElementById("mode-label");
const formTitle = document.getElementById("form-title");
const deleteVendorBtn = document.getElementById("delete-vendor");
const vendorForm = document.getElementById("vendor-form");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let vendorsCache = [];

function updateModeLabels() {
  if (editingVendorId) {
    modeLabel.textContent = `Edit vendor #${editingVendorId}`;
    formTitle.textContent = "Vendor details";
    deleteVendorBtn.style.display = "inline-flex";
  } else {
    modeLabel.textContent = "New vendor";
    formTitle.textContent = "Vendor details";
    deleteVendorBtn.style.display = "none";
  }
}

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function loadVendors() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/vendors?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch vendors");
  const data = await res.json();
  vendorsCache = data.vendors || [];
}

async function loadVendor() {
  if (!editingVendorId) return;
  await loadVendors();
  const vendor = vendorsCache.find((v) => String(v.id) === String(editingVendorId));
  if (!vendor) {
    return;
  }
  vendorForm.companyName.value = vendor.company_name || "";
  vendorForm.contactName.value = vendor.contact_name || "";
  vendorForm.email.value = vendor.email || "";
  vendorForm.phone.value = vendor.phone || "";
  vendorForm.streetAddress.value = vendor.street_address || "";
  vendorForm.city.value = vendor.city || "";
  vendorForm.region.value = vendor.region || "";
  vendorForm.country.value = vendor.country || "";
  vendorForm.postalCode.value = vendor.postal_code || "";
  vendorForm.notes.value = vendor.notes || "";
}

vendorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  const payload = getFormData(vendorForm);
  if (!payload.companyName) return;
  payload.companyId = activeCompanyId;
  if (!payload.contactName) payload.contactName = null;
  if (!payload.email) payload.email = null;
  if (!payload.phone) payload.phone = null;
  if (!payload.streetAddress) payload.streetAddress = null;
  if (!payload.city) payload.city = null;
  if (!payload.region) payload.region = null;
  if (!payload.country) payload.country = null;
  if (!payload.postalCode) payload.postalCode = null;
  if (!payload.notes) payload.notes = null;

  const res = await fetch(editingVendorId ? `/api/vendors/${editingVendorId}` : "/api/vendors", {
    method: editingVendorId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  window.location.href = returnTo || "vendors.html";
});

deleteVendorBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId || !editingVendorId) return;
  if (!window.confirm("Delete this vendor?")) return;
  const res = await fetch(`/api/vendors/${editingVendorId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  });
  if (!res.ok) return;
  window.location.href = "vendors.html";
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  updateModeLabels();
  loadVendor().catch(() => {});
} else {
  updateModeLabels();
}
