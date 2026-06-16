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

function hasFirstAndLastName(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length >= 2;
}

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

function conditionValues() {
  const otherValue = String(form.elements.conditionsOther?.value || "").trim();
  return checkedValues("conditions").map((value) => {
    if (value === "Other" && otherValue) return `Other: ${otherValue}`;
    return value;
  });
}

function validateRequiredGroup(name) {
  const group = form.querySelector(`[data-required-group="${name}"]`);
  const valid = checkedValues(name).length > 0;
  group?.classList.toggle("has-error", !valid);
  return valid;
}

function validateConditions() {
  const values = checkedValues("conditions");
  const otherSelected = values.includes("Other");
  const otherField = form.querySelector('[data-conditional-field="conditionsOther"]');
  const otherValid = !otherSelected || String(form.elements.conditionsOther?.value || "").trim().length > 0;
  const valid = values.length > 0 && otherValid;

  otherField?.classList.toggle("has-error", otherSelected && !otherValid);
  setError("conditions", valid ? "" : "Please select at least one option and specify any other condition.");
  return valid;
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

  const fullName = form.elements.fullName;
  const fullNameValid = hasFirstAndLastName(fullName?.value);
  fullName?.closest(".intake-field")?.classList.toggle("has-error", !fullNameValid);
  valid = valid && fullNameValid;

  const age = Number(form.elements.age?.value || 0);
  if (age && age < 18) {
    valid = false;
    form.elements.age.closest(".intake-field")?.classList.add("has-error");
  }

  setError("profile", valid ? "" : "Please complete every required field. First and last name are required, and you must be at least 18.");
  return valid;
}

function validateAttestation() {
  const recentSurgeriesValid = validateRequiredGroup("recentSurgeries");
  const riskDiagnosesValid = validateRequiredGroup("riskDiagnoses");
  const medicationsValid = validateRequiredGroup("prescriptionMedications");
  const valid = recentSurgeriesValid && riskDiagnosesValid && medicationsValid;
  setError("attestation", valid ? "" : "Please complete every required question.");
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
    conditions: conditionValues(),
    email: form.elements.email.value,
    fullName: form.elements.fullName.value,
    age: form.elements.age.value,
    sex: checkedValues("sex")[0] || "",
    state: form.elements.state.value,
    recentSurgeries: checkedValues("recentSurgeries")[0] || "",
    recentSurgeriesDetails: form.elements.recentSurgeriesDetails?.value || "",
    riskDiagnoses: checkedValues("riskDiagnoses"),
    prescriptionMedications: checkedValues("prescriptionMedications")[0] || "",
    medicationsList: form.elements.medicationsList?.value || "",
    goalsSymptoms: form.elements.goalsSymptoms?.value || "",
    attestation: "I attest that this request is for my personal use. I understand that submission of this form does not guarantee approval. All requests are reviewed by a licensed healthcare provider, who will determine eligibility based on medical history, current medications, symptoms, and treatment goals. Payment and fulfillment remain subject to provider approval.",
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

function syncConditionalFields() {
  document.querySelectorAll("[data-conditional-field]").forEach((field) => {
    const fieldName = field.dataset.conditionalField;
    const visible = Boolean(form.querySelector(`[data-reveals="${fieldName}"]:checked`));

    field.hidden = !visible;
    field.querySelectorAll("input, select, textarea").forEach((input) => {
      input.disabled = !visible;
      if (!visible) input.value = "";
    });

    if (!visible) field.classList.remove("has-error");
  });
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
  } else if (target.name && target.checked) {
    const exclusive = form.querySelector(`[data-exclusive="${target.name}"]`);
    if (exclusive && exclusive !== target) exclusive.checked = false;
  }

  syncConditionalFields();
});

syncConditionalFields();

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
