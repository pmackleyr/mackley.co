const form = document.getElementById("spray-intake-form");
const steps = Array.from(document.querySelectorAll(".intake-step"));
const reviewSteps = steps.filter((step) => step.dataset.step !== "complete");
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
  if (!window.MACKLEYAnalytics || typeof window.MACKLEYAnalytics.track !== "function") return;
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

function stepErrorName() {
  return steps[currentStep]?.dataset.step || "";
}

function errorFor(name) {
  return document.querySelector(`[data-error-for="${name}"]`);
}

function setError(name, message) {
  const error = errorFor(name);
  if (error) error.textContent = message || "";
}

function checkedValues(name) {
  if (!form) return [];
  return Array.from(form.querySelectorAll(`[name="${name}"]:checked`)).map((input) => input.value);
}

function value(name) {
  return String(form?.elements[name]?.value || "").trim();
}

function valuesWithOther(name, otherName) {
  return checkedValues(name).map((item) => {
    if (item === "Other" && otherName && value(otherName)) return `Other: ${value(otherName)}`;
    return item;
  });
}

function setGroupError(group, invalid) {
  group?.classList.toggle("has-error", Boolean(invalid));
}

function validateRequiredGroup(group) {
  if (!group || group.hidden) return true;
  const groupName = group.dataset.requiredGroup;
  const valid = checkedValues(groupName).length > 0;
  setGroupError(group, !valid);
  return valid;
}

function validateRequiredFields(active) {
  let valid = true;
  active.querySelectorAll("input[required]:not([type='radio']):not([type='checkbox']), select[required], textarea[required]").forEach((field) => {
    if (field.disabled || field.closest("[hidden]")) return;
    const fieldValid = field.checkValidity() && String(field.value || "").trim().length > 0;
    field.closest(".intake-field, .intake-conditional-field")?.classList.toggle("has-error", !fieldValid);
    valid = valid && fieldValid;
  });
  return valid;
}

function validateGenericStep() {
  const active = steps[currentStep];
  if (!active) return true;
  let valid = validateRequiredFields(active);

  active.querySelectorAll("[data-required-group]").forEach((group) => {
    valid = validateRequiredGroup(group) && valid;
  });

  return valid;
}

function validateIdentity() {
  let valid = validateGenericStep();
  const fullName = form.elements.fullName;
  const fullNameValid = hasFirstAndLastName(fullName?.value);
  fullName?.closest(".intake-field")?.classList.toggle("has-error", !fullNameValid);
  valid = valid && fullNameValid;

  const age = Number(form.elements.age?.value || 0);
  const ageValid = age >= 18 && age <= 120;
  form.elements.age?.closest(".intake-field")?.classList.toggle("has-error", !ageValid);
  valid = valid && ageValid;

  setError("identity", valid ? "" : "Please complete every required field. First and last name are required, and you must be at least 18.");
  return valid;
}

function validateSafety() {
  const valid = validateGenericStep();
  setError("safety", valid ? "" : "Please select at least one option and specify Other if selected.");
  return valid;
}

function validateMedications() {
  let valid = validateGenericStep();
  if (checkedValues("prescriptionMedications")[0] === "Yes") {
    const medicationGroup = document.querySelector('[data-required-group="medicationTypes"]');
    valid = validateRequiredGroup(medicationGroup) && valid;
  }
  setError("medications", valid ? "" : "Please answer the medication question and select any medication categories that apply.");
  return valid;
}

function validateGoals() {
  const goals = checkedValues("goals");
  const valid = validateGenericStep() && goals.length <= 3;
  setError("goals", valid ? "" : "Please pick up to 3 options and specify Other if selected.");
  return valid;
}

function validateBaseline() {
  const valid = validateGenericStep();
  setError("baseline", valid ? "" : "Please answer every baseline score.");
  return valid;
}

function validateCurrentStep() {
  const stepName = stepErrorName();
  if (stepName === "identity") return validateIdentity();
  if (stepName === "safety") return validateSafety();
  if (stepName === "medications") return validateMedications();
  if (stepName === "goals") return validateGoals();
  if (stepName === "baseline") return validateBaseline();
  setError(stepName, "");
  return validateGenericStep();
}

function updateProgress() {
  const progressLabel = document.querySelector("[data-progress-label]");
  const progressBar = document.querySelector("[data-progress-bar]");
  const activeStep = steps[currentStep];
  const reviewIndex = reviewSteps.indexOf(activeStep);

  if (reviewIndex < 0) {
    progressLabel?.setAttribute("hidden", "");
    progressBar?.style.setProperty("--intake-progress", "100%");
    return;
  }

  const progress = ((reviewIndex + 1) / reviewSteps.length) * 100;
  if (progressLabel) {
    progressLabel.hidden = false;
    progressLabel.textContent = `Step ${reviewIndex + 1} of ${reviewSteps.length}`;
  }
  progressBar?.style.setProperty("--intake-progress", `${progress}%`);
}

function showStep(index) {
  currentStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === currentStep);
  });
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncConditionalFields() {
  document.querySelectorAll("[data-conditional-field]").forEach((field) => {
    const fieldName = field.dataset.conditionalField;
    const visible = Boolean(form.querySelector(`[data-reveals="${fieldName}"]:checked`));

    field.hidden = !visible;
    field.querySelectorAll("input, select, textarea").forEach((input) => {
      input.disabled = !visible;
      if (!visible) {
        if (input.type === "checkbox" || input.type === "radio") input.checked = false;
        else input.value = "";
      }
    });

    if (!visible) field.classList.remove("has-error");
  });
}

function enforceMaxChecked(target) {
  const group = target.closest("[data-max-checked]");
  if (!group || !target.checked) return;
  const max = Number(group.dataset.maxChecked || 0);
  if (!max) return;

  const checked = Array.from(group.querySelectorAll(`input[name="${target.name}"]:checked`));
  if (checked.length <= max) return;
  target.checked = false;
  setError(group.dataset.requiredGroup || target.name, `Pick up to ${max}.`);
}

function baselinePayload() {
  return {
    mentallyClear: value("baselineClarity"),
    focusWhenNeeded: value("baselineFocus"),
    calmInBody: value("baselineCalm"),
    emotionallySteady: value("baselineSteady"),
    connectedToPeople: value("baselineConnected"),
    motivatedForWhatMattered: value("baselineMotivated"),
    sleptWell: value("baselineSlept"),
    wokeUpRestored: value("baselineRestored"),
    becomingWhoIWantToBe: value("baselineBecoming")
  };
}

function collectPayload() {
  const referral = activeReferralClaim || readStoredReferralClaim();
  return {
    product: getProductName(),
    price: Number(product.value || 30),
    stripeProductId: product.stripeProductId || "prod_UgF2SFTaA6cCVy",
    status: "pending_provider_approval",
    paymentStatus: "not_started",
    email: value("email"),
    fullName: value("fullName"),
    age: value("age"),
    sex: value("sex"),
    state: value("state"),
    pregnancyStatus: checkedValues("pregnancyStatus")[0] || "",
    safetyDiagnoses: valuesWithOther("safetyDiagnoses", "safetyOther"),
    prescriptionMedications: checkedValues("prescriptionMedications")[0] || "",
    medicationTypes: valuesWithOther("medicationTypes", "medicationOther"),
    medicationNames: value("medicationNames"),
    goals: valuesWithOther("goals", "goalsOther"),
    baseline: baselinePayload(),
    clinicianNote: value("clinicianNote"),
    attestation: "I attest that this prescription request is for my personal use. I understand that submission of this form does not guarantee approval. All requests are reviewed by a licensed healthcare provider, who will determine eligibility based on medical history, current medications, symptoms, and treatment goals. Payment and fulfillment remain subject to provider approval. I understand this is not emergency care. If I am experiencing thoughts of self-harm, harm to others, chest pain, severe allergic reaction, or a medical emergency, I should call 911 or seek emergency care.",
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

if (form) {
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.matches("[data-exclusive]") && target.checked) {
      const groupName = target.dataset.exclusive;
      form.querySelectorAll(`[name="${groupName}"]`).forEach((input) => {
        if (input !== target) input.checked = false;
      });
    } else if (target.name && target.checked) {
      const exclusive = form.querySelector(`[data-exclusive="${target.name}"]`);
      if (exclusive && exclusive !== target) exclusive.checked = false;
    }

    enforceMaxChecked(target);
    syncConditionalFields();
  });

  document.querySelectorAll("[data-next]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!validateCurrentStep()) return;
      showStep(currentStep + 1);
    });
  });

  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", () => showStep(currentStep - 1));
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
  syncConditionalFields();
  showStep(0);
}
