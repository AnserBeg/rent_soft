const PDFDocument = require("pdfkit");
const fs = require("fs");
const { PassThrough } = require("stream");

// --- Visual Constants ---
const COLORS = {
  primary: "#0f172a", // Slate 900
  secondary: "#334155", // Slate 700
  muted: "#64748b", // Slate 500
  accent: "#2563eb", // Blue 600
  border: "#e2e8f0", // Slate 200
  bgHeader: "#f8fafc", // Slate 50
  bgRowEven: "#ffffff",
  bgRowOdd: "#f8fafc", // Slate 50
  success: "#16a34a", // Green 600
  warning: "#ca8a04", // Yellow 600
  danger: "#dc2626", // Red 600
  white: "#ffffff",
};

const FONTS = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

function safeText(value) {
  return String(value ?? "").trim();
}

function stripHtml(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  const withBreaks = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n");
  return withBreaks
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
      const title = safeText(contact?.title);
      const email = safeText(contact?.email);
      const phone = safeText(contact?.phone);
      const nameLine = title ? `${name} - ${title}` : name;
      const details = [email, phone].filter(Boolean).join(" / ") || "--";
      return `${label} ${nameLine}: ${details}`;
    })
    .join("; ");
}

function normalizeCoverageHours(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.slots)) {
    raw = raw.slots;
  }
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const timeToMinutes = (val) => {
    const match = String(val || "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return hour * 60 + minute;
  };
  const slots = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const startDay = String(entry.startDay || entry.start_day || "").toLowerCase();
      const endDay = String(entry.endDay || entry.end_day || startDay || "").toLowerCase();
      const startTime = safeText(entry.startTime || entry.start_time || entry.start);
      const endTime = safeText(entry.endTime || entry.end_time || entry.end);
      if (!startDay || !endDay || (!startTime && !endTime)) return;
      slots.push({ startDay, endDay, startTime, endTime });
    });
    return slots;
  }
  if (raw && typeof raw === "object") {
    days.forEach((day, idx) => {
      const entry = raw[day] || {};
      const startTime = safeText(entry.start);
      const endTime = safeText(entry.end);
      if (!startTime && !endTime) return;
      let endDay = day;
      const explicit = entry.endDayOffset ?? entry.end_day_offset;
      if (explicit === 1 || explicit === "1" || explicit === true || entry.spansMidnight === true) {
        endDay = days[(idx + 1) % days.length];
      } else if (startTime && endTime) {
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
          endDay = days[(idx + 1) % days.length];
        }
      }
      slots.push({ startDay: day, endDay, startTime, endTime });
    });
  }
  return slots;
}

function formatCoverageHours(value) {
  const dayLabels = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const slots = normalizeCoverageHours(value);
  if (!slots.length) return "";
  const parts = slots.map((slot) => {
    const startLabel = dayLabels[slot.startDay] || slot.startDay || "--";
    const endLabel = dayLabels[slot.endDay] || slot.endDay || "--";
    const start = slot.startTime || "--";
    const end = slot.endTime || "--";
    if (slot.startDay === slot.endDay) {
      return `${startLabel} ${start}-${end}`;
    }
    return `${startLabel} ${start}-${endLabel} ${end}`;
  });
  return parts.join(", ");
}

function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
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
  try {
    const options = {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    };
    if (timeZone) options.timeZone = timeZone;
    return new Intl.DateTimeFormat("en-US", options).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  switch (s) {
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
      return (s.charAt(0).toUpperCase() + s.slice(1)) || "Unknown";
  }
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "ordered" || s === "received" || s === "closed") return COLORS.success;
  if (s === "quote_rejected" || s === "request_rejected") return COLORS.danger;
  if (s === "reservation" || s === "requested") return COLORS.warning;
  if (s === "quote") return COLORS.accent;
  return COLORS.secondary;
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

function companyContactLines(companyProfile) {
  if (!companyProfile) return [];
  const phone = safeText(companyProfile.phone);
  const email = safeText(companyProfile.email);
  const lines = [];
  if (phone) lines.push(phone);
  if (email) lines.push(email);
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
  if (email) lines.push(email);
  if (phone) lines.push(phone);
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

// --- Drawing Helpers ---

function drawBox(doc, { x, y, w, h, border = null, fill = null, radius = 0 }) {
  doc.save();
  if (fill) {
    doc.fillColor(fill);
    if (radius > 0) doc.roundedRect(x, y, w, h, radius).fill();
    else doc.rect(x, y, w, h).fill();
  }
  if (border) {
    doc.strokeColor(border);
    doc.lineWidth(0.5); // Thinner, more elegant borders
    if (radius > 0) doc.roundedRect(x, y, w, h, radius).stroke();
    else doc.rect(x, y, w, h).stroke();
  }
  doc.restore();
}

function drawBadge(doc, { text, x, y, bg, color, width }) {
  const h = 20;
  const radius = h / 2;
  const w = width || 100;

  drawBox(doc, { x, y, w, h, fill: bg, radius });

  doc.save();
  doc.fillColor(color).font(FONTS.bold).fontSize(9);
  doc.text(text.toUpperCase(), x, y + 5, { width: w, align: "center", characterSpacing: 0.5 });
  doc.restore();
}

function drawEyebrow(doc, text, x, y, width) {
  doc.save();
  doc.fillColor(COLORS.muted).font(FONTS.bold).fontSize(7);
  doc.text(text.toUpperCase(), x, y, { width, characterSpacing: 1 });
  doc.restore();
}

function ensureSpace(doc, neededHeight, { bottomMargin = 50 } = {}) {
  const bottom = doc.page.height - (doc.page.margins.bottom ?? bottomMargin);
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
    return true; // Added page
  }
  return false; // Did not add page
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 30);
  doc.moveDown(0.5);
  doc.save();
  doc.fillColor(COLORS.primary).font(FONTS.bold).fontSize(12);
  doc.text(title, doc.page.margins.left, doc.y);
  doc.rect(doc.page.margins.left, doc.y + 4, doc.page.width - doc.page.margins.left - doc.page.margins.right, 0.5)
    .fillColor(COLORS.border).fill();
  doc.restore();
  doc.moveDown(1);
}

// --- Main Document Functions ---

function createContractDoc({ title, docNo, docLabel = "Contract", status, logoPath = null, companyProfile = null }) {
  const doc = new PDFDocument({ size: "LETTER", margin: 40 }); // Slightly tighter margins for more space

  const top = doc.page.margins.top;
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - left - right;

  // --- Header Section ---
  const headerHeight = 100;

  // Left: Logo & Company Info
  const logoMaxWidth = 100;
  const logoMaxHeight = 60;
  let currentX = left;

  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, left, top, { fit: [logoMaxWidth, logoMaxHeight], align: "left", valign: "top" });
      currentX += logoMaxWidth + 20;
    } catch (_) {
      // Ignore logo load error
    }
  }

  const companyInfoY = top + 5;
  doc.font(FONTS.bold).fontSize(14).fillColor(COLORS.primary).text(companyProfile?.name || "Company", currentX, companyInfoY);
  doc.moveDown(0.2);
  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.secondary);

  const addressLines = companyAddressLines(companyProfile);
  addressLines.forEach(line => doc.text(line, currentX, null, { width: 250 }));

  const contactLines = companyContactLines(companyProfile);
  if (contactLines.length > 0) {
    doc.moveDown(0.2);
    contactLines.forEach(line => doc.text(line, currentX, null, { width: 250 }));
  }

  // Right: Document Title & Details
  const rightColX = pageWidth - right - 200;
  doc.y = top; // Reset Y

  // Status Badge
  const statusTxt = statusLabel(status);
  const badgeColor = statusColor(status);

  // Draw Status visually
  drawBox(doc, {
    x: pageWidth - right - 120,
    y: top,
    w: 120,
    h: 24,
    fill: badgeColor,
    radius: 4
  });
  doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.white)
    .text(statusTxt.toUpperCase(), pageWidth - right - 120, top + 7, { width: 120, align: "center", characterSpacing: 1 });

  doc.moveDown(2.5); // Space below badge

  // Doc Title
  doc.font(FONTS.bold).fontSize(20).fillColor(COLORS.primary)
    .text(title, rightColX, null, { width: 200, align: "right" });

  doc.font(FONTS.regular).fontSize(10).fillColor(COLORS.muted)
    .text(`${docLabel} # ${docNo}`, rightColX, doc.y + 5, { width: 200, align: "right" });

  doc.y = top + headerHeight; // Ensure we move past header

  // Divider
  doc.save()
    .moveTo(left, doc.y)
    .lineTo(pageWidth - right, doc.y)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke()
    .restore();

  doc.moveDown(1.5);

  return doc;
}

function writeOrderPdf(doc, { order, lineItems, fees, notes, attachments, rentalInfoFields = null }) {
  const isQ = isQuote(order?.status);
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - left - right;

  // --- Info Blocks (Two Columns) ---
  const colGap = 20;
  const colWidth = (contentWidth - colGap) / 2;
  const startY = doc.y;

  // Left Column: Customer
  drawBox(doc, { x: left, y: startY, w: colWidth, h: 100, fill: COLORS.bgHeader, radius: 6 });
  const innerMargin = 15;

  doc.save();
  const leftTextX = left + innerMargin;
  const leftTextY = startY + innerMargin;

  drawEyebrow(doc, "Customer", leftTextX, leftTextY);
  doc.y = leftTextY + 12;

  const customerName = safeText(order?.customer_name) || "--";
  const customerContact = safeText(order?.customer_contact_name);

  doc.font(FONTS.bold).fontSize(11).fillColor(COLORS.primary).text(customerName, leftTextX, doc.y);

  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.secondary);
  if (customerContact && customerContact.toLowerCase() !== customerName.toLowerCase()) {
    doc.text(customerContact, leftTextX, doc.y + 2);
  } else {
    doc.moveDown(0.2);
  }

  doc.moveDown(0.3);
  customerAddressLines(order).forEach(line => doc.text(line, leftTextX));

  doc.moveDown(0.3);
  customerContactLines(order).forEach(line => doc.text(line, leftTextX));
  doc.restore();

  // Right Column: Key Details
  const rightColX = left + colWidth + colGap;
  drawBox(doc, { x: rightColX, y: startY, w: colWidth, h: 100, border: COLORS.border, radius: 6 }); // Hollow box with border

  doc.save();
  const rightTextX = rightColX + innerMargin;
  let rightTextY = startY + innerMargin;

  const { start, end } = computeOrderDateRange(lineItems);
  const agent = safeText(order?.salesperson_name);

  // Grid for details
  const labelW = 70;

  // Start
  drawEyebrow(doc, "Start", rightTextX, rightTextY);
  doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.primary).text(fmtDateTime(start), rightTextX, rightTextY + 12);

  // End (same line roughly? No, better distinct lines for readability)
  rightTextY += 35;
  drawEyebrow(doc, "End", rightTextX, rightTextY);
  doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.primary).text(fmtDateTime(end), rightTextX, rightTextY + 12);

  // Agent (Absolute positioned to right side of box)
  if (agent) {
    const agentX = rightTextX + 120;
    const agentY = startY + innerMargin;
    drawEyebrow(doc, "Rental Agent", agentX, agentY);
    doc.font(FONTS.regular).fontSize(10).fillColor(COLORS.secondary).text(agent, agentX, agentY + 12);
  }
  doc.restore();

  doc.y = startY + 100 + 20; // Move past boxes

  // --- Rental Info ---
  const rentalInfoConfig = normalizeRentalInfoFields(rentalInfoFields);
  const showRentalInfo = (key) => rentalInfoConfig?.[key]?.enabled !== false;
  const rentalInfoLines = [];

  if (showRentalInfo("siteAddress")) {
    const val = safeText(order?.site_address || order?.siteAddress);
    if (val) rentalInfoLines.push({ label: "Site Address", value: val });
  }
  if (showRentalInfo("criticalAreas")) {
    const val = safeText(order?.critical_areas || order?.criticalAreas);
    if (val) rentalInfoLines.push({ label: "Critical Areas", value: val });
  }
  if (showRentalInfo("emergencyContacts")) {
    const val = formatContactLines(order?.emergency_contacts || order?.emergencyContacts, "");
    if (val !== "--") rentalInfoLines.push({ label: "Emergency Contacts", value: val });
  }
  if (showRentalInfo("siteContacts")) {
    const val = formatContactLines(order?.site_contacts || order?.siteContacts, "");
    if (val !== "--") rentalInfoLines.push({ label: "Site Contacts", value: val });
  }
  if (showRentalInfo("coverageHours")) {
    const val = formatCoverageHours(order?.coverage_hours || order?.coverageHours);
    if (val) rentalInfoLines.push({ label: "Coverage Hours", value: val });
  }

  const generalNotes = safeText(stripHtml(order?.general_notes || order?.generalNotes));

  if (rentalInfoLines.length > 0 || generalNotes) {
    drawSectionTitle(doc, "Rental Information");

    const col1X = left;
    const col2X = left + (contentWidth / 2) + 10;

    let currentY = doc.y;

    rentalInfoLines.forEach((item, idx) => {
      // Check for space
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        currentY = doc.page.margins.top;
      }

      doc.save();
      drawEyebrow(doc, item.label, left, doc.y);
      doc.y += 10;
      doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.secondary).text(item.value, left, doc.y, { width: contentWidth });
      doc.y += 10;
      doc.restore();
    });

    if (generalNotes) {
      doc.moveDown(0.8);
      drawEyebrow(doc, "General Notes", left, doc.y);
      doc.y += 10;
      doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.secondary).text(generalNotes, left, doc.y, { width: contentWidth });
      doc.moveDown(1);
    }
    doc.moveDown(1);
  }

  // --- Line Items Table ---
  ensureSpace(doc, 60); // Ensure at least header fits

  const tableTop = doc.y;
  const colDescW = contentWidth * 0.55;
  const colRateW = contentWidth * 0.15;
  const colQtyW = contentWidth * 0.1;
  const colTotalW = contentWidth * 0.2;

  const xDesc = left + 10;
  const xRate = left + colDescW;
  const xQty = xRate + colRateW;
  const xTotal = xQty + colQtyW; // End point

  // Table Header
  const headerHeight = 24;
  drawBox(doc, { x: left, y: tableTop, w: contentWidth, h: headerHeight, fill: COLORS.accent, radius: 4 });

  doc.save();
  doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(9);
  const textOffsetY = tableTop + 7;
  doc.text("DESCRIPTION", xDesc, textOffsetY);
  doc.text("RATE", xRate, textOffsetY, { width: colRateW - 10, align: "right" });
  doc.text("QTY", xQty, textOffsetY, { width: colQtyW - 10, align: "right" });
  doc.text("TOTAL", xQty + colQtyW, textOffsetY, { width: colTotalW - 20, align: "right" });
  doc.restore();

  doc.y = tableTop + headerHeight + 5;

  (Array.isArray(lineItems) ? lineItems : []).forEach((li, idx) => {
    // Calculate height needed (approx)
    const title = li.bundleName ? `Bundle: ${li.bundleName}` : li.typeName || "Item";
    const unitDescription = safeText(li.unitDescription || li.unit_description || "");
    const inv = Array.isArray(li.bundleItems) && li.bundleItems.length ? li.bundleItems : Array.isArray(li.inventoryDetails) ? li.inventoryDetails : [];
    const invText = inv.map((it) => [safeText(it.serialNumber || it.serial_number), safeText(it.modelName || it.model_name)].filter(Boolean).join(" ")).filter(Boolean).slice(0, 6).join(", ");

    const needsDetailLine = unitDescription || invText || li.startAt;
    const rowH = needsDetailLine ? 38 : 24;

    const addedPage = ensureSpace(doc, rowH);
    if (addedPage) doc.y += 10; // Top padding on new page

    const y = doc.y;
    const fill = idx % 2 === 0 ? COLORS.bgRowOdd : COLORS.bgRowEven;

    drawBox(doc, { x: left, y: y, w: contentWidth, h: rowH, fill: fill, radius: 4 });

    // Content
    doc.save();
    const txtY = y + 7;

    // Desc
    doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.primary).text(title, xDesc, txtY, { width: colDescW - 20, lineBreak: false, ellipsis: true });

    // Numbers
    const rate = li.rateAmount === null || li.rateAmount === undefined ? "--" : fmtMoney(li.rateAmount);
    const isRerent = !!unitDescription && !li.bundleId && (!Array.isArray(li.inventoryIds) || li.inventoryIds.length === 0);
    const qty = li.bundleId ? 1 : Array.isArray(li.inventoryIds) && li.inventoryIds.length ? li.inventoryIds.length : isRerent ? 1 : isDemandOnlyStatus(order?.status) ? 1 : 0;

    doc.font(FONTS.regular).fillColor(COLORS.secondary);
    doc.text(rate, xRate, txtY, { width: colRateW - 10, align: "right" });
    doc.text(String(qty), xQty, txtY, { width: colQtyW - 10, align: "right" });

    const lineTotal = li.lineAmount === null || li.lineAmount === undefined ? "--" : fmtMoney(li.lineAmount);
    doc.font(FONTS.bold).fillColor(COLORS.primary).text(lineTotal, xQty + colQtyW, txtY, { width: colTotalW - 20, align: "right" });

    // Details line
    if (needsDetailLine) {
      doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.muted);
      const detailStr = [unitDescription, invText].filter(Boolean).join(" | ");
      const outStr = li.startAt ? `Out: ${fmtDateTime(li.startAt)}` : "";
      const fullDetail = [detailStr, outStr].filter(Boolean).join(" • ");

      doc.text(fullDetail, xDesc, txtY + 14, { width: contentWidth - 20, lineBreak: false, ellipsis: true });
    }

    doc.restore();
    doc.y += rowH + 2; // Gap
  });

  doc.moveDown(2);

  // --- Bottom Section: Terms & Totals ---
  const bottomY = doc.y;

  // Terms (Left 2/3)
  const termsW = contentWidth * 0.6;

  doc.save();
  const termsText = safeText(order?.terms);
  const special = safeText(order?.special_instructions);

  if (termsText || special) {
    if (doc.y > doc.page.height - 150) doc.addPage(); // Ensure space for terms

    drawEyebrow(doc, isQ ? "Quote Terms & Conditions" : "Contract Terms & Conditions", left, doc.y);
    doc.moveDown(0.5);
    doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.secondary);

    if (termsText) {
      doc.text(termsText, left, doc.y, { width: termsW });
      doc.moveDown(0.5);
    }
    if (special) {
      doc.font(FONTS.bold).text("Special Instructions:", { width: termsW });
      doc.font(FONTS.regular).text(special, { width: termsW });
    }
  }
  doc.restore();

  // Totals (Right 1/3)
  // Reset Y to bottomY but check for page break issues? 
  // It's safer to just place it.

  // If we added a page for terms, we need to handle totals placement.
  // Ideally totals are always kept together.

  const totals = computeTotals({ lineItems, fees });
  const totalsW = contentWidth * 0.35;
  const totalsX = left + contentWidth - totalsW;

  // Check if we need a new page for totals box
  if (bottomY + 160 > doc.page.height - 50) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  } else {
    doc.y = bottomY;
  }

  drawBox(doc, {
    x: totalsX,
    y: doc.y,
    w: totalsW,
    h: 150,
    bg: COLORS.bgHeader,
    radius: 6,
    border: COLORS.border
  });

  const innerTotalM = 12;
  let totalCurrentY = doc.y + innerTotalM;
  const totalValX = totalsX + totalsW - innerTotalM;
  const totalLabelX = totalsX + innerTotalM;
  const labelWidth = totalsW - (innerTotalM * 2) - 60; // Leave space for value

  const drawTotalLine = (label, value, isBold = false, isBig = false) => {
    doc.save();
    doc.font(isBold ? FONTS.bold : FONTS.regular).fontSize(isBig ? 12 : 9).fillColor(COLORS.primary);
    doc.text(label, totalLabelX, totalCurrentY, { width: labelWidth });
    doc.text(value, totalLabelX, totalCurrentY, { width: totalsW - (innerTotalM * 2), align: "right" });
    doc.restore();
    totalCurrentY += (isBig ? 24 : 18);
  };

  drawTotalLine("Rental Total", fmtMoney(totals.rentalTotal));
  drawTotalLine("Fees/Other", fmtMoney(totals.feeTotal));
  drawTotalLine("Subtotal", fmtMoney(totals.subtotal));
  drawTotalLine("GST (5%)", fmtMoney(totals.tax));

  // Divider
  doc.save()
    .moveTo(totalsX + innerTotalM, totalCurrentY - 6)
    .lineTo(totalsX + totalsW - innerTotalM, totalCurrentY - 6)
    .strokeColor(COLORS.border).stroke()
    .restore();

  drawTotalLine("Grand Total", fmtMoney(totals.grandTotal), true);
  drawTotalLine("Amount Due", fmtMoney(totals.amountDue), true, true);

  // --- Signature ---
  doc.y = Math.max(doc.y, totalCurrentY) + 30; // Move past totals
  ensureSpace(doc, 80);

  const signatureY = doc.y + 20;
  const sigLineW = contentWidth * 0.45;

  doc.save();
  // Signature Line
  doc.moveTo(left, signatureY + 40).lineTo(left + sigLineW, signatureY + 40).strokeColor(COLORS.primary).stroke();
  drawEyebrow(doc, "Authorized Signature", left, signatureY);

  // Date Line
  const dateLineX = left + contentWidth - (contentWidth * 0.3);
  doc.moveTo(dateLineX, signatureY + 40).lineTo(dateLineX + (contentWidth * 0.3), signatureY + 40).strokeColor(COLORS.primary).stroke();
  drawEyebrow(doc, "Date", dateLineX, signatureY);
  doc.restore();

  // Footer
  const pageCountToken = "{total_pages_count}";
  // We can't easily do page X of Y in PDFKit standard flow without buffering pages or using 'range'.
  // We will just do a simple timestamp footer.

  doc.y = doc.page.height - 30;
  doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.muted)
    .text(`Generated on ${new Date().toLocaleString()}`, left, doc.y, { align: "center", width: contentWidth });

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

module.exports = {
  streamOrderPdf,
  buildOrderPdfBuffer,
};
