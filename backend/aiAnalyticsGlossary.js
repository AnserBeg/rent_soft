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
      "Can mean booked utilization, actual utilization, live utilization, or revenue utilization; clarify if duration basis is not explicit.",
  },
  {
    term: "revenue",
    definition:
      "Usually rental line amount or order totals depending on the question. Prefer explicit amount columns and avoid counting quotes as earned revenue unless asked.",
  },
];

function formatAnalyticsGlossaryForPrompt() {
  return AI_ANALYTICS_GLOSSARY.map((item) => {
    const column = item.preferredColumn ? ` Preferred column: ${item.preferredColumn}.` : "";
    return `- ${item.term}: ${item.definition}${column}`;
  }).join("\n");
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

  const text = String(question || "").trim().toLowerCase();
  if (!text) return { status: "ready_to_query", clarification: null, clarifiedIntent: "" };

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
  DURATION_CLARIFICATION,
  classifyAnalyticsQuestion,
  formatAnalyticsGlossaryForPrompt,
  labelForClarificationValue,
  normalizeClarification,
};
