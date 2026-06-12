const form = document.getElementById("spray-intake-form");
const steps = Array.from(document.querySelectorAll(".intake-step"));
const product = window.MACKLEYProduct || {};
const intakeStorageKey = "mackley_provider_intake";
const referralStorageKey = "mackley_referral_claim";
const referralShareStorageKey = "mackley_referral_share";
const referralParams = new URLSearchParams(window.location.search);
let currentStep = 0;
let latestPayload = null;

function getProductName() {
  return product.name || "Intranasal Neuropeptide Formula";
}

function trackLoopEvent(name, payload) {
  if (!window.MACKLEYAnalytics || typeof window.MACKLEYAnalytics.track !== "function") {
    return;
  }
  window.MACKLEYAnalytics.track(name, {
    timestamp: new Date().toISOString(),
    ...payload
  });
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function shortHash(value) {
  let hash = 0;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildActorId(payload) {
  const seed = payload?.email || payload?.fullName || window.crypto?.randomUUID?.() || Date.now();
  return `mk-${shortHash(seed)}`;
}

function readReferralClaim() {
  const referrer = normalizeToken(referralParams.get("ref"));
  const loop = normalizeToken(referralParams.get("loop"));
  const offer = referralParams.get("offer") === "20" ? "20" : "";
  const depth = Math.max(0, Number(referralParams.get("depth") || 0) || 0);

  if (!referrer && !loop && !offer) return null;

  return {
    referrerUserId: referrer,
    loopId: loop || `loop-${shortHash(referrer || Date.now())}`,
    offerPercent: offer || "20",
    shareDepth: depth,
    claimedAt: new Date().toISOString()
  };
}

function applyReferralClaim() {
  const claim = readReferralClaim();
  const note = document.getElementById("referral-note");
  if (!claim) return null;

  localStorage.setItem(referralStorageKey, JSON.stringify(claim));
  if (note) {
    note.hidden = false;
    note.textContent = `${claim.offerPercent}% referral offer applied.`;
  }
  trackLoopEvent("loop_demand_claimed", {
    actor_user_id: "",
    subject_user_id: "",
    loop_id: claim.loopId,
    channel: "link",
    share_depth: claim.shareDepth,
    referrer_user_id: claim.referrerUserId
  });
  return claim;
}

function readStoredReferralClaim() {
  try {
    return JSON.parse(localStorage.getItem(referralStorageKey) || "null");
  } catch (error) {
    return null;
  }
}

const activeReferralClaim = applyReferralClaim() || readStoredReferralClaim();

function showStep(index) {
  currentStep = index;
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function errorFor(name) {
  return document.querySelector(`[data-error-for="${name}"]`);
}

function setError(name, message) {
  const error = errorFor(name);
  if (error) error.textContent = message || "";
}

function checkedValues(name) {
  return Array.from(form.querySelectorAll(`[name="${name}"]:checked`)).map((input) => input.value);
}

function validateConditions() {
  const values = checkedValues("conditions");
  setError("conditions", values.length ? "" : "Please select at least one option.");
  return values.length > 0;
}

function validateProfile() {
  const active = steps[currentStep];
  const fields = Array.from(active.querySelectorAll("input[required], select[required]"));
  let valid = true;

  fields.forEach((field) => {
    const isRadio = field.type === "radio";
    const fieldValid = isRadio ? checkedValues(field.name).length > 0 : field.checkValidity();
    field.closest(".intake-field")?.classList.toggle("has-error", !fieldValid);
    valid = valid && fieldValid;
  });

  const age = Number(form.elements.age?.value || 0);
  if (age && age < 18) {
    valid = false;
    form.elements.age.closest(".intake-field")?.classList.add("has-error");
  }

  setError("profile", valid ? "" : "Please complete every required field. You must be at least 18.");
  return valid;
}

function validateAttestation() {
  const valid = checkedValues("surgeries").length > 0;
  setError("attestation", valid ? "" : "Please answer the surgery question.");
  return valid;
}

function validateCurrentStep() {
  const stepName = steps[currentStep]?.dataset.step;
  if (stepName === "conditions") return validateConditions();
  if (stepName === "profile") return validateProfile();
  if (stepName === "attestation") return validateAttestation();
  return true;
}

function collectPayload() {
  const referral = activeReferralClaim || readStoredReferralClaim();
  return {
    product: getProductName(),
    price: Number(product.value || 30),
    stripeProductId: product.stripeProductId || "prod_UgF2SFTaA6cCVy",
    status: "pending_provider_approval",
    paymentStatus: "not_started",
    conditions: checkedValues("conditions"),
    email: form.elements.email.value,
    fullName: form.elements.fullName.value,
    age: form.elements.age.value,
    sex: checkedValues("sex")[0] || "",
    state: form.elements.state.value,
    surgeries: checkedValues("surgeries")[0] || "",
    riskFactors: form.elements.riskFactors.value,
    referral,
    submittedAt: new Date().toISOString()
  };
}

function updateCompletionState(payload) {
  const status = document.getElementById("intake-status");
  if (status) {
    status.textContent = `Status: pending provider approval for ${payload.fullName}.`;
  }
}

function buildReferralLink(payload) {
  const actorUserId = buildActorId(payload);
  const loopId = `inf-${shortHash(`${actorUserId}:${payload.submittedAt || Date.now()}`)}`;
  const priorDepth = Number(payload.referral?.shareDepth || 0) || 0;
  const url = new URL("/spray-intake/", window.location.origin);
  url.searchParams.set("ref", actorUserId);
  url.searchParams.set("offer", "20");
  url.searchParams.set("loop", loopId);
  url.searchParams.set("depth", String(priorDepth + 1));

  return {
    actorUserId,
    loopId,
    shareDepth: priorDepth + 1,
    url: url.toString()
  };
}

function writeShareStatus(message) {
  const status = document.getElementById("share-status");
  if (status) status.textContent = message;
}

function showReferralLink(url) {
  const link = document.getElementById("share-link");
  if (!link) return;
  link.hidden = false;
  link.href = url;
  link.textContent = url;
}

async function shareReferral() {
  if (!latestPayload) {
    try {
      latestPayload = JSON.parse(localStorage.getItem(intakeStorageKey) || "null");
    } catch (error) {
      latestPayload = null;
    }
  }

  if (!latestPayload) {
    writeShareStatus("Complete the provider survey first.");
    return;
  }

  const share = buildReferralLink(latestPayload);
  const sharePayload = {
    title: "INF by MACKLEY",
    text: "I thought you might want to check out INF. This link applies 20% off if you are approved by a licensed provider.",
    url: share.url
  };

  localStorage.setItem(referralShareStorageKey, JSON.stringify({
    ...share,
    createdAt: new Date().toISOString()
  }));

  trackLoopEvent("loop_supply_created", {
    actor_user_id: share.actorUserId,
    subject_user_id: "",
    loop_id: share.loopId,
    channel: "share",
    share_depth: share.shareDepth,
    referrer_user_id: latestPayload.referral?.referrerUserId || ""
  });

  try {
    if (navigator.share && typeof navigator.share === "function") {
      await navigator.share(sharePayload);
      trackLoopEvent("loop_shared", {
        actor_user_id: share.actorUserId,
        subject_user_id: "",
        loop_id: share.loopId,
        channel: "native_share",
        share_depth: share.shareDepth,
        referrer_user_id: latestPayload.referral?.referrerUserId || ""
      });
      writeShareStatus("Referral link ready to send.");
      return;
    }

    showReferralLink(share.url);
    trackLoopEvent("loop_link_copied", {
      actor_user_id: share.actorUserId,
      subject_user_id: "",
      loop_id: share.loopId,
      channel: "visible_link",
      share_depth: share.shareDepth,
      referrer_user_id: latestPayload.referral?.referrerUserId || ""
    });
    writeShareStatus("Referral link ready.");
  } catch (error) {
    showReferralLink(share.url);
    writeShareStatus("Referral link ready.");
  }
}

form.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-exclusive]") && target.checked) {
    const groupName = target.dataset.exclusive;
    form.querySelectorAll(`[name="${groupName}"]`).forEach((input) => {
      if (input !== target) input.checked = false;
    });
  } else if (target.name === "conditions" && target.checked) {
    const exclusive = form.querySelector(`[data-exclusive="${target.name}"]`);
    if (exclusive && exclusive !== target) exclusive.checked = false;
  }
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!validateCurrentStep()) return;
    showStep(currentStep + 1);
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) return;

  const payload = collectPayload();
  latestPayload = payload;
  localStorage.setItem(intakeStorageKey, JSON.stringify(payload));

  if (window.MACKLEYAnalytics && typeof window.MACKLEYAnalytics.track === "function") {
    window.MACKLEYAnalytics.track("provider_survey_submitted", {
      product: payload.product,
      value: payload.price,
      destination: "licensed_provider_review",
      status: payload.status
    });
  }

  updateCompletionState(payload);
  showStep(steps.findIndex((step) => step.dataset.step === "complete"));
});

document.querySelector("[data-share-referral]")?.addEventListener("click", shareReferral);
