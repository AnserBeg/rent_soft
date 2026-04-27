const companyMeta = document.getElementById("ai-analytics-company-meta");
const questionInput = document.getElementById("ai-analytics-question");
const maxRowsInput = document.getElementById("ai-analytics-max-rows");
const runButton = document.getElementById("ai-analytics-run");
const newChatButton = document.getElementById("ai-analytics-new-chat");
const downloadButton = document.getElementById("ai-analytics-download");
const statusEl = document.getElementById("ai-analytics-status");
const answerEl = document.getElementById("ai-analytics-answer");
const sqlEl = document.getElementById("ai-analytics-sql");
const countEl = document.getElementById("ai-analytics-count");
const tableEl = document.getElementById("ai-analytics-table");
const chartCanvas = document.getElementById("ai-analytics-chart");
const chartTypeSelect = document.getElementById("ai-analytics-chart-type");
const xSelect = document.getElementById("ai-analytics-x");
const yAggSelect = document.getElementById("ai-analytics-y-agg");
const yFieldSelect = document.getElementById("ai-analytics-y-field");
const topNInput = document.getElementById("ai-analytics-topn");
const workspaceEl = document.getElementById("ai-analytics-workspace");
const columnResizer = document.getElementById("ai-analytics-column-resizer");
const rowResizer = document.getElementById("ai-analytics-row-resizer");

let rows = [];
let columns = [];
let csvText = "";
let chart = null;
let lastQuestion = "";
let pendingClarification = null;
let pendingQuestion = "";
let messages = [];
let messageSeq = 0;

function setStatus(message) {
  if (statusEl) statusEl.textContent = String(message || "");
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function base64ToUtf8(value) {
  const binary = atob(String(value || ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function fmtCount(n) {
  const count = Number(n || 0);
  return `${count} row${count === 1 ? "" : "s"}`;
}

function allColumns() {
  if (columns.length) return columns;
  const keys = new Set();
  rows.slice(0, 80).forEach((row) => Object.keys(row || {}).forEach((key) => keys.add(key)));
  return Array.from(keys.values());
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resetResultData() {
  rows = [];
  columns = [];
  csvText = "";
  if (countEl) countEl.textContent = "0 rows";
  if (downloadButton) downloadButton.disabled = true;
  renderTable();
  renderChart();
}

function updateMessage(id, patch) {
  const message = messages.find((item) => item.id === id);
  if (!message) return;
  Object.assign(message, patch || {});
  renderMessages();
}

function addMessage(role, content, extras = {}) {
  const message = {
    id: `msg-${++messageSeq}`,
    role,
    content: String(content || ""),
    createdAt: new Date().toISOString(),
    ...extras,
  };
  messages.push(message);
  renderMessages();
  return message.id;
}

function renderMessages() {
  if (!answerEl) return;
  answerEl.innerHTML = "";
  answerEl.classList.toggle("hint", messages.length === 0);

  if (!messages.length) {
    answerEl.textContent = "Start a chat to query company analytics.";
    return;
  }

  const transcript = document.createElement("div");
  transcript.className = "ai-analytics-transcript";

  messages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = `ai-analytics-message ${message.role}`;

    const content = document.createElement("div");
    content.className = "ai-analytics-message-content";
    content.textContent = message.content;
    bubble.appendChild(content);

    if (message.meta) {
      const meta = document.createElement("div");
      meta.className = "ai-analytics-message-meta";
      meta.textContent = message.meta;
      bubble.appendChild(meta);
    }

    if (message.clarification && message.active !== false) {
      bubble.appendChild(buildClarificationControls(message.clarification));
    }

    transcript.appendChild(bubble);
  });

  answerEl.appendChild(transcript);
  answerEl.scrollTop = answerEl.scrollHeight;
}

function buildClarificationControls(clarification) {
  const wrap = document.createElement("div");
  wrap.className = "ai-analytics-clarification";

  const options = Array.isArray(clarification?.options) ? clarification.options : [];
  if (options.length) {
    const optionWrap = document.createElement("div");
    optionWrap.className = "ai-analytics-clarification-options";
    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost";
      button.textContent = String(option?.label || option?.value || "Option");
      button.addEventListener("click", () => {
        submitClarification({
          question: clarification.question,
          value: String(option?.value || ""),
          answer: String(option?.label || option?.value || ""),
        });
      });
      optionWrap.appendChild(button);
    });
    wrap.appendChild(optionWrap);
  }

  const fallback = document.createElement("form");
  fallback.className = "ai-analytics-clarification-freeform";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Or type a clarification";
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "primary";
  send.textContent = "Continue";
  fallback.appendChild(input);
  fallback.appendChild(send);
  fallback.addEventListener("submit", (event) => {
    event.preventDefault();
    const answer = String(input.value || "").trim();
    if (!answer) return;
    submitClarification({ question: clarification.question, answer });
  });
  wrap.appendChild(fallback);

  return wrap;
}

function renderSql(sql) {
  if (!sqlEl) return;
  sqlEl.textContent = String(sql || "");
}

function renderTable() {
  if (!tableEl) return;
  tableEl.innerHTML = "";
  const cols = allColumns();
  if (!cols.length) return;

  const head = document.createElement("div");
  head.className = "table-row table-header";
  head.style.gridTemplateColumns = `repeat(${Math.max(1, cols.length)}, 180px)`;
  cols.forEach((col) => {
    const span = document.createElement("span");
    span.textContent = col;
    head.appendChild(span);
  });
  tableEl.appendChild(head);

  rows.slice(0, 200).forEach((rowData) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.style.gridTemplateColumns = head.style.gridTemplateColumns;
    cols.forEach((col) => {
      const span = document.createElement("span");
      span.textContent = safeText(rowData?.[col]);
      row.appendChild(span);
    });
    tableEl.appendChild(row);
  });
}

function setSelectOptions(select, options) {
  if (!select) return;
  select.innerHTML = "";
  options.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

function rebuildChartOptions(suggestion) {
  const cols = allColumns();
  const numericCols = cols.filter((col) => rows.some((row) => toNumber(row?.[col]) !== null));
  setSelectOptions(xSelect, cols);
  setSelectOptions(yFieldSelect, numericCols);

  if (suggestion?.type && chartTypeSelect?.querySelector(`option[value="${suggestion.type}"]`)) {
    chartTypeSelect.value = suggestion.type;
  }
  if (suggestion?.x && cols.includes(suggestion.x)) xSelect.value = suggestion.x;
  if (suggestion?.y && numericCols.includes(suggestion.y)) yFieldSelect.value = suggestion.y;

  if (!xSelect.value && cols.length) xSelect.value = cols[0];
  if (!yFieldSelect.value && numericCols.length) yFieldSelect.value = numericCols[0];
  if (suggestion?.aggregation && yAggSelect?.querySelector(`option[value="${suggestion.aggregation}"]`)) {
    yAggSelect.value = suggestion.aggregation;
  } else if (numericCols.length && yFieldSelect.value) {
    yAggSelect.value = "sum";
  }
  if (
    yAggSelect?.value === "count" &&
    yFieldSelect?.value &&
    numericCols.includes(yFieldSelect.value) &&
    xSelect?.value !== yFieldSelect.value
  ) {
    yAggSelect.value = "sum";
  }
  syncYFieldState();
}

function colorAt(index) {
  const palette = [
    [37, 99, 235],
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
    [168, 85, 247],
    [14, 165, 233],
    [236, 72, 153],
    [34, 197, 94],
    [99, 102, 241],
    [234, 88, 12],
  ];
  const [r, g, b] = palette[index % palette.length];
  return { r, g, b };
}

function renderChart() {
  if (!chartCanvas || typeof Chart === "undefined") return;
  if (chart) {
    chart.destroy();
    chart = null;
  }
  if (!rows.length) return;

  const xField = String(xSelect?.value || "");
  const agg = String(yAggSelect?.value || "count");
  const yField = String(yFieldSelect?.value || "");
  const topN = Math.max(1, Math.min(50, Number(topNInput?.value) || 12));
  if (!xField) return;
  if ((agg === "sum" || agg === "avg") && !yField) return;

  const grouped = new Map();
  rows.forEach((row) => {
    const key = safeText(row?.[xField]) || "--";
    if (!grouped.has(key)) grouped.set(key, { count: 0, sum: 0, sumCount: 0 });
    const current = grouped.get(key);
    current.count += 1;
    if (agg === "sum" || agg === "avg") {
      const n = toNumber(row?.[yField]);
      if (n !== null) {
        current.sum += n;
        current.sumCount += 1;
      }
    }
  });

  const items = Array.from(grouped.entries()).map(([label, value]) => ({
    label,
    value: agg === "count" ? value.count : agg === "sum" ? value.sum : value.sumCount ? value.sum / value.sumCount : 0,
  }));
  items.sort((a, b) => b.value - a.value);
  const sliced = items.slice(0, topN);
  const labels = sliced.map((item) => item.label);
  const values = sliced.map((item) => item.value);
  const type = String(chartTypeSelect?.value || "bar");
  const colors = labels.map((_, index) => {
    const c = colorAt(index);
    return `rgba(${c.r}, ${c.g}, ${c.b}, 0.65)`;
  });

  chart = new Chart(chartCanvas.getContext("2d"), {
    type,
    data: {
      labels,
      datasets: [
        {
          label: agg === "count" ? "Count" : agg === "sum" ? `Sum(${yField})` : `Avg(${yField})`,
          data: values,
          backgroundColor: type === "line" ? "rgba(37, 99, 235, 0.18)" : colors,
          borderColor: type === "line" ? "rgba(37, 99, 235, 0.8)" : colors.map((color) => color.replace("0.65", "0.9")),
          borderWidth: 1,
          tension: 0.25,
          fill: type === "line",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: type === "pie" || type === "doughnut", position: "bottom" } },
      scales:
        type === "pie" || type === "doughnut"
          ? {}
          : {
              x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
              y: { beginAtZero: true },
            },
    },
  });
}

function syncYFieldState() {
  const needsField = yAggSelect?.value === "sum" || yAggSelect?.value === "avg";
  if (yFieldSelect) yFieldSelect.disabled = !needsField;
}

async function submitClarification(clarification) {
  if (!pendingQuestion) return;
  messages.forEach((message) => {
    if (message.clarification) message.active = false;
  });
  addMessage("user", clarification?.answer || clarification?.value || "Clarification provided");
  await runQuery({ clarification, questionOverride: pendingQuestion, appendUser: false });
}

function buildContextualQuestion(question) {
  const cleanQuestion = String(question || "").trim();
  const previous = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-8)
    .map((message) => `${message.role === "user" ? "User" : "AI"}: ${message.content}`)
    .join("\n");

  if (!previous) return cleanQuestion;
  return `Conversation so far:\n${previous}\n\nLatest user message:\n${cleanQuestion}`;
}

function newChat() {
  messages = [];
  pendingClarification = null;
  pendingQuestion = "";
  lastQuestion = "";
  if (questionInput) questionInput.value = "";
  renderMessages();
  renderSql("");
  resetResultData();
  setStatus("New chat ready.");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setupResizablePanels() {
  if (!workspaceEl) return;

  const startDrag = (event, mode) => {
    if (window.matchMedia?.("(max-width: 900px)")?.matches) return;
    event.preventDefault();
    const rect = workspaceEl.getBoundingClientRect();
    const move = (moveEvent) => {
      if (mode === "column") {
        const leftWidth = clamp(moveEvent.clientX - rect.left, 420, rect.width - 360);
        workspaceEl.style.setProperty("--ai-analytics-left-width", `${leftWidth}px`);
      } else {
        const topHeight = clamp(moveEvent.clientY - rect.top, 260, rect.height - 240);
        workspaceEl.style.setProperty("--ai-analytics-chart-height", `${topHeight}px`);
      }
      renderChart();
    };
    const stop = () => {
      document.body.classList.remove("ai-analytics-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    document.body.classList.add("ai-analytics-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  columnResizer?.addEventListener("pointerdown", (event) => startDrag(event, "column"));
  rowResizer?.addEventListener("pointerdown", (event) => startDrag(event, "row"));
}

async function runQuery({ clarification = null, questionOverride = "", appendUser = true } = {}) {
  const question = String(questionOverride || questionInput?.value || "").trim();
  if (!question) {
    setStatus("Enter a question first.");
    questionInput?.focus();
    return;
  }

  lastQuestion = question;
  const requestQuestion = clarification ? question : buildContextualQuestion(question);
  if (!clarification) {
    pendingQuestion = requestQuestion;
    pendingClarification = null;
  }
  if (appendUser) {
    addMessage("user", question);
    if (questionInput) questionInput.value = "";
  }
  const thinkingId = addMessage("assistant", "Thinking...", { pending: true });
  runButton.disabled = true;
  downloadButton.disabled = true;
  setStatus("Thinking...");
  renderSql("");
  resetResultData();

  try {
    const maxRows = Math.max(1, Math.min(1000, Number(maxRowsInput?.value) || 250));
    const res = await fetch("/api/ai-analytics/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: requestQuestion, maxRows, clarification }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

    if (data.status === "clarification_required") {
      pendingQuestion = requestQuestion;
      pendingClarification = data.clarification || null;
      renderSql("");
      resetResultData();
      updateMessage(thinkingId, {
        content: String(pendingClarification?.question || "Can you clarify what you mean?"),
        clarification: pendingClarification,
        pending: false,
      });
      setStatus("Clarification needed.");
      return;
    }

    if (data.status === "blocked") {
      pendingClarification = null;
      pendingQuestion = "";
      renderSql("");
      resetResultData();
      updateMessage(thinkingId, {
        content: data.answer || "That request is outside the read-only analytics scope.",
        pending: false,
      });
      setStatus("Request blocked.");
      return;
    }

    pendingClarification = null;
    pendingQuestion = "";
    rows = Array.isArray(data.rows) ? data.rows : [];
    columns = Array.isArray(data.columns) ? data.columns : [];
    csvText = data.csvEncoding === "base64" ? base64ToUtf8(data.csv || "") : String(data.csv || "");
    renderSql(data.sql || "");
    renderTable();
    rebuildChartOptions(data.chart || null);
    renderChart();
    if (countEl) countEl.textContent = fmtCount(data.rowCount ?? rows.length);
    downloadButton.disabled = !csvText;
    updateMessage(thinkingId, {
      content: data.answer || "No answer returned.",
      meta: `${fmtCount(data.rowCount ?? rows.length)} returned`,
      pending: false,
    });
    setStatus(`Ready. ${fmtCount(data.rowCount ?? rows.length)} returned.`);
  } catch (error) {
    updateMessage(thinkingId, {
      content: error?.message || "AI Analytics request failed.",
      pending: false,
    });
    resetResultData();
    setStatus("Request failed.");
  } finally {
    runButton.disabled = false;
  }
}

function downloadCsv() {
  if (!csvText) return;
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const slug = lastQuestion.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "query";
  a.href = url;
  a.download = `rent-soft-ai-analytics-${slug}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function init() {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (companyMeta) {
    companyMeta.textContent = companyId
      ? `Using ${session?.company?.name || `company #${companyId}`}`
      : "Log in to use AI Analytics.";
  }
  runButton?.addEventListener("click", () => runQuery());
  newChatButton?.addEventListener("click", newChat);
  downloadButton?.addEventListener("click", downloadCsv);
  questionInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) runQuery();
  });
  [chartTypeSelect, xSelect, yFieldSelect, topNInput].filter(Boolean).forEach((el) => {
    el.addEventListener("change", () => renderChart());
  });
  yAggSelect?.addEventListener("change", () => {
    syncYFieldState();
    renderChart();
  });
  setupResizablePanels();
  renderMessages();
}

init();
