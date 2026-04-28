(() => {
  const STORAGE_OPEN_KEY = "rentSoft.aiChatOpen";
  const STORAGE_WIDTH_KEY = "rentSoft.aiChatWidth";
  const STORAGE_SCREENSHOT_KEY = "rentSoft.aiChatIncludeScreenshots";
  const MIN_WIDTH = 320;
  const MAX_WIDTH = 720;
  const DEFAULT_WIDTH = 420;

  if (window.RentSoftAiAgent?.mounted) return;

  function clampWidth(width) {
    const value = Number(width);
    if (!Number.isFinite(value)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
  }

  function getStoredWidth() {
    return clampWidth(localStorage.getItem(STORAGE_WIDTH_KEY) || DEFAULT_WIDTH);
  }

  function getStoredOpen() {
    return localStorage.getItem(STORAGE_OPEN_KEY) === "true";
  }

  function getStoredIncludeScreenshots() {
    return localStorage.getItem(STORAGE_SCREENSHOT_KEY) === "true";
  }

  function setOpenState(isOpen) {
    document.body.classList.toggle("ai-chat-open", Boolean(isOpen));
    localStorage.setItem(STORAGE_OPEN_KEY, isOpen ? "true" : "false");
  }

  function setWidth(width) {
    const next = clampWidth(width);
    document.documentElement.style.setProperty("--ai-chat-width", `${next}px`);
    localStorage.setItem(STORAGE_WIDTH_KEY, String(next));
  }

  function createMessageHtml(message) {
    const shell = document.createElement("div");
    shell.className = `ai-chat-message ${message.role}`;
    if (message.role === "assistant") {
      const text = document.createElement("div");
      text.className = "ai-chat-message-text";
      text.textContent = message.text;
      shell.appendChild(text);

      if (message.imageUrl) {
        const link = document.createElement("a");
        link.href = message.imageUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.className = "ai-chat-image-link";
        const img = document.createElement("img");
        img.className = "ai-chat-image";
        img.src = message.imageUrl;
        img.alt = message.targetLabel ? `Annotated screenshot for ${message.targetLabel}` : "Annotated screenshot";
        link.appendChild(img);
        shell.appendChild(link);
      }

      if (message.meta) {
        const meta = document.createElement("div");
        meta.className = "ai-chat-message-meta";
        meta.textContent = message.meta;
        shell.appendChild(meta);
      }
    } else {
      shell.textContent = message.text;
    }
    return shell;
  }

  function mountAgent() {
    const appShell = document.querySelector(".app-shell");
    const sidebar = document.querySelector(".sidebar");
    const session = window.RentSoft?.getSession?.();
    if (!appShell || !sidebar || !session?.company?.id) return;

    const root = document.createElement("div");
    root.className = "ai-chat-root";
    root.innerHTML = `
      <button class="ai-chat-bubble" id="ai-chat-bubble" type="button" aria-label="Open support chat">
        <span class="ai-chat-bubble-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v3"></path>
            <path d="M18.5 7.5l-2.1 2.1"></path>
            <path d="M21 14h-3"></path>
            <path d="M5.5 7.5l2.1 2.1"></path>
            <path d="M3 14h3"></path>
            <rect x="7" y="9" width="10" height="9" rx="3"></rect>
            <path d="M10 13h.01"></path>
            <path d="M14 13h.01"></path>
            <path d="M10.5 16h3"></path>
          </svg>
        </span>
        <span class="ai-chat-bubble-copy">
          <span class="ai-chat-bubble-label">Support</span>
          <span class="ai-chat-bubble-subtitle">Ask the guide</span>
        </span>
      </button>
      <aside class="ai-chat-panel" aria-label="Support chat" aria-hidden="true">
        <div class="ai-chat-resize-handle" id="ai-chat-resize-handle" aria-hidden="true"></div>
        <div class="ai-chat-header">
          <div class="ai-chat-title-block">
            <span class="ai-chat-header-mark" aria-hidden="true">AI</span>
            <div>
              <h2>Support</h2>
              <p class="hint" id="ai-chat-header-meta">Answers from the latest uploaded manual.</p>
            </div>
          </div>
          <div class="ai-chat-header-actions">
            <span class="ai-chat-status-pill" id="ai-chat-status-pill">Guide</span>
            <button class="icon-button" id="ai-chat-close" type="button" aria-label="Close support chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="ai-chat-toolbar">
          <label class="ai-chat-switch">
            <input type="checkbox" id="ai-chat-include-screenshots" />
            <span></span>
            Screenshots
          </label>
        </div>
        <div class="ai-chat-messages" id="ai-chat-messages">
          <div class="ai-chat-empty">
            <div class="ai-chat-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
                <path d="M8 9h8"></path>
                <path d="M8 13h5"></path>
              </svg>
            </div>
            <h3>Ask about any workflow</h3>
            <p class="hint">Rental orders, assets, invoices, settings, and other documented workflows.</p>
          </div>
        </div>
        <form class="ai-chat-form" id="ai-chat-form">
          <div class="ai-chat-composer">
            <textarea id="ai-chat-input" rows="3" placeholder="Ask how to do something in the app." required></textarea>
            <button class="primary ai-chat-send" id="ai-chat-send" type="submit" aria-label="Send message">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 2L11 13"></path>
                <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
              </svg>
            </button>
          </div>
        </form>
      </aside>
    `;
    document.body.appendChild(root);

    const bubble = root.querySelector("#ai-chat-bubble");
    const panel = root.querySelector(".ai-chat-panel");
    const closeButton = root.querySelector("#ai-chat-close");
    const resizeHandle = root.querySelector("#ai-chat-resize-handle");
    const headerMeta = root.querySelector("#ai-chat-header-meta");
    const statusPill = root.querySelector("#ai-chat-status-pill");
    const messages = root.querySelector("#ai-chat-messages");
    const form = root.querySelector("#ai-chat-form");
    const input = root.querySelector("#ai-chat-input");
    const sendButton = root.querySelector("#ai-chat-send");
    const includeScreenshots = root.querySelector("#ai-chat-include-screenshots");

    const state = {
      loadingManual: false,
      sending: false,
      manual: null,
    };

    function syncPanelState() {
      const isOpen = document.body.classList.contains("ai-chat-open");
      panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
      bubble.hidden = isOpen;
    }

    function appendMessage(message) {
      messages.querySelector(".ai-chat-empty")?.remove();
      messages.appendChild(createMessageHtml(message));
      messages.scrollTop = messages.scrollHeight;
    }

    function replaceLastAssistantMessage(message) {
      const last = messages.lastElementChild;
      if (last && last.classList.contains("assistant")) {
        last.replaceWith(createMessageHtml(message));
      } else {
        appendMessage(message);
      }
      messages.scrollTop = messages.scrollHeight;
    }

    async function loadActiveManual() {
      if (state.loadingManual) return;
      state.loadingManual = true;
      try {
        const res = await fetch("/api/support-agent/active-manual");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Support manual not available.");
        state.manual = data.manual || null;
        headerMeta.textContent = state.manual
          ? `Using ${state.manual.name}`
          : "Answers from the latest uploaded manual.";
        statusPill.textContent = state.manual ? "Ready" : "Guide";
        statusPill.classList.toggle("is-ready", Boolean(state.manual));
      } catch (error) {
        state.manual = null;
        headerMeta.textContent = error?.message ? String(error.message) : "Support manual not available.";
        statusPill.textContent = "Offline";
        statusPill.classList.remove("is-ready");
      } finally {
        state.loadingManual = false;
      }
    }

    async function sendMessage(event) {
      event.preventDefault();
      if (state.sending) return;
      const question = String(input.value || "").trim();
      if (!question) return;

      state.sending = true;
      sendButton.disabled = true;
      input.disabled = true;
      appendMessage({ role: "user", text: question });
      input.value = "";
      appendMessage({ role: "assistant", text: "Thinking..." });

      try {
        const res = await fetch("/api/support-agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            includeScreenshots: includeScreenshots.checked,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to reach support chat.");
        state.manual = data.manual || state.manual;
        if (state.manual?.name) {
          headerMeta.textContent = `Using ${state.manual.name}`;
          statusPill.textContent = "Ready";
          statusPill.classList.add("is-ready");
        }
        const meta = !data.includeScreenshots
          ? "Screenshots off"
          : data.chosenScreenshot
            ? `${data.chosenScreenshot}${data.targetLabel ? ` - ${data.targetLabel}` : ""}`
            : "No screenshot selected";
        replaceLastAssistantMessage({
          role: "assistant",
          text: data.answer || "No answer returned.",
          imageUrl: data.annotatedImageUrl || data.originalImageUrl || "",
          targetLabel: data.targetLabel || "",
          meta,
        });
      } catch (error) {
        replaceLastAssistantMessage({
          role: "assistant",
          text: error?.message ? String(error.message) : "Unable to reach support chat.",
          meta: "Request failed",
        });
      } finally {
        state.sending = false;
        sendButton.disabled = false;
        input.disabled = false;
        input.focus();
      }
    }

    function openPanel() {
      setOpenState(true);
      syncPanelState();
      loadActiveManual();
      input.focus();
    }

    function closePanel() {
      setOpenState(false);
      syncPanelState();
    }

    bubble.addEventListener("click", openPanel);
    closeButton.addEventListener("click", closePanel);
    form.addEventListener("submit", sendMessage);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    includeScreenshots.checked = getStoredIncludeScreenshots();
    includeScreenshots.addEventListener("change", () => {
      localStorage.setItem(STORAGE_SCREENSHOT_KEY, includeScreenshots.checked ? "true" : "false");
    });

    let drag = null;
    resizeHandle.addEventListener("mousedown", (event) => {
      if (window.matchMedia("(max-width: 980px)").matches) return;
      drag = {
        startX: event.clientX,
        startWidth: getStoredWidth(),
      };
      document.body.classList.add("ai-chat-resizing");
      event.preventDefault();
    });

    window.addEventListener("mousemove", (event) => {
      if (!drag) return;
      const nextWidth = drag.startWidth + (drag.startX - event.clientX);
      setWidth(nextWidth);
    });

    window.addEventListener("mouseup", () => {
      if (!drag) return;
      drag = null;
      document.body.classList.remove("ai-chat-resizing");
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("ai-chat-open")) {
        closePanel();
      }
    });

    setWidth(getStoredWidth());
    setOpenState(getStoredOpen());
    syncPanelState();
    loadActiveManual();

    window.RentSoftAiAgent = {
      mounted: true,
      open: openPanel,
      close: closePanel,
    };
  }

  mountAgent();
})();
