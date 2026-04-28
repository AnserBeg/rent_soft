const ANALYTICS_BUSINESS_LOGIC_SECTIONS = [
  {
    title: "Scope and safety",
    rules: [
      "Use only tenant-scoped ai_analytics views. Never query public, system schemas, sessions, passwords, tokens, credentials, QBO connections, QBO documents, QBO error logs, or company settings.",
      "Company scoping is enforced by the database. Do not add company_id filters unless needed for display.",
      "QBO/QuickBooks credential and sync tables are not analytics-safe. If asked for QBO invoice data, say it is unavailable unless a safe summary view exists.",
    ],
  },
  {
    title: "Rental dates and amounts",
    rules: [
      "created_at means when a record was created, not when rental activity happened or money was earned.",
      "line_amount is the full rental line amount. It is not a monthly charge and should not be grouped by rental_order_created_at for monthly charge questions.",
      "Monthly customer/rental-order charges mean prorated charges allocated to the month the rental was active, minus pause periods, plus fees dated in that month. Use rental_order_monthly_charges.total_charge.",
      "For earned rental revenue, avoid quote-only statuses unless the user asks for quotes or pipeline.",
      "Fees are separate from line items. Include them only when the user asks for order totals, charges, or fees.",
    ],
  },
  {
    title: "Rental statuses",
    rules: [
      "Quote statuses are quote and quote_rejected.",
      "Demand/pipeline statuses include quote, quote_rejected, reservation, and requested.",
      "Active/live rental usually means ordered line items that have been fulfilled or picked up and not returned.",
      "Returned/finalized rental work usually uses received and closed, depending on the wording.",
      "Inventory assignment is not reliable for quote, quote_rejected, or requested demand.",
    ],
  },
  {
    title: "Duration and utilization",
    rules: [
      "Rented days is ambiguous unless the user says booked, actual completed, current/live, or billable.",
      "Booked days use booked_duration_days. Actual completed days use actual_completed_duration_days and require actual timestamps. Current/live days use actual_live_duration_days. Billable days use billable_duration_days or daily billable_units.",
      "Without a date range, generic equipment utilization means live fleet utilization: currently rented assets divided by total equipment units.",
      "With a period or month, equipment utilization means utilized asset-days divided by total fleet capacity asset-days for matching equipment types, unless the user asks for a different basis.",
      "Do not treat month names like Feb or February as equipment names.",
    ],
  },
  {
    title: "Equipment, customers, and branches",
    rules: [
      "Equipment type means a rentable product category/type. Asset, unit, or equipment unit means an individual equipment row.",
      "Model and serial are individual asset identifiers, not type names.",
      "For asset-level rental questions, prefer rental_order_line_item_assets because it has one row per assigned equipment unit.",
      "Customer names may be parent/branch style. Preserve parent context when available.",
      "Branch means rental_orders.pickup_location_id joined to locations by default. Use site, current location, or base location only when the user says so.",
    ],
  },
  {
    title: "Other operations",
    rules: [
      "Recent without a time window defaults to the last 90 days and the answer should mention that default.",
      "Sales orders represent asset sales, not rentals. Use sale_price, usually closed status, for realized sales revenue.",
      "Equipment has purchase_price but no dedicated purchase_date. For acquisition timing, prefer purchase order possession/closed dates tied to equipment, otherwise label equipment.created_at as asset_created_at.",
      "Work orders can indicate service/repair state and can create line-item pause periods that affect monthly charges.",
    ],
  },
];

function formatAnalyticsBusinessLogicForPrompt({ maxChars = 5000 } = {}) {
  const text = ANALYTICS_BUSINESS_LOGIC_SECTIONS.map((section) => {
    const rules = section.rules.map((rule) => `- ${rule}`).join("\n");
    return `${section.title}:\n${rules}`;
  }).join("\n\n");
  const normalizedMax = Math.max(1000, Number(maxChars) || 5000);
  if (text.length <= normalizedMax) return text;
  return `${text.slice(0, Math.max(0, normalizedMax - 80)).trim()}\n...business logic truncated to ${normalizedMax} chars`;
}

module.exports = {
  ANALYTICS_BUSINESS_LOGIC_SECTIONS,
  formatAnalyticsBusinessLogicForPrompt,
};
