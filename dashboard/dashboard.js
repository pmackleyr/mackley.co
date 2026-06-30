(() => {
  const API_BASE = "https://api.mackley.co";
  const localPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
    || new URLSearchParams(window.location.search).get("demo") === "1";
  const state = { dashboard: null, days: 14, loading: false, accessToken: "" };

  const elements = {
    metricGrid: document.getElementById("metric-grid"),
    funnelList: document.getElementById("funnel-list"),
    priorityList: document.getElementById("priority-list"),
    reviewRows: document.getElementById("review-rows"),
    peopleRows: document.getElementById("people-rows"),
    referralMetrics: document.getElementById("referral-metrics"),
    referralList: document.getElementById("referral-list"),
    sourceList: document.getElementById("source-list"),
    checkList: document.getElementById("check-list"),
    activityList: document.getElementById("activity-list"),
    alert: document.getElementById("ops-alert"),
    error: document.getElementById("dashboard-error"),
    refresh: document.getElementById("refresh-dashboard"),
    retry: document.getElementById("retry-dashboard"),
    period: document.getElementById("period-select"),
    peopleFilter: document.getElementById("people-filter")
  };
  elements.login = document.getElementById("operator-login");
  elements.loginPassword = document.getElementById("operator-password");

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function replaceChildren(target, children) {
    target.replaceChildren(...children.filter(Boolean));
  }

  function formatInteger(value) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0)}%`;
  }

  function formatCurrency(cents) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format((Number(cents) || 0) / 100);
  }

  function formatDate(value, options = {}) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(options.time ? { hour: "numeric", minute: "2-digit" } : {})
    }).format(date);
  }

  function formatRelativeHours(hours) {
    if (hours === null || hours === undefined) return "Expiry unavailable";
    if (hours <= 0) return "Expired";
    if (hours < 24) return `${Math.ceil(hours)}h remaining`;
    return `${Math.ceil(hours / 24)}d remaining`;
  }

  function statusLabel(status) {
    return {
      AWAITING_AUTHORIZATION: "Awaiting authorization",
      PENDING_PROVIDER_REVIEW: "Pending review",
      APPROVAL_PROCESSING: "Processing approval",
      PAYMENT_CAPTURED: "Payment captured",
      ACTIVE: "Active",
      DENIED: "Denied"
    }[status] || String(status || "Unknown").replaceAll("_", " ");
  }

  function statusClass(status, hoursRemaining) {
    if (status === "ACTIVE") return "is-active";
    if (status === "DENIED") return "is-denied";
    if (status === "APPROVAL_PROCESSING" || (hoursRemaining !== null && hoursRemaining <= 24)) return "is-attention";
    return "";
  }

  function statusPill(status, hoursRemaining) {
    return createElement("span", `status-pill ${statusClass(status, hoursRemaining)}`.trim(), statusLabel(status));
  }

  function cell(main, sub) {
    const wrapper = createElement("div");
    wrapper.append(createElement("span", "cell-main", main));
    if (sub) wrapper.append(createElement("span", "cell-sub", sub));
    return wrapper;
  }

  function tableCell(content) {
    const td = document.createElement("td");
    td.append(content instanceof Node ? content : document.createTextNode(String(content ?? "")));
    return td;
  }

  function emptyTableRow(columnCount, message) {
    const row = document.createElement("tr");
    const td = createElement("td", "", message);
    td.colSpan = columnCount;
    row.append(td);
    return row;
  }

  function renderMetrics(dashboard) {
    const kpis = dashboard.kpis || {};
    const metrics = [
      ["Sessions", formatInteger(kpis.sessions), `Last ${dashboard.days} days`],
      ["Survey submissions", formatInteger(kpis.surveySubmissions), `${formatPercent(kpis.surveyRate)} of sessions`],
      ["Pending reviews", formatInteger(kpis.pendingReviews), "Licensed provider queue"],
      ["Authorized value", formatCurrency(kpis.authorizedValue), "Not yet captured"],
      ["Purchases", formatInteger(kpis.purchases), `${formatCurrency(kpis.purchaseValue)} captured`],
      ["Denied requests", formatInteger(kpis.deniedRequests), "No charge captured"]
    ];
    replaceChildren(elements.metricGrid, metrics.map(([label, value, note]) => {
      const metric = createElement("div", "metric");
      metric.append(
        createElement("span", "metric-label", label),
        createElement("strong", "metric-value", value),
        createElement("span", "metric-note", note)
      );
      return metric;
    }));
  }

  function renderFunnel(dashboard) {
    replaceChildren(elements.funnelList, (dashboard.funnel || []).map((item) => {
      const row = createElement("div", "funnel-row");
      const track = createElement("div", "bar-track");
      const fill = createElement("div", "bar-fill");
      fill.style.width = `${Math.max(1, Math.min(100, Number(item.rate) || 0))}%`;
      track.append(fill);
      row.append(
        createElement("span", "funnel-label", item.label),
        track,
        createElement("span", "funnel-rate", `${formatInteger(item.value)} · ${formatPercent(item.rate)}`)
      );
      return row;
    }));
  }

  function renderPriorities(dashboard) {
    const reliability = dashboard.reliability || {};
    const priorities = [
      ["Provider reviews", `${formatInteger(dashboard.kpis?.pendingReviews)} waiting`],
      ["Authorization window", reliability.expiringSoon ? `${reliability.expiringSoon} expire soon` : "No urgent expiries"],
      ["Approval processing", reliability.processingStale ? `${reliability.processingStale} stalled` : "Clear"],
      ["Authorized value", formatCurrency(dashboard.kpis?.authorizedValue)]
    ];
    replaceChildren(elements.priorityList, priorities.map(([label, value]) => {
      const row = createElement("div", "priority-row");
      const copy = createElement("div", "priority-copy");
      copy.append(createElement("strong", "", label), createElement("span", "", "Current operating state"));
      row.append(copy, createElement("span", "priority-value", value));
      return row;
    }));
  }

  function renderReviews(dashboard) {
    const reviews = dashboard.reviews || [];
    document.querySelector("[data-nav-review-count]").textContent = formatInteger(reviews.length);
    document.getElementById("review-meta").textContent = `${formatInteger(reviews.length)} open`;
    const rows = reviews.map((review) => {
      const row = document.createElement("tr");
      row.append(
        tableCell(cell(review.person, `${review.email} · ${review.requestId}`)),
        tableCell(cell(formatDate(review.submittedAt, { time: true }), review.orderId)),
        tableCell(review.state || "--"),
        tableCell(review.safetySignals === null
          ? cell("Restricted", "Provider role required")
          : cell(`${formatInteger(review.safetySignals)} signals`, review.medicationDeclared ? "Medication declared" : "No medication declared")),
        tableCell(cell(formatRelativeHours(review.authorizationHoursRemaining), formatCurrency(review.amountAuthorized))),
        tableCell(statusPill(review.status, review.authorizationHoursRemaining))
      );
      return row;
    });
    replaceChildren(elements.reviewRows, rows.length ? rows : [emptyTableRow(6, "No provider reviews are waiting.")]);
  }

  function filteredPeople(dashboard) {
    const filter = elements.peopleFilter.value;
    if (filter === "active") return dashboard.people.filter((person) => person.status === "ACTIVE");
    if (filter === "denied") return dashboard.people.filter((person) => person.status === "DENIED");
    if (filter === "review") return dashboard.people.filter((person) => [
      "AWAITING_AUTHORIZATION",
      "PENDING_PROVIDER_REVIEW",
      "APPROVAL_PROCESSING"
    ].includes(person.status));
    return dashboard.people;
  }

  function renderPeople(dashboard) {
    const people = filteredPeople(dashboard);
    const rows = people.map((person) => {
      const row = document.createElement("tr");
      row.append(
        tableCell(cell(person.person || "--", person.requestId)),
        tableCell(cell(person.contact || person.email || "--", "Email")),
        tableCell(person.location || person.state || "--"),
        tableCell(statusPill(person.status, person.authorizationHoursRemaining)),
        tableCell(formatDate(person.submittedAt, { time: true })),
        tableCell(cell(formatCurrency(person.amountAuthorized), person.referralCode || "Direct"))
      );
      return row;
    });
    replaceChildren(elements.peopleRows, rows.length ? rows : [emptyTableRow(6, "No people match this status.")]);
  }

  function renderReferrals(dashboard) {
    const referrals = dashboard.referrals || {};
    document.getElementById("referral-meta").textContent = `${formatPercent(referrals.conversionRate)} activated`;
    const metrics = [
      ["Claims", formatInteger(referrals.claims)],
      ["Activated", formatInteger(referrals.activated)],
      ["Conversion", formatPercent(referrals.conversionRate)]
    ];
    replaceChildren(elements.referralMetrics, metrics.map(([label, value]) => {
      const metric = createElement("div", "referral-metric");
      metric.append(createElement("span", "", label), createElement("strong", "", value));
      return metric;
    }));
    const rows = (referrals.recent || []).map((referral) => {
      const row = createElement("div", "compact-row");
      row.append(cell(referral.code, `${referral.orderId} · ${formatDate(referral.submittedAt)}`), statusPill(referral.status));
      return row;
    });
    replaceChildren(elements.referralList, rows.length ? rows : [createElement("p", "section-meta", "No referral claims yet.")]);
  }

  function renderSources(dashboard) {
    replaceChildren(elements.sourceList, (dashboard.sources || []).map((source) => {
      const row = createElement("div", "source-row");
      const copy = createElement("div", "source-copy");
      copy.append(createElement("strong", "", source.label), createElement("span", "", `${formatInteger(source.sessions)} sessions`));
      row.append(copy, createElement("span", "source-value", formatPercent(source.providerSurveyRate)));
      return row;
    }));
  }

  function renderReliability(dashboard) {
    const reliability = dashboard.reliability || {};
    const attention = reliability.status === "attention";
    document.querySelector("[data-system-dot]").classList.toggle("is-attention", attention);
    document.querySelector("[data-system-label]").textContent = attention ? "Attention required" : "Systems healthy";
    elements.alert.hidden = !attention;
    if (attention) {
      document.querySelector("[data-alert-title]").textContent = "Attention required";
      document.querySelector("[data-alert-copy]").textContent = (reliability.checks || []).find((check) => /expire|attention|missing/i.test(check)) || "Review the reliability checks below.";
    }

    replaceChildren(elements.checkList, (reliability.checks || []).map((check) => {
      const row = createElement("div", "check-row");
      const needsAttention = /expire|stalled|missing|attention/i.test(check) && !/No |clear|complete/i.test(check);
      row.append(createElement("span", `check-icon${needsAttention ? " is-attention" : ""}`), createElement("span", "", check));
      return row;
    }));

    replaceChildren(elements.activityList, (dashboard.activity || []).map((event) => {
      const row = createElement("div", "activity-row");
      const copy = createElement("div", "activity-copy");
      copy.append(
        createElement("strong", "", `${event.person || "--"} · ${statusLabel(event.toStatus || event.action)}`),
        createElement("span", "", `${event.orderId} · ${event.reason || event.action} · ${event.actor?.role || "system"}`)
      );
      row.append(copy, createElement("span", "activity-time", formatDate(event.at, { time: true })));
      return row;
    }));
    document.getElementById("generated-at").textContent = `Updated ${formatDate(dashboard.generatedAt, { time: true })}`;
  }

  function renderDashboard(dashboard) {
    state.dashboard = dashboard;
    document.body.classList.remove("is-loading");
    elements.error.hidden = true;
    elements.login.hidden = true;
    document.querySelectorAll(".ops-section").forEach((section) => { section.hidden = false; });
    document.querySelector("[data-viewer-role]").textContent = dashboard.viewer?.role || "Operator";
    document.querySelector("[data-viewer-email]").textContent = localPreview ? "Preview data" : dashboard.viewer?.email || "Access protected";
    document.querySelector("[data-period-label]").textContent = `Count · % of sessions · ${dashboard.days} days`;
    renderMetrics(dashboard);
    renderFunnel(dashboard);
    renderPriorities(dashboard);
    renderReviews(dashboard);
    renderPeople(dashboard);
    renderReferrals(dashboard);
    renderSources(dashboard);
    renderReliability(dashboard);
    window.__MACKLEY_OPS__ = {
      viewer: dashboard.viewer,
      days: dashboard.days,
      kpis: dashboard.kpis,
      funnel: dashboard.funnel,
      peopleCount: dashboard.people?.length || 0,
      reviewCount: dashboard.reviews?.length || 0,
      generatedAt: dashboard.generatedAt
    };
    window.__OPENMAT__ = window.__MACKLEY_OPS__;
  }

  function showError(message, allowPassword = false) {
    document.body.classList.remove("is-loading");
    document.querySelectorAll(".ops-section").forEach((section) => { section.hidden = true; });
    elements.alert.hidden = true;
    elements.error.hidden = false;
    elements.error.querySelector("[data-error-copy]").textContent = message;
    elements.login.hidden = !allowPassword;
    elements.retry.hidden = allowPassword;
    if (allowPassword) elements.loginPassword.focus();
  }

  async function loadDashboard() {
    if (state.loading) return;
    state.loading = true;
    document.body.classList.add("is-loading");
    elements.refresh.disabled = true;
    try {
      if (localPreview) {
        const dashboard = window.MACKLEY_OPS_DEMO;
        if (!dashboard) throw new Error("Preview data is unavailable.");
        renderDashboard({ ...dashboard, days: state.days, generatedAt: new Date().toISOString() });
        return;
      }
      const headers = { "Content-Type": "application/json" };
      if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
      const response = await fetch(`${API_BASE}/ops/dashboard`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers,
        body: JSON.stringify({ days: state.days })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) {
        showError(
          state.accessToken ? "That dashboard password was not accepted." : "Sign in with Cloudflare Access or the temporary dashboard password.",
          true
        );
        return;
      }
      if (!response.ok || !payload.dashboard) throw new Error(payload.error || "Operator access is unavailable.");
      renderDashboard(payload.dashboard);
    } catch (error) {
      showError(error.message || "Confirm Cloudflare Access and try again.");
    } finally {
      state.loading = false;
      elements.refresh.disabled = false;
    }
  }

  elements.refresh.addEventListener("click", loadDashboard);
  elements.retry.addEventListener("click", loadDashboard);
  elements.login.addEventListener("submit", (event) => {
    event.preventDefault();
    state.accessToken = String(new FormData(elements.login).get("password") || "");
    elements.loginPassword.value = "";
    loadDashboard();
  });
  elements.period.addEventListener("change", () => {
    state.days = Number(elements.period.value) || 14;
    loadDashboard();
  });
  elements.peopleFilter.addEventListener("change", () => {
    if (state.dashboard) renderPeople(state.dashboard);
  });

  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!visible) return;
    document.querySelectorAll(".ops-nav a").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`);
    });
  }, { rootMargin: "-20% 0px -65%", threshold: [0, 0.25, 0.6] });
  document.querySelectorAll(".ops-section").forEach((section) => sectionObserver.observe(section));

  window.MACKLEYDashboard = { reload: loadDashboard, getState: () => ({ ...state }) };
  window.render_app_to_text = () => JSON.stringify(window.__MACKLEY_OPS__ || {}, null, 2);
  window.advanceTime = async () => Promise.resolve();
  loadDashboard();
})();
