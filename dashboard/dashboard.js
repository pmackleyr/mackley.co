(() => {
  const API_BASE = "https://api.mackley.co";
  const PASSWORD_STORAGE_KEY = "mackley_dashboard_password_v1";

  const state = {
    days: 14,
    dashboard: null,
    accessEntries: [],
    dashboardPassword: "",
    authLocked: true,
  };

  const dashboardHeader = document.getElementById("dashboard-header");
  const authCard = document.getElementById("auth-card");
  const setupCard = document.getElementById("setup-card");
  const accessCard = document.getElementById("access-card");
  const accessRows = document.getElementById("access-rows");
  const accessMeta = document.getElementById("access-meta");
  const experimentCard = document.getElementById("experiment-card");
  const experimentGrid = document.getElementById("experiment-grid");
  const experimentMeta = document.getElementById("experiment-meta");
  const insightList = document.getElementById("insight-list");
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
    window.sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
    state.dashboardPassword = "";
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
    state.dashboardPassword = password;
    loginStatus.textContent = "Unlocking dashboard...";
    await loadDashboard({ password, fromLogin: true });
  });

  loadDashboard();

  async function loadDashboard(options = {}) {
    state.authLocked = false;
    const password = options.password || state.dashboardPassword || window.sessionStorage.getItem(PASSWORD_STORAGE_KEY) || "";
    if (!password) {
      showAuth();
      return;
    }

    const accessResponse = await fetch(`${API_BASE}/access-entries`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ limit: 200 }),
    }).catch(() => null);

    if (!accessResponse) {
      loginStatus.textContent = options.fromLogin ? "Dashboard login failed." : "";
      showAuth();
      return;
    }

    const accessPayload = await accessResponse.json().catch(() => ({}));
    if (!accessResponse.ok) {
      window.sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
      loginStatus.textContent = options.fromLogin ? "Password did not match." : "";
      showAuth();
      return;
    }

    state.dashboardPassword = password;
    window.sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
    loginStatus.textContent = "";
    loginForm.reset();

    const dashboardResponse = await fetch(`${API_BASE}/analytics/dashboard`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ days: state.days }),
    }).catch(() => null);

    let dashboard = null;
    if (dashboardResponse && dashboardResponse.ok) {
      const dashboardPayload = await dashboardResponse.json().catch(() => ({}));
      dashboard = dashboardPayload.dashboard || null;
    }

    state.accessEntries = accessPayload.entries || [];
    state.dashboard = dashboard;
    renderAccessDashboard(state.accessEntries, dashboard);
  }

  function showAuth() {
    state.authLocked = true;
    state.dashboard = null;
    document.body.classList.remove("dashboard-unlocked");
    dashboardHeader.hidden = true;
    authCard.hidden = false;
    setupCard.hidden = true;
    accessCard.hidden = true;
    experimentCard.hidden = true;
    chartCard.hidden = true;
    appActions.hidden = true;
    accessMeta.textContent = "";
    experimentMeta.textContent = "";
    experimentGrid.innerHTML = "";
    insightList.innerHTML = "";
    accessRows.innerHTML = "";
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
    accessCard.hidden = true;
    experimentCard.hidden = true;
    chartCard.hidden = true;
    appActions.hidden = true;
    setupList.innerHTML = checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    experimentMeta.textContent = "";
    experimentGrid.innerHTML = "";
    insightList.innerHTML = "";
    dashboardMeta.textContent = "Setup required";
    syncRuntimeBridge();
  }

  function renderAccessDashboard(entries, dashboard) {
    document.body.classList.add("dashboard-unlocked");
    dashboardHeader.hidden = false;
    authCard.hidden = true;
    setupCard.hidden = true;
    accessCard.hidden = false;
    experimentCard.hidden = !dashboard;
    chartCard.hidden = !dashboard;
    appActions.hidden = false;

    accessMeta.textContent = `${formatInteger(entries.length)} access entries`;
    accessRows.innerHTML = entries.length
      ? entries.map(renderAccessRow).join("")
      : `
        <tr class="empty-row">
          <td colspan="4">
            <strong>No access entries yet.</strong>
            <p class="panel-copy">Successful lockscreen completions will appear here.</p>
          </td>
        </tr>
      `;

    if (dashboard) {
      renderDashboard(dashboard);
    } else {
      dashboardMeta.textContent = "";
      experimentMeta.textContent = "";
      experimentGrid.innerHTML = "";
      insightList.innerHTML = "";
      chartRows.innerHTML = "";
    }

    syncRuntimeBridge();
  }

  function renderDashboard(dashboard) {
    document.body.classList.add("dashboard-unlocked");
    dashboardHeader.hidden = false;
    authCard.hidden = true;
    setupCard.hidden = true;
    accessCard.hidden = false;
    experimentCard.hidden = false;
    chartCard.hidden = false;
    appActions.hidden = false;
    const sessions = getDashboardSessions(dashboard);
    const metrics = dashboard.metrics || {};
    dashboardMeta.textContent = `${formatInteger(metrics.sessions || sessions.length)} sessions · ${formatInteger(metrics.pageViews || dashboard.totals?.views || 0)} views · ${formatInteger(
      metrics.beginCheckoutSessions || dashboard.totals?.clicks || 0
    )} clicks/form starts · ${formatInteger(metrics.providerSurveySessions || 0)} forms · ${formatDuration(metrics.averageEngagedSeconds || dashboard.totals?.timeSpentSeconds || 0)} avg engaged`;

    renderExperimentDashboard(dashboard);

    chartRows.innerHTML = sessions.length
      ? sessions.map(renderSessionRow).join("")
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

  function renderAccessRow(entry) {
    const location = formatAccessLocation(entry);
    return `
      <tr>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(entry.name || "Unknown")}</strong>
            <span class="muted-code">${escapeHtml(entry.id || "")}</span>
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(entry.email || "Unknown email")}</strong>
            <span>${escapeHtml(entry.language || "")}</span>
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(location || "Unknown location")}</strong>
            <span>${escapeHtml(entry.pagePath || "/")}</span>
            <span class="muted-code">${escapeHtml(entry.referrer || "Direct")}</span>
          </div>
        </td>
        <td>
          <div class="stack-cell">
            <strong>${escapeHtml(formatTimestamp(entry.createdAt))}</strong>
            <span>${escapeHtml(entry.timezone || "")}</span>
            <span class="muted-code">${escapeHtml(entry.ip || "No IP")}</span>
          </div>
        </td>
      </tr>
    `;
  }

  function formatAccessLocation(entry) {
    const parts = [entry.city, entry.region].filter(Boolean);
    if (parts.length) return parts.join(", ");
    return entry.country || entry.countryCode || "";
  }

  function renderSessionRow(session) {
    const pages = getSessionPages(session);
    const clicks = getSessionClicks(session);
    const links = session.links || [];
    const variantLabel = session.variantLabel || formatVariantLabel(session.landingVariant);
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
            <span>${escapeHtml(formatTimestamp(session.firstSeenAt || session.startedAt || session.lastEventAt))}</span>
            ${variantLabel ? `<span class="experiment-pill">${escapeHtml(variantLabel)}</span>` : ""}
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

  function renderExperimentDashboard(dashboard) {
    const experiment = dashboard.experiment || {};
    const variants = experiment.variants || [];
    const recommendations = dashboard.recommendations || [];

    experimentMeta.textContent = `${formatInteger(experiment.totalSessions || 0)} assigned sessions · goal: ${experiment.goal || "Clicks / form starts"}`;
    experimentGrid.innerHTML = variants.length
      ? variants.map(renderVariantCard).join("")
      : `
        <div class="empty-experiment">
          <strong>No experiment data yet.</strong>
          <p class="panel-copy">Assigned landing sessions will appear after the next home-page visits.</p>
        </div>
      `;

    const insight = experiment.insight ? [{
      priority: "goal",
      title: "Experiment readout",
      detail: experiment.insight,
      action: "Optimize for clicks/form starts, then verify purchase continuation."
    }] : [];
    insightList.innerHTML = [...insight, ...recommendations].slice(0, 5).map(renderInsight).join("");
  }

  function renderVariantCard(variant) {
    const status = variant.status || "collecting";
    return `
      <article class="experiment-variant experiment-variant--${escapeHtml(status)}">
        <div class="variant-head">
          <div>
            <p class="variant-kicker">Variant ${escapeHtml((variant.variant || "").toUpperCase() || "?")}</p>
            <h3>${escapeHtml(variant.label || formatVariantLabel(variant.variant) || "Variant")}</h3>
          </div>
          <span class="variant-status">${escapeHtml(status)}</span>
        </div>
        <dl class="variant-metrics">
          <div>
            <dt>Traffic</dt>
            <dd>${formatInteger(variant.sessions)} <span>${formatPercentLabel(variant.trafficShare)}</span></dd>
          </div>
          <div>
            <dt>CTA seen</dt>
            <dd>${formatPercentLabel(variant.ctaVisibilityRate)}</dd>
          </div>
          <div>
            <dt>Clicks</dt>
            <dd>${formatPercentLabel(variant.clickRate)} <span>${formatInteger(variant.beginCheckoutSessions)}</span></dd>
          </div>
          <div>
            <dt>Forms</dt>
            <dd>${formatPercentLabel(variant.formSubmissionRate)} <span>${formatInteger(variant.providerSurveySubmissions)}</span></dd>
          </div>
          <div>
            <dt>Purchase</dt>
            <dd>${formatPercentLabel(variant.purchaseRate)}</dd>
          </div>
        </dl>
        <p class="variant-bottleneck"><span>Bottleneck</span>${escapeHtml(variant.bottleneck || "Collecting sample")}</p>
      </article>
    `;
  }

  function renderInsight(item) {
    return `
      <article class="insight insight--${escapeHtml(item.priority || "watch")}">
        <strong>${escapeHtml(item.title || "Insight")}</strong>
        <span>${escapeHtml(item.detail || "")}</span>
        <em>${escapeHtml(item.action || "")}</em>
      </article>
    `;
  }

  function getDashboardSessions(dashboard) {
    return dashboard.sessions || dashboard.recentSessions || [];
  }

  function getSessionPages(session) {
    const direct = session.pages || session.screens || [];
    if (direct.length) return direct;
    const paths = session.pagePaths || session.pathFlow || [];
    return paths.map((path) => ({
      label: path,
      path,
      durationSeconds: 0,
      scrollMax: session.maxScrollPercent || 0
    }));
  }

  function getSessionClicks(session) {
    const direct = session.clicks || [];
    if (direct.length) return direct;
    const timelineClicks = (session.eventTimeline || [])
      .filter((event) => ["click_target", "begin_checkout", "checkout_redirect", "checkout_blocked"].includes(event.event))
      .map((event) => ({
        linkText: event.label || event.event,
        detail: event.event,
        linkHref: event.href || "",
        pagePath: event.path || ""
      }));
    if (timelineClicks.length) return timelineClicks;
    return (session.clickedTargets || []).map((label) => ({
      linkText: label,
      detail: "click"
    }));
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

  function formatVariantLabel(value) {
    const variant = String(value || "").toLowerCase();
    if (variant === "a") return "A current flow";
    if (variant === "b") return "B white product hero";
    return "";
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

    const accessEntries = state.accessEntries || [];
    const sessions = getDashboardSessions(dashboard);
    const experiment = dashboard.experiment;
    return [
      "Simple Analytics Dashboard",
      experiment ? `${experiment.goal || "Experiment"} :: ${experiment.insight || ""}` : "",
      ...(experiment?.variants || []).map((variant) => `${variant.label} :: ${formatInteger(variant.sessions)} sessions :: ${formatPercentLabel(variant.clickRate)} clicks :: ${formatPercentLabel(variant.formSubmissionRate)} forms :: ${variant.bottleneck}`),
      ...accessEntries.map((entry) => `${entry.name || "Unknown"} :: ${entry.email || ""} :: ${entry.pagePath || "/"} :: ${formatTimestamp(entry.createdAt)}`),
      ...sessions.map((session) => {
        const pages = getSessionPages(session)
          .map((page) => `${page.label || page.path || "Page"} ${formatDuration(page.durationSeconds)}`)
          .join(" | ");
        const clicks = getSessionClicks(session)
          .slice(0, 6)
          .map((event) => event.linkText || event.detail || event.label || "Click")
          .join(" | ");
        return `${session.sessionId || session.key || "session"} :: ${formatVariantLabel(session.landingVariant)} :: ${pages} :: ${clicks} :: ${session.source?.key || session.source || "direct / direct"}`;
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
      accessEntries: state.accessEntries,
      latestEvents: getDashboardSessions(state.dashboard || {})?.flatMap((session) => session.topEvents || session.eventTimeline || []).slice(0, 25) || [],
    };
    window.render_app_to_text = buildAppText;
    window.advanceTime = async (ms = 0) => {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
      return buildAppText();
    };
  }
})();
