import type { IPricingRule, PricingRuleType } from "../models/Homestay.js";

// Re-export for convenience
export type { IPricingRule };

// ── Duration ──────────────────────────────────────────────────────────────────

/**
 * Total booking duration in hours, rounded up, minimum 1.
 * e.g. 2h 15min → 3h; same formula as the frontend pricing.ts
 */
export const calcHours = (checkIn: Date, checkOut: Date): number =>
  Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)));

// ── Extra guest fee ───────────────────────────────────────────────────────────

export const EXTRA_GUEST_BASE = 2;          // guests included in base price
export const EXTRA_GUEST_FEE_PER_PERSON = 80_000; // VND per extra guest

/** Fee for guests beyond the base 2 included guests. */
export const calcExtraGuestFee = (guests: number): number =>
  Math.max(0, guests - EXTRA_GUEST_BASE) * EXTRA_GUEST_FEE_PER_PERSON;

// ── Mixed pricing rules ───────────────────────────────────────────────────────

export interface PriceRuleResult {
  /** Base price from the matched rule (does NOT include extra guest fee) */
  basePrice: number;
  rule: IPricingRule;
  ruleType: PricingRuleType;
  /** true when hours exceed all hourly tiers → price = hours × highestTier.price */
  isOverflow: boolean;
}

/**
 * Calculate base price using mixed pricing rules.
 *
 * Priority:
 *  1. Overnight rule  — if checkIn hour >= rule.startHour
 *  2. Day-Night rule  — if checkIn hour >= rule.startHour
 *  3. Hourly tiers    — match by duration (with overflow fallback)
 *
 * Returns null when rules array is empty or no hourly rules exist in fallback.
 * Treats rules without an explicit type as 'hourly' (backward compat).
 */
export const calculatePriceWithRules = (
  checkIn: Date,
  hours: number,
  rules: IPricingRule[]
): PriceRuleResult | null => {
  if (!rules || rules.length === 0) return null;
  // Only consider rules that are active (default true for legacy rules without isActive)
  const active = rules.filter((r) => r.isActive !== false);
  if (active.length === 0) return null;
  rules = active;

  // Local hour as decimal (e.g. 21:30 → 21.5)
  const checkInHour = checkIn.getHours() + checkIn.getMinutes() / 60;

  // ── 1. Overnight ────────────────────────────────────────────────────────────
  const overnightRules = rules.filter(
    (r) => r.type === "overnight" && r.startHour != null
  );
  // Pick the overnight rule with the highest startHour that still applies
  const matchedOvernight = overnightRules
    .filter((r) => checkInHour >= r.startHour!)
    .sort((a, b) => b.startHour! - a.startHour!)[0];

  if (matchedOvernight) {
    return {
      basePrice: matchedOvernight.price,
      rule: matchedOvernight,
      ruleType: "overnight",
      isOverflow: false,
    };
  }

  // ── 2. Day-Night ─────────────────────────────────────────────────────────────
  const daynightRules = rules.filter(
    (r) => r.type === "daynight" && r.startHour != null
  );
  const matchedDaynight = daynightRules
    .filter((r) => checkInHour >= r.startHour!)
    .sort((a, b) => b.startHour! - a.startHour!)[0];

  if (matchedDaynight) {
    return {
      basePrice: matchedDaynight.price,
      rule: matchedDaynight,
      ruleType: "daynight",
      isOverflow: false,
    };
  }

  // ── 3. Hourly tiers ──────────────────────────────────────────────────────────
  const hourlyRules = rules
    .filter((r) => (r.type == null || r.type === "hourly") && r.maxHours != null)
    .sort((a, b) => a.maxHours! - b.maxHours!);

  if (hourlyRules.length === 0) return null;

  const matched = hourlyRules.find((r) => hours <= r.maxHours!);
  if (matched) {
    return { basePrice: matched.price, rule: matched, ruleType: "hourly", isOverflow: false };
  }

  // Overflow: hours exceed all defined tiers
  const highest = hourlyRules[hourlyRules.length - 1];
  return {
    basePrice: hours * highest.price,
    rule: highest,
    ruleType: "hourly",
    isOverflow: true,
  };
};

// ── Legacy wrapper (backward compat) ─────────────────────────────────────────

/** @deprecated Use calculatePriceWithRules */
export interface PriceResult {
  price: number;
  tier: IPricingRule;
  isOverflow: boolean;
}

/** @deprecated Use calculatePriceWithRules */
export const calculatePrice = (
  hours: number,
  tiers: IPricingRule[]
): PriceResult | null => {
  // Treat all as hourly for legacy callers
  const hourlyOnly = tiers.map((t) => ({ ...t, type: "hourly" as const }));
  const now = new Date();
  const result = calculatePriceWithRules(now, hours, hourlyOnly);
  if (!result) return null;
  return { price: result.basePrice, tier: result.rule, isOverflow: result.isOverflow };
};

// ── Validation helpers ────────────────────────────────────────────────────────

export const validatePricingRules = (rules: IPricingRule[]): string | null => {
  if (rules.length === 0) return null;
  for (const r of rules) {
    const t = r.type ?? "hourly";
    if (!["hourly", "overnight", "daynight"].includes(t)) {
      return `Loại rule không hợp lệ: ${t}`;
    }
    if (!Number.isFinite(r.price) || r.price < 0) {
      return "Giá mỗi mức không được âm";
    }
    if (t === "hourly") {
      if (!r.maxHours || !Number.isFinite(r.maxHours) || r.maxHours < 1) {
        return "maxHours của hourly rule phải ≥ 1";
      }
    }
    if (t === "overnight" || t === "daynight") {
      if (r.startHour == null || !Number.isFinite(r.startHour) || r.startHour < 0 || r.startHour > 23) {
        return "startHour phải từ 0 đến 23";
      }
    }
  }
  // No duplicate maxHours among active hourly rules
  const hourlyHours = rules
    .filter((r) => (r.type ?? "hourly") === "hourly" && r.isActive !== false)
    .map((r) => r.maxHours!);
  if (new Set(hourlyHours).size !== hourlyHours.length) {
    return "Các mức giờ (hourly) không được trùng nhau trong các rule đang bật";
  }
  return null;
};

/** @deprecated Use validatePricingRules */
export const validatePricingTiers = validatePricingRules;

export const sortTiers = (rules: IPricingRule[]): IPricingRule[] =>
  [...rules].sort((a, b) => (a.maxHours ?? 0) - (b.maxHours ?? 0));
