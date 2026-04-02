const API_URL = "https://api.mackley.co/analytics/dashboard";
const PASSWORD_KEY = "mackley_dashboard_password";
const DAYS_KEY = "mackley_dashboard_days";
const AUTO_REFRESH_MS = 60_000;

const numberFormatter = new Intl.NumberFormat("en-US");
const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});
const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
});

const state = {
  password: sessionStorage.getItem(PASSWORD_KEY) || "",
  days: Number(localStorage.getItem(DAYS_KEY)) || 14,
  refreshTimer: null,
  countdownTimer: null,
  lastLoadedAt: 0
};

const refs = {
  gateShell: document.getElementById("gate-shell"),
  appShell: document.getElementById("app-shell"),
  authForm: document.getElementById("auth-form"),
  passwordInput: document.getElementById("password-input"),
  authError: document.getElementById("auth-error"),
  rangePicker: document.getElementById("range-picker"),
  refreshButton: document.getElementById("refresh-button"),
  lockButton: document.getElementById("lock-button"),
  storyline: document.getElementById("storyline"),
  lastUpdated: document.getElementById("last-updated"),
  refreshState: document.getElementById("refresh-state"),
  metricsGrid: document.getElementById("metrics-grid"),
  recommendationsPanel: document.getElementById("recommendations-panel"),
  funnelPanel: document.getElementById("funnel-panel"),
  timelinePanel: document.getElementById("timeline-panel"),
  sourcesPanel: document.getElementById("sources-panel"),
  pagesPanel: document.getElementById("pages-panel"),
  clicksPanel: document.getElementById("clicks-panel"),
  sessionsPanel: document.getElementById("sessions-panel")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatPercent(value) {
  const numeric = Number(value) || 0;
  return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)}%`;
}

function formatSeconds(value) {
  const seconds = Number(value) || 0;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 6) / 10}m`;
}

function formatTimestamp(value) {
  if (!value) return "Unknown";
  return timestampFormatter.format(new Date(value));
}

function formatDay(value) {
  return dayFormatter.format(new Date(`${value}T12:00:00Z`));
}

function formatPath(path) {
  if (!path) return "/";
  return path === "/index.html" ? "/" : path;
}

function formatAgo(value) {
  const deltaSeconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.round(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.round(deltaSeconds / 3600)}h ago`;
  return `${Math.round(deltaSeconds / 86400)}d ago`;
}

function priorityLabel(priority) {
  if (priority === "critical") return "Do this first";
  if (priority === "high") return "High leverage";
  if (priority === "medium") return "Worth testing";
  return "Keep watching";
}

function setLocked(message = "") {
  clearTimers();
  state.password = "";
  sessionStorage.removeItem(PASSWORD_KEY);
  refs.appShell.hidden = true;
  refs.gateShell.hidden = false;
  refs.authError.hidden = !message;
  refs.authError.textContent = message || "";
  refs.passwordInput.value = "";
  refs.passwordInput.focus();
}

function unlock() {
  refs.gateShell.hidden = true;
  refs.appShell.hidden = false;
  refs.authError.hidden = true;
}

function setRefreshLoading(isLoading) {
  refs.refreshButton.disabled = isLoading;
  refs.refreshButton.textContent = isLoading ? "Refreshing…" : "Refresh now";
}

function updateRangeButtons() {
  refs.rangePicker.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.days) === state.days);
  });
}

function clearTimers() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function startTimers() {
  clearTimers();
  state.refreshTimer = window.setInterval(() => {
    loadDashboard();
  }, AUTO_REFRESH_MS);
  state.countdownTimer = window.setInterval(updateCountdown, 1000);
  updateCountdown();
}

function updateCountdown() {
  if (!state.lastLoadedAt) {
    refs.refreshState.textContent = "Auto-refresh every 60s";
    return;
  }
  const remainingMs = Math.max(0, AUTO_REFRESH_MS - (Date.now() - state.lastLoadedAt));
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  refs.refreshState.textContent = `Auto-refresh in ${remainingSeconds}s`;
}

function metricCard(label, value, hint) {
  return `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(label)}</span>
      <span class="metric-value">${escapeHtml(value)}</span>
      <span class="metric-hint">${escapeHtml(hint)}</span>
    </article>
  `;
}

function panelHeader(kicker, title, copy = "") {
  return `
    <div class="panel-header">
      <div>
        <p class="panel-kicker">${escapeHtml(kicker)}</p>
        <h2>${escapeHtml(title)}</h2>
        ${copy ? `<p class="panel-subcopy">${escapeHtml(copy)}</p>` : ""}
      </div>
    </div>
  `;
}

function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function renderMetrics(metrics) {
  refs.metricsGrid.innerHTML = [
    metricCard("Sessions", formatNumber(metrics.sessions), `${formatNumber(metrics.newSessions)} new, ${formatNumber(metrics.returningSessions)} returning`),
    metricCard("CTA visibility", formatPercent(metrics.ctaVisibilityRate), `${formatNumber(metrics.ctaImpressionSessions)} sessions saw the buy action`),
    metricCard("Checkout start rate", formatPercent(metrics.checkoutRate), `${formatPercent(metrics.checkoutRateFromCta)} from CTA viewers`),
    metricCard("Verified purchase rate", formatPercent(metrics.purchaseRate), `${formatPercent(metrics.purchaseRateFromCheckout)} from checkout starters`),
    metricCard("Blocked sessions", formatNumber(metrics.blockedSessions), "Sessions that stalled before a clean Stripe completion"),
    metricCard("Deep scroll rate", formatPercent(metrics.deepScrollRate), `${formatNumber(metrics.deepScrollSessions)} sessions reached 50% depth`),
    metricCard("Average engaged time", formatSeconds(metrics.averageEngagedSeconds), "Based on tracked page exits"),
    metricCard("Tracked events", formatNumber(metrics.totalEvents), `${formatNumber(metrics.pageViews)} page views recorded`)
  ].join("");
}

function renderRecommendations(dashboard) {
  if (!dashboard.recommendations.length) {
    refs.recommendationsPanel.innerHTML = panelHeader("Focus", "What to fix next") + emptyState("No recommendation was generated.");
    return;
  }

  const cards = dashboard.recommendations.map((item) => `
    <article class="recommendation-card">
      <span class="recommendation-priority" data-priority="${escapeHtml(item.priority)}">${escapeHtml(priorityLabel(item.priority))}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.detail)}</p>
      <p><strong>Next move:</strong> ${escapeHtml(item.action)}</p>
    </article>
  `).join("");

  refs.recommendationsPanel.innerHTML = `
    ${panelHeader("Focus", "What to fix next", "This is the clearest path to improving conversion right now.")}
    <div class="recommendation-list">${cards}</div>
  `;
}

function renderFunnel(dashboard) {
  const maxValue = Math.max(...dashboard.funnel.map((step) => step.value), 1);
  const rows = dashboard.funnel.map((step) => `
    <div class="funnel-row">
      <div class="row-topline">
        <span class="row-label">${escapeHtml(step.label)}</span>
        <span class="row-value">${formatNumber(step.value)} · ${formatPercent(step.rate)}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max(6, (step.value / maxValue) * 100)}%"></div>
      </div>
    </div>
  `).join("");

  refs.funnelPanel.innerHTML = `
    ${panelHeader("Flow", "Conversion funnel", "Every step is session-based, so the drop-offs are easy to read.")}
    <div class="funnel-rows">${rows}</div>
  `;
}

function renderTimeline(dashboard) {
  if (!dashboard.timeline.length) {
    refs.timelinePanel.innerHTML = panelHeader("When", "Daily trend") + emptyState("No tracked days yet.");
    return;
  }

  const maxSessions = Math.max(...dashboard.timeline.map((day) => day.sessions), 1);
  const rows = dashboard.timeline.map((day) => `
    <div class="timeline-row">
      <div class="row-topline">
        <span class="row-label">${escapeHtml(formatDay(day.date))}</span>
        <span class="row-value">${formatNumber(day.sessions)} sessions</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill bar-fill--soft" style="width:${Math.max(4, (day.sessions / maxSessions) * 100)}%"></div>
      </div>
      <div class="timeline-supplement">
        <span>${formatNumber(day.beginCheckout)} checkout starts</span>
        <span>${formatNumber(day.purchases)} purchases</span>
        <span>${formatNumber(day.blocked)} blocked</span>
      </div>
    </div>
  `).join("");

  refs.timelinePanel.innerHTML = `
    ${panelHeader("When", "Daily trend", "Use this to tie creative or spend changes to conversion movement.")}
    <div class="timeline-rows">${rows}</div>
  `;
}

function renderSources(dashboard) {
  if (!dashboard.sources.length) {
    refs.sourcesPanel.innerHTML = panelHeader("Traffic", "Source quality") + emptyState("No source data yet.");
    return;
  }

  const rows = dashboard.sources.map((source) => `
    <tr>
      <td>
        <strong>${escapeHtml(source.label)}</strong>
        <div class="item-meta">${escapeHtml(source.source)} / ${escapeHtml(source.medium)}</div>
      </td>
      <td>${formatNumber(source.sessions)}</td>
      <td>${formatPercent(source.checkoutRate)}</td>
      <td>${formatPercent(source.purchaseRate)}</td>
      <td>${formatPercent(source.blockedRate)}</td>
    </tr>
  `).join("");

  refs.sourcesPanel.innerHTML = `
    ${panelHeader("Traffic", "Source quality", "Find the traffic that matches the page and cut the traffic that does not.")}
    <table class="data-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Sessions</th>
          <th>Checkout</th>
          <th>Purchase</th>
          <th>Blocked</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPages(dashboard) {
  if (!dashboard.pages.length) {
    refs.pagesPanel.innerHTML = panelHeader("Pages", "Page contribution") + emptyState("No page data yet.");
    return;
  }

  const rows = dashboard.pages.map((page) => `
    <tr>
      <td><strong>${escapeHtml(formatPath(page.pagePath))}</strong></td>
      <td>${formatNumber(page.pageViews)}</td>
      <td>${formatPercent(page.checkoutRate)}</td>
      <td>${formatPercent(page.purchaseRate)}</td>
    </tr>
  `).join("");

  refs.pagesPanel.innerHTML = `
    ${panelHeader("Pages", "Page contribution", "Which pages are actually creating checkout intent, not just traffic.")}
    <table class="data-table">
      <thead>
        <tr>
          <th>Page</th>
          <th>Views</th>
          <th>Checkout</th>
          <th>Purchase</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderClicks(dashboard) {
  if (!dashboard.topClicks.length) {
    refs.clicksPanel.innerHTML = panelHeader("Clicks", "Most clicked targets") + emptyState("No click targets yet.");
    return;
  }

  const rows = dashboard.topClicks.map((item) => `
    <tr>
      <td>
        <strong>${escapeHtml(item.label)}</strong>
        <div class="item-meta">${escapeHtml(formatPath(item.pagePath))}</div>
      </td>
      <td>${item.href ? escapeHtml(item.href) : "No href"}</td>
      <td>${formatNumber(item.clicks)}</td>
    </tr>
  `).join("");

  refs.clicksPanel.innerHTML = `
    ${panelHeader("Clicks", "Most clicked targets", "Shows where attention goes when it does not go straight to checkout.")}
    <table class="data-table">
      <thead>
        <tr>
          <th>Target</th>
          <th>Destination</th>
          <th>Clicks</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderSessionFacts(session) {
  const facts = [
    ["Started", formatTimestamp(session.startedAt)],
    ["Last event", `${formatTimestamp(session.lastEventAt)} (${formatAgo(session.lastEventAt)})`],
    ["Entry page", formatPath(session.firstPath)],
    ["Last page", formatPath(session.lastPath)],
    ["Scroll depth", `${formatNumber(session.maxScrollPercent)}%`],
    ["Engaged time", formatSeconds(session.engagedTimeSeconds)],
    ["Clicks", formatNumber(session.clickCount)],
    ["Checkout steps", session.checkoutSteps.length ? session.checkoutSteps.join(", ") : "None"],
    ["Blocked reason", session.blockedReason || "None"],
    ["Transaction", session.transactionId || "Not purchased"]
  ];

  return facts.map(([label, value]) => `
    <div class="session-fact">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(value)}</span>
    </div>
  `).join("");
}

function renderSessionTimeline(session) {
  if (!session.eventTimeline.length) {
    return emptyState("No event timeline stored for this session.");
  }

  return `
    <div class="timeline-pill-row">
      ${session.eventTimeline.map((entry) => {
        const delta = Math.max(0, Math.round((entry.at - session.startedAt) / 1000));
        const parts = [
          `+${delta}s`,
          entry.event.replace(/_/g, " ")
        ];
        if (entry.label) parts.push(entry.label);
        if (entry.scrollPercent) parts.push(`${entry.scrollPercent}%`);
        if (entry.seconds) parts.push(`${entry.seconds}s`);
        if (entry.path) parts.push(formatPath(entry.path));
        return `<span class="timeline-pill">${escapeHtml(parts.join(" · "))}</span>`;
      }).join("")}
    </div>
  `;
}

function renderSessions(dashboard) {
  if (!dashboard.recentSessions.length) {
    refs.sessionsPanel.innerHTML = panelHeader("Sessions", "Recent sessions") + emptyState("No recent sessions captured in this window.");
    return;
  }

  const list = dashboard.recentSessions.map((session) => `
    <details class="session-card">
      <summary>
        <div class="session-summary">
          <div class="session-summary-main">
            <div class="pill-row">
              <span class="pill pill--status" data-status="${escapeHtml(session.status)}">${escapeHtml(session.status)}</span>
              <span class="pill">${escapeHtml(session.visitorType || "unknown")}</span>
              <span class="pill">${escapeHtml(session.deviceType || "unknown")}</span>
            </div>
            <div class="session-summary-title">${escapeHtml(session.source || "direct / direct")}</div>
            <div class="session-meta">${escapeHtml(formatPath(session.firstPath))} → ${escapeHtml(formatPath(session.lastPath))}</div>
          </div>
          <div class="session-summary-aside">
            <div class="session-meta">${escapeHtml(formatTimestamp(session.lastEventAt))}</div>
            <div class="session-meta">${escapeHtml(formatAgo(session.lastEventAt))}</div>
          </div>
        </div>
      </summary>
      <div class="session-detail-grid">
        <div class="session-detail-card">
          <h4>Session facts</h4>
          <div class="session-facts">${renderSessionFacts(session)}</div>
        </div>
        <div class="session-detail-card">
          <h4>Clicked targets</h4>
          ${session.clickedTargets.length
            ? `<div class="pill-row">${session.clickedTargets.map((target) => `<span class="pill">${escapeHtml(target)}</span>`).join("")}</div>`
            : emptyState("No tracked clicks in this session.")}
        </div>
        <div class="session-detail-card">
          <h4>Journey summary</h4>
          ${session.journey.length
            ? `<div class="journey-row">${session.journey.map((item) => `<span class="journey-pill">${escapeHtml(item)}</span>`).join("")}</div>`
            : emptyState("No session journey summary available.")}
        </div>
        <div class="session-detail-card">
          <h4>Event timeline</h4>
          ${renderSessionTimeline(session)}
        </div>
      </div>
    </details>
  `).join("");

  refs.sessionsPanel.innerHTML = `
    ${panelHeader("Sessions", "Recent sessions", "Open any session to see how that visitor moved through the site.")}
    <div class="session-list">${list}</div>
  `;
}

function buildStoryline(dashboard) {
  if (!dashboard.metrics.sessions) {
    return `No sessions have been captured in the last ${dashboard.days} days yet.`;
  }

  const lead = dashboard.recommendations[0];
  if (!lead) {
    return `Tracked ${formatNumber(dashboard.metrics.sessions)} sessions in the last ${dashboard.days} days.`;
  }

  return `${lead.title}. ${lead.detail} ${lead.action}`;
}

function renderDashboard(dashboard) {
  refs.storyline.textContent = buildStoryline(dashboard);
  refs.lastUpdated.textContent = `Updated ${formatTimestamp(dashboard.generatedAt)}`;
  renderMetrics(dashboard.metrics);
  renderRecommendations(dashboard);
  renderFunnel(dashboard);
  renderTimeline(dashboard);
  renderSources(dashboard);
  renderPages(dashboard);
  renderClicks(dashboard);
  renderSessions(dashboard);
}

async function loadDashboard() {
  if (!state.password) return;

  setRefreshLoading(true);

  try {
    const response = await fetch(`${API_URL}?days=${state.days}`, {
      method: "GET",
      headers: {
        "x-dashboard-password": state.password
      },
      cache: "no-store"
    });

    if (response.status === 401) {
      setLocked("That password did not unlock the dashboard.");
      return;
    }

    if (!response.ok) {
      throw new Error(`Dashboard request failed (${response.status})`);
    }

    const data = await response.json();
    if (!data?.ok || !data.dashboard) {
      throw new Error("Dashboard payload was missing.");
    }

    unlock();
    renderDashboard(data.dashboard);
    state.lastLoadedAt = Date.now();
    startTimers();
  } catch (error) {
    refs.storyline.textContent = "Dashboard data could not be loaded right now. Check the worker and try again.";
    refs.lastUpdated.textContent = "Dashboard request failed";
    refs.refreshState.textContent = "Auto-refresh paused";
    clearTimers();
  } finally {
    setRefreshLoading(false);
  }
}

function handleUnlock(event) {
  event.preventDefault();
  const nextPassword = refs.passwordInput.value.trim();
  if (!nextPassword) {
    refs.authError.hidden = false;
    refs.authError.textContent = "Enter the dashboard password.";
    return;
  }

  refs.authError.hidden = true;
  state.password = nextPassword;
  sessionStorage.setItem(PASSWORD_KEY, nextPassword);
  loadDashboard();
}

function handleRangeClick(event) {
  const button = event.target.closest("button[data-days]");
  if (!button) return;
  const days = Number(button.dataset.days);
  if (!days || days === state.days) return;
  state.days = days;
  localStorage.setItem(DAYS_KEY, String(days));
  updateRangeButtons();
  loadDashboard();
}

function init() {
  updateRangeButtons();

  refs.authForm.addEventListener("submit", handleUnlock);
  refs.rangePicker.addEventListener("click", handleRangeClick);
  refs.refreshButton.addEventListener("click", () => loadDashboard());
  refs.lockButton.addEventListener("click", () => setLocked());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.password) {
      loadDashboard();
    }
  });

  if (state.password) {
    unlock();
    loadDashboard();
  } else {
    setLocked();
  }
}

init();
