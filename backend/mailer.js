let nodemailer = null;
try {
  // Optional dependency until installed.
  // eslint-disable-next-line global-require
  nodemailer = require("nodemailer");
} catch (_) {
  nodemailer = null;
}

const transporterCache = new Map();

function emailSettingsKey(settings) {
  if (!settings) return "";
  return [
    settings.email_enabled ? "1" : "0",
    settings.email_smtp_provider || "",
    settings.email_smtp_host || "",
    settings.email_smtp_port || "",
    settings.email_smtp_secure ? "1" : "0",
    settings.email_smtp_require_tls ? "1" : "0",
    settings.email_smtp_user || "",
    settings.email_smtp_pass ? "1" : "0",
    settings.email_from_name || "",
    settings.email_from_address || "",
  ].join("|");
}

function buildTransportOptions(settings) {
  if (!settings || settings.email_enabled !== true) return null;
  const host = String(settings.email_smtp_host || "").trim();
  const port = Number(settings.email_smtp_port);
  const user = String(settings.email_smtp_user || "").trim();
  const pass = settings.email_smtp_pass === null || settings.email_smtp_pass === undefined ? "" : String(settings.email_smtp_pass);
  const fromAddress = String(settings.email_from_address || "").trim();
  if (!host || !Number.isFinite(port) || port <= 0 || !user || !pass || !fromAddress) return null;

  return {
    host,
    port,
    secure: settings.email_smtp_secure === true,
    requireTLS: settings.email_smtp_require_tls === true,
    auth: { user, pass },
  };
}

function getTransporter(companyId, settings) {
  if (!nodemailer) return null;
  const key = emailSettingsKey(settings);
  const cached = transporterCache.get(companyId);
  if (cached && cached.key === key) return cached.transporter;

  const options = buildTransportOptions(settings);
  if (!options) return null;
  const transporter = nodemailer.createTransport(options);
  transporterCache.set(companyId, { key, transporter });
  return transporter;
}

function fromHeader(settings) {
  const addr = String(settings?.email_from_address || "").trim();
  const name = String(settings?.email_from_name || "").trim();
  if (!addr) return null;
  return name ? `${name} <${addr}>` : addr;
}

async function sendCompanyEmail({ companyId, settings, to, subject, text, html, attachments }) {
  if (!nodemailer) return { ok: false, error: "email_not_installed" };
  const transporter = getTransporter(companyId, settings);
  if (!transporter) return { ok: false, error: "email_not_configured" };

  const from = fromHeader(settings);
  if (!from) return { ok: false, error: "email_not_configured" };

  const cleanTo = String(to || "").trim();
  if (!cleanTo) return { ok: false, error: "missing_recipient" };

  const payload = {
    from,
    to: cleanTo,
    subject: String(subject || "").trim() || "Notification",
    text: String(text || "").trim() || undefined,
    html: html ? String(html) : undefined,
    attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined,
  };

  const info = await transporter.sendMail(payload);
  return { ok: true, messageId: info?.messageId || null };
}

function statusDisplay(status) {
  const s = String(status || "").trim().toLowerCase();
  switch (s) {
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
    case "quote":
      return "Quote";
    case "quote_rejected":
      return "Quote rejected";
    default:
      return s || "Updated";
  }
}

function orderDocNumber(order) {
  const ro = order?.ro_number || order?.roNumber || null;
  const qo = order?.quote_number || order?.quoteNumber || null;
  if (ro && qo) return `${ro} / ${qo}`;
  return ro || qo || `#${order?.id || order?.order_id || ""}`;
}

function requestSubmittedEmail({ order, companyName }) {
  const doc = orderDocNumber(order);
  const start = order?.start_at ? new Date(order.start_at).toLocaleString() : null;
  const end = order?.end_at ? new Date(order.end_at).toLocaleString() : null;
  const when = start && end ? `\nDates: ${start} to ${end}` : "";
  const subject = `${companyName || "Aiven Rental"}: Request received (${doc})`;
  const text = `We received your rental request.${when}\n\nReference: ${doc}\nStatus: ${statusDisplay(order?.status)}\n\nIf you have questions, reply to this email.`;
  return { subject, text };
}

function statusUpdatedEmail({ order, companyName, prevStatus, note }) {
  const doc = orderDocNumber(order);
  const next = String(order?.status || "").toLowerCase();
  const isRejected = next === "request_rejected";
  const subject = isRejected ? `${companyName || "Aiven Rental"}: Request rejected (${doc})` : `${companyName || "Aiven Rental"}: Status updated (${doc})`;
  const reason = String(note || "").trim();
  const reasonBlock = isRejected && reason ? `\n\nReason:\n${reason}` : "";
  const pdfLine = isRejected ? "\n\nA PDF copy of your request is attached." : "";
  const text = isRejected
    ? `Request rejected.\n\nReference: ${doc}\nStatus: ${statusDisplay(order?.status)}${reasonBlock}${pdfLine}\n\nIf you have questions, reply to this email.`
    : `Your request status has been updated.\n\nReference: ${doc}\nPrevious: ${statusDisplay(prevStatus)}\nNew: ${statusDisplay(order?.status)}\n\nIf you have questions, reply to this email.`;
  return { subject, text };
}

module.exports = {
  sendCompanyEmail,
  requestSubmittedEmail,
  statusUpdatedEmail,
};
