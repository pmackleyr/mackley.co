const form = document.getElementById("spray-intake-form");
const steps = Array.from(document.querySelectorAll(".intake-step"));
const reviewSteps = steps.filter((step) => step.dataset.step !== "complete");
const product = window.MACKLEYProduct || {};
const intakeStorageKey = "mackley_provider_intake";
const referralStorageKey = "mackley_referral_claim";
const referralShareStorageKey = "mackley_referral_share";
const referralApiBase = "https://api.mackley.co/referrals";
const checkoutApiBase = "https://api.mackley.co";
const netiOfferCode = "BREATHEDEEPER";
const referralParams = new URLSearchParams(window.location.search);
let currentStep = 0;
let latestPayload = null;
let paymentInFlight = false;
let embeddedCheckout = null;

function buildIntakeReceipt(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    version: 2,
    requestId: String(payload.requestId || ""),
    email: String(payload.email || ""),
    fullName: String(payload.fullName || ""),
    referralCode: normalizeReferralCode(payload.referralCode),
    referral: payload.referral && typeof payload.referral === "object" ? payload.referral : null,
    checkoutSessionId: String(payload.checkoutSessionId || ""),
    paymentStatus: String(payload.paymentStatus || ""),
    orderId: String(payload.orderId || ""),
    verificationEmailSent: Boolean(payload.verificationEmailSent),
    savedAt: new Date().toISOString()
  };
}

function persistIntakeReceipt(payload) {
  const receipt = buildIntakeReceipt(payload);
  if (!receipt) return;
  try {
    window.sessionStorage.setItem(intakeStorageKey, JSON.stringify(receipt));
    window.localStorage.removeItem(intakeStorageKey);
  } catch (error) {
    // Payment can continue in memory if storage is unavailable.
  }
}

function readIntakeReceipt() {
  try {
    const current = JSON.parse(window.sessionStorage.getItem(intakeStorageKey) || "null");
    if (current) return current;

    // One-time migration removes legacy questionnaires from persistent storage.
    const legacy = JSON.parse(window.localStorage.getItem(intakeStorageKey) || "null");
    if (!legacy) return null;
    const receipt = buildIntakeReceipt(legacy);
    window.sessionStorage.setItem(intakeStorageKey, JSON.stringify(receipt));
    window.localStorage.removeItem(intakeStorageKey);
    return receipt;
  } catch (error) {
    return null;
  }
}

function getProductName() {
  return product.name || "Intranasal Neuropeptide Formula";
}

function setButtonLabel(button, label) {
  if (!button) return;
  const labelNode = button.querySelector(".ui-button__label");
  if (labelNode) labelNode.textContent = label;
  else button.textContent = label;
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

function normalizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

function displayReferralCode(value) {
  const code = normalizeReferralCode(value);
  if (code === netiOfferCode) return code;
  if (code.length <= 3) return code;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
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
  const code = normalizeReferralCode(referralParams.get("code"));
  const loop = normalizeToken(referralParams.get("loop"));
  const offer = referralParams.get("offer") === "10" ? "10" : "";
  const depth = Math.max(0, Number(referralParams.get("depth") || 0) || 0);

  if (!referrer && !code && !loop && !offer) return null;

  return {
    referrerUserId: referrer,
    referralCode: code,
    loopId: loop || `loop-${shortHash(referrer || Date.now())}`,
    offerPercent: offer || "10",
    shareDepth: depth,
    status: "unverified_link",
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
    note.textContent = `${claim.offerPercent}% referral offer saved. It will be verified before secure payment.`;
  }
  const codeInput = form?.elements.referralCode;
  if (codeInput && claim.referralCode) {
    codeInput.value = displayReferralCode(claim.referralCode);
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

function applyNetiOfferCode() {
  const offerCode = normalizeReferralCode(referralParams.get("offer"));
  if (offerCode !== netiOfferCode) return;

  const codeInput = form?.elements.referralCode;
  const note = document.getElementById("referral-note");
  if (codeInput) codeInput.value = netiOfferCode;
  if (note) {
    note.hidden = false;
    note.textContent = "BREATHEDEEPER saved: one free Neti Pot after approval. Shipping & handling apply.";
  }
}

applyNetiOfferCode();

async function referralRequest(path, payload) {
  const response = await fetch(`${referralApiBase}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "referral_request_failed");
  }
  return data;
}

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
    price: Number(product.value || 99),
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
    referralCode: normalizeReferralCode(value("referralCode")),
    goals: valuesWithOther("goals", "goalsOther"),
    baseline: baselinePayload(),
    clinicianNote: value("clinicianNote"),
    attestation: "I attest that this prescription request is for my personal use. I understand that submission of this form does not guarantee approval. All requests are reviewed by a licensed healthcare provider, who will determine eligibility based on medical history, current medications, symptoms, and treatment goals. Payment and fulfillment remain subject to provider approval. I understand this is not emergency care. If I am experiencing thoughts of self-harm, harm to others, chest pain, severe allergic reaction, or a medical emergency, I should call 911 or seek emergency care.",
    referral,
    submittedAt: new Date().toISOString()
  };
}

async function confirmReferralClaim(payload) {
  const manualCode = normalizeReferralCode(payload.referralCode);
  const storedReferral = activeReferralClaim || readStoredReferralClaim();
  const note = document.getElementById("referral-note");

  if (manualCode === netiOfferCode) {
    if (note) {
      note.hidden = false;
      note.textContent = "BREATHEDEEPER applied: one free Neti Pot after approval. Shipping & handling apply.";
    }
    trackLoopEvent("neti_offer_claimed", {
      actor_user_id: buildActorId(payload),
      offer_code: netiOfferCode,
      product: "Original Copper Neti Pot"
    });
    return {
      offerCode: netiOfferCode,
      offerType: "first_approved_shipment_neti_pot",
      status: "accepted"
    };
  }

  if (!manualCode && !storedReferral?.referrerUserId && !storedReferral?.referralCode) {
    return null;
  }

  try {
    const data = await referralRequest("claim", {
      referrerUserId: storedReferral?.referrerUserId || "",
      referralCode: manualCode || storedReferral?.referralCode || "",
      loopId: storedReferral?.loopId || "",
      shareDepth: storedReferral?.shareDepth || 0,
      claimantEmail: payload.email,
      claimantName: payload.fullName
    });

    if (data.accepted && data.claim) {
      const verifiedClaim = {
        ...data.claim,
        offerPercent: String(data.claim.receiverOfferPercent || 10),
        claimedAt: new Date().toISOString()
      };
      localStorage.setItem(referralStorageKey, JSON.stringify(verifiedClaim));
      if (note) {
        note.hidden = false;
        note.textContent = "Referral accepted: 10% off if approved.";
      }
      trackLoopEvent("loop_demand_claimed", {
        actor_user_id: "",
        subject_user_id: buildActorId(payload),
        loop_id: verifiedClaim.loopId,
        channel: manualCode ? "manual_code" : "link",
        share_depth: verifiedClaim.shareDepth,
        referrer_user_id: verifiedClaim.referrerActorId
      });
      return verifiedClaim;
    }

    if (note) {
      note.hidden = false;
      note.textContent = data.message || "Referral could not be applied.";
    }
    return {
      ...(storedReferral || {}),
      status: "rejected",
      reason: data.reason || "not_accepted"
    };
  } catch (error) {
    if (note) {
      note.hidden = false;
      note.textContent = "Referral could not be verified. You can still submit your survey.";
    }
    return {
      ...(storedReferral || {}),
      status: "verification_failed"
    };
  }
}

function updateCompletionState(payload) {
  const status = document.getElementById("intake-status");
  if (status) {
    status.textContent = `Status: pending provider approval for ${payload.fullName}.`;
  }
}

async function createProviderRequest(payload) {
  const response = await fetch(`${checkoutApiBase}/provider-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.requestId) {
    throw new Error(data.error || "provider_request_failed");
  }
  return data;
}

function updateVerificationNote(payload) {
  const note = document.getElementById("verification-email-note");
  if (!note || !payload?.email) return;
  note.textContent = payload.verificationEmailSent
    ? `We sent a link to ${payload.email} to confirm where provider updates should go. You can continue with payment authorization now; you will not be charged unless a licensed provider approves your request.`
    : `We could not send an email confirmation to ${payload.email}. You can still continue and be reviewed; we will use this address for provider updates. You will not be charged unless a licensed provider approves your request.`;
}

async function initializeEmbeddedCheckout() {
  if (paymentInFlight || !latestPayload?.requestId) return;
  if (embeddedCheckout) return;
  const button = document.querySelector("[data-authorize-payment]");
  const originalLabel = button?.textContent || "Retry secure payment";
  const mount = document.getElementById("embedded-checkout");
  const publishableKey = document.querySelector('meta[name="stripe-publishable-key"]')?.content || "";
  paymentInFlight = true;
  setError("payment", "");
  if (button) {
    button.disabled = true;
    setButtonLabel(button, "Opening secure checkout...");
  }

  try {
    if (!window.Stripe || !publishableKey || !mount) throw new Error("stripe_unavailable");
    latestPayload.referralCode = normalizeReferralCode(value("referralCode"));
    latestPayload.referral = await confirmReferralClaim(latestPayload);
    persistIntakeReceipt(latestPayload);
    const stripe = window.Stripe(publishableKey);
    embeddedCheckout = await stripe.initEmbeddedCheckout({
      fetchClientSecret: async () => {
        const response = await fetch(`${checkoutApiBase}/create-checkout-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            requestId: latestPayload.requestId,
            quantity: 1,
            email: latestPayload.email,
            name: latestPayload.fullName,
            referral: latestPayload.referral || null,
            offerCode: latestPayload.referral?.offerCode || "",
            embedded: true
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.clientSecret) throw new Error(data.error || "checkout_session_failed");
        latestPayload.checkoutSessionId = data.sessionId;
        latestPayload.paymentStatus = "authorization_started";
        persistIntakeReceipt(latestPayload);
        return data.clientSecret;
      }
    });
    embeddedCheckout.mount(mount);
    if (button) button.hidden = true;
    paymentInFlight = false;
  } catch (error) {
    paymentInFlight = false;
    if (button) {
      button.hidden = false;
      button.disabled = false;
      setButtonLabel(button, originalLabel);
    }
    setError("payment", "Secure checkout could not be opened. Please try again.");
  }
}

async function verifyCheckoutReturn(sessionId) {
  if (!sessionId) return false;
  const response = await fetch(`${checkoutApiBase}/verify-checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.verified) throw new Error(data.error || "authorization_not_verified");
  if (latestPayload) {
    latestPayload.paymentStatus = "authorized_pending_provider_review";
    latestPayload.orderId = data.orderId;
    latestPayload.checkoutSessionId = data.sessionId;
    persistIntakeReceipt(latestPayload);
    updateCompletionState(latestPayload);
  }
  showStep(steps.findIndex((step) => step.dataset.step === "complete"));
  return true;
}

async function verifyEmailToken(token) {
  if (!token) return;
  const status = document.getElementById("email-verification-status");
  if (status) {
    status.hidden = false;
    status.textContent = "Verifying your email...";
  }
  try {
    const response = await fetch(`${checkoutApiBase}/provider-requests/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.verified) throw new Error("email_verification_failed");
    if (status) status.textContent = "Email verified. Your provider request is ready for review after payment authorization.";
  } catch (error) {
    if (status) status.textContent = "This verification link is invalid or expired. Submit the form again to receive a new link.";
  }
}

async function buildReferralLink(payload) {
  const priorDepth = Number(payload.referral?.shareDepth || 0) || 0;
  const created = await referralRequest("create", {
    email: payload.email,
    fullName: payload.fullName,
    priorReferral: payload.referral || null,
    shareDepth: priorDepth
  });
  const url = new URL("/intake/", window.location.origin);
  url.searchParams.set("ref", created.actorUserId);
  url.searchParams.set("code", created.referralCode);
  url.searchParams.set("offer", String(created.receiverOfferPercent || 10));
  url.searchParams.set("loop", created.loopId);
  url.searchParams.set("depth", String(priorDepth + 1));

  return {
    actorUserId: created.actorUserId,
    referralCode: created.referralCode,
    displayCode: created.displayCode || displayReferralCode(created.referralCode),
    loopId: created.loopId,
    receiverOfferPercent: created.receiverOfferPercent || 10,
    sharerRewardPercent: created.sharerRewardPercent || 10,
    maxTotalPercent: created.maxTotalPercent || 20,
    shareDepth: priorDepth + 1,
    url: url.toString()
  };
}

function writeShareStatus(message) {
  const status = document.getElementById("share-status");
  if (status) status.textContent = message;
}

function showReferralLink(share) {
  const link = document.getElementById("share-link");
  const code = document.getElementById("share-code");
  if (link) {
    link.hidden = false;
    link.href = share.url;
    link.textContent = share.url;
  }
  if (code) {
    code.hidden = false;
    code.textContent = `Code: ${share.displayCode || displayReferralCode(share.referralCode)}`;
  }
}

async function shareReferral() {
  if (!latestPayload) {
    try {
      latestPayload = readIntakeReceipt();
    } catch (error) {
      latestPayload = null;
    }
  }

  if (!latestPayload) {
    writeShareStatus("Complete the provider survey first.");
    return;
  }

  let share = null;
  try {
    share = await buildReferralLink(latestPayload);
  } catch (error) {
    writeShareStatus("Referral link could not be created. Please try again.");
    return;
  }

  const sharePayload = {
    title: "INF by MACKLEY",
    text: "I got you 10% off INF if approved by a licensed provider. Use my link or code when you submit the survey.",
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
      showReferralLink(share);
      writeShareStatus(`Shared. Your code is ${share.displayCode}.`);
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${share.url}\nCode: ${share.displayCode}`);
    }
    showReferralLink(share);
    trackLoopEvent("loop_link_copied", {
      actor_user_id: share.actorUserId,
      subject_user_id: "",
      loop_id: share.loopId,
      channel: "visible_link",
      share_depth: share.shareDepth,
      referrer_user_id: latestPayload.referral?.referrerUserId || ""
    });
    writeShareStatus(`Referral link copied. Your code is ${share.displayCode}.`);
  } catch (error) {
    showReferralLink(share);
    writeShareStatus(`Referral link ready. Your code is ${share.displayCode}.`);
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateCurrentStep()) return;

    const submitButton = form.querySelector('[data-step="attestation"] button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const payload = collectPayload();
      const providerRequest = await createProviderRequest(payload);
      payload.requestId = providerRequest.requestId;
      payload.verificationEmailSent = Boolean(providerRequest.verificationEmailSent);
      latestPayload = payload;
      persistIntakeReceipt(payload);

      if (window.MACKLEYAnalytics && typeof window.MACKLEYAnalytics.track === "function") {
        window.MACKLEYAnalytics.track("provider_survey_submitted", {
          product: payload.product,
          value: payload.price,
          destination: "licensed_provider_review",
          status: payload.status
        });
      }

      updateVerificationNote(payload);
      showStep(steps.findIndex((step) => step.dataset.step === "payment"));
      initializeEmbeddedCheckout();
    } catch (error) {
      setError("attestation", "Your survey could not be saved. Please try again.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  document.querySelector("[data-authorize-payment]")?.addEventListener("click", initializeEmbeddedCheckout);
  form.elements.referralCode?.addEventListener("change", () => {
    if (!latestPayload?.requestId || !embeddedCheckout) return;
    try {
      embeddedCheckout.destroy();
    } catch (error) {
      // A failed teardown should not block a fresh checkout attempt.
    }
    embeddedCheckout = null;
    document.getElementById("embedded-checkout")?.replaceChildren();
    initializeEmbeddedCheckout();
  });
  document.querySelector("[data-share-referral]")?.addEventListener("click", shareReferral);
  syncConditionalFields();
  if (referralParams.get("checkout") === "canceled" || referralParams.get("checkout") === "return") {
    try {
      latestPayload = readIntakeReceipt();
    } catch (error) {
      latestPayload = null;
    }
  }
  const returningSessionId = referralParams.get("session_id");
  const verificationToken = referralParams.get("verify_email");
  if (returningSessionId && referralParams.get("checkout") === "return") {
    verifyCheckoutReturn(returningSessionId).catch(() => {
      showStep(steps.findIndex((step) => step.dataset.step === "payment"));
      setError("payment", "We could not verify the authorization yet. Please reload this page in a moment.");
    });
  } else {
    showStep(latestPayload?.requestId
      ? steps.findIndex((step) => step.dataset.step === "payment")
      : 0);
    if (latestPayload?.requestId) {
      const referralInput = form.elements.referralCode;
      if (referralInput && latestPayload.referralCode) {
        referralInput.value = displayReferralCode(latestPayload.referralCode);
      }
      updateVerificationNote(latestPayload);
      initializeEmbeddedCheckout();
    }
  }
  verifyEmailToken(verificationToken);
}
