const DURATION_CLARIFICATION = {
  question: "When you say rented out days, what duration basis should AI Analytics use?",
  options: [
    { value: "booked_days", label: "Booked days" },
    { value: "actual_completed_days", label: "Actual completed days" },
    { value: "actual_live_days", label: "Actual days so far" },
    { value: "billable_days", label: "Billable days" },
  ],
};

const AI_ANALYTICS_GLOSSARY = [
  {
    term: "booked_days",
    definition: "Scheduled rental duration from rental_order_line_items.end_at - rental_order_line_items.start_at.",
    preferredColumn: "rental_order_line_items.booked_duration_days",
  },
  {
    term: "actual_completed_days",
    definition:
      "Actual completed rental duration from returned_at - fulfilled_at. Use only rows where both timestamps exist.",
    preferredColumn: "rental_order_line_items.actual_completed_duration_days",
  },
  {
    term: "actual_live_days",
    definition:
      "Actual duration so far from COALESCE(returned_at, NOW()) - fulfilled_at for assets that have actually gone out.",
    preferredColumn: "rental_order_line_items.actual_live_duration_days",
  },
  {
    term: "billable_days",
    definition:
      "Billable daily units derived from billable_units when rate_basis is daily. Do not substitute booked days.",
    preferredColumn: "rental_order_line_items.billable_duration_days",
  },
  {
    term: "rented out",
    definition:
      "Ambiguous for duration questions unless the user says booked, actual, active/current/so far, returned, or billable.",
  },
  {
    term: "active rental",
    definition:
      "Usually a rental order line item that has been fulfilled or picked up and has not been returned.",
  },
  {
    term: "reserved",
    definition:
      "Usually future or reservation-stage demand. Reserved does not necessarily mean the asset is actually out.",
  },
  {
    term: "utilization",
    definition:
      "Can mean booked utilization, actual utilization, live utilization, or revenue utilization. If the user asks for a general utilization ranking without a date range, default to current live utilization.",
  },
  {
    term: "branch",
    definition:
      "Default branch means rental_orders.pickup_location_id joined to locations. Use job site, current location, or base location only when the user says so.",
  },
  {
    term: "recent rentals",
    definition:
      "If the user says recent without a time window, default to the last 90 days and mention that default in the answer.",
  },
  {
    term: "asset purchase date",
    definition:
      "Equipment records have purchase_price and created_at, but no purchase_date. For oldest assets by purchase date, prefer purchase_orders.expected_possession_date or closed_at when tied to equipment_id; otherwise use equipment.created_at as the asset created/acquired date and label it clearly.",
  },
  {
    term: "business snapshot",
    definition:
      "For broad snapshot questions, return one compact row with core counts and totals such as customer count, asset count, active rental orders, currently rented assets, open work orders, and rental line revenue.",
  },
  {
    term: "revenue",
    definition:
      "Usually rental line amount or order totals depending on the question. Prefer explicit amount columns and avoid counting quotes as earned revenue unless asked.",
  },
  {
    term: "monthly charges",
    definition:
      "Monthly customer/rental-order charges mean prorated charges allocated to the month the rental was active, minus line-item pause periods, plus fees dated in that month. Do not use rental_order_created_at or raw line_amount for this concept.",
    preferredColumn: "rental_order_monthly_charges.total_charge",
  },
];

const BLOCKED_ANALYTICS_RESPONSE = {
  answer:
    "I can only answer read-only, tenant-scoped analytics questions. I cannot perform data changes, inspect secrets, or query base/system schemas.",
};

function formatAnalyticsGlossaryForPrompt() {
  return AI_ANALYTICS_GLOSSARY.map((item) => {
    const column = item.preferredColumn ? ` Preferred column: ${item.preferredColumn}.` : "";
    return `- ${item.term}: ${item.definition}${column}`;
  }).join("\n");
}

function getAnalyticsQuestionGuidance(question) {
  const text = String(question || "").trim().toLowerCase();
  const guidance = [];

  if (/\brevenue\b/.test(text) && /\b(branch|location)\b/.test(text) && !/\bsite|current location|base location\b/.test(text)) {
    guidance.push(
      "For revenue by branch, do not ask for clarification. Use rental_orders.pickup_location_id joined to locations as branch, and group missing locations as Unassigned branch."
    );
  }

  if (/\butili[sz]ation\b/.test(text) && !/\brevenue\b/.test(text) && !/\bdays?\b/.test(text)) {
    guidance.push(
      "For unspecified equipment utilization, do not ask for clarification. Default to current live utilization: active rented assets divided by total equipment units for each matching equipment type."
    );
  }

  if (/\boldest\b/.test(text) && /\bassets?\b/.test(text) && /\bpurchase date\b/.test(text)) {
    guidance.push(
      "For oldest assets by purchase date, do not ask for clarification. Equipment has no purchase_date column; use the best available acquisition date from purchase_orders tied to equipment_id, falling back to equipment.created_at as asset_created_at."
    );
  }

  if (/\bno recent rentals?\b/.test(text) || (/\bcustomers?\b/.test(text) && /\brecent rentals?\b/.test(text))) {
    guidance.push(
      "For customers with no recent rentals, do not ask for clarification. Default recent to the last 90 days and include each customer's last_rental_at when available."
    );
  }

  if (/\bbroad snapshot\b|\bsnapshot of the rental business\b|\bbusiness snapshot\b/.test(text)) {
    guidance.push(
      "For broad rental business snapshots, do not ask for clarification. Return one compact summary row with customer_count, asset_count, active_rental_order_count, currently_rented_asset_count, open_work_order_count, and total_line_revenue."
    );
  }

  if (/\blist every rental order line item\b/.test(text)) {
    guidance.push(
      "For rental order line item listings, use rental_order_line_items joined to rental_orders, customers, equipment_types, rental_order_line_inventory, and equipment. Use rental_order_line_items.rental_order_status for order status."
    );
  }

  if (
    /\bmonthly charges?\b/.test(text) ||
    (/\bcharges?\b/.test(text) && /\b(month|months|monthly)\b/.test(text) && /\brental orders?\b/.test(text))
  ) {
    guidance.push(
      "For monthly charges from rental orders, use rental_order_monthly_charges. Sum total_charge by month. Filter rental_order_status to the requested statuses, or default to requested, reservation, and ordered when the user is referring to the Monthly customer totals page. Do not group by rental_order_created_at and do not sum rental_order_line_items.line_amount for this concept."
    );
  }

  return guidance;
}

function normalizeClarification(clarification) {
  if (!clarification || typeof clarification !== "object") return null;
  const question = String(clarification.question || "").trim();
  const value = String(clarification.value || "").trim();
  const answer = String(clarification.answer || "").trim();
  if (!question && !value && !answer) return null;
  const normalizedValue = value || normalizeClarificationAnswer(answer);
  return {
    question,
    value: normalizedValue,
    answer: answer || labelForClarificationValue(normalizedValue) || value,
  };
}

function normalizeClarificationAnswer(answer) {
  const text = String(answer || "").trim().toLowerCase();
  if (!text) return "";
  if (/actual.*completed|completed.*actual|returned|return/.test(text)) return "actual_completed_days";
  if (/actual.*(live|so far|current)|so far|currently|active|not returned/.test(text)) return "actual_live_days";
  if (/booked|scheduled|reserved|planned/.test(text)) return "booked_days";
  if (/billable|billed|charged|invoice/.test(text)) return "billable_days";
  return "";
}

function labelForClarificationValue(value) {
  return DURATION_CLARIFICATION.options.find((option) => option.value === value)?.label || "";
}

function classifyAnalyticsQuestion({ question, clarification } = {}) {
  const text = String(question || "").trim().toLowerCase();
  if (!text) return { status: "ready_to_query", clarification: null, clarifiedIntent: "" };

  const asksForWrite =
    /\b(delete|remove|wipe|erase|drop|truncate|alter|update|insert|create|grant|revoke)\b[\s\S]*\b(customers?|users?|orders?|equipment|assets?|tables?|database|schema|rows?|records?)\b/.test(
      text
    ) ||
    /\b(delete|remove|wipe|erase)\s+all\b/.test(text) ||
    /\bmake\s+(a\s+)?(change|update)\b/.test(text);
  const asksForSecrets =
    /\b(password\s*hash(?:es)?|passwords?|tokens?|sessions?|api\s*keys?|secrets?|credentials?)\b/.test(text);
  const asksForBaseSchema =
    /\b(public|pg_catalog|information_schema)\s*\.\s*[a-z_][a-z0-9_]*\b/.test(text) ||
    /\bquery\s+(the\s+)?(base|raw|system)\s+(tables?|schema|database)\b/.test(text);
  const asksForMultipleStatements =
    /\b(two|multiple|several)\s+sql\s+statements?\b/.test(text) ||
    /\brun\s+.*;\s*(select|with|update|delete|drop|insert|alter|truncate)\b/.test(text);

  if (asksForWrite || asksForSecrets || asksForBaseSchema || asksForMultipleStatements) {
    return {
      status: "blocked",
      reason: BLOCKED_ANALYTICS_RESPONSE.answer,
      clarification: null,
    };
  }

  const normalizedClarification = normalizeClarification(clarification);
  if (normalizedClarification) {
    return {
      status: "ready_to_query",
      clarification: normalizedClarification,
      clarifiedIntent: [
        normalizedClarification.question,
        normalizedClarification.value
          ? `Use ${normalizedClarification.value}.`
          : `User clarified: ${normalizedClarification.answer}.`,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const hasDurationIntent =
    /\b(days?|duration|how long|length of time|time rented|rental time)\b/.test(text) ||
    /\b(rented out|days rented|rented for|rental days)\b/.test(text);
  const mentionsRental =
    /\b(rent|rental|rented|rented out|asset|equipment|order|line item|reservation|booked)\b/.test(text);
  const hasExplicitBasis =
    /\b(actual|fulfilled|picked up|pickup|delivered|returned|checked in|check-in|completed)\b/.test(text) ||
    /\b(booked|scheduled|reserved|planned)\b/.test(text) ||
    /\b(billable|billed|charged|invoice|invoiced)\b/.test(text) ||
    /\b(so far|currently|current|active|not returned|still out|live)\b/.test(text);
  const ambiguousRentalDuration =
    hasDurationIntent &&
    mentionsRental &&
    !hasExplicitBasis &&
    (/\brented out\b/.test(text) ||
      /\bdays rented\b/.test(text) ||
      /\brented for\b/.test(text) ||
      /\bhow many days\b[\s\S]*\brent/.test(text) ||
      /\bhow long\b[\s\S]*\brent/.test(text));

  if (ambiguousRentalDuration) {
    return {
      status: "clarification_required",
      clarification: DURATION_CLARIFICATION,
      reason: "Rental duration basis is ambiguous.",
    };
  }

  return { status: "ready_to_query", clarification: null, clarifiedIntent: "" };
}

module.exports = {
  AI_ANALYTICS_GLOSSARY,
  BLOCKED_ANALYTICS_RESPONSE,
  DURATION_CLARIFICATION,
  classifyAnalyticsQuestion,
  formatAnalyticsGlossaryForPrompt,
  getAnalyticsQuestionGuidance,
  labelForClarificationValue,
  normalizeClarification,
};
