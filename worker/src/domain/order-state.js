export const ORDER_STATUS = Object.freeze({
  AWAITING_AUTHORIZATION: "AWAITING_AUTHORIZATION",
  PENDING: "PENDING_PROVIDER_REVIEW",
  PROCESSING: "APPROVAL_PROCESSING",
  PAYMENT_CAPTURED: "PAYMENT_CAPTURED",
  ACTIVE: "ACTIVE",
  DENIED: "DENIED"
});

const TRANSITIONS = Object.freeze({
  [ORDER_STATUS.AWAITING_AUTHORIZATION]: new Set([
    ORDER_STATUS.PENDING,
    ORDER_STATUS.DENIED
  ]),
  [ORDER_STATUS.PENDING]: new Set([
    ORDER_STATUS.PROCESSING,
    ORDER_STATUS.DENIED
  ]),
  [ORDER_STATUS.PROCESSING]: new Set([
    ORDER_STATUS.PAYMENT_CAPTURED,
    ORDER_STATUS.ACTIVE,
    ORDER_STATUS.DENIED
  ]),
  [ORDER_STATUS.PAYMENT_CAPTURED]: new Set([
    ORDER_STATUS.ACTIVE
  ]),
  [ORDER_STATUS.ACTIVE]: new Set(),
  [ORDER_STATUS.DENIED]: new Set()
});

export function isOrderStatus(value) {
  return Object.values(ORDER_STATUS).includes(value);
}

export function canTransitionOrder(fromStatus, toStatus) {
  if (!toStatus || fromStatus === toStatus) return true;
  if (!fromStatus) return isOrderStatus(toStatus);
  return Boolean(TRANSITIONS[fromStatus]?.has(toStatus));
}

export function assertOrderTransition(fromStatus, toStatus) {
  if (!canTransitionOrder(fromStatus, toStatus)) {
    throw new Error(`invalid_order_transition:${fromStatus || "NONE"}:${toStatus || "NONE"}`);
  }
}

export function isTerminalOrderStatus(status) {
  return status === ORDER_STATUS.ACTIVE || status === ORDER_STATUS.DENIED;
}
