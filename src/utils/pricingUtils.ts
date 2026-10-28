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
  /** true when hours exceed all hourly tiers in an hourly-only setting */
  isOverflow: boolean;
  days?: number;
  extraHours?: number;
  dayPrice?: number;
  extraHoursPrice?: number;
  breakdownText?: string;
}

/**
 * Calculate base price using room pricing rules.
 *
 * Rules:
 *  - When hours >= 24 (spanning across days):
 *      days = Math.floor(hours / 24)
 *      extraHours = hours % 24
 *      basePrice = (days * dailyPrice) + (price of extraHours from room pricing tiers)
 *  - When hours < 24:
 *      1. If hours <= highest hourly tier maxHours: matches the appropriate hourly tier.
 *      2. Overnight: if checkInHour >= overnight.startHour and hours <= 16: matches overnight.
 *      3. Day-Night: if checkInHour >= daynight.startHour and hours >= 18: matches daynight.
 *      4. Fallback: hourly tier price for hours (capped at dailyPrice).
 */
export const calculatePriceWithRules = (
  checkIn: Date,
  hours: number,
  rules: IPricingRule[],
  dailyRate?: number
): PriceRuleResult | null => {
  const active = (rules || []).filter((r) => r.isActive !== false);

  // Determine daily rate: daynight rule if defined and > 0, otherwise provided dailyRate
  const daynightRule = active.find((r) => r.type === "daynight" && r.price > 0);
  const resolvedDailyPrice = daynightRule
    ? daynightRule.price
    : dailyRate && dailyRate > 0
      ? dailyRate
      : 0;

  if (active.length === 0 && resolvedDailyPrice <= 0) return null;

  const checkInHour = checkIn.getHours() + checkIn.getMinutes() / 60;

  const hourlyRules = active
    .filter((r) => (r.type == null || r.type === "hourly") && r.maxHours != null && r.price >= 0)
    .sort((a, b) => a.maxHours! - b.maxHours!);

  const overnightRules = active
    .filter((r) => r.type === "overnight" && r.startHour != null && r.price >= 0)
    .sort((a, b) => b.startHour! - a.startHour!);

  const getHourlyTierPrice = (
    h: number
  ): { price: number; rule: IPricingRule | null; isOverflow: boolean } => {
    if (h <= 0) return { price: 0, rule: null, isOverflow: false };

    if (hourlyRules.length > 0) {
      const matched = hourlyRules.find((r) => h <= r.maxHours!);
      if (matched) {
        return { price: matched.price, rule: matched, isOverflow: false };
      }
      // h exceeds all defined hourly tiers
      const highest = hourlyRules[hourlyRules.length - 1];
      const perHourRate =
        highest.maxHours && highest.maxHours > 0
          ? Math.round(highest.price / highest.maxHours)
          : highest.price;
      const overflowPrice = highest.price + (h - highest.maxHours!) * perHourRate;
      if (resolvedDailyPrice > 0 && overflowPrice > resolvedDailyPrice) {
        return { price: resolvedDailyPrice, rule: daynightRule || highest, isOverflow: false };
      }
      return { price: overflowPrice, rule: highest, isOverflow: true };
    }

    if (resolvedDailyPrice > 0) {
      return {
        price: Math.min(resolvedDailyPrice, Math.round((h / 24) * resolvedDailyPrice)),
        rule: null,
        isOverflow: false,
      };
    }
    return { price: 0, rule: null, isOverflow: false };
  };

  const days = Math.floor(hours / 24);
  const extraHours = hours % 24;

  // ── 1. Spanning across days (>= 24 hours) ───────────────────────────────────
  if (days >= 1) {
    const daysPrice = days * resolvedDailyPrice;
    let extraHoursPrice = 0;
    let extraRule: IPricingRule | null = null;
    let isOverflow = false;

    if (extraHours > 0) {
      const hourlyRes = getHourlyTierPrice(extraHours);
      extraHoursPrice = hourlyRes.price;
      extraRule = hourlyRes.rule;
      isOverflow = hourlyRes.isOverflow;
    }

    const basePrice = daysPrice + extraHoursPrice;
    const representativeRule: IPricingRule = daynightRule || {
      name: "Theo ngày",
      type: "daynight",
      price: resolvedDailyPrice,
      isActive: true,
    };

    const breakdownParts: string[] = [];
    if (days > 0) {
      breakdownParts.push(`${days} ngày (${daysPrice.toLocaleString("vi-VN")}₫)`);
    }
    if (extraHours > 0) {
      const extraRuleLabel = extraRule?.name ? ` [${extraRule.name}]` : "";
      breakdownParts.push(`${extraHours}h${extraRuleLabel} (${extraHoursPrice.toLocaleString("vi-VN")}₫)`);
    }

    return {
      basePrice,
      rule: representativeRule,
      ruleType: "daynight",
      isOverflow,
      days,
      extraHours,
      dayPrice: resolvedDailyPrice,
      extraHoursPrice,
      breakdownText: breakdownParts.join(" + "),
    };
  }

  // ── 2. Under 24 hours (days === 0) ──────────────────────────────────────────
  const highestMaxHours =
    hourlyRules.length > 0 ? hourlyRules[hourlyRules.length - 1].maxHours || 0 : 0;

  // 2A. Fits within hourly tiers
  if (hourlyRules.length > 0 && hours <= highestMaxHours) {
    const matched = hourlyRules.find((r) => hours <= r.maxHours!);
    if (matched) {
      return {
        basePrice: matched.price,
        rule: matched,
        ruleType: "hourly",
        isOverflow: false,
        days: 0,
        extraHours: hours,
        dayPrice: resolvedDailyPrice,
        extraHoursPrice: matched.price,
        breakdownText: `${matched.name || "Theo giờ"} (${hours}h): ${matched.price.toLocaleString("vi-VN")}₫`,
      };
    }
  }

  // 2B. Overnight stay (checkIn in evening and duration <= 16h)
  const matchedOvernight = overnightRules.find((r) => checkInHour >= r.startHour!);
  if (matchedOvernight && hours <= 16) {
    return {
      basePrice: matchedOvernight.price,
      rule: matchedOvernight,
      ruleType: "overnight",
      isOverflow: false,
      days: 0,
      extraHours: hours,
      dayPrice: resolvedDailyPrice,
      extraHoursPrice: matchedOvernight.price,
      breakdownText: `${matchedOvernight.name || "Qua đêm"}: ${matchedOvernight.price.toLocaleString("vi-VN")}₫`,
    };
  }

  // 2C. Day-night stay (checkIn >= 14:00 and hours >= 18)
  if (resolvedDailyPrice > 0 && hours >= 18) {
    const repRule: IPricingRule = daynightRule || {
      name: "Ngày đêm",
      type: "daynight",
      price: resolvedDailyPrice,
      isActive: true,
    };
    return {
      basePrice: resolvedDailyPrice,
      rule: repRule,
      ruleType: "daynight",
      isOverflow: false,
      days: 1,
      extraHours: 0,
      dayPrice: resolvedDailyPrice,
      extraHoursPrice: 0,
      breakdownText: `${repRule.name || "Ngày đêm"}: ${resolvedDailyPrice.toLocaleString("vi-VN")}₫`,
    };
  }

  // 2D. Fallback hourly tier calculation
  const tierRes = getHourlyTierPrice(hours);
  const repRule: IPricingRule = tierRes.rule || {
    name: "Theo giờ",
    type: "hourly",
    price: tierRes.price,
    isActive: true,
  };

  return {
    basePrice: tierRes.price,
    rule: repRule,
    ruleType: "hourly",
    isOverflow: tierRes.isOverflow,
    days: 0,
    extraHours: hours,
    dayPrice: resolvedDailyPrice,
    extraHoursPrice: tierRes.price,
    breakdownText: `${repRule.name || "Theo giờ"} (${hours}h): ${tierRes.price.toLocaleString("vi-VN")}₫`,
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
