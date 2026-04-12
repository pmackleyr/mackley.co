(() => {
  const state = {
    days: 14,
    query: "",
    dashboard: null,
    selectedSessionId: "",
  };

  const authCard = document.getElementById("auth-card");
  const dashboardApp = document.getElementById("dashboard-app");
  const overviewGrid = document.getElementById("overview-grid");
  const loginForm = document.getElementById("login-form");
  const loginStatus = document.getElementById("login-status");
  const sessionList = document.getElementById("session-list");
  const sessionDetail = document.getElementById("session-detail");
  const filterInput = document.getElementById("session-filter");
  const sourceTable = document.getElementById("source-table");
  const linkTable = document.getElementById("link-table");
  const pageTable = document.getElementById("page-table");
  const overviewNote = document.getElementById("overview-note");
  const generatedAt = document.getElementById("generated-at");
  const rangeButtons = Array.from(document.querySelectorAll("[data-range]"));

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

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.days = Number(button.dataset.range || 14);
      rangeButtons.forEach((item) => item.classList.toggle("active", item === button));
      loadDashboard();
    });
  });

  filterInput.addEventListener("input", () => {
    state.query = filterInput.value.trim().toLowerCase();
    renderSessions();
    renderSelectedSession();
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
    setLoadingState(true);
    const response = await fetch(`/api/data/dashboard?days=${state.days}`, {
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => null);

    if (!response) {
      showAuth();
      loginStatus.textContent = "Dashboard could not load.";
      setLoadingState(false);
      return;
    }

    if (response.status === 401) {
      showAuth();
      setLoadingState(false);
      return;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showAuth();
      loginStatus.textContent = payload.detail || payload.error || "Dashboard failed to load.";
      setLoadingState(false);
      return;
    }

    state.dashboard = payload.dashboard || null;
    if (!state.selectedSessionId && state.dashboard?.recentSessions?.length) {
      state.selectedSessionId = state.dashboard.recentSessions[0].sessionId;
    }

    renderDashboard();
    setLoadingState(false);
  }

  function setLoadingState(isLoading) {
    const label = generatedAt;
    if (!label) return;
    label.textContent = isLoading ? "Loading recent activity..." : label.textContent;
  }

  function showAuth() {
    authCard.hidden = false;
    dashboardApp.hidden = true;
  }

  function showDashboard() {
    authCard.hidden = true;
    dashboardApp.hidden = false;
  }

  function renderDashboard() {
    if (!state.dashboard) {
      showAuth();
      return;
    }

    showDashboard();
    renderOverview();
    renderTables();
    renderSessions();
    renderSelectedSession();
    generatedAt.textContent = `Updated ${formatTimestamp(state.dashboard.generatedAt)} · ${state.dashboard.days} day view`;
  }

  function renderOverview() {
    const dashboard = state.dashboard || {};
    const metrics = dashboard.metrics || {};
    const sessions = dashboard.recentSessions || [];
    const totalClicks = sessions.reduce((sum, session) => sum + Number(session.clickCount || 0), 0);
    const deviceCount = countUnique(sessions.map((session) => session.device?.summary || session.deviceType));
    const locationCount = countUnique(sessions.map((session) => session.location?.summary));

    const cards = [
      { label: "Sessions", value: formatInteger(metrics.sessions || sessions.length), foot: "Recent visitors in the chosen window" },
      { label: "Screens", value: formatInteger((dashboard.pages || []).length), foot: "Unique pages seen in the window" },
      { label: "Page views", value: formatInteger(metrics.pageViews || 0), foot: "Tracked page_view events" },
      { label: "Clicks", value: formatInteger(totalClicks), foot: "Tracked link and button clicks" },
      { label: "Deep scrolls", value: formatInteger(metrics.deepScrollSessions || 0), foot: `${metrics.deepScrollRate || 0}% reached 50% scroll` },
      { label: "Avg engaged", value: `${formatInteger(metrics.averageEngagedSeconds || 0)}s`, foot: "Average engaged time on exit" },
    ];

    overviewGrid.innerHTML = cards
      .map(
        (card) => `
          <article class="metric-card">
            <p class="metric-label">${escapeHtml(card.label)}</p>
            <p class="metric-value">${escapeHtml(card.value)}</p>
            <p class="metric-foot">${escapeHtml(card.foot)}</p>
          </article>
        `
      )
      .join("");
    overviewNote.innerHTML = `
      <div class="empty-state">
        <strong>${formatInteger(deviceCount)} device profiles, ${formatInteger(locationCount)} locations.</strong>
        <p>Use the session list and detail panel to inspect the exact screens, scrolls, and links behind each visit.</p>
      </div>
    `;
  }

  function renderTables() {
    const dashboard = state.dashboard || {};
    sourceTable.innerHTML = (dashboard.sources || [])
      .map(
        (source) => `
          <tr>
            <td>${escapeHtml(source.label || source.source || "Direct")}</td>
            <td>${formatInteger(source.sessions || 0)}</td>
            <td>${formatInteger(source.beginCheckout || 0)}</td>
            <td>${formatInteger(source.purchases || 0)}</td>
          </tr>
        `
      )
      .join("") || emptyRow(4, "No sources yet.");

    linkTable.innerHTML = (dashboard.topClicks || [])
      .map(
        (link) => `
          <tr>
            <td>${escapeHtml(link.label || link.href || "Link")}</td>
            <td>${formatInteger(link.clicks || 0)}</td>
            <td>${escapeHtml(link.pagePath || "Unknown page")}</td>
          </tr>
        `
      )
      .join("") || emptyRow(3, "No links yet.");

    pageTable.innerHTML = (dashboard.pages || [])
      .map(
        (page) => `
          <tr>
            <td>${escapeHtml(page.pagePath || "Unknown page")}</td>
            <td>${formatInteger(page.pageViews || 0)}</td>
            <td>${formatInteger(page.beginCheckout || 0)}</td>
            <td>${formatInteger(page.purchases || 0)}</td>
          </tr>
        `
      )
      .join("") || emptyRow(4, "No page views yet.");
  }

  function renderSessions() {
    if (!state.dashboard) return;

    const filtered = getFilteredSessions();
    if (!filtered.length) {
      sessionList.innerHTML = `
        <div class="empty-state">
          <strong>No sessions match this filter.</strong>
          <p>Try a source, device, location, path, or link term.</p>
        </div>
      `;
      if (state.dashboard.recentSessions?.length && !state.selectedSessionId) {
        state.selectedSessionId = state.dashboard.recentSessions[0].sessionId;
      }
      return;
    }

    if (!filtered.some((session) => session.sessionId === state.selectedSessionId)) {
      state.selectedSessionId = filtered[0].sessionId;
    }

    sessionList.innerHTML = filtered
      .map((session) => {
        const active = session.sessionId === state.selectedSessionId ? "active" : "";
        return `
          <button class="session-item ${active}" data-session-id="${escapeHtml(session.sessionId)}" type="button">
            <div class="session-top">
              <strong>${escapeHtml(session.summary || session.firstPath || "Session")}</strong>
              <span class="muted-code">${escapeHtml(formatRelativeTime(session.lastEventAt))}</span>
            </div>
            <p class="session-summary">${escapeHtml(session.source || "direct / direct")}</p>
            <div class="session-meta">
              <span>${escapeHtml(session.device?.summary || session.deviceType || "Unknown device")}</span>
              <span>${escapeHtml(session.location?.summary || "Unknown location")}</span>
              <span>${formatInteger(session.screenCount || (session.pagePaths || []).length || 0)} screens</span>
              <span>${formatInteger(session.clickCount || 0)} clicks</span>
            </div>
            <div class="session-meta">
              <span>${escapeHtml(session.status || "open")}</span>
              <span>${escapeHtml(session.visitorType || "anonymous")}</span>
            </div>
          </button>
        `;
      })
      .join("");

    Array.from(sessionList.querySelectorAll("[data-session-id]")).forEach((node) => {
      const sessionId = node.getAttribute("data-session-id");
      node.addEventListener("click", () => {
        state.selectedSessionId = sessionId || "";
        renderSessions();
        renderSelectedSession();
      });
    });
  }

  function renderSelectedSession() {
    if (!state.dashboard) return;

    const session = getFilteredSessions().find((item) => item.sessionId === state.selectedSessionId);
    if (!session) {
      sessionDetail.innerHTML = `
        <div class="empty-state">
          <strong>No session selected.</strong>
          <p>Pick a visit from the list to inspect the screens, links, and scroll behavior.</p>
        </div>
      `;
      return;
    }

    const pageFlow = session.pagePaths || [];
    const timeline = session.eventTimeline || [];
    const links = session.clickedTargets || [];
    const checkoutSteps = session.checkoutSteps || [];

    sessionDetail.innerHTML = `
      <div class="detail-shell">
        <div class="detail-header">
          <div>
            <div class="eyebrow">Selected session</div>
            <h2 class="detail-title">${escapeHtml(session.summary || session.firstPath || "Session")}</h2>
            <p class="lede">${escapeHtml(formatTimestamp(session.startedAt))} to ${escapeHtml(formatTimestamp(session.lastEventAt))}</p>
            <p class="muted-code">${escapeHtml(session.sessionId || "unknown session")}</p>
          </div>
          <div class="detail-stamp">
            <span>Duration</span>
            <strong>${escapeHtml(formatDuration((session.lastEventAt - session.startedAt) / 1000))}</strong>
          </div>
        </div>

        <div class="detail-meta-grid">
          <div class="detail-meta">
            <span class="label">Source</span>
            <span class="value">${escapeHtml(session.source || "direct / direct")}</span>
            <span class="panel-copy">${escapeHtml(session.referrerDomain || "No referrer")}</span>
          </div>
          <div class="detail-meta">
            <span class="label">Device</span>
            <span class="value">${escapeHtml(session.device?.summary || session.deviceType || "Unknown")}</span>
            <span class="panel-copy">${escapeHtml(session.device?.timezone || session.device?.language || "No extra device data")}</span>
          </div>
          <div class="detail-meta">
            <span class="label">Location</span>
            <span class="value">${escapeHtml(session.location?.summary || "Unknown location")}</span>
            <span class="panel-copy">${escapeHtml(session.location?.countryCode || session.location?.timezone || "No geo fields yet")}</span>
          </div>
          <div class="detail-meta">
            <span class="label">Entry</span>
            <span class="value">${escapeHtml(session.firstPath || "/")}</span>
            <span class="panel-copy">${escapeHtml(session.lastPath || "No exit path")}</span>
          </div>
        </div>

        <div>
          <div class="section-heading">
            <div>
              <div class="eyebrow">Flow</div>
              <h3>Screen by screen</h3>
            </div>
            <div class="pill-row">
              <span class="pill">${formatInteger(session.screenCount || pageFlow.length || 0)} screens</span>
              <span class="pill">${formatInteger(session.viewCount || session.pageViews || 0)} views</span>
              <span class="pill">${formatInteger(session.clickCount || 0)} clicks</span>
              <span class="pill">${formatInteger(session.maxScrollPercent || 0)}% max scroll</span>
            </div>
          </div>
          <div class="pill-row">
            ${(pageFlow.length ? pageFlow : [session.firstPath, session.lastPath].filter(Boolean))
              .map((page) => `<span class="pill">${escapeHtml(page)}</span>`)
              .join("")}
          </div>
        </div>

        <div>
          <div class="section-heading">
            <div>
              <div class="eyebrow">Links</div>
              <h3>Clicked links</h3>
            </div>
          </div>
          <div class="screen-links">
            ${links.map((link) => `<span class="chip">${escapeHtml(link)}</span>`).join("") || '<span class="pill">No link clicks recorded</span>'}
          </div>
        </div>

        <div>
          <div class="section-heading">
            <div>
              <div class="eyebrow">Checkout</div>
              <h3>Completed steps</h3>
            </div>
          </div>
          <div class="pill-row">
            ${checkoutSteps.map((step) => `<span class="pill">${escapeHtml(step)}</span>`).join("") || '<span class="pill">No checkout steps recorded</span>'}
          </div>
        </div>

        <div>
          <div class="section-heading">
            <div>
              <div class="eyebrow">Activity</div>
              <h3>Event timeline</h3>
            </div>
          </div>
          <div class="timeline-list">
            ${timeline.map(renderTimelineItem).join("") || '<div class="empty-state"><strong>No activity events.</strong><p>This session did not emit timeline events.</p></div>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderTimelineItem(event) {
    const tone = toneForEvent(event.event);
    return `
      <article class="timeline-item ${tone}">
        <div class="timeline-top">
          <strong>${escapeHtml(event.label || event.event || "Event")}</strong>
          <span class="muted-code">${escapeHtml(formatTimestamp(event.at))}</span>
        </div>
        <p class="timeline-detail">${escapeHtml(event.path || event.href || event.event || "Tracked event")}</p>
        <div class="timeline-stats">
          ${event.href ? `<span>${escapeHtml(event.href)}</span>` : ""}
          ${event.scrollPercent ? `<span>${formatInteger(event.scrollPercent)}% scroll</span>` : ""}
          ${event.seconds ? `<span>${formatInteger(event.seconds)}s milestone</span>` : ""}
        </div>
      </article>
    `;
  }

  function getFilteredSessions() {
    if (!state.dashboard) return [];

    const sessions = state.dashboard.recentSessions || [];
    if (!state.query) return sessions;

    return sessions.filter((session) => {
      const haystack = [
        session.summary,
        session.sessionId,
        session.source,
        session.status,
        session.visitorType,
        session.device?.summary,
        session.location?.summary,
        session.firstPath,
        session.lastPath,
        session.referrerDomain,
        ...(session.pagePaths || []),
        ...(session.clickedTargets || []),
        ...(session.eventTimeline || []).flatMap((event) => [event.label, event.event, event.path, event.href]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(state.query);
    });
  }

  function toneForEvent(eventName) {
    if (["begin_checkout", "checkout_blocked"].includes(eventName)) return "critical";
    if (["click_target", "checkout_redirect"].includes(eventName)) return "high";
    if (["scroll_depth", "engagement_milestone", "page_view", "view_item", "cta_impression"].includes(eventName)) return "good";
    return "watch";
  }

  function emptyRow(colspan, label) {
    return `<tr><td colspan="${colspan}">${escapeHtml(label)}</td></tr>`;
  }

  function countUnique(values) {
    return new Set(values.filter(Boolean)).size;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    if (total < 60) return `${Math.round(total)}s`;
    const minutes = Math.floor(total / 60);
    const remainder = Math.round(total % 60);
    return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function formatRelativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
