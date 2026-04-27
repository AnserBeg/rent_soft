function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(csvEscape).join(',');
  const body = rows.map(row => columns.map(col => csvEscape(row[col])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

module.exports = { rowsToCsv };
