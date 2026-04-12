(() => {
  const state = {
    days: 14,
    dashboard: null,
  };

  const dashboardHeader = document.getElementById("dashboard-header");
  const authCard = document.getElementById("auth-card");
  const setupCard = document.getElementById("setup-card");
  const chartCard = document.getElementById("chart-card");
  const chartRows = document.getElementById("chart-rows");
  const appActions = document.getElementById("app-actions");
  const loginForm = document.getElementById("login-form");
  const loginStatus = document.getElementById("login-status");
  const setupList = document.getElementById("setup-list");
  const rangeButtons = Array.from(document.querySelectorAll("[data-range]"));
  const authCancel = document.getElementById("auth-cancel");

  document.getElementById("refresh-dashboard").addEventListener("click", () => {
    loadDashboard();
  });

  document.getElementById("logout-dashboard").addEventListener("click", async () => {
    await fetch("/api/data/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
    showAuth();
  });

  authCancel.addEventListener("click", () => {
    loginForm.reset();
    loginStatus.textContent = "";
  });

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.days = Number(button.dataset.range || 14);
      rangeButtons.forEach((item) => item.classList.toggle("active", item === button));
      loadDashboard();
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const password = String(formData.get("password") || "");
    loginStatus.textContent = "Unlocking dashboard...";

    const response = await fetch("/api/data/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    }).catch(() => null);

    if (!response) {
      loginStatus.textContent = "Dashboard login failed.";
      return;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      loginStatus.textContent =
        payload.error === "dashboard_password_not_configured"
          ? "Set DATA_DASHBOARD_PASSWORD first."
          : "Password did not match.";
      return;
    }

    loginStatus.textContent = "";
    loginForm.reset();
    loadDashboard();
  });

  loadDashboard();

  async function loadDashboard() {
    const response = await fetch(`/api/data/dashboard?days=${state.days}`, {
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => null);

    if (!response) {
      showAuth();
      return;
    }

    if (response.status === 401) {
      showAuth();
      return;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showAuth();
      return;
    }

    if (!payload.configured) {
      showSetup(payload.checklist || []);
      return;
    }

    state.dashboard = payload.dashboard;
    renderDashboard(payload.dashboard);
  }

  function showAuth() {
    dashboardHeader.hidden = true;
    authCard.hidden = false;
    setupCard.hidden = true;
    chartCard.hidden = true;
    appActions.hidden = true;
  }

  function showSetup(checklist) {
    dashboardHeader.hidden = false;
    authCard.hidden = true;
    setupCard.hidden = false;
    chartCard.hidden = true;
    appActions.hidden = true;
    setupList.innerHTML = checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function renderDashboard(dashboard) {
    dashboardHeader.hidden = false;
    authCard.hidden = true;
    setupCard.hidden = true;
    chartCard.hidden = false;
    appActions.hidden = false;

    chartRows.innerHTML = (dashboard.sessions || []).length
      ? dashboard.sessions.map(renderSessionRow).join("")
      : `
        <div class="empty-state">
          <strong>No sessions yet.</strong>
          <p class="panel-copy">Once visitors arrive, each session will appear as a single row in the chart.</p>
        </div>
      `;
  }

  function renderSessionRow(session) {
    const pages = session.pages || session.screens || [];
    const clicks = session.clicks || [];
    const visitorLabel = [
      session.visitorType ? `${capitalize(session.visitorType)} visitor` : "Visitor",
      session.device?.deviceType || "",
      session.location?.summary || "",
    ]
      .filter(Boolean)
      .join(" · ");

    return `
      <article class="chart-row">
        <div class="chart-cell visitor-cell">
          <strong>${escapeHtml(visitorLabel || "Visitor")}</strong>
          <span>${escapeHtml(session.device?.summary || "Unknown device")}</span>
          <span>${escapeHtml(session.location?.summary || "Unknown location")}</span>
          <span class="muted-code">${escapeHtml(formatTimestamp(session.firstSeenAt))}</span>
          <span class="muted-code">${escapeHtml(session.sessionId || "unknown session")}</span>
        </div>

        <div class="chart-cell pages-cell">
          <div class="page-track" aria-label="Pages and time on page">
            ${pages
              .map((page) => {
                return `
                  <div class="page-segment" style="flex:${Math.max(Number(page.durationSeconds || 0), 0.35)}">
                    <strong>${escapeHtml(page.label || page.path || "Page")}</strong>
                    <span>${escapeHtml(formatDuration(page.durationSeconds))}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
          <p class="cell-foot">
            ${formatInteger(pages.length || 0)} page${pages.length === 1 ? "" : "s"}
            · ${escapeHtml(formatDuration(session.durationSeconds || session.totalPageTimeSeconds || 0))} total
            · ${escapeHtml(`${formatPercentLabel(session.scrollMax || 0)} max scroll`)}
          </p>
        </div>

        <div class="chart-cell clicks-cell">
          <div class="chip-row">
            ${clicks.length
              ? clicks
                  .slice(0, 6)
                  .map((event) => {
                    const label = event.detail || event.label || event.event || "Click";
                    return `<span class="chip">${escapeHtml(label)}</span>`;
                  })
                  .join("")
              : '<span class="chip chip-muted">No clicks</span>'}
          </div>
        </div>

        <div class="chart-cell source-cell">
          <strong>${escapeHtml(session.source?.key || "direct / direct")}</strong>
          <span>${escapeHtml(session.entry?.referrerDomain || session.entry?.referrerUrl || "Direct")}</span>
          <span>${escapeHtml(session.entry?.landingPath || session.entry?.landingUrl || "Landing path")}</span>
          <span class="muted-code">${escapeHtml(session.totalPageTimeSeconds ? `${formatDuration(session.totalPageTimeSeconds)} on page` : "No dwell time")}</span>
        </div>
      </article>
    `;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    if (total < 60) return `${Math.round(total)}s`;
    const minutes = Math.floor(total / 60);
    const rem = Math.round(total % 60);
    return `${minutes}m ${String(rem).padStart(2, "0")}s`;
  }

  function formatPercentLabel(value) {
    return `${Number(value || 0)}%`;
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function capitalize(value) {
    const stringValue = String(value || "");
    if (!stringValue) return "";
    return stringValue.charAt(0).toUpperCase() + stringValue.slice(1);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
})();
