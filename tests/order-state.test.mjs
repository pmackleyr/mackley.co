import assert from "node:assert/strict";
import test from "node:test";

import {
  ORDER_STATUS,
  assertOrderTransition,
  canTransitionOrder,
  isTerminalOrderStatus
} from "../worker/src/domain/order-state.js";

test("the manual-capture order lifecycle permits only intended transitions", () => {
  assert.equal(canTransitionOrder(null, ORDER_STATUS.PENDING), true);
  assert.equal(canTransitionOrder(ORDER_STATUS.AWAITING_AUTHORIZATION, ORDER_STATUS.PENDING), true);
  assert.equal(canTransitionOrder(ORDER_STATUS.PENDING, ORDER_STATUS.PROCESSING), true);
  assert.equal(canTransitionOrder(ORDER_STATUS.PROCESSING, ORDER_STATUS.PAYMENT_CAPTURED), true);
  assert.equal(canTransitionOrder(ORDER_STATUS.PAYMENT_CAPTURED, ORDER_STATUS.ACTIVE), true);
  assert.equal(canTransitionOrder(ORDER_STATUS.PENDING, ORDER_STATUS.DENIED), true);
});

test("captured, active, and denied orders cannot move backwards", () => {
  assert.equal(canTransitionOrder(ORDER_STATUS.PAYMENT_CAPTURED, ORDER_STATUS.DENIED), false);
  assert.equal(canTransitionOrder(ORDER_STATUS.ACTIVE, ORDER_STATUS.PENDING), false);
  assert.equal(canTransitionOrder(ORDER_STATUS.DENIED, ORDER_STATUS.PROCESSING), false);
  assert.throws(
    () => assertOrderTransition(ORDER_STATUS.ACTIVE, ORDER_STATUS.DENIED),
    /invalid_order_transition/
  );
  assert.equal(isTerminalOrderStatus(ORDER_STATUS.ACTIVE), true);
  assert.equal(isTerminalOrderStatus(ORDER_STATUS.DENIED), true);
});
