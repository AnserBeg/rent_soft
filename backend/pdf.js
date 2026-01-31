const PDFDocument = require("pdfkit");
const fs = require("fs");
const { PassThrough } = require("stream");

function safeText(value) {
  return String(value ?? "").trim();
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
  for (const [key, defaults] of Object.entries(DEFAULT_RENTAL_INFO_FIELDS)) {
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
  }
  return normalized;
}

function normalizeContacts(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function formatContactLines(value, label) {
  const contacts = normalizeContacts(value);
  if (!contacts.length) return "--";
  return contacts
    .map((contact) => {
      const name = safeText(contact?.name) || "--";
      const email = safeText(contact?.email);
      const phone = safeText(contact?.phone);
      const details = [email, phone].filter(Boolean).join(" / ") || "--";
      return `${label} ${name}: ${details}`;
    })
    .join("; ");
}

function normalizeCoverageHours(value) {
  let raw = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

function formatCoverageHours(value) {
  const days = [
    ["mon", "Mon"],
    ["tue", "Tue"],
    ["wed", "Wed"],
    ["thu", "Thu"],
    ["fri", "Fri"],
    ["sat", "Sat"],
    ["sun", "Sun"],
  ];
  const raw = normalizeCoverageHours(value);
  const parts = [];
  days.forEach(([key, label]) => {
    const entry = raw[key] || {};
    const start = safeText(entry.start);
    const end = safeText(entry.end);
    const endDayOffset =
      entry.endDayOffset === 1 || entry.end_day_offset === 1 || entry.spansMidnight === true ? 1 : 0;
    if (!start && !end) return;
    const suffix = endDayOffset ? " (+1 day)" : "";
    parts.push(`${label} ${start || "--"}-${end || "--"}${suffix}`);
  });
  return parts.join(", ");
}

function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

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

function fmtDate(value, timeZone = null) {
  if (!value) return "--";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const tzDate = formatDateInTimeZone(value, timeZone);
  if (tzDate) return tzDate;
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(value, timeZone = null) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  }
  return d.toLocaleString();
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  switch (s) {
    // Rental orders / quotes
    case "quote":
      return "Quote";
    case "quote_rejected":
      return "Rejected";
    case "requested":
      return "Requested";
    case "request_rejected":
      return "Request rejected";
    case "reservation":
      return "Reservation";
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    case "closed":
      return "Closed";
    default:
      return s || "";
  }
}

function docNumberLabel(row) {
  const ro = row?.ro_number || row?.roNumber || null;
  const qo = row?.quote_number || row?.quoteNumber || null;
  if (ro && qo) return `${ro} / ${qo}`;
  return ro || qo || `#${row?.id ?? ""}`;
}

function isQuote(status) {
  const s = String(status || "").toLowerCase();
  return s === "quote" || s === "quote_rejected";
}

function isDemandOnlyStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "quote" || s === "quote_rejected" || s === "reservation" || s === "requested";
}

function sanitizeFileName(name) {
  const safe = String(name || "document")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return safe.length ? safe : "document";
}

function companyAddressLines(companyProfile) {
  if (!companyProfile) return [];
  const line1 = safeText(companyProfile.streetAddress);
  const parts2 = [safeText(companyProfile.city), safeText(companyProfile.region), safeText(companyProfile.postalCode)].filter(Boolean);
  const line2 = parts2.join(", ");
  const line3 = safeText(companyProfile.country);
  return [line1, line2, line3].filter(Boolean);
}

function companyContactLine(companyProfile) {
  if (!companyProfile) return "";
  const parts = [safeText(companyProfile.email), safeText(companyProfile.phone)].filter(Boolean);
  return parts.join(" • ");
}

function companyContactLines(companyProfile) {
  if (!companyProfile) return [];
  const phone = safeText(companyProfile.phone);
  const email = safeText(companyProfile.email);
  const lines = [];
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  return lines;
}

function customerAddressLines(order) {
  const line1 = safeText(order?.customer_street_address);
  const line2 = [safeText(order?.customer_city), safeText(order?.customer_region), safeText(order?.customer_postal_code)].filter(Boolean).join(", ");
  const line3 = safeText(order?.customer_country);
  return [line1, line2, line3].filter(Boolean);
}

function customerContactLines(order) {
  const email = safeText(order?.customer_email);
  const phone = safeText(order?.customer_phone);
  const lines = [];
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  return lines;
}

function computeOrderDateRange(lineItems) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  let min = null;
  let max = null;
  for (const li of items) {
    const s = li?.startAt ? new Date(li.startAt) : null;
    const e = li?.endAt ? new Date(li.endAt) : null;
    if (s && !Number.isNaN(s.getTime())) {
      if (!min || s < min) min = s;
    }
    if (e && !Number.isNaN(e.getTime())) {
      if (!max || e > max) max = e;
    }
  }
  return { start: min ? min.toISOString() : null, end: max ? max.toISOString() : null };
}

function computeTotals({ lineItems, fees }) {
  const rentalTotal = (Array.isArray(lineItems) ? lineItems : []).reduce((sum, li) => sum + (Number(li?.lineAmount) || 0), 0);
  const feeTotal = (Array.isArray(fees) ? fees : []).reduce((sum, f) => sum + (Number(f?.amount) || 0), 0);
  const subtotal = Number((rentalTotal + feeTotal).toFixed(2));
  const tax = Number((subtotal * 0.05).toFixed(2));
  const grandTotal = Number((subtotal + tax).toFixed(2));
  return { rentalTotal, feeTotal, subtotal, tax, grandTotal, amountPaid: 0, amountDue: grandTotal };
}

function drawBox(doc, { x, y, w, h, border = "#cbd5e1", fill = null, radius = 0 }) {
  doc.save();
  if (fill) doc.fillColor(fill);
  doc.strokeColor(border);
  if (radius > 0) {
    if (fill) doc.roundedRect(x, y, w, h, radius).fillAndStroke();
    else doc.roundedRect(x, y, w, h, radius).stroke();
  } else {
    if (fill) doc.rect(x, y, w, h).fillAndStroke();
    else doc.rect(x, y, w, h).stroke();
  }
  doc.restore();
}

function ensureSpace(doc, neededHeight, { bottomMargin = 50 } = {}) {
  const bottom = doc.page.height - (doc.page.margins.bottom ?? bottomMargin);
  if (doc.y + neededHeight > bottom) doc.addPage();
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 18);
  doc.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(10).text(String(title || "").toUpperCase());
  doc.fillColor("#000");
}

function createContractDoc({ title, docNo, docLabel = "Contract", status, logoPath = null, companyProfile = null }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });

  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const pageWidth = doc.page.width;

  const headerGap = 18;
  const colW = Math.floor((pageWidth - left - right - headerGap) / 2);
  const leftX = left;
  const rightX = left + colW + headerGap;

  const logoMaxWidth = 80;
  const logoMaxHeight = 58;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, leftX, top, { fit: [logoMaxWidth, logoMaxHeight], align: "left", valign: "top" });
    } catch (_) {}
  }

  const companyTextX = leftX + logoMaxWidth + 12;
  doc.x = companyTextX;
  doc.y = top;
  doc.fillColor("#111");
  doc.font("Helvetica-Bold").fontSize(12).text(companyProfile?.name || "Company", { width: colW - (companyTextX - leftX) });
  doc.font("Helvetica").fontSize(9).fillColor("#555");
  companyAddressLines(companyProfile).forEach((line) => doc.text(line, { width: colW - (companyTextX - leftX) }));
  companyContactLines(companyProfile).forEach((line) => doc.text(line, { width: colW - (companyTextX - leftX) }));

  doc.fillColor("#111").font("Helvetica-Bold").fontSize(16).text(title, rightX, top, { width: colW, align: "right" });
  doc.font("Helvetica").fontSize(11).fillColor("#111").text(`${docLabel} # ${docNo}`, rightX, top + 20, { width: colW, align: "right" });

  const badgeText = safeText(statusLabel(status));
  if (badgeText) {
    const badgeW = Math.min(220, colW);
    const badgeX = rightX + colW - badgeW;
    const badgeY = top + 44;
    const badgeH = 18;
    drawBox(doc, { x: badgeX, y: badgeY, w: badgeW, h: badgeH, border: "#cbd5e1", fill: "#f8fafc", radius: 4 });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(`STATUS: ${badgeText}`, badgeX + 6, badgeY + 4, {
      width: badgeW - 12,
      align: "center",
    });
  }

  doc.fillColor("#000");
  doc.y = top + 78;
  return doc;
}

function writeOrderPdf(doc, { order, lineItems, fees, notes, attachments, rentalInfoFields = null }) {
  const isQ = isQuote(order?.status);
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const usableW = pageWidth - left - right;
  const splitGap = 12;
  const leftW = Math.floor(usableW * 0.54);
  const rightW = usableW - leftW - splitGap;

  // Customer + contract detail blocks
  const boxY = doc.y + 6;
  const boxH = 108;
  drawBox(doc, { x: left, y: boxY, w: leftW, h: boxH, border: "#e2e8f0", fill: "#ffffff", radius: 6 });
  const customerName = safeText(order?.customer_name) || "--";
  const customerContact = safeText(order?.customer_contact_name);
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(10).text(customerName, left + 10, boxY + 10, { width: leftW - 20 });
  if (customerContact && customerContact.toLowerCase() !== customerName.toLowerCase()) {
    doc.font("Helvetica").fontSize(8).fillColor("#475569").text(customerContact, { width: leftW - 20 });
  }
  doc.font("Helvetica").fontSize(9).fillColor("#111");
  customerAddressLines(order).forEach((line) => doc.text(line, { width: leftW - 20 }));
  const customerContacts = customerContactLines(order);
  if (customerContacts.length) {
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(8).fillColor("#475569");
    customerContacts.forEach((line) => doc.text(line, { width: leftW - 20 }));
  }

  const detailX = left + leftW + splitGap;
  drawBox(doc, { x: detailX, y: boxY, w: rightW, h: boxH, border: "#e2e8f0", fill: "#ffffff", radius: 6 });
  const headerH = 22;
  drawBox(doc, { x: detailX, y: boxY, w: rightW, h: headerH, border: "#e2e8f0", fill: "#f8fafc", radius: 6 });
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9).text(isQ ? "QUOTE DETAILS" : "CONTRACT DETAILS", detailX + 10, boxY + 6, {
    width: rightW - 20,
  });

  const hasAgent = Boolean(safeText(order?.salesperson_name));
  const { start, end } = computeOrderDateRange(lineItems);
  const agent = safeText(order?.salesperson_name);
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8).text("Start", detailX + 10, boxY + headerH + 12);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10).text(fmtDateTime(start), detailX + 10, boxY + headerH + 22, {
    width: rightW - 20,
  });
  doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8).text("End", detailX + 10, boxY + headerH + 42);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10).text(fmtDateTime(end), detailX + 10, boxY + headerH + 52, {
    width: rightW - 20,
  });
  if (hasAgent) {
    doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8).text("Rental Agent", detailX + 10, boxY + headerH + 72);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10).text(agent, detailX + 10, boxY + headerH + 82, {
      width: rightW - 20,
    });
  }

  doc.fillColor("#000");
  doc.y = boxY + boxH + 16;

  const rentalInfoConfig = normalizeRentalInfoFields(rentalInfoFields);
  const showRentalInfo = (key) => rentalInfoConfig?.[key]?.enabled !== false;
  const rentalInfoLines = [];
  const siteAddress = safeText(order?.site_address || order?.siteAddress);
  const criticalAreas = safeText(order?.critical_areas || order?.criticalAreas);
  const generalNotes = safeText(order?.general_notes || order?.generalNotes);
  const emergencyContacts = formatContactLines(order?.emergency_contacts || order?.emergencyContacts, "Emergency");
  const siteContacts = formatContactLines(order?.site_contacts || order?.siteContacts, "Site");
  const coverageText = formatCoverageHours(order?.coverage_hours || order?.coverageHours);
  if (showRentalInfo("siteAddress")) rentalInfoLines.push(`Site address: ${siteAddress || "--"}`);
  if (showRentalInfo("criticalAreas")) rentalInfoLines.push(`Critical areas: ${criticalAreas || "--"}`);
  if (showRentalInfo("generalNotes")) rentalInfoLines.push(`General notes: ${generalNotes || "--"}`);
  if (showRentalInfo("emergencyContacts")) rentalInfoLines.push(`Emergency contacts: ${emergencyContacts}`);
  if (showRentalInfo("siteContacts")) rentalInfoLines.push(`Site contacts: ${siteContacts}`);
  if (showRentalInfo("coverageHours")) rentalInfoLines.push(`Coverage hours: ${coverageText || "--"}`);
  if (rentalInfoLines.length) {
    drawSectionTitle(doc, "Rental information");
    doc.font("Helvetica").fontSize(9).fillColor("#111");
    rentalInfoLines.forEach((line) => doc.text(line, { width: usableW }));
    doc.moveDown(0.6);
  }

  // Line items table
  const tableX = left;
  const tableW = usableW;
  const headerY2 = doc.y;
  const rowH = 20;
  drawBox(doc, { x: tableX, y: headerY2, w: tableW, h: rowH, border: "#0ea5e9", fill: "#38bdf8" });
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
  const outW = Math.floor(tableW * 0.55);
  const rateW = Math.floor(tableW * 0.15);
  const qtyW = Math.floor(tableW * 0.1);
  const totW = tableW - outW - rateW - qtyW;
  doc.text("Description", tableX + 8, headerY2 + 6, { width: outW - 16, align: "left" });
  doc.text("Rate", tableX + outW, headerY2 + 6, { width: rateW, align: "right" });
  doc.text("Qty", tableX + outW + rateW, headerY2 + 6, { width: qtyW, align: "right" });
  doc.text("Line Total", tableX + outW + rateW + qtyW, headerY2 + 6, { width: totW - 8, align: "right" });
  doc.y = headerY2 + rowH;

  (Array.isArray(lineItems) ? lineItems : []).forEach((li, idx) => {
    ensureSpace(doc, 52);
    const y = doc.y;
    const fill = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    drawBox(doc, { x: tableX, y, w: tableW, h: 44, border: "#e2e8f0", fill });
    const title = li.bundleName ? `Bundle: ${li.bundleName}` : li.typeName || "Item";
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(9).text(title, tableX + 8, y + 6, { width: outW - 16 });

    const rate = li.rateAmount === null || li.rateAmount === undefined ? "--" : fmtMoney(li.rateAmount);
    const qty = li.bundleId
      ? 1
      : Array.isArray(li.inventoryIds) && li.inventoryIds.length
        ? li.inventoryIds.length
        : isDemandOnlyStatus(order?.status)
          ? 1
          : 0;
    const lineTotal = li.lineAmount === null || li.lineAmount === undefined ? "--" : fmtMoney(li.lineAmount);
    doc.fillColor("#111").font("Helvetica").fontSize(9);
    doc.text(rate, tableX + outW, y + 6, { width: rateW, align: "right" });
    doc.text(String(qty), tableX + outW + rateW, y + 6, { width: qtyW, align: "right" });
    doc.text(lineTotal, tableX + outW + rateW + qtyW, y + 6, { width: totW - 8, align: "right" });

    const inv = Array.isArray(li.bundleItems) && li.bundleItems.length
      ? li.bundleItems
      : Array.isArray(li.inventoryDetails)
        ? li.inventoryDetails
        : [];
    const invText = inv
      .map((it) => [safeText(it.serialNumber || it.serial_number), safeText(it.modelName || it.model_name)].filter(Boolean).join(" "))
      .filter(Boolean)
      .slice(0, 6)
      .join(", ");
    doc.fillColor("#475569").font("Helvetica").fontSize(8);
    if (invText) doc.text(invText, tableX + 8, y + 24, { width: outW - 16 });
    doc.text(`Out: ${fmtDateTime(li.startAt)}`, tableX + 8, y + 34, { width: outW - 16 });

    doc.y = y + 44;
  });

  // Terms + totals
  doc.moveDown(0.8);
  const termsX = left;
  const termsW = leftW;
  const totalsX = left + leftW + splitGap;
  const totalsW = rightW;
  const y0 = doc.y;

  const termsText = safeText(order?.terms);
  const special = safeText(order?.special_instructions);
  const hasTermsBlock = Boolean(termsText) || Boolean(special);
  if (hasTermsBlock) {
    drawSectionTitle(doc, isQ ? "Quote terms" : "Contract terms");
    doc.font("Helvetica").fontSize(8).fillColor("#111");
    if (termsText) doc.text(termsText, termsX, doc.y + 2, { width: termsW });
    if (special) {
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fillColor("#111").text("Special instructions", { width: termsW });
      doc.font("Helvetica").fillColor("#111").text(special, { width: termsW });
    }
  }

  const totals = computeTotals({ lineItems, fees });
  const boxTop = y0;
  drawBox(doc, { x: totalsX, y: boxTop, w: totalsW, h: 142, border: "#cbd5e1", fill: "#ffffff" });

  const lineY = (row) => boxTop + 12 + row * 18;
  const labelW = totalsW * 0.65;
  const valW = totalsW - labelW - 16;
  const drawTotalRow = (row, label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#111").fontSize(9).text(label, totalsX + 10, lineY(row), { width: labelW });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").text(value, totalsX + labelW, lineY(row), { width: valW, align: "right" });
    doc.save()
      .strokeColor("#e2e8f0")
      .moveTo(totalsX + 10, lineY(row) + 14)
      .lineTo(totalsX + totalsW - 10, lineY(row) + 14)
      .stroke()
      .restore();
  };
  drawTotalRow(0, "Rental Total", fmtMoney(totals.rentalTotal));
  drawTotalRow(1, "Fees Total", fmtMoney(totals.feeTotal));
  drawTotalRow(2, "Total Before Tax", fmtMoney(totals.subtotal));
  drawTotalRow(3, "GST (5%)", fmtMoney(totals.tax));
  drawTotalRow(4, "Grand Total", fmtMoney(totals.grandTotal), true);
  drawTotalRow(5, "Amount Paid", fmtMoney(totals.amountPaid));
  doc.font("Helvetica-Bold").fontSize(10);
  drawTotalRow(6, "Amount Due", fmtMoney(totals.amountDue), true);

  // Signature line
  ensureSpace(doc, 90);
  doc.y = Math.max(doc.y, boxTop + 160);
  doc.moveDown(0.4);
  const sigW = usableW * 0.62;
  const dateW = usableW - sigW - 24;
  const sigX = left;
  const dateX = left + sigW + 24;
  const labelY = doc.y;
  doc.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(9).text("Authorized Signature", sigX, labelY, { width: sigW });
  doc.fillColor("#1d4ed8").font("Helvetica-Bold").fontSize(9).text("Date", dateX, labelY, { width: dateW });
  doc.save().strokeColor("#111").lineWidth(1).moveTo(sigX, labelY + 26).lineTo(sigX + sigW, labelY + 26).stroke().restore();
  doc.save().strokeColor("#111").lineWidth(1).moveTo(dateX, labelY + 26).lineTo(dateX + dateW, labelY + 26).stroke().restore();
  doc.fillColor("#555").font("Helvetica").fontSize(8).text(`Generated ${new Date().toLocaleString()}`, left, doc.page.height - (doc.page.margins.bottom ?? 50) + 14, {
    width: usableW,
    align: "center",
  });

  doc.end();
}

function streamOrderPdf(
  res,
  { order, lineItems, fees, notes, attachments, companyLogoPath = null, companyProfile = null, rentalInfoFields = null }
) {
  const docNo = docNumberLabel(order);
  const isQ = isQuote(order?.status);
  const doc = createContractDoc({
    title: isQ ? "Quote" : "Rental Contract",
    docNo,
    docLabel: isQ ? "Quote" : "Contract",
    status: order?.status,
    logoPath: companyLogoPath,
    companyProfile,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFileName(docNo)}.pdf"`);
  doc.pipe(res);
  writeOrderPdf(doc, { order, lineItems, fees, notes, attachments, rentalInfoFields });
}

async function buildOrderPdfBuffer({
  order,
  lineItems,
  fees,
  notes,
  attachments,
  companyLogoPath = null,
  companyProfile = null,
  rentalInfoFields = null,
}) {
  const docNo = docNumberLabel(order);
  const isQ = isQuote(order?.status);
  const doc = createContractDoc({
    title: isQ ? "Quote" : "Rental Contract",
    docNo,
    docLabel: isQ ? "Quote" : "Contract",
    status: order?.status,
    logoPath: companyLogoPath,
    companyProfile,
  });

  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (c) => chunks.push(c));

  const done = new Promise((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
  });

  doc.pipe(stream);
  writeOrderPdf(doc, { order, lineItems, fees, notes, attachments, rentalInfoFields });
  await done;

  return {
    filename: `${sanitizeFileName(docNo)}.pdf`,
    buffer: Buffer.concat(chunks),
  };
}

function streamOrdersReportPdf(res, { title, rows, companyLogoPath = null, companyProfile = null, rentalInfoFields = null }) {
  const docNo = "rental-orders-report";
  const doc = createContractDoc({
    title: title || "Rental Orders Report",
    docNo,
    docLabel: "Report",
    status: "",
    logoPath: companyLogoPath,
    companyProfile,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="rental-orders-report.pdf"`);
  doc.pipe(res);

  ensureSpace(doc, 20);
  doc.moveDown(0.4);
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const tableW = pageWidth - left - right;
  const headerY = doc.y;
  drawBox(doc, { x: left, y: headerY, w: tableW, h: 20, border: "#0ea5e9", fill: "#38bdf8" });
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text("Doc #", left + 8, headerY + 6, { width: 90 });
  doc.text("Status", left + 100, headerY + 6, { width: 60 });
  doc.text("Customer", left + 165, headerY + 6, { width: 140 });
  doc.text("Sales", left + 310, headerY + 6, { width: 90 });
  doc.text("Start", left + 405, headerY + 6, { width: 80 });
  doc.text("End", left + 490, headerY + 6, { width: 80 });
  doc.text("Qty", left + 575, headerY + 6, { width: 40, align: "right" });
  doc.text("Fees", left + 620, headerY + 6, { width: tableW - 628, align: "right" });
  doc.y = headerY + 20;

  const rentalInfoConfig = normalizeRentalInfoFields(rentalInfoFields);
  const showRentalInfo = (key) => rentalInfoConfig?.[key]?.enabled !== false;

  (rows || []).forEach((r) => {
    const siteAddress = safeText(r?.site_address || r?.siteAddress);
    const criticalAreas = safeText(r?.critical_areas || r?.criticalAreas);
    const coverageText = formatCoverageHours(r?.coverage_hours || r?.coverageHours);
    const detailLine = [
      showRentalInfo("siteAddress") && siteAddress ? `Site address: ${siteAddress}` : null,
      showRentalInfo("criticalAreas") && criticalAreas ? `Critical areas: ${criticalAreas}` : null,
      showRentalInfo("coverageHours") && coverageText ? `Coverage: ${coverageText}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const detailHeight = detailLine ? Math.max(12, doc.heightOfString(detailLine, { width: tableW - 16 })) : 0;
    const rowH = 16 + (detailLine ? detailHeight + 4 : 0);
    ensureSpace(doc, rowH);
    const y = doc.y;
    drawBox(doc, { x: left, y, w: tableW, h: rowH, border: "#e2e8f0", fill: "#ffffff" });
    doc.fillColor("#111").font("Helvetica").fontSize(8);
    doc.text(docNumberLabel(r), left + 8, y + 4, { width: 90 });
    doc.text(statusLabel(r.status), left + 100, y + 4, { width: 60 });
    doc.text(r.customer_name || "--", left + 165, y + 4, { width: 140 });
    doc.text(r.salesperson_name || "--", left + 310, y + 4, { width: 90 });
    doc.text(fmtDateTime(r.start_at), left + 405, y + 4, { width: 80 });
    doc.text(fmtDateTime(r.end_at), left + 490, y + 4, { width: 80 });
    doc.text(String(r.equipment_count || 0), left + 575, y + 4, { width: 40, align: "right" });
    doc.text(fmtMoney(r.fee_total), left + 620, y + 4, { width: tableW - 628, align: "right" });
    if (detailLine) {
      doc.fillColor("#475569").font("Helvetica").fontSize(7);
      doc.text(detailLine, left + 8, y + 18, { width: tableW - 16 });
    }
    doc.y = y + rowH;
  });

  doc.end();
}

module.exports = {
  streamOrderPdf,
  buildOrderPdfBuffer,
  streamOrdersReportPdf,
};
