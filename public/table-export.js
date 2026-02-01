(function () {
  if (window.location.pathname.endsWith("/qbo-customers.html")) return;

  const CSV_MIME = "text/csv;charset=utf-8;";

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    const raw = typeof value === "string" ? value : String(value);
    return raw.replace(/\s+/g, " ").trim();
  }

  function csvEscape(value) {
    const text = normalizeText(value);
    if (text === "") return "";
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function isVisibleRow(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return false;
    if (el.offsetParent === null && el !== document.body) return false;
    return true;
  }

  function getCellText(cell) {
    if (!cell) return "";
    const raw = typeof cell.innerText === "string" ? cell.innerText : cell.textContent;
    return normalizeText(raw || "");
  }

  function getDivTableData(tableEl) {
    const headerRow = tableEl.querySelector(".table-row.table-header");
    const headerCells = headerRow ? Array.from(headerRow.children) : [];
    const headers = headerCells.map(getCellText);
    const rowEls = Array.from(tableEl.querySelectorAll(".table-row:not(.table-header)"))
      .filter(isVisibleRow);

    let columnCount = headers.length;
    if (!columnCount && rowEls.length) {
      columnCount = rowEls.reduce((max, row) => Math.max(max, row.children.length), 0);
    }

    const rows = rowEls.map((row) => {
      const cells = Array.from(row.children);
      const values = cells.map(getCellText);
      if (columnCount > 0) {
        if (values.length < columnCount) {
          return values.concat(Array(columnCount - values.length).fill(""));
        }
        return values.slice(0, columnCount);
      }
      return values;
    });

    const finalHeaders = headers.length ? headers : Array(columnCount).fill("");
    return { headers: finalHeaders, rows };
  }

  function getHtmlTableData(tableEl) {
    const headerCells = Array.from(tableEl.querySelectorAll("thead th"));
    const headers = headerCells.map(getCellText);
    const rowEls = Array.from(tableEl.querySelectorAll("tbody tr"))
      .filter(isVisibleRow);

    let columnCount = headers.length;
    if (!columnCount && rowEls.length) {
      columnCount = rowEls.reduce((max, row) => Math.max(max, row.children.length), 0);
    }

    const rows = rowEls.map((row) => {
      const cells = Array.from(row.children);
      const values = cells.map(getCellText);
      if (columnCount > 0) {
        if (values.length < columnCount) {
          return values.concat(Array(columnCount - values.length).fill(""));
        }
        return values.slice(0, columnCount);
      }
      return values;
    });

    const finalHeaders = headers.length ? headers : Array(columnCount).fill("");
    return { headers: finalHeaders, rows };
  }

  function buildCsv({ headers, rows }) {
    const lines = [];
    if (headers && headers.length) {
      lines.push(headers.map(csvEscape).join(","));
    }
    rows.forEach((row) => {
      lines.push(row.map(csvEscape).join(","));
    });
    return lines.join("\r\n");
  }

  function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: CSV_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function slugify(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "table";
  }

  function inferFilename(tableEl, titleHint) {
    const base = slugify(titleHint || tableEl.id || "table");
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return `rentsoft-${base}-${stamp}.csv`;
  }

  function exportTable(tableEl, titleHint) {
    if (!tableEl) return;
    const isHtmlTable = tableEl.tagName === "TABLE";
    const data = isHtmlTable ? getHtmlTableData(tableEl) : getDivTableData(tableEl);
    const csv = buildCsv(data);
    const filename = inferFilename(tableEl, titleHint);
    downloadCsv(csv, filename);
  }

  function ensureInlineContainer(headEl) {
    if (!headEl) return null;
    const existing = headEl.querySelector(".inline") || headEl.querySelector(".inline-actions");
    if (existing) return existing;
    const container = document.createElement("div");
    container.className = "inline-actions";
    headEl.appendChild(container);
    return container;
  }

  function addExportButton(anchorEl, tableEl, titleHint) {
    if (!anchorEl || !tableEl) return;
    if (tableEl.dataset.exportBound === "true") return;
    tableEl.dataset.exportBound = "true";

    const button = document.createElement("button");
    button.className = "ghost";
    button.type = "button";
    button.textContent = "Export CSV";
    button.addEventListener("click", () => exportTable(tableEl, titleHint));
    anchorEl.appendChild(button);
  }

  function addForTableShell(shell) {
    const tableEl = shell.querySelector(".table");
    if (!tableEl) return;
    const head = shell.querySelector(".table-head");
    const title = head?.querySelector("p")?.innerText || "";
    const anchor = ensureInlineContainer(head || shell);
    addExportButton(anchor, tableEl, title);
  }

  function addForTableWrap(wrap) {
    const tableEl = wrap.querySelector("table");
    if (!tableEl) return;
    const section = wrap.closest("section");
    const head = section?.querySelector(".card-header");
    const title = head?.querySelector("h2")?.innerText || "";
    const anchor = ensureInlineContainer(head || wrap);
    addExportButton(anchor, tableEl, title);
  }

  function init() {
    document.querySelectorAll(".table-shell").forEach(addForTableShell);
    document.querySelectorAll(".table-wrap").forEach(addForTableWrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains("table-shell")) addForTableShell(node);
        if (node.classList.contains("table-wrap")) addForTableWrap(node);
        node.querySelectorAll?.(".table-shell").forEach(addForTableShell);
        node.querySelectorAll?.(".table-wrap").forEach(addForTableWrap);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
