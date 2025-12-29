document.addEventListener("DOMContentLoaded", () => {
  const meta = document.getElementById("home-meta");
  const login = document.getElementById("home-login");
  const enter = document.getElementById("home-enter");

  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();

  if (!session) {
    if (meta) meta.textContent = "Log in to keep your company selected across pages.";
    return;
  }

  if (companyId) {
    window.RentSoft?.setCompanyId?.(companyId);
    if (login) {
      login.textContent = "Continue";
      login.setAttribute("href", "work-bench.html");
    }
    if (enter) enter.setAttribute("href", "work-bench.html");
    if (meta) {
      const companyName = session?.company?.name ? String(session.company.name) : null;
      const userName = session?.user?.name ? String(session.user.name) : null;
      meta.textContent = `Signed in${userName ? ` as ${userName}` : ""}${companyName ? ` • ${companyName}` : ""}.`;
    }
  }
});
