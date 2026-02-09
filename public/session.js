(() => {
  const SESSION_KEY = "rentSoft.session";
  const COMPANY_KEY = "rentSoft.companyId";
  const CUSTOMER_TOKEN_KEY = "rentSoft.customerAccountToken";
  const CUSTOMER_KEY = "rentSoft.customerAccount";

  function normalizeCompanyId(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  }

  function setSession(session) {
    if (!session || typeof session !== "object") throw new Error("Invalid session.");
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    const companyId = normalizeCompanyId(session?.company?.id || session?.companyId || session?.user?.companyId);
    if (companyId) setCompanyId(companyId);
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getCustomerToken() {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY);
  }

  function clearCustomerSession() {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
  }

  function setCompanyId(companyId) {
    const normalized = normalizeCompanyId(companyId);
    if (!normalized) return;
    localStorage.setItem(COMPANY_KEY, String(normalized));
  }

  function getCompanyId() {
    const stored = normalizeCompanyId(localStorage.getItem(COMPANY_KEY));
    if (stored) return stored;
    const session = getSession();
    return normalizeCompanyId(session?.company?.id || session?.companyId || session?.user?.companyId);
  }

  function logout({ redirectTo = "index.html" } = {}) {
    const customerToken = getCustomerToken();
    fetch("/api/logout", { method: "POST" }).catch(() => {});
    if (customerToken) {
      fetch("/api/customers/logout", { method: "POST", headers: { Authorization: `Bearer ${customerToken}` } }).catch(() => {});
    }
    clearSession();
    localStorage.removeItem(COMPANY_KEY);
    clearCustomerSession();
    window.location.href = redirectTo;
  }

  function requireAuth() {
    const path = window.location.pathname || "/";
    const isPublic =
      path === "/" ||
      path.endsWith("/index.html") ||
      path.endsWith("/landing.html") ||
      path.endsWith("/signup.html") ||
      path.endsWith("/login.html") ||
      path.endsWith("/style.css") ||
      path.includes("/vendor/") ||
      path.includes("/uploads/");
    if (isPublic) return;

    const session = getSession();
    if (session) return;

    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function refreshSession() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.user?.id && data?.company?.id) {
        setSession(data);
      } else if (res.status === 401) {
        clearSession();
        localStorage.removeItem(COMPANY_KEY);
      }
    } catch {
      // ignore
    }
  }

  function mountLogoutButton({ buttonId = "logout-button", redirectTo = "index.html" } = {}) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener("click", () => logout({ redirectTo }));
  }

  let saveBannerTimer = null;
  let errorBannerTimer = null;
  function showSaveBanner(message = "Saved successfully.") {
    let banner = document.getElementById("save-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "save-banner";
      banner.className = "save-banner";
      document.body.appendChild(banner);
    }
    banner.classList.remove("error");
    banner.textContent = message;
    banner.classList.add("show");
    if (saveBannerTimer) clearTimeout(saveBannerTimer);
    saveBannerTimer = setTimeout(() => {
      banner.classList.remove("show");
    }, 2200);
  }

  function showErrorBanner(message = "Unable to save.") {
    let banner = document.getElementById("error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "error-banner";
      banner.className = "save-banner error";
      document.body.appendChild(banner);
    }
    banner.textContent = message;
    banner.classList.add("show");
    if (errorBannerTimer) clearTimeout(errorBannerTimer);
    errorBannerTimer = setTimeout(() => {
      banner.classList.remove("show");
    }, 2600);
  }

  function getCookieValue(name) {
    const raw = document.cookie || "";
    if (!raw) return "";
    const parts = raw.split(";");
    for (const part of parts) {
      const [key, ...rest] = part.split("=");
      if (String(key || "").trim() !== name) continue;
      return decodeURIComponent(rest.join("=").trim());
    }
    return "";
  }

  function isSameOrigin(url) {
    try {
      const target = new URL(url, window.location.origin);
      return target.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  const nativeFetch = window.fetch?.bind(window);
  if (nativeFetch) {
    window.fetch = async (input, init = {}) => {
      const req = input instanceof Request ? input : null;
      const method = String((init && init.method) || (req && req.method) || "GET").toUpperCase();
      const url = String((req && req.url) || input || "");
      const shouldAttachCsrf =
        !["GET", "HEAD", "OPTIONS"].includes(method) && url.includes("/api/") && isSameOrigin(url);
      const headers = new Headers((init && init.headers) || (req && req.headers) || undefined);
      if (shouldAttachCsrf && !headers.has("X-CSRF-Token")) {
        const token = getCookieValue("rentSoft.csrf");
        if (token) headers.set("X-CSRF-Token", token);
      }

      const res = await nativeFetch(input, { ...init, headers });
      if (
        res.ok &&
        (method === "POST" || method === "PUT" || method === "PATCH") &&
        url.includes("/api/") &&
        !url.includes("/api/uploads") &&
        !url.includes("/api/logout") &&
        !url.includes("/api/customers/logout")
      ) {
        showSaveBanner();
      }
      return res;
    };
  }

  window.RentSoft = {
    getSession,
    setSession,
    clearSession,
    getCompanyId,
    setCompanyId,
    logout,
    requireAuth,
    refreshSession,
    mountLogoutButton,
    showSaveBanner,
    showErrorBanner,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  window.RentSoft?.requireAuth?.();
  window.RentSoft?.refreshSession?.();

  function getCurrentPage() {
    const rawPath = window.location.pathname || "";
    const file = rawPath.split("/").filter(Boolean).at(-1) || "";
    return file || "index.html";
  }

  const session = window.RentSoft?.getSession?.();
  const role = session?.user?.role ? String(session.user.role).trim().toLowerCase() : "";
  const dispatchAllowedPages = new Set([
    "work-orders.html",
    "work-order-form.html",
    "dispatch.html",
    "dispatch-detail.html",
  ]);

  if (role === "dispatch" && !dispatchAllowedPages.has(getCurrentPage())) {
    window.location.href = "dispatch.html";
    return;
  }

  function mountDispatchTopbar() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    const inner = topbar.querySelector(".topbar-inner") || topbar;
    const brand = topbar.querySelector(".topbar-brand");
    if (brand) brand.remove();

    let actions = topbar.querySelector(".topbar-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "topbar-actions";
      inner.appendChild(actions);
    }

    actions.textContent = "";

    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.id = "logout-button";
    logoutBtn.className = "ghost danger";
    logoutBtn.textContent = "Log out";
    actions.appendChild(logoutBtn);

    inner.style.justifyContent = "flex-end";
    window.RentSoft?.mountLogoutButton?.({ buttonId: "logout-button", redirectTo: "index.html" });
  }

  const sidebar = document.querySelector(".sidebar");
  const shell = document.querySelector(".app-shell");
  if (!sidebar || !shell) return;

  if (role === "dispatch") {
    mountDispatchTopbar();
    const navLinks = sidebar.querySelector(".nav-links");
    if (navLinks) {
      const allLinks = Array.from(navLinks.querySelectorAll("a.nav-link[href]"));
      const allowedLinks = allLinks.filter((link) => {
        const href = (link.getAttribute("href") || "").split("#")[0];
        return dispatchAllowedPages.has(href);
      });

      const preferredOrder = ["dispatch.html", "work-orders.html"];
      const linkByHref = new Map();
      allowedLinks.forEach((link) => {
        const href = (link.getAttribute("href") || "").split("#")[0];
        linkByHref.set(href, link);
      });

      navLinks.textContent = "";

      const group = document.createElement("div");
      group.className = "nav-group";
      const used = new Set();
      preferredOrder.forEach((href) => {
        const link = linkByHref.get(href);
        if (link) {
          group.appendChild(link);
          used.add(href);
        }
      });

      allowedLinks.forEach((link) => {
        const href = (link.getAttribute("href") || "").split("#")[0];
        if (!used.has(href)) group.appendChild(link);
      });

      navLinks.appendChild(group);
    }
  }

  const SIDEBAR_COLLAPSE_KEY = "rentSoft.sidebarCollapsed";
  const NAV_GROUP_STATE_KEY = "rentSoft.navGroupState";

  function ensurePurchaseNavGroup() {
    const navLinks = sidebar.querySelector(".nav-links");
    if (!navLinks) return;
    const groups = Array.from(navLinks.querySelectorAll(".nav-group"));
    const hasPurchase = groups.some((group) => {
      const title = group.querySelector(".nav-group-title");
      return String(title?.textContent || "").trim().toLowerCase() === "purchase";
    });
    if (hasPurchase) return;

    const group = document.createElement("div");
    group.className = "nav-group";
    group.innerHTML = `
      <div class="nav-group-title">Purchase</div>
      <a class="nav-link" href="purchase-orders.html">Purchase Orders</a>
      <a class="nav-link" href="vendors.html">Vendors</a>
    `;

    const inventoryGroup = groups.find((g) => {
      const title = g.querySelector(".nav-group-title");
      return String(title?.textContent || "").trim().toLowerCase() === "inventory";
    });
    if (inventoryGroup?.parentElement) {
      inventoryGroup.parentElement.insertBefore(group, inventoryGroup.nextSibling);
    } else {
      navLinks.appendChild(group);
    }
  }

  function ensureMonthlyChargesLink() {
    const navLinks = sidebar.querySelector(".nav-links");
    if (!navLinks) return;

    const targetHref = "customer-monthly-charges.html";
    if (navLinks.querySelector(`a.nav-link[href="${targetHref}"]`)) return;

    const groups = Array.from(navLinks.querySelectorAll(".nav-group"));
    const operationsGroup = groups.find((group) => {
      const titleEl = group.querySelector(".nav-group-title, .nav-group-toggle");
      return String(titleEl?.textContent || "").trim().toLowerCase() === "operations";
    });

    const link = document.createElement("a");
    link.className = "nav-link";
    link.href = targetHref;
    link.textContent = "Monthly Charges";

    if (!operationsGroup) {
      const group = document.createElement("div");
      group.className = "nav-group";
      group.innerHTML = `<div class="nav-group-title">Operations</div>`;
      group.appendChild(link);
      navLinks.appendChild(group);
      return;
    }

    const financeLink = operationsGroup.querySelector('a.nav-link[href="invoices.html"]');
    if (financeLink?.parentElement === operationsGroup) {
      financeLink.insertAdjacentElement("afterend", link);
      return;
    }

    const opsLinks = operationsGroup.querySelector(".nav-group-links") || operationsGroup;
    const rentalOrdersLink = opsLinks.querySelector('a.nav-link[href="rental-orders.html"]');
    if (rentalOrdersLink) {
      rentalOrdersLink.insertAdjacentElement("afterend", link);
      return;
    }

    opsLinks.appendChild(link);
  }

  function setActiveLink() {
    const current = getCurrentPage();
    const links = Array.from(sidebar.querySelectorAll("a.nav-link[href]"));
    const match = links.find((a) => (a.getAttribute("href") || "").split("#")[0] === current);
    links.forEach((a) => {
      const isActive = a === match;
      a.classList.toggle("active", isActive);
      if (isActive) {
        a.setAttribute("aria-current", "page");
      } else {
        a.removeAttribute("aria-current");
      }
    });
  }

  function iconSvg(name) {
    const common = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="nav-icon"`;
    switch (name) {
      case "layout":
        return `<svg ${common}><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect></svg>`;
      case "wrench":
        return `<svg ${common}><path d="M21 3l-6.5 6.5"></path><path d="M14.5 9.5l-4 4"></path><path d="M7 13l-4 4 4 4 4-4"></path><path d="M14 4a5 5 0 0 0 6 6"></path></svg>`;
      case "bar-chart":
        return `<svg ${common}><path d="M4 19V10"></path><path d="M10 19V5"></path><path d="M16 19v-8"></path><path d="M22 19H2"></path></svg>`;
      case "clipboard":
        return `<svg ${common}><path d="M9 4h6"></path><path d="M9 4a2 2 0 0 0-2 2v2h10V6a2 2 0 0 0-2-2"></path><rect x="6" y="8" width="12" height="13" rx="2"></rect></svg>`;
      case "file-text":
        return `<svg ${common}><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path><path d="M8 13h8"></path><path d="M8 17h8"></path></svg>`;
      case "boxes":
        return `<svg ${common}><path d="M7 7h10v10H7z"></path><path d="M7 12h10"></path><path d="M12 7v10"></path></svg>`;
      case "truck":
        return `<svg ${common}><path d="M3 7h11v10H3z"></path><path d="M14 10h4l3 3v4h-7z"></path><circle cx="7" cy="19" r="1.6"></circle><circle cx="18" cy="19" r="1.6"></circle></svg>`;
      case "map-pin":
        return `<svg ${common}><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>`;
      case "users":
        return `<svg ${common}><path d="M17 21v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"></path><circle cx="9.5" cy="8" r="3"></circle><path d="M20 21v-1a3.6 3.6 0 0 0-2.4-3.4"></path><path d="M16.8 5.3a3 3 0 0 1 0 5.4"></path></svg>`;
      case "user-check":
        return `<svg ${common}><circle cx="9" cy="8" r="3"></circle><path d="M2 21v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1"></path><path d="M16 11l2 2 4-4"></path></svg>`;
      case "gear":
        return `<svg ${common}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a7.8 7.8 0 0 0 .1-6"></path><path d="M4.5 9a7.8 7.8 0 0 0 .1 6"></path><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.2 4.2l1.4 1.4"></path><path d="M18.4 18.4l1.4 1.4"></path><path d="M19.8 4.2l-1.4 1.4"></path><path d="M5.6 18.4l-1.4 1.4"></path></svg>`;
      case "credit-card":
        return `<svg ${common}><rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 10h18"></path><path d="M7 15h4"></path></svg>`;
      default:
        return `<svg ${common}><circle cx="12" cy="12" r="9"></circle></svg>`;
    }
  }

  function iconNameForLink(link) {
    const href = (link.getAttribute("href") || "").toLowerCase();
    if (href.includes("dashboard")) return "layout";
    if (href.includes("work-bench")) return "wrench";
    if (href.includes("dispatch")) return "truck";
    if (href.includes("reports")) return "bar-chart";
    if (href.includes("purchase-order") || href.includes("purchase-orders")) return "clipboard";
    if (href.includes("rental-orders")) return "clipboard";
    if (href.includes("work-orders")) return "file-text";
    if (href.includes("rental-quotes")) return "file-text";
    if (href.includes("monthly-charges")) return "credit-card";
    if (href.includes("equipment")) return "boxes";
    if (href.includes("parts")) return "boxes";
    if (href.includes("types")) return "truck";
    if (href.includes("locations") || href.includes("location")) return "map-pin";
    if (href.includes("customers")) return "users";
    if (href.includes("vendors") || href.includes("vendor")) return "users";
    if (href.includes("sales-people") || href.includes("sales-person")) return "user-check";
    if (href.includes("settings")) return "gear";
    if (href.includes("accounts")) return "credit-card";
    return "dot";
  }

  function mountNavGroupToggles() {
    const groups = Array.from(sidebar.querySelectorAll(".nav-group"));
    if (!groups.length) return;

    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(NAV_GROUP_STATE_KEY) || "null");
    } catch {
      stored = null;
    }
    const state = stored && typeof stored === "object" ? stored : {};

    const current = getCurrentPage();

    function keyForTitle(raw) {
      return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-_]/g, "");
    }

    function setCollapsed(group, collapsed) {
      group.classList.toggle("is-collapsed", collapsed);
      const btn = group.querySelector("button.nav-group-toggle");
      if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    groups.forEach((group, idx) => {
      const titleEl = group.querySelector(".nav-group-title");
      if (!titleEl) return;

      const titleText = (titleEl.textContent || "").trim() || `Group ${idx + 1}`;
      const groupKey = keyForTitle(titleText) || `group-${idx + 1}`;
      group.dataset.groupKey = groupKey;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-group-title nav-group-toggle";
      btn.textContent = titleText;

      const links = Array.from(group.querySelectorAll(":scope > a.nav-link"));
      const linksWrap = document.createElement("div");
      linksWrap.className = "nav-group-links";
      linksWrap.id = `nav-group-${groupKey}-${idx + 1}`;
      links.forEach((a) => linksWrap.appendChild(a));

      btn.setAttribute("aria-controls", linksWrap.id);
      btn.setAttribute("aria-expanded", "true");

      titleEl.replaceWith(btn);
      group.appendChild(linksWrap);

      const hasActive = links.some((a) => (a.getAttribute("href") || "").split("#")[0] === current);
      const storedValue = Object.prototype.hasOwnProperty.call(state, groupKey) ? state[groupKey] : undefined;
      const collapsed = typeof storedValue === "boolean" ? storedValue : !hasActive;
      setCollapsed(group, collapsed);

      btn.addEventListener("click", () => {
        const nextCollapsed = !group.classList.contains("is-collapsed");
        setCollapsed(group, nextCollapsed);
        state[groupKey] = nextCollapsed;
        localStorage.setItem(NAV_GROUP_STATE_KEY, JSON.stringify(state));
      });
    });
  }

  function mountNavIcons() {
    const links = Array.from(sidebar.querySelectorAll("a.nav-link"));
    links.forEach((link) => {
      if (link.querySelector(".nav-icon")) return;
      const label = (link.textContent || "").trim();
      if (!label) return;

      const badgeValue = (link.getAttribute("data-badge") || "").trim();
      const badgeLabel = (link.getAttribute("data-badge-label") || "").trim();

      link.textContent = "";
      link.insertAdjacentHTML("afterbegin", iconSvg(iconNameForLink(link)));

      const span = document.createElement("span");
      span.className = "nav-label";
      span.textContent = label;
      link.appendChild(span);

      if (badgeValue) {
        const badge = document.createElement("span");
        badge.className = "nav-badge";
        badge.textContent = badgeValue;
        if (badgeLabel) badge.setAttribute("aria-label", badgeLabel);
        link.appendChild(badge);
      }

      link.setAttribute("title", label);
      if (!link.getAttribute("aria-label")) link.setAttribute("aria-label", label);
    });
  }

  function mountSidebarCollapse() {
    const isMobile = window.matchMedia?.("(max-width: 980px)")?.matches;
    if (isMobile) return;

    const stored = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    const collapsed = stored === "true";
    document.body.classList.toggle("sidebar-collapsed", collapsed);

    const footer = document.createElement("div");
    footer.className = "sidebar-footer";
    footer.innerHTML = `
      <button type="button" class="sidebar-toggle" id="sidebar-collapse-toggle" aria-label="Toggle sidebar collapse" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="width:18px;height:18px;">
          <path d="M10 6l-6 6 6 6"></path>
          <path d="M20 6v12"></path>
        </svg>
      </button>
    `;

    sidebar.appendChild(footer);

    const btn = footer.querySelector("#sidebar-collapse-toggle");
    const sync = () => {
      const isCollapsed = document.body.classList.contains("sidebar-collapsed");
      btn?.setAttribute("aria-pressed", isCollapsed ? "true" : "false");
      btn?.setAttribute("title", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
    };

    btn?.addEventListener("click", () => {
      const next = !document.body.classList.contains("sidebar-collapsed");
      document.body.classList.toggle("sidebar-collapsed", next);
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      sync();
    });

    sync();
  }

  function mountNavScrollPersistence() {
    const navLinks = sidebar.querySelector(".nav-links");
    if (!navLinks) return;

    const NAV_SCROLL_KEY = "rentSoft.navScrollTop";
    const stored = Number(localStorage.getItem(NAV_SCROLL_KEY));
    if (Number.isFinite(stored)) {
      navLinks.scrollTop = stored;
    }

    let ticking = false;
    const save = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        localStorage.setItem(NAV_SCROLL_KEY, String(navLinks.scrollTop || 0));
        ticking = false;
      });
    };

    navLinks.addEventListener("scroll", save, { passive: true });
    window.addEventListener("beforeunload", () => {
      localStorage.setItem(NAV_SCROLL_KEY, String(navLinks.scrollTop || 0));
    });
  }

  function getMobileTitle() {
    const raw = document.title || "";
    const cleaned = raw.replace(/^(?:Rent Soft|Aiven Rental)\s*-\s*/i, "").trim();
    return cleaned || "Menu";
  }

  const topbar = document.createElement("div");
  topbar.className = "mobile-topbar";
  topbar.innerHTML = `
    <button type="button" class="icon-button" id="mobile-nav-toggle" aria-label="Open menu" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    </button>
    <div class="mobile-topbar-title">${getMobileTitle()}</div>
    <div style="width: 36px;"></div>
  `;

  const overlay = document.createElement("div");
  overlay.className = "mobile-nav-overlay";
  overlay.setAttribute("aria-hidden", "true");

  shell.insertBefore(topbar, shell.firstChild);
  document.body.appendChild(overlay);

  const toggleBtn = topbar.querySelector("#mobile-nav-toggle");

  function setOpen(open) {
    document.body.classList.toggle("nav-open", open);
    toggleBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
  }

  toggleBtn?.addEventListener("click", () => {
    setOpen(!document.body.classList.contains("nav-open"));
  });

  overlay.addEventListener("click", () => setOpen(false));

  sidebar.addEventListener("click", (e) => {
    const link = e.target?.closest?.("a.nav-link");
    if (link) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  if (role !== "dispatch") ensurePurchaseNavGroup();
  if (role !== "dispatch") ensureMonthlyChargesLink();
  setActiveLink();
  if (role !== "dispatch") mountNavGroupToggles();
  mountNavIcons();
  mountSidebarCollapse();
  mountNavScrollPersistence();
});
