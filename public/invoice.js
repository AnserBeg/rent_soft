function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function asText(v) {
  return v === null || v === undefined ? "" : String(v);
}

function escapeHtml(value) {
  return asText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

function formatTaxRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 0;
  const display = n > 1 ? n : n * 100;
  return Number(display.toFixed(2));
}

function parseTaxRate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

let billingTimeZone = "UTC";

function formatDateInTimeZone(value, timeZone) {
  if (!value || !timeZone) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = dtf.formatToParts(d).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    if (!parts.year || !parts.month || !parts.day) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
}

function fmtDate(value) {
  if (!value) return "--";
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const tzDate = formatDateInTimeZone(value, billingTimeZone);
  if (tzDate) return tzDate;
  return d.toISOString().slice(0, 10);
}

function formatStatus(value) {
  const raw = String(value || "").trim();
  if (!raw) return "--";
  return raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function billingReasonLabel(reason) {
  const v = String(reason || "").trim().toLowerCase();
  switch (v) {
    case "monthly":
      return "Monthly billing";
    case "monthly_arrears":
      return "Monthly billing (arrears)";
    case "contract_final":
      return "Final invoice";
    case "pickup_proration":
      return "Pickup proration";
    case "pause_credit":
      return "Pause credit";
    case "return_credit":
      return "Return credit";
    case "resume_charge":
      return "Resume charge";
    case "credit_memo":
      return "Credit memo";
    case "debit_memo":
      return "Debit memo";
    default:
      return "Invoice";
  }
}

function documentTypeLabel(docType) {
  const v = String(docType || "").trim().toLowerCase();
  switch (v) {
    case "credit_memo":
    case "credit":
      return "Credit memo";
    case "debit_memo":
    case "debit":
      return "Debit memo";
    default:
      return "Invoice";
  }
}

function serializeLines() {
  const rows = Array.from(document.querySelectorAll("[data-line-row]"));
  return rows
    .map((row) => {
      const description = row.querySelector("[data-desc]")?.value || "";
      const quantity = row.querySelector("[data-qty]")?.value;
      const unitPrice = row.querySelector("[data-unit]")?.value;
      const amount = row.querySelector("[data-amt]")?.value;
      const isTaxable = row.querySelector("[data-taxable]")?.checked;
      const taxRate = row.querySelector("[data-tax-rate]")?.value;
      return {
        description: String(description || "").trim(),
        quantity: quantity === "" ? 0 : safeNum(quantity, 0),
        unitPrice: unitPrice === "" ? 0 : safeNum(unitPrice, 0),
        amount: amount === "" ? null : safeNum(amount, null),
        isTaxable: isTaxable !== false,
        taxRate: taxRate === "" ? null : parseTaxRate(taxRate),
      };
    })
    .filter((li) => li.description);
}

function renderLineRow(line, editable = true, taxDefaults = null) {
  const tr = document.createElement("tr");
  tr.dataset.lineRow = "1";
  const q = safeNum(line?.quantity, 0);
  const u = safeNum(line?.unitPrice, 0);
  const a = line?.amount === null || line?.amount === undefined ? q * u : safeNum(line.amount, q * u);
  const taxEnabled = taxDefaults?.enabled === true;
  const defaultRate = Number(taxDefaults?.defaultRate || 0);
  const taxRateValue = line?.taxRate === null || line?.taxRate === undefined ? defaultRate : Number(line.taxRate);
  const isTaxable = line?.isTaxable === false ? false : true;
  const disabled = editable ? "" : "disabled";
  const taxDisabled = editable && taxEnabled ? "" : "disabled";
  tr.innerHTML = `
    <td><input data-desc value="${escapeHtml(line?.description || "")}" ${disabled} /></td>
    <td><input data-qty type="number" step="0.0001" value="${q}" ${disabled} /></td>
    <td><input data-unit type="number" step="0.01" value="${u}" ${disabled} /></td>
    <td><input data-tax-rate data-tax-field type="number" step="0.01" value="${formatTaxRate(taxRateValue)}" ${taxDisabled} /></td>
    <td style="text-align:center;"><input data-taxable data-tax-field type="checkbox" ${isTaxable ? "checked" : ""} ${taxDisabled} /></td>
    <td><input data-amt type="number" step="0.01" value="${safeNum(a, 0).toFixed(2)}" ${disabled} /></td>
    <td style="text-align:right;"><button class="ghost small" type="button" data-remove ${disabled}>Remove</button></td>
  `;
  if (editable) {
    tr.querySelector("[data-remove]")?.addEventListener("click", () => tr.remove());
  }
  return tr;
}

function renderPayments(paymentsBody, payments) {
  if (!paymentsBody) return;
  const rows = Array.isArray(payments) ? payments : [];
  if (!rows.length) {
    paymentsBody.innerHTML = `<tr><td colspan="5" class="hint">No payments.</td></tr>`;
    return;
  }
  paymentsBody.innerHTML = rows
    .map((p) => {
      const label = p.isReversal ? "Reversal" : (p.isDeposit ? "Deposit" : (p.method || "--"));
      const ref = p.isReversal && p.reversalReason ? p.reversalReason : (p.reference || "--");
      const action = p.canReverse
        ? `<button class="ghost small" type="button" data-reverse-payment="${escapeHtml(String(p.paymentId))}">Reverse</button>`
        : "";
      return `
    <tr>
      <td>${escapeHtml(fmtDate(p.paidAt))}</td>
      <td>${escapeHtml(money(p.amount))}</td>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(ref)}</td>
      <td style="text-align:right;">${action}</td>
    </tr>
  `;
    })
    .join("");
}

function renderCreditActivity(body, entries) {
  if (!body) return;
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="hint">No credit activity.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((e) => {
    const type =
      e.type === "deposit"
        ? "Deposit"
        : e.type === "deposit_refund"
          ? "Deposit refund"
          : e.type === "deposit_allocation"
            ? "Deposit applied"
            : e.type === "deposit_allocation_reversal"
              ? "Deposit restored"
              : e.type === "allocation"
                ? "Credit applied"
                : e.type === "allocation_reversal"
                  ? "Credit restored"
                  : e.type === "reversal"
                    ? "Payment reversal"
                    : "Payment";
      const title = e.reversalReason ? ` title="${escapeHtml(e.reversalReason)}"` : "";
      const amount = safeNum(e.amount, 0);
      const label = amount < 0 ? `-${money(Math.abs(amount))}` : money(amount);
      const invoice = e.invoiceNumber || (e.invoiceId ? `#${e.invoiceId}` : "--");
      return `
    <tr>
      <td>${escapeHtml(fmtDate(e.occurredAt))}</td>
      <td${title}>${escapeHtml(type)}</td>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(invoice)}</td>
    </tr>
  `;
    })
    .join("");
}

function safeReturnTo(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.includes("://")) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("#")) return null;
  return value;
}

function resolveInvoiceRecipients(invoice) {
  const contacts = Array.isArray(invoice?.customerAccountingContacts) ? invoice.customerAccountingContacts : [];
  const normalizeEmail = (value) => String(value || "").trim();
  const selected = contacts
    .filter((c) => c && c.invoiceEmail === true)
    .map((c) => normalizeEmail(c.email))
    .filter(Boolean);
  if (selected.length) return selected;
  const allAccounting = contacts.map((c) => normalizeEmail(c?.email)).filter(Boolean);
  if (allAccounting.length) return allAccounting;
  const fallback = normalizeEmail(invoice?.customerEmail);
  return fallback ? [fallback] : [];
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id") ? Number(params.get("id")) : null;
  const returnTo = safeReturnTo(params.get("returnTo"));

  const invoiceTitle = $("invoice-title");
  const invoicePill = $("invoice-pill");
  const invoiceSubtitle = $("invoice-subtitle");
  const companyMeta = $("company-meta");
  const customerDetailsEl = $("customer-details");
  const billingContextEl = $("billing-context");
  const generalNotesEl = $("invoice-general-notes");
  const linesBody = $("lines-body");
  const linesMeta = $("lines-meta");
  const addLineBtn = $("add-line");
  const saveLinesBtn = $("save-lines");
  const paymentsBody = $("payments-body");
  const creditActivityBody = $("credit-activity-body");

  const backBtn = $("back");
  const deleteBtn = $("delete-invoice");
  const voidBtn = $("void-invoice");
  const downloadPdfBtn = $("download-pdf");
  const emailInvoiceBtn = $("email-invoice");
  const createCreditMemoBtn = $("create-credit-memo");
  const createDebitMemoBtn = $("create-debit-memo");

  const emailInvoiceModal = $("email-invoice-modal");
  const closeEmailInvoiceModalBtn = $("close-email-invoice-modal");
  const cancelEmailInvoiceBtn = $("cancel-email-invoice");
  const emailInvoiceForm = $("email-invoice-form");
  const emailInvoiceTo = $("email-invoice-to");
  const emailInvoiceMessage = $("email-invoice-message");
  const emailInvoiceHint = $("email-invoice-hint");
  const sendEmailInvoiceBtn = $("send-email-invoice");

  const paymentForm = $("payment-form");
  const paymentAmount = $("payment-amount");
  const paymentDate = $("payment-date");
  const paymentMethod = $("payment-method");
  const paymentRef = $("payment-ref");
  const paymentNote = $("payment-note");
  const paymentMeta = $("payment-meta");
  const paymentCreditOnly = $("payment-credit-only");
  const paymentDepositOnly = $("payment-deposit-only");
  const customerCreditMeta = $("customer-credit");
  const applyCreditForm = $("apply-credit-form");
  const applyCreditAmount = $("apply-credit-amount");
  const applyCreditMeta = $("apply-credit-meta");
  const customerDepositMeta = $("customer-deposit");
  const applyDepositForm = $("apply-deposit-form");
  const applyDepositAmount = $("apply-deposit-amount");
  const applyDepositMeta = $("apply-deposit-meta");
  const refundDepositForm = $("refund-deposit-form");
  const refundDepositAmount = $("refund-deposit-amount");
  const refundDepositNote = $("refund-deposit-note");
  const refundDepositMeta = $("refund-deposit-meta");

  const activeCompanyId = window.RentSoft?.getCompanyId?.() ? Number(window.RentSoft.getCompanyId()) : null;
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setMeta(companyMeta, activeCompanyId ? (companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`) : "Log in to manage invoices.");

  let loadedInvoice = null;
  let lineEditingLocked = false;
  let taxConfig = { enabled: false, defaultRate: 0, inclusive: false };
  let taxConfigLoaded = false;

  function setEmailInvoiceHint(text) {
    setMeta(emailInvoiceHint, text || "");
  }

  async function loadTaxConfig() {
    if (!activeCompanyId || taxConfigLoaded) return taxConfig;
    try {
      const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        taxConfig = {
          enabled: data.settings?.tax_enabled === true,
          defaultRate: Number(data.settings?.default_tax_rate || 0),
          inclusive: data.settings?.tax_inclusive_pricing === true,
        };
        billingTimeZone = data.settings?.billing_timezone || "UTC";
        taxConfigLoaded = true;
      }
    } catch (_) {
      // Ignore settings load failures; keep defaults.
    }
    return taxConfig;
  }

  function setApplyCreditHint(text) {
    setMeta(applyCreditMeta, text || "");
  }

  function setApplyDepositHint(text) {
    setMeta(applyDepositMeta, text || "");
  }

  function setRefundDepositHint(text) {
    setMeta(refundDepositMeta, text || "");
  }

  function setLineEditingState(locked) {
    const isLocked = locked === true;
    if (addLineBtn) addLineBtn.disabled = isLocked;
    if (saveLinesBtn) saveLinesBtn.disabled = isLocked;
    const inputs = linesBody?.querySelectorAll("input, button[data-remove]") || [];
    inputs.forEach((el) => {
      if (isLocked) {
        el.disabled = true;
        return;
      }
      if (el.hasAttribute("data-tax-field") && taxConfig?.enabled !== true) {
        el.disabled = true;
        return;
      }
      el.disabled = false;
    });
    if (isLocked) {
      setMeta(linesMeta, "Line items are locked once an invoice is sent, paid, or void.");
    }
  }

  function openEmailInvoiceModal() {
    if (!emailInvoiceModal) return;
    if (!loadedInvoice) return;
    const recipients = resolveInvoiceRecipients(loadedInvoice);
    if (emailInvoiceTo) emailInvoiceTo.value = recipients.join(", ");
    if (emailInvoiceMessage) emailInvoiceMessage.value = "";
    setEmailInvoiceHint("");
    emailInvoiceModal.classList.add("show");
    setTimeout(() => emailInvoiceTo?.focus?.(), 0);
  }

  function closeEmailInvoiceModal() {
    emailInvoiceModal?.classList.remove("show");
  }

  backBtn?.addEventListener("click", () => {
    if (returnTo) {
      window.location.href = returnTo;
      return;
    }
    window.location.href = "accounts-receivable.html";
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!activeCompanyId || !invoiceId) return;
    const label = loadedInvoice?.invoiceNumber ? ` ${loadedInvoice.invoiceNumber}` : "";
    const ok = window.confirm(`Delete invoice${label}? This cannot be undone.`);
    if (!ok) return;
      setMeta(linesMeta, "");
      setMeta(paymentMeta, "");
      setApplyCreditHint("");
      setApplyDepositHint("");
      setRefundDepositHint("");
    setApplyCreditHint("");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 204) throw new Error(data.error || "Unable to delete invoice.");
      if (returnTo) {
        window.location.href = returnTo;
        return;
      }
      window.location.href = "accounts-receivable.html";
    } catch (err) {
      setMeta(linesMeta, err?.message ? String(err.message) : String(err));
    }
  });

  voidBtn?.addEventListener("click", async () => {
    if (!activeCompanyId || !invoiceId || !loadedInvoice) return;
    const status = String(loadedInvoice?.status || "").trim().toLowerCase();
    if (status === "void") return;
    const label = loadedInvoice?.invoiceNumber ? ` ${loadedInvoice.invoiceNumber}` : "";
    const reason = window.prompt(`Void invoice${label}? Provide a reason for the audit log:`, "");
    if (reason === null) return;
    const trimmed = String(reason || "").trim();
    if (!trimmed) {
      setMeta(linesMeta, "Void reason is required.");
      return;
    }
    setMeta(linesMeta, "");
    setMeta(paymentMeta, "");
    setApplyCreditHint("");
    setApplyDepositHint("");
    setRefundDepositHint("");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, reason: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to void invoice.");
      await loadInvoice();
    } catch (err) {
      setMeta(linesMeta, err?.message ? String(err.message) : String(err));
    }
  });

  downloadPdfBtn?.addEventListener("click", () => {
    if (!activeCompanyId || !invoiceId) return;
    window.location.href = `/api/invoices/${invoiceId}/pdf?companyId=${activeCompanyId}`;
  });

  emailInvoiceBtn?.addEventListener("click", () => {
    if (!activeCompanyId || !invoiceId) return;
    if (!loadedInvoice) return;
    openEmailInvoiceModal();
  });

  closeEmailInvoiceModalBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeEmailInvoiceModal();
  });

  cancelEmailInvoiceBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeEmailInvoiceModal();
  });

  emailInvoiceModal?.addEventListener("click", (e) => {
    if (e.target === emailInvoiceModal) closeEmailInvoiceModal();
  });

  emailInvoiceForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCompanyId || !invoiceId) return;
    setEmailInvoiceHint("");

    const to = String(emailInvoiceTo?.value || "").trim();
    const message = String(emailInvoiceMessage?.value || "").trim();
    if (!to) {
      setEmailInvoiceHint("Recipient email is required.");
      return;
    }

    if (sendEmailInvoiceBtn) sendEmailInvoiceBtn.disabled = true;
    if (cancelEmailInvoiceBtn) cancelEmailInvoiceBtn.disabled = true;
    if (closeEmailInvoiceModalBtn) closeEmailInvoiceModalBtn.disabled = true;
    setEmailInvoiceHint("Sending…");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, to, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to send invoice email.");
      setEmailInvoiceHint("Sent.");
      setTimeout(() => closeEmailInvoiceModal(), 400);
    } catch (err) {
      setEmailInvoiceHint(err?.message ? String(err.message) : String(err));
    } finally {
      if (sendEmailInvoiceBtn) sendEmailInvoiceBtn.disabled = false;
      if (cancelEmailInvoiceBtn) cancelEmailInvoiceBtn.disabled = false;
      if (closeEmailInvoiceModalBtn) closeEmailInvoiceModalBtn.disabled = false;
    }
  });

  function renderCustomerPanel(inv) {
    if (!customerDetailsEl) return;
    if (!inv) {
      customerDetailsEl.style.display = "none";
      customerDetailsEl.innerHTML = "";
      return;
    }
    customerDetailsEl.style.display = "block";
    const arTags = Array.isArray(inv.arTags) ? inv.arTags : [];
    const arTagLabel = arTags.length ? arTags.map((tag) => formatStatus(tag)).join(", ") : null;
    const item = (label, value) => `
      <div class="detail-item">
        <div class="detail-label">${escapeHtml(label)}</div>
        <div class="detail-value">${escapeHtml(value || "--")}</div>
      </div>`;

      customerDetailsEl.innerHTML = `
        <div class="details-grid">
          ${item("Customer", inv.customerName)}
          ${item("Contact", inv.customerContactName)}
          ${item("Email", inv.customerEmail)}
          ${item("Phone", inv.customerPhone)}
          ${item("Invoice date", fmtDate(inv.invoiceDate || inv.issueDate))}
          ${item("Due date", fmtDate(inv.dueDate))}
          ${item("Document type", documentTypeLabel(inv.documentType))}
          ${item("Status", formatStatus(inv.status))}
          ${item("AR status", formatStatus(inv.arStatus || inv.status))}
          ${arTagLabel ? item("AR flags", arTagLabel) : ""}
          ${item("Subtotal", money(inv.subtotal))}
          ${item("Tax", money(inv.taxTotal))}
          ${item("Total", money(inv.total))}
          ${item("Paid", money(inv.paid))}
          ${item("Balance", money(inv.balance))}
          ${item("Customer credit", money(inv.customerCredit))}
          ${item("Deposit", money(inv.customerDeposit))}
        </div>
      `;
    }

  function renderCustomerCredit(inv) {
    if (!customerCreditMeta) return;
    if (!inv) {
      customerCreditMeta.textContent = "Available credit: --";
      return;
    }
    const credit = safeNum(inv?.customerCredit, 0);
    customerCreditMeta.textContent = `Available credit: ${money(credit)}`;
    const balance = safeNum(inv?.balance, 0);
    const status = String(inv?.status || "").trim().toLowerCase();
    const shouldDisable = credit <= 0 || balance <= 0 || status === "void";
    const applyBtn = applyCreditForm?.querySelector("button");
    if (applyBtn) applyBtn.disabled = shouldDisable;
    if (applyCreditAmount) applyCreditAmount.disabled = shouldDisable;
  }

  function renderCustomerDeposit(inv) {
    if (!customerDepositMeta) return;
    if (!inv) {
      customerDepositMeta.textContent = "Available deposit: --";
      return;
    }
    const deposit = safeNum(inv?.customerDeposit, 0);
    customerDepositMeta.textContent = `Available deposit: ${money(deposit)}`;
    const balance = safeNum(inv?.balance, 0);
    const status = String(inv?.status || "").trim().toLowerCase();
    const applyDisable = deposit <= 0 || balance <= 0 || status === "void";
    const refundDisable = deposit <= 0 || status === "void";
    const applyBtn = applyDepositForm?.querySelector("button");
    if (applyBtn) applyBtn.disabled = applyDisable;
    if (applyDepositAmount) applyDepositAmount.disabled = applyDisable;
    const refundBtn = refundDepositForm?.querySelector("button");
    if (refundBtn) refundBtn.disabled = refundDisable;
    if (refundDepositAmount) refundDepositAmount.disabled = refundDisable;
    if (refundDepositNote) refundDepositNote.disabled = refundDisable;
  }

  function renderBillingContext(inv) {
    if (!billingContextEl) return;
    if (!inv) {
      billingContextEl.style.display = "none";
      billingContextEl.innerHTML = "";
      return;
    }
    billingContextEl.style.display = "block";
    const reason = billingReasonLabel(inv.billingReason);
    const servicePeriodStart = inv.servicePeriodStart || inv.periodStart;
    const servicePeriodEnd = inv.servicePeriodEnd || inv.periodEnd;
    const coverage = servicePeriodStart && servicePeriodEnd ? `${fmtDate(servicePeriodStart)} to ${fmtDate(servicePeriodEnd)}` : "--";
    const orderRef = inv.rentalOrderNumber || (inv.rentalOrderId ? `#${inv.rentalOrderId}` : "--");
    const appliesTo = inv.appliesToInvoiceNumber || (inv.appliesToInvoiceId ? `#${inv.appliesToInvoiceId}` : "--");
    const status = String(inv.status || "").trim().toLowerCase();
    const voidedAt = inv.voidedAt ? fmtDate(inv.voidedAt) : null;
    const voidedBy = inv.voidedBy || null;
    const voidReason = inv.voidReason || null;

    const item = (label, value) => `
      <div class="detail-item">
        <div class="detail-label">${escapeHtml(label)}</div>
        <div class="detail-value">${escapeHtml(value || "--")}</div>
      </div>`;

    billingContextEl.innerHTML = `
      <div class="details-grid">
        ${item("Billing reason", reason)}
        ${item("Service period", coverage)}
        ${item("Rental order", orderRef)}
        ${inv.appliesToInvoiceId ? item("Applies to", appliesTo) : ""}
        ${status === "void" ? item("Voided at", voidedAt) : ""}
        ${status === "void" ? item("Voided by", voidedBy) : ""}
        ${status === "void" ? item("Void reason", voidReason) : ""}
      </div>
    `;
  }

  function renderGeneralNotes(inv) {
    if (!generalNotesEl) return;
    const text = String(inv?.generalNotes || "").trim();
    if (!text) {
      generalNotesEl.style.display = "none";
      generalNotesEl.textContent = "";
      return;
    }
    generalNotesEl.style.display = "grid";
    generalNotesEl.textContent = text;
  }

  function setCorrectionButtons({ enabled, hidden, reason }) {
    const show = hidden !== true;
    const disable = enabled === false;
    [createCreditMemoBtn, createDebitMemoBtn].forEach((btn) => {
      if (!btn) return;
      btn.style.display = show ? "" : "none";
      btn.disabled = disable;
      btn.title = reason || "";
    });
  }

  async function createCorrection(docType) {
    if (!activeCompanyId || !invoiceId) return;
    if (!loadedInvoice) return;
    const label = docType === "credit_memo" ? "credit memo" : "debit memo";
    const invNo = loadedInvoice?.invoiceNumber ? ` ${loadedInvoice.invoiceNumber}` : "";
    const ok = window.confirm(`Create a ${label} for invoice${invNo}?`);
    if (!ok) return;
    setMeta(linesMeta, "");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, documentType: docType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to create correction.");
      const newId = Number(data.invoiceId || data.id);
      if (Number.isFinite(newId) && newId > 0) {
        const next = `invoice.html?id=${encodeURIComponent(newId)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
        window.location.href = next;
        return;
      }
      await loadInvoice();
    } catch (err) {
      setMeta(linesMeta, err?.message ? String(err.message) : String(err));
    }
  }

  async function loadInvoice() {
    if (!activeCompanyId || !invoiceId) {
      setMeta(invoiceSubtitle, "Missing invoice id.");
      return;
    }
    setMeta(linesMeta, "");
    setMeta(paymentMeta, "");
    setMeta(invoiceSubtitle, "Loading…");
    const res = await fetch(`/api/invoices/${invoiceId}?companyId=${activeCompanyId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load invoice.");
      await loadTaxConfig();

    loadedInvoice = data.invoice || null;
    const inv = loadedInvoice;
    lineEditingLocked = String(inv?.status || "").trim().toLowerCase() !== "draft";
    const invNo = inv?.invoiceNumber || (inv?.id ? `#${inv.id}` : "");
    const docLabel = documentTypeLabel(inv?.documentType);
    if (invoiceTitle) invoiceTitle.textContent = `${docLabel} ${invNo || ""}`.trim();
    if (invoicePill) {
      invoicePill.textContent = invNo;
      invoicePill.style.display = invNo ? "inline-flex" : "none";
    }
    if (invoiceSubtitle) {
      invoiceSubtitle.textContent = `${inv?.customerName || "--"} • Total ${money(inv?.total)} • Paid ${money(inv?.paid)} • Balance ${money(inv?.balance)}`;
    }
    renderCustomerPanel(inv);
      renderBillingContext(inv);
      renderGeneralNotes(inv);
      renderCustomerCredit(inv);
      renderCustomerDeposit(inv);
    if (creditActivityBody) {
      try {
        const customerId = inv?.customerId;
        if (!customerId) {
          renderCreditActivity(creditActivityBody, []);
        } else {
          const creditRes = await fetch(`/api/customers/${customerId}/credits?companyId=${activeCompanyId}`);
          const creditData = await creditRes.json().catch(() => ({}));
          if (!creditRes.ok) throw new Error(creditData.error || "Unable to load credit activity.");
          renderCreditActivity(creditActivityBody, creditData.activity || []);
        }
      } catch (err) {
        creditActivityBody.innerHTML = `<tr><td colspan="4" class="hint">${escapeHtml(err?.message ? String(err.message) : String(err))}</td></tr>`;
      }
    }

    const status = String(inv?.status || "").trim().toLowerCase();
    const docType = String(inv?.documentType || "").trim().toLowerCase();
    if (paymentForm) {
      const disablePayments = status === "void";
      paymentForm.querySelectorAll("input, button").forEach((el) => {
        el.disabled = disablePayments;
      });
      if (disablePayments) {
        setMeta(paymentMeta, "Payments are disabled for void invoices.");
      }
    }
    if (docType !== "invoice") {
      setCorrectionButtons({ hidden: true });
    } else if (status === "draft") {
      setCorrectionButtons({ enabled: false, reason: "Send the invoice before issuing a correction." });
    } else if (status === "void") {
      setCorrectionButtons({ enabled: false, reason: "Voided invoices cannot be corrected." });
    } else if (status === "sent" || status === "paid") {
      setCorrectionButtons({ enabled: true });
    } else {
      setCorrectionButtons({ enabled: false, reason: "Invoice must be sent or paid before issuing a correction." });
    }

    if (voidBtn) {
      const paidAmount = safeNum(inv?.paid, 0);
      const hasPayments = Math.abs(paidAmount) > 0.005;
      const canVoid = status !== "void";
      voidBtn.style.display = canVoid ? "" : "none";
      voidBtn.disabled = !canVoid || hasPayments;
      voidBtn.title = hasPayments ? "Reverse or remove payments before voiding." : "";
    }

    const lines = Array.isArray(data.lineItems) ? data.lineItems : [];
    linesBody.innerHTML = "";
      if (!lines.length) {
        linesBody.appendChild(renderLineRow({ description: "", quantity: 1, unitPrice: 0, amount: 0 }, !lineEditingLocked, taxConfig));
      } else {
        lines.forEach((li) => linesBody.appendChild(renderLineRow(li, !lineEditingLocked, taxConfig)));
      }
    setLineEditingState(lineEditingLocked);

    renderPayments(paymentsBody, data.payments || []);
  }

  addLineBtn?.addEventListener("click", () => {
    if (lineEditingLocked) {
      setMeta(linesMeta, "Line items are locked once an invoice is sent, paid, or void.");
      return;
    }
    linesBody?.appendChild(renderLineRow({ description: "", quantity: 1, unitPrice: 0, amount: 0 }, true, taxConfig));
  });

  createCreditMemoBtn?.addEventListener("click", () => createCorrection("credit_memo"));
  createDebitMemoBtn?.addEventListener("click", () => createCorrection("debit_memo"));

  saveLinesBtn?.addEventListener("click", async () => {
    if (!activeCompanyId || !invoiceId) return;
    if (lineEditingLocked) {
      setMeta(linesMeta, "Line items are locked once an invoice is sent, paid, or void.");
      return;
    }
    setMeta(linesMeta, "");
    try {
      const payload = serializeLines();
      const res = await fetch(`/api/invoices/${invoiceId}/line-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, lineItems: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to save line items.");
      setMeta(linesMeta, "Saved.");
      await loadInvoice();
    } catch (err) {
      setMeta(linesMeta, err?.message ? String(err.message) : String(err));
    }
  });

  applyCreditForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCompanyId || !invoiceId) return;
    setApplyCreditHint("");
    try {
      const amount = applyCreditAmount?.value;
      const res = await fetch(`/api/invoices/${invoiceId}/apply-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          amount: amount === "" ? null : amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to apply credit.");
      const appliedAmount = safeNum(data.appliedAmount, 0);
      applyCreditForm.reset();
      setApplyCreditHint(appliedAmount > 0 ? `Applied ${money(appliedAmount)} in credit.` : "No credit applied.");
      await loadInvoice();
    } catch (err) {
      setApplyCreditHint(err?.message ? String(err.message) : String(err));
    }
  });

  applyDepositForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCompanyId || !invoiceId) return;
    setApplyDepositHint("");
    try {
      const amount = applyDepositAmount?.value;
      const res = await fetch(`/api/invoices/${invoiceId}/apply-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          amount: amount === "" ? null : amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to apply deposit.");
      const appliedAmount = safeNum(data.appliedAmount, 0);
      applyDepositForm.reset();
      setApplyDepositHint(appliedAmount > 0 ? `Applied ${money(appliedAmount)} from deposit.` : "No deposit applied.");
      await loadInvoice();
    } catch (err) {
      setApplyDepositHint(err?.message ? String(err.message) : String(err));
    }
  });

  refundDepositForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCompanyId || !loadedInvoice) return;
    const customerId = loadedInvoice?.customerId;
    if (!customerId) return;
    setRefundDepositHint("");
    try {
      const amount = refundDepositAmount?.value;
      const note = refundDepositNote?.value || null;
      const res = await fetch(`/api/customers/${customerId}/deposits/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          amount,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to refund deposit.");
      refundDepositForm.reset();
      setRefundDepositHint(`Refunded ${money(data.refundedAmount || 0)} from deposit.`);
      await loadInvoice();
    } catch (err) {
      setRefundDepositHint(err?.message ? String(err.message) : String(err));
    }
  });

    paymentForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeCompanyId || !invoiceId) return;
      setMeta(paymentMeta, "");
      try {
        const amount = paymentAmount?.value;
        const paidAt = paymentDate?.value ? `${paymentDate.value}T00:00:00Z` : null;
        const creditOnly = paymentCreditOnly?.checked === true;
        const depositOnly = paymentDepositOnly?.checked === true;
        const customerId = loadedInvoice?.customerId;
        if ((creditOnly || depositOnly) && !customerId) throw new Error("Customer is not available.");
        const endpoint = depositOnly
          ? `/api/customers/${customerId}/deposits`
          : creditOnly
            ? `/api/customers/${customerId}/payments`
            : `/api/invoices/${invoiceId}/payments`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: activeCompanyId,
          amount,
          paidAt,
          method: paymentMethod?.value || null,
          reference: paymentRef?.value || null,
          note: paymentNote?.value || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to add payment.");
        paymentForm.reset();
        if (paymentCreditOnly) paymentCreditOnly.checked = false;
        if (paymentDepositOnly) paymentDepositOnly.checked = false;
        if (depositOnly) {
          const deposit = data?.deposit;
          setMeta(paymentMeta, deposit !== undefined ? `Deposit recorded. Available deposit: ${money(deposit)}.` : "Deposit recorded.");
        } else if (creditOnly) {
          const credit = data?.credit;
          setMeta(paymentMeta, credit !== undefined ? `Credit recorded. Available credit: ${money(credit)}.` : "Credit recorded.");
        } else {
          setMeta(paymentMeta, "Payment added.");
        }
        await loadInvoice();
    } catch (err) {
      setMeta(paymentMeta, err?.message ? String(err.message) : String(err));
    }
    });

    paymentCreditOnly?.addEventListener("change", () => {
      if (paymentCreditOnly.checked && paymentDepositOnly) {
        paymentDepositOnly.checked = false;
      }
    });

    paymentDepositOnly?.addEventListener("change", () => {
      if (paymentDepositOnly.checked && paymentCreditOnly) {
        paymentCreditOnly.checked = false;
      }
    });

  paymentsBody?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-reverse-payment]");
    if (!btn) return;
    if (!activeCompanyId) return;
    const paymentId = Number(btn.getAttribute("data-reverse-payment"));
    if (!Number.isFinite(paymentId) || paymentId <= 0) return;
    const ok = window.confirm("Reverse this payment? This will reopen invoice balances.");
    if (!ok) return;
    const reason = window.prompt("Reason for reversal (optional):", "");
    setMeta(paymentMeta, "");
    try {
      const res = await fetch(`/api/payments/${paymentId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, reason: reason || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to reverse payment.");
      setMeta(paymentMeta, "Payment reversed.");
      await loadInvoice();
    } catch (err) {
      setMeta(paymentMeta, err?.message ? String(err.message) : String(err));
    }
  });

  loadInvoice().catch((err) => setMeta(invoiceSubtitle, err?.message ? String(err.message) : String(err)));
});
