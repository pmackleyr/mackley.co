const UNIT_PRICE = 50;
const DISCOUNT_PER_EXTRA = 5;
const STORAGE_KEY = "mackley_checkout_qty";
const API_BASE = "https://api.mackley.co";
const SOCIAL_PROOF_ENDPOINT = `${API_BASE}/social-proof`;
const emailStorageKey = "mackley_checkout_email";
const purchaseRecordKey = "mackley_purchase_recorded";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const form = document.getElementById("checkout-form");
const placeOrderButton = document.getElementById("place-order");
const qtyInput = document.getElementById("quantity");
const qtyDecrease = document.getElementById("qty-decrease");
const qtyIncrease = document.getElementById("qty-increase");
const qtyChips = Array.from(document.querySelectorAll(".qty-chip"));
const customChip = document.querySelector(".qty-chip--custom");
const totalPrice = document.getElementById("total-price");
const unitPrice = document.getElementById("unit-price");
const discountAmount = document.getElementById("discount-amount");
const discountRow = document.getElementById("discount-row");
const accordionItems = Array.from(document.querySelectorAll(".accordion-item"));
const paymentElementContainer = document.getElementById("payment-element");
const paymentFallback = document.querySelector(".payment-fallback");
const addressElementContainer = document.getElementById("shipping-address-element");
const shippingFields = document.querySelector(".shipping-fields");

const requiredFields = Array.from(form.querySelectorAll("input[required]"));
const touchedFields = new Set();
let submitAttempted = false;

let stripe = null;
let elements = null;
let addressElement = null;
let paymentElement = null;
let stripeReady = false;
let shippingComplete = false;
let shippingAddressValue = null;
let debounceTimer = null;
const header = document.querySelector(".site-header");
const footer = document.querySelector(".site-footer");
const successMode = new URLSearchParams(window.location.search).get("success") === "1";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getQuantity() {
  const parsed = Number(qtyInput.value);
  if (Number.isNaN(parsed)) return 1;
  return clamp(parsed, 1, 10);
}

function updateQuantity(nextValue) {
  const normalized = clamp(nextValue, 1, 10);
  qtyInput.value = String(normalized);
  localStorage.setItem(STORAGE_KEY, String(normalized));
  updateTotals();
  updateChipState(normalized);
  debounceCreateIntent();
}

function getDiscount(qty) {
  return Math.max(0, (qty - 1) * DISCOUNT_PER_EXTRA);
}

function getTotal(qty) {
  return qty * UNIT_PRICE - getDiscount(qty);
}

function updateTotals() {
  const qty = getQuantity();
  const discount = getDiscount(qty);
  totalPrice.textContent = currency.format(getTotal(qty));
  unitPrice.textContent = currency.format(UNIT_PRICE);
  if (discountAmount) {
    discountAmount.textContent = `-${currency.format(discount)}`;
  }
  if (discountRow) {
    discountRow.classList.toggle("summary-discount--active", discount > 0);
  }
}

function updateChipState(qty) {
  if (customChip) {
    if (qty > 4) {
      customChip.hidden = false;
      customChip.textContent = String(qty);
      customChip.dataset.qty = String(qty);
    } else {
      customChip.hidden = true;
    }
  }
  qtyChips.forEach((chip) => {
    chip.classList.toggle("is-active", Number(chip.dataset.qty) === qty);
  });
}

function setError(input, message) {
  const errorId = input.getAttribute("aria-describedby");
  if (!errorId) return;
  const errorEl = document.getElementById(errorId);
  if (errorEl) {
    errorEl.textContent = message || "";
  }
  if (message) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
}

function validateField(input, showError) {
  if (input.validity.valid) {
    setError(input, "");
    return true;
  }

  if (!showError) return false;

  let message = "Please complete this field.";
  if (input.type === "email") {
    message = "Enter a valid email address.";
  }
  setError(input, message);
  return false;
}

function validateContact() {
  const email = document.getElementById("email");
  const name = document.getElementById("full-name");
  return [email, name].every((input) => {
    const showError = touchedFields.has(input.id) || submitAttempted;
    return validateField(input, showError);
  });
}

function validateShippingFields() {
  if (addressElement) {
    return shippingComplete;
  }
  const shippingInputs = [
    document.getElementById("address-line1"),
    document.getElementById("city"),
    document.getElementById("state"),
    document.getElementById("postal"),
    document.getElementById("country")
  ];
  return shippingInputs.every((input) => {
    const showError = touchedFields.has(input.id) || submitAttempted;
    return validateField(input, showError);
  });
}

function updateSummary(step, text) {
  const summary = document.querySelector(`[data-summary="${step}"]`);
  if (summary) summary.textContent = text;
}

function setAccordionOpen(targetStep) {
  accordionItems.forEach((item) => {
    const isTarget = item.dataset.step === targetStep;
    const header = item.querySelector(".accordion-header");
    item.classList.toggle("is-open", isTarget);
    if (header) header.setAttribute("aria-expanded", isTarget ? "true" : "false");
  });
}

function updateCTAState() {
  const contactValid = validateContact();
  const shippingValid = validateShippingFields();
  placeOrderButton.disabled = !(contactValid && shippingValid && stripeReady);
}

function recordPurchaseProof(force) {
  if (!successMode && !force) return;
  if (sessionStorage.getItem(purchaseRecordKey)) return;
  sessionStorage.setItem(purchaseRecordKey, String(Date.now()));

  fetch(SOCIAL_PROOF_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "purchase",
      page: "checkout",
      window: 3600,
      record: true
    }),
    keepalive: true
  }).catch(() => {
    // Best-effort; ignore failures.
  });
}

function handleContactAdvance() {
  const email = document.getElementById("email").value.trim();
  const name = document.getElementById("full-name").value.trim();
  if (email && name && validateContact()) {
    updateSummary("contact", `${email} · ${name}`);
    setAccordionOpen("shipping");
  }
}

function handleShippingAdvance() {
  if (!validateShippingFields()) return;
  const city = document.getElementById("city").value.trim();
  const state = document.getElementById("state").value.trim();
  const postal = document.getElementById("postal").value.trim();
  if (city || state || postal) {
    const summary = [city, state].filter(Boolean).join(", ");
    const postalText = postal ? ` · ${postal}` : "";
    updateSummary("shipping", `${summary}${postalText}` || "Complete");
  }
  setAccordionOpen("payment");
}

function focusFirstInvalid() {
  const firstInvalid = requiredFields.find((input) => input.hasAttribute("required") && !input.validity.valid);
  if (firstInvalid) {
    firstInvalid.focus();
  }
}

function getShippingData() {
  if (addressElement && shippingComplete && shippingAddressValue) {
    const address = shippingAddressValue.address || {};
    return {
      line1: address.line1 || "",
      line2: address.line2 || "",
      city: address.city || "",
      state: address.state || "",
      postal: address.postal_code || "",
      country: address.country || ""
    };
  }
  return {
    line1: document.getElementById("address-line1").value.trim(),
    line2: document.getElementById("address-line2").value.trim(),
    city: document.getElementById("city").value.trim(),
    state: document.getElementById("state").value.trim(),
    postal: document.getElementById("postal").value.trim(),
    country: document.getElementById("country").value.trim()
  };
}

function getCustomerData() {
  return {
    email: document.getElementById("email").value.trim(),
    name: document.getElementById("full-name").value.trim()
  };
}

function renderSuccess(data) {
  const main = document.querySelector("main.checkout");
  if (!main) return;
  const qty = data?.quantity ?? getQuantity();
  const total = currency.format(getTotal(qty));
  const email = data?.email ?? document.getElementById("email")?.value.trim() ?? "—";
  const orderId = data?.orderId ?? `MK-${Date.now()}`;
  main.innerHTML = `
    <section class="checkout-confirm" aria-live="polite">
      <h1 class="page-title">Order confirmed.</h1>
      <p class="page-subhead">We’ll email updates before shipping.</p>
      <div class="checkout-card">
        <div class="summary-row"><span>Order #</span><span>${orderId}</span></div>
        <div class="summary-row"><span>Email</span><span>${email}</span></div>
        <div class="summary-row"><span>Quantity</span><span>${qty}</span></div>
        <div class="summary-row summary-total"><span>Total</span><span>${total}</span></div>
      </div>
      <a class="cta" href="/original">Back to Original</a>
    </section>
  `;
}

function updateInsets() {
  const root = document.documentElement;
  const headerHeight = header ? header.offsetHeight : 0;
  const footerHeight = footer ? footer.offsetHeight : 0;
  root.style.setProperty("--header-h", `${headerHeight}px`);
  root.style.setProperty("--footer-h", `${footerHeight}px`);
}

async function createPaymentIntent() {
  if (!stripe || !elements) return;
  const { email, name } = getCustomerData();
  const shipping = getShippingData();
  const quantity = getQuantity();

  try {
    const response = await fetch(`${API_BASE}/create-payment-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ quantity, email, name, shipping })
    });

    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    if (!data.clientSecret) throw new Error("Missing client secret");
    stripeReady = false;
    elements.update({ clientSecret: data.clientSecret });
    if (paymentElement) {
      paymentElement.unmount();
    }
    paymentElementContainer.innerHTML = "";
    paymentElement = elements.create("payment");
    paymentElement.mount(paymentElementContainer);
    paymentElement.on("ready", () => {
      stripeReady = true;
      updateCTAState();
    });
  } catch (error) {
    setPaymentFallback();
  }
}

function debounceCreateIntent() {
  if (!stripe || !elements) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    createPaymentIntent();
  }, 350);
}

function setPaymentFallback() {
  stripeReady = false;
  if (paymentFallback) {
    paymentFallback.hidden = false;
  }
  if (paymentElementContainer) {
    paymentElementContainer.innerHTML = "";
  }
  updateCTAState();
}

async function setupStripe() {
  const metaKey = document.querySelector("meta[name=\"stripe-pk\"]")?.content;
  const key = window.STRIPE_PUBLISHABLE_KEY || metaKey;
  if (!key || !window.Stripe) {
    setPaymentFallback();
    return;
  }

  stripe = window.Stripe(key);
  try {
    const response = await fetch(`${API_BASE}/create-payment-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        quantity: getQuantity(),
        email: "",
        name: "",
        shipping: {}
      })
    });

    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    if (!data.clientSecret) throw new Error("Missing client secret");

    elements = stripe.elements({ clientSecret: data.clientSecret, appearance: { theme: "night" } });

    if (addressElementContainer) {
      addressElement = elements.create("address", { mode: "shipping" });
      addressElement.mount(addressElementContainer);
      addressElement.on("change", (event) => {
        shippingComplete = event.complete;
        shippingAddressValue = event.value;
        if (event.complete) {
          const city = event.value.address.city || "";
          const state = event.value.address.state || "";
          const postal = event.value.address.postal_code || "";
          updateSummary("shipping", `${[city, state].filter(Boolean).join(", ")}${postal ? ` · ${postal}` : ""}` || "Complete");
          setAccordionOpen("payment");
        }
        updateCTAState();
      });
      shippingFields.hidden = true;
      shippingFields.querySelectorAll("input[required]").forEach((input) => {
        input.removeAttribute("required");
      });
    }

    paymentElement = elements.create("payment");
    paymentElement.mount(paymentElementContainer);
    paymentElement.on("ready", () => {
      stripeReady = true;
      updateCTAState();
    });
  } catch (error) {
    setPaymentFallback();
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  submitAttempted = true;
  const contactValid = validateContact();
  const shippingValid = validateShippingFields();
  updateCTAState();

  if (!contactValid || !shippingValid) {
    focusFirstInvalid();
    return;
  }

  if (!stripe || !elements || !stripeReady) {
    return;
  }

  placeOrderButton.disabled = true;
  placeOrderButton.textContent = "Placing...";

  const { email, name } = getCustomerData();
  const shipping = getShippingData();
  localStorage.setItem(emailStorageKey, email);
  localStorage.setItem(STORAGE_KEY, String(getQuantity()));

  const result = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: `${window.location.origin}/checkout.html?success=1`,
      receipt_email: email,
      shipping: {
        name,
        address: shipping.address || shipping
      }
    }
  });

  if (result.error) {
    placeOrderButton.disabled = false;
    placeOrderButton.textContent = "Place order";
    if (result.error.type === "validation_error") {
      return;
    }
    setPaymentFallback();
    return;
  }

  renderSuccess({
    email,
    quantity: getQuantity(),
    orderId: `MK-${Date.now()}`
  });
  recordPurchaseProof(true);
}

function initAccordion() {
  accordionItems.forEach((item) => {
    const header = item.querySelector(".accordion-header");
    if (!header) return;
    header.addEventListener("click", () => {
      setAccordionOpen(item.dataset.step);
    });
  });

  setAccordionOpen("contact");
}

function initFields() {
  requiredFields.forEach((input) => {
    input.addEventListener("blur", () => {
      touchedFields.add(input.id);
      validateField(input, true);
      updateCTAState();
    });
    input.addEventListener("input", () => {
      if (touchedFields.has(input.id) || submitAttempted) {
        validateField(input, true);
      }
      updateCTAState();
      if (input.id === "email" || input.id === "full-name") {
        handleContactAdvance();
        debounceCreateIntent();
      }
      if (["address-line1", "city", "state", "postal", "country"].includes(input.id)) {
        handleShippingAdvance();
        debounceCreateIntent();
      }
    });
  });
}

function initQuantity() {
  const storedQty = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isNaN(storedQty) && storedQty >= 1) {
    updateQuantity(storedQty);
  } else {
    updateTotals();
    updateChipState(getQuantity());
  }

  qtyDecrease.addEventListener("click", () => updateQuantity(getQuantity() - 1));
  qtyIncrease.addEventListener("click", () => updateQuantity(getQuantity() + 1));
  qtyInput.addEventListener("input", () => updateQuantity(getQuantity()));
  qtyChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      updateQuantity(Number(chip.dataset.qty));
    });
  });
}

updateInsets();
window.addEventListener("resize", updateInsets);

if (successMode) {
  const savedEmail = localStorage.getItem(emailStorageKey) || "—";
  const savedQty = Number(localStorage.getItem(STORAGE_KEY)) || 1;
  renderSuccess({
    email: savedEmail,
    quantity: savedQty,
    orderId: `MK-${Date.now()}`
  });
  recordPurchaseProof();
} else {
  initAccordion();
  initFields();
  initQuantity();
  form.addEventListener("submit", handleSubmit);
  setupStripe();
  updateCTAState();
}
