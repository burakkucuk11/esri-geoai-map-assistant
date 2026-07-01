import { randomUUID } from "node:crypto";

const PLAN_TOKEN_TTL_MS = 5 * 60 * 1000;
const plans = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [token, entry] of plans) {
    if (entry.expiresAt <= now) {
      plans.delete(token);
    }
  }
}

export function storePlan(plan) {
  purgeExpired();

  const token = randomUUID();
  plans.set(token, { plan, expiresAt: Date.now() + PLAN_TOKEN_TTL_MS });

  return token;
}

export function takePlan(token) {
  purgeExpired();

  const entry = token ? plans.get(token) : null;
  if (!entry) {
    return null;
  }

  plans.delete(token);
  return entry.plan;
}
