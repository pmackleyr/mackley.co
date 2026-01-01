const API_BASE = "https://api.mackley.co";
const PROOF_ENDPOINT = `${API_BASE}/social-proof`;
const PROOF_REFRESH_MS = 60000;
const formatter = new Intl.NumberFormat("en-US");

const proofs = Array.from(document.querySelectorAll(".social-proof[data-proof]"));

function getWindowSeconds(el) {
  const parsed = Number(el.dataset.window);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  return el.dataset.proof === "purchase" ? 3600 : 900;
}

function shouldRecordOnLoad(el) {
  if (el.dataset.record === "false") return false;
  return el.dataset.proof === "view";
}

function formatProofText(el, count) {
  const singular = el.dataset.singular || "";
  const plural = el.dataset.label || "";
  const label = count === 1 && singular ? singular : plural;
  if (!label) return formatter.format(count);
  return `${formatter.format(count)} ${label}`.trim();
}

async function fetchProof(el, record) {
  const payload = {
    type: el.dataset.proof,
    page: el.dataset.page || "site",
    window: getWindowSeconds(el),
    record: Boolean(record),
    total: el.dataset.total === "true"
  };

  const response = await fetch(PROOF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    keepalive: record
  });

  if (!response.ok) {
    throw new Error("Proof request failed.");
  }

  const data = await response.json();
  return typeof data.count === "number" ? data.count : null;
}

async function updateProof(el, record) {
  try {
    const count = await fetchProof(el, record);
    if (typeof count === "number") {
      el.textContent = formatProofText(el, count);
    }
  } catch (error) {
    // Keep placeholder text on error.
  } finally {
    el.classList.add("is-ready");
  }
}

if (proofs.length) {
  proofs.forEach((el, index) => {
    const delay = Number(el.dataset.delay);
    const stagger = Number.isNaN(delay) ? 220 + index * 140 : delay;
    el.style.setProperty("--proof-delay", `${stagger}ms`);
    updateProof(el, shouldRecordOnLoad(el));
    window.setInterval(() => updateProof(el, false), PROOF_REFRESH_MS);
  });
}
