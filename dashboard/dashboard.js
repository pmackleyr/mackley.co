(() => {
  const state = {
    days: 14,
    dashboard: null,
    authLocked: true,
  };

  const dashboardHeader = document.getElementById("dashboard-header");
  const authCard = document.getElementById("auth-card");
  const setupCard = document.getElementById("setup-card");
  const chartCard = document.getElementById("chart-card");
  const chartRows = document.getElementById("chart-rows");
  const dashboardMeta = document.getElementById("dashboard-meta");
  const appActions = document.getElementById("app-actions");
  const loginForm = document.getElementById("login-form");
  const loginStatus = document.getElementById("login-status");
  const setupList = document.getElementById("setup-list");
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
    state.authLocked = false;
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
    state.authLocked = true;
    state.dashboard = null;
    document.body.classList.remove("dashboard-unlocked");
    dashboardHeader.hidden = true;
    authCard.hidden = false;
    setupCard.hidden = true;
    chartCard.hidden = true;
    appActions.hidden = true;
    dashboardMeta.textContent = "";
    chartRows.innerHTML = "";
    syncRuntimeBridge();
  }

  function showSetup(checklist) {
    state.dashboard = null;
    document.body.classList.add("dashboard-unlocked");
    dashboardHeader.hidden = false;
    authCard.hidden = true;
    setupCard.hidden = false;
    chartCard.hidden = true;
    appActions.hidden = true;
    setupList.innerHTML = checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    dashboardMeta.textContent = "Setup required";
    syncRuntimeBridge();
  }

  function renderDashboard(dashboard) {
    document.body.classList.add("dashboard-unlocked");
    dashboardHeader.hidden = false;
    authCard.hidden = true;
    setupCard.hidden = true;
    chartCard.hidden = false;
    appActions.hidden = false;
    dashboardMeta.textContent = `${formatInteger((dashboard.sessions || []).length)} sessions · ${formatInteger(dashboard.totals?.views || 0)} views · ${formatInteger(dashboard.totals?.clicks || 0)} clicks · ${formatDuration(
      dashboard.totals?.timeSpentSeconds || 0
    )} time`;

    chartRows.innerHTML = (dashboard.sessions || []).length
      ? dashboard.sessions.map(renderSessionRow).join("")
      : `
        <tr class="empty-row">
          <td colspan="7">
            <strong>No sessions yet.</strong>
            <p class="panel-copy">Once visitors arrive, each session will appear as one table row.</p>
          </td>
        </tr>
      `;

    syncRuntimeBridge();
  }

  function renderSessionRow(session) {
    const pages = session.pages || session.screens || [];
    const clicks = session.clicks || [];
    const links = session.links || [];
    const visitorLabel = [
      session.visitorType ? `${capitalize(session.visitorType)} visitor` : "Visitor",
      session.device?.deviceType || "",
      session.location?.summary || "",
    ]
      .filter(Boolean)
      .join(" · ");
    const totalTime = session.totalPageTimeSeconds || session.durationSeconds || 0;
    const sessionSpan = session.durationSeconds || 0;

    return `
      <tr>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(visitorLabel || "Visitor")}</strong>
            <span>${escapeHtml(session.sessionId || "unknown session")}</span>
            <span>${escapeHtml(formatTimestamp(session.firstSeenAt))}</span>
            <span class="muted-code">${formatInteger(session.viewCount || pages.length || 0)} views · ${formatInteger(
      session.clickCount || clicks.length || 0
    )} clicks</span>
          </div>
        </td>
        <td>
          <div class="stack-list">
            ${pages.length
              ? pages
                  .map((page) => {
                    const pageLabel = page.label || page.title || page.path || "Page";
                    const pagePath = page.path && page.path !== pageLabel ? page.path : "";
                    return `
                      <div class="stack-item">
                        <strong>${escapeHtml(pageLabel)}</strong>
                        ${pagePath ? `<span>${escapeHtml(pagePath)}</span>` : ""}
                        <span>${escapeHtml(formatDuration(page.durationSeconds))} · ${escapeHtml(
                      `${formatPercentLabel(page.scrollMax || 0)} scroll`
                    )}</span>
                      </div>
                    `;
                  })
                  .join("")
              : '<span class="muted-code">No pages</span>'}
          </div>
        </td>
        <td>
          <div class="chip-row">
            ${clicks.length
              ? clicks
                  .slice(0, 6)
                  .map((event) => {
                    const label = event.linkText || event.detail || event.label || event.event || "Click";
                    const secondary = event.linkHref || event.pagePath || "";
                    return `<span class="chip">${escapeHtml(label)}${secondary ? `<em>${escapeHtml(secondary)}</em>` : ""}</span>`;
                  })
                  .join("")
              : links.length
                ? links
                    .slice(0, 6)
                    .map((link) => {
                      const label = link.text || link.href || "Link";
                      const secondary = link.href && link.text && link.href !== link.text ? link.href : "";
                      return `<span class="chip">${escapeHtml(label)}${secondary ? `<em>${escapeHtml(secondary)}</em>` : ""}</span>`;
                    })
                    .join("")
                : '<span class="chip chip-muted">No clicks</span>'}
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(session.source?.key || "direct / direct")}</strong>
            <span>${escapeHtml(session.entry?.referrerDomain || session.entry?.referrerUrl || "Direct")}</span>
            <span>${escapeHtml(session.entry?.landingPath || session.entry?.landingUrl || "Landing path")}</span>
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(session.device?.deviceType || "Device")}</strong>
            <span>${escapeHtml(session.device?.summary || "Unknown device")}</span>
            <span class="muted-code">${escapeHtml(session.device?.browser || "")}${session.device?.os ? ` · ${escapeHtml(session.device.os)}` : ""}</span>
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(session.location?.summary || "Unknown location")}</strong>
            <span>${escapeHtml(session.location?.countryCode || session.location?.country || "")}</span>
            <span class="muted-code">${escapeHtml(session.location?.ip || "No IP")}</span>
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(formatDuration(totalTime))}</strong>
            <span>${escapeHtml(formatDuration(sessionSpan))} session span</span>
            <span class="muted-code">${escapeHtml(`${formatInteger(pages.length || 0)} page${pages.length === 1 ? "" : "s"}`)}</span>
          </div>
        </td>
      </tr>
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

  function buildAppText() {
    if (authCard && !authCard.hidden) {
      return "Enter dashboard password";
    }

    if (setupCard && !setupCard.hidden) {
      return "Analytics not connected yet";
    }

    const dashboard = state.dashboard;
    if (!dashboard) return "";

    const sessions = dashboard.sessions || [];
    return [
      "Simple Analytics Dashboard",
      ...sessions.map((session) => {
        const pages = (session.pages || session.screens || [])
          .map((page) => `${page.label || page.path || "Page"} ${formatDuration(page.durationSeconds)}`)
          .join(" | ");
        const clicks = (session.clicks || [])
          .slice(0, 6)
          .map((event) => event.linkText || event.detail || event.label || "Click")
          .join(" | ");
        return `${session.sessionId || session.key || "session"} :: ${pages} :: ${clicks} :: ${session.source?.key || "direct / direct"}`;
      }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  function syncRuntimeBridge() {
    window.__OPENMAT__ = {
      authLocked: state.authLocked,
      days: state.days,
      dashboard: state.dashboard,
      latestEvents: state.dashboard?.sessions?.flatMap((session) => session.topEvents || []).slice(0, 25) || [],
    };
    window.render_app_to_text = buildAppText;
    window.advanceTime = async (ms = 0) => {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
      return buildAppText();
    };
  }
})();
