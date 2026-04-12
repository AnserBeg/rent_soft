const TRACKING_DATA_TYPES = new Set(["date", "datetime", "number", "text", "boolean", "select"]);
const TRACKING_RULE_TYPES = new Set(["none", "time_interval", "meter_interval", "manual_due_date"]);

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value) {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s || null;
}

function normalizeDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normalizeDatetime(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const raw = String(value).trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeTrackingRule(rule) {
  const input = rule && typeof rule === "object" ? rule : {};
  const enabled = input.enabled === true;
  const ruleType = TRACKING_RULE_TYPES.has(String(input.ruleType || "")) ? String(input.ruleType) : "none";
  const intervalDays = Math.max(0, Math.floor(asNumber(input.intervalDays) ?? 0)) || null;
  const warnDays = Math.max(0, Math.floor(asNumber(input.warnDays) ?? 0)) || null;
  const intervalHours = Math.max(0, asNumber(input.intervalHours) ?? 0) || null;
  const warnHours = Math.max(0, asNumber(input.warnHours) ?? 0) || null;
  return { enabled, ruleType, intervalDays, warnDays, intervalHours, warnHours };
}

function normalizeTrackingFieldDefinition(row) {
  if (!row) return null;
  const dataType = String(row.dataType || row.data_type || "").trim();
  if (!TRACKING_DATA_TYPES.has(dataType)) return null;
  const rule = normalizeTrackingRule(row.rule);
  return {
    id: Number(row.id),
    equipmentTypeId: Number(row.equipmentTypeId ?? row.equipment_type_id),
    fieldKey: String(row.fieldKey ?? row.field_key ?? "").trim(),
    label: String(row.label || "").trim(),
    dataType,
    unit: asString(row.unit),
    required: row.required === true,
    options: Array.isArray(row.options) ? row.options : [],
    sortOrder: Number.isFinite(Number(row.sortOrder ?? row.sort_order)) ? Number(row.sortOrder ?? row.sort_order) : 0,
    showOnAssetsTable: row.showOnAssetsTable === true || row.show_on_assets_table === true,
    tableColumnLabel: asString(row.tableColumnLabel ?? row.table_column_label) || null,
    tableColumnMode: String((row.tableColumnMode ?? row.table_column_mode) || "value"),
    rule,
  };
}

function formatTrackingValueForDisplay(def, value) {
  if (!def) return "--";
  if (value === null || value === undefined || value === "") return "--";
  switch (def.dataType) {
    case "date":
      return normalizeDateOnly(value) || "--";
    case "datetime": {
      const iso = normalizeDatetime(value);
      if (!iso) return "--";
      return iso.replace("T", " ").replace("Z", "Z");
    }
    case "number": {
      const n = asNumber(value);
      if (n === null) return "--";
      return def.unit ? `${n} ${def.unit}` : String(n);
    }
    case "boolean":
      return value === true || String(value).toLowerCase() === "true" ? "Yes" : "No";
    default:
      return String(value);
  }
}

function addDaysIsoDate(dateOnly, days) {
  const clean = normalizeDateOnly(dateOnly);
  if (!clean) return null;
  const ms = Date.parse(`${clean}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  const out = new Date(ms + days * 24 * 60 * 60 * 1000);
  return out.toISOString().slice(0, 10);
}

function computeTrackingStatusForField({ def, rawValue, latestMeterHours, now = new Date() }) {
  if (!def) return null;
  const rule = normalizeTrackingRule(def.rule);
  if (!rule.enabled || rule.ruleType === "none") {
    const missing = def.required && (rawValue === null || rawValue === undefined || rawValue === "");
    return {
      fieldId: def.id,
      label: def.label,
      statusKey: missing ? "missing" : "ok",
      dueAt: null,
      dueAtLabel: null,
      valueLabel: formatTrackingValueForDisplay(def, rawValue),
    };
  }

  const nowDateOnly = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString().slice(0, 10) : null;

  if (rule.ruleType === "manual_due_date") {
    const due = normalizeDateOnly(rawValue);
    if (!due) {
      return {
        fieldId: def.id,
        label: def.label,
        statusKey: "missing",
        dueAt: null,
        dueAtLabel: null,
        valueLabel: "--",
      };
    }
    const overdue = nowDateOnly ? due < nowDateOnly : false;
    const warnDays = rule.warnDays ?? 0;
    const warnAt = warnDays ? addDaysIsoDate(nowDateOnly, warnDays) : null;
    const dueSoon = !overdue && warnAt ? due <= warnAt : false;
    return {
      fieldId: def.id,
      label: def.label,
      statusKey: overdue ? "overdue" : dueSoon ? "dueSoon" : "ok",
      dueAt: due,
      dueAtLabel: due,
      valueLabel: due,
    };
  }

  if (rule.ruleType === "time_interval") {
    const last = normalizeDateOnly(rawValue);
    if (!last || !rule.intervalDays) {
      return {
        fieldId: def.id,
        label: def.label,
        statusKey: "missing",
        dueAt: null,
        dueAtLabel: null,
        valueLabel: last || "--",
      };
    }
    const due = addDaysIsoDate(last, rule.intervalDays);
    if (!due) {
      return {
        fieldId: def.id,
        label: def.label,
        statusKey: "missing",
        dueAt: null,
        dueAtLabel: null,
        valueLabel: last,
      };
    }
    const overdue = nowDateOnly ? due < nowDateOnly : false;
    const warnDays = rule.warnDays ?? 0;
    const warnAt = warnDays ? addDaysIsoDate(nowDateOnly, warnDays) : null;
    const dueSoon = !overdue && warnAt ? due <= warnAt : false;
    return {
      fieldId: def.id,
      label: def.label,
      statusKey: overdue ? "overdue" : dueSoon ? "dueSoon" : "ok",
      dueAt: due,
      dueAtLabel: due,
      valueLabel: last,
    };
  }

  if (rule.ruleType === "meter_interval") {
    const last = asNumber(rawValue);
    if (last === null || !rule.intervalHours) {
      return {
        fieldId: def.id,
        label: def.label,
        statusKey: "missing",
        dueAt: null,
        dueAtLabel: null,
        valueLabel: last === null ? "--" : String(last),
      };
    }
    const dueAt = last + rule.intervalHours;
    const current = asNumber(latestMeterHours);
    if (current === null) {
      return {
        fieldId: def.id,
        label: def.label,
        statusKey: "missing",
        dueAt,
        dueAtLabel: `${dueAt}h`,
        valueLabel: def.unit ? `${last} ${def.unit}` : String(last),
      };
    }
    const overdue = current >= dueAt;
    const warnHours = rule.warnHours ?? 0;
    const dueSoon = !overdue && warnHours ? dueAt - current <= warnHours : false;
    return {
      fieldId: def.id,
      label: def.label,
      statusKey: overdue ? "overdue" : dueSoon ? "dueSoon" : "ok",
      dueAt,
      dueAtLabel: `${dueAt}h`,
      valueLabel: def.unit ? `${last} ${def.unit}` : String(last),
      meterLabel: `${current}h`,
    };
  }

  return null;
}

function worstStatusKey(keys) {
  const set = new Set((keys || []).filter(Boolean));
  if (set.has("overdue")) return "overdue";
  if (set.has("dueSoon")) return "dueSoon";
  if (set.has("missing")) return "missing";
  return set.size ? "ok" : "none";
}

function statusLabelForKey(key) {
  switch (key) {
    case "overdue":
      return "Overdue";
    case "dueSoon":
      return "Due soon";
    case "missing":
      return "Missing data";
    case "ok":
      return "OK";
    default:
      return "--";
  }
}

function computeEquipmentTrackingSummary({ definitions, valuesByFieldId, latestMeterHours, now = new Date() }) {
  const defs = Array.isArray(definitions) ? definitions.map(normalizeTrackingFieldDefinition).filter(Boolean) : [];
  const statuses = defs.map((def) =>
    computeTrackingStatusForField({
      def,
      rawValue: valuesByFieldId ? valuesByFieldId[String(def.id)] : null,
      latestMeterHours,
      now,
    })
  ).filter(Boolean);

  const needs = statuses
    .filter((s) => s.statusKey === "overdue" || s.statusKey === "dueSoon" || s.statusKey === "missing")
    .map((s) => {
      if (s.statusKey === "missing") return `${s.label}: missing`;
      if (s.statusKey === "overdue") return `${s.label}: overdue`;
      return `${s.label}: due soon`;
    });

  const overallKey = worstStatusKey(statuses.map((s) => s.statusKey));
  return {
    overallStatusKey: overallKey,
    overallStatusLabel: statusLabelForKey(overallKey),
    needs,
    statuses,
  };
}

module.exports = {
  TRACKING_DATA_TYPES,
  TRACKING_RULE_TYPES,
  normalizeTrackingRule,
  normalizeTrackingFieldDefinition,
  normalizeDateOnly,
  normalizeDatetime,
  formatTrackingValueForDisplay,
  computeTrackingStatusForField,
  computeEquipmentTrackingSummary,
  statusLabelForKey,
  worstStatusKey,
};
