function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function serializeLines() {
  const rows = Array.from(document.querySelectorAll("[data-line-row]"));
  return rows
    .map((row) => {
      const description = row.querySelector("[data-desc]")?.value || "";
      const quantity = row.querySelector("[data-qty]")?.value;
      const unitPrice = row.querySelector("[data-unit]")?.value;
      const amount = row.querySelector("[data-amt]")?.value;
      const isTaxable = row.querySelector("[data-tax]")?.checked;
      return {
        description: String(description || "").trim(),
        quantity: quantity === "" ? 0 : safeNum(quantity, 0),
        unitPrice: unitPrice === "" ? 0 : safeNum(unitPrice, 0),
        amount: amount === "" ? null : safeNum(amount, null),
        isTaxable: isTaxable !== false,
      };
    })
    .filter((li) => li.description);
}

function renderLineRow(line) {
  const tr = document.createElement("tr");
  tr.dataset.lineRow = "1";
  const q = safeNum(line?.quantity, 0);
  const u = safeNum(line?.unitPrice, 0);
  const a = line?.amount === null || line?.amount === undefined ? q * u : safeNum(line.amount, q * u);
  tr.innerHTML = `
    <td><input data-desc value="${String(line?.description || "").replaceAll('"', "&quot;")}" /></td>
    <td><input data-qty type="number" step="0.0001" value="${q}" /></td>
    <td><input data-unit type="number" step="0.01" value="${u}" /></td>
    <td><input data-amt type="number" step="0.01" value="${safeNum(a, 0).toFixed(2)}" /></td>
    <td style="text-align:center;"><input data-tax type="checkbox" ${line?.isTaxable === false ? "" : "checked"} /></td>
    <td style="text-align:right;"><button class="ghost small" type="button" data-remove>Remove</button></td>
  `;
  tr.querySelector("[data-remove]")?.addEventListener("click", () => tr.remove());
  return tr;
}

document.addEventListener("DOMContentLoaded", () => {
  const manualCustomerSelect = $("manual-customer");
  const manualInvoiceDateInput = $("manual-invoice-date");
  const manualDueDateInput = $("manual-due-date");
  const manualServiceStartInput = $("manual-service-start");
  const manualServiceEndInput = $("manual-service-end");
  const manualNotesInput = $("manual-notes");
  const manualGeneralNotesInput = $("manual-general-notes");
  const manualLinesBody = $("manual-lines-body");
  const manualAddLineBtn = $("manual-add-line");
  const manualCreateBtn = $("manual-create");
  const manualMeta = $("manual-meta");

  const activeCompanyId = window.RentSoft?.getCompanyId?.() ? Number(window.RentSoft.getCompanyId()) : null;

  async function loadCustomers() {
    if (!activeCompanyId || !manualCustomerSelect) return;
    const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load customers.");
    const customers = Array.isArray(data.customers) ? data.customers : [];
    customers.sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")));
    manualCustomerSelect.innerHTML = (customers.length ? `<option value="">Select customer</option>` : `<option value="">No customers found</option>`) + customers
      .map((c) => `<option value="${c.id}">${String(c.company_name || `Customer #${c.id}`)}</option>`)
      .join("");
  }

  function resetManualInvoiceForm() {
    if (manualInvoiceDateInput) manualInvoiceDateInput.value = "";
    if (manualDueDateInput) manualDueDateInput.value = "";
    if (manualServiceStartInput) manualServiceStartInput.value = "";
    if (manualServiceEndInput) manualServiceEndInput.value = "";
    if (manualNotesInput) manualNotesInput.value = "";
    if (manualGeneralNotesInput) manualGeneralNotesInput.value = "";
    if (manualLinesBody) {
      manualLinesBody.innerHTML = "";
      manualLinesBody.appendChild(renderLineRow({ quantity: 1, unitPrice: 0, amount: null, isTaxable: true }));
    }
  }

  manualAddLineBtn?.addEventListener("click", () => {
    if (!manualLinesBody) return;
    manualLinesBody.appendChild(renderLineRow({ quantity: 1, unitPrice: 0, amount: null, isTaxable: true }));
  });

  manualCreateBtn?.addEventListener("click", async () => {
    if (!activeCompanyId) {
      setMeta(manualMeta, "Log in to create a manual invoice.");
      return;
    }
    setMeta(manualMeta, "");
    try {
      const customerId = manualCustomerSelect?.value ? Number(manualCustomerSelect.value) : null;
      if (!customerId) throw new Error("Select a customer.");
      const lineItems = serializeLines();
      if (!lineItems.length) throw new Error("Add at least one line item.");

      const res = await fetch("/api/invoices/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          customerId,
          invoiceDate: manualInvoiceDateInput?.value || null,
          dueDate: manualDueDateInput?.value || null,
          servicePeriodStart: manualServiceStartInput?.value || null,
          servicePeriodEnd: manualServiceEndInput?.value || null,
          generalNotes: manualGeneralNotesInput?.value || null,
          notes: manualNotesInput?.value || null,
          lineItems,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to create manual invoice.");
      const inv = data?.invoice || data;
      const label = inv?.invoiceNumber || inv?.invoice_number || (inv?.id ? `#${inv.id}` : "invoice");
      setMeta(manualMeta, `Created invoice ${label}.`);
      resetManualInvoiceForm();
    } catch (err) {
      setMeta(manualMeta, err?.message ? String(err.message) : String(err));
    }
  });

  if (!activeCompanyId) {
    setMeta(manualMeta, "Log in to create a manual invoice.");
    return;
  }

  loadCustomers()
    .then(() => setMeta(manualMeta, ""))
    .catch((err) => setMeta(manualMeta, err?.message || String(err)));
  resetManualInvoiceForm();
});
