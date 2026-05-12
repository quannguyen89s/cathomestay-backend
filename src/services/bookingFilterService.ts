/**
 * Shared booking filter, search, sort and paginate helpers used by
 * getHomestayBookings and exportHomestayBookings in adminController.
 */

import type { IBooking } from "../models/Booking.js";
import type { IPricingRule } from "../models/Homestay.js";
import { calcHours, calculatePriceWithRules } from "../utils/pricingUtils.js";

export interface BookingQueryOptions {
  status?: string;
  from?: string;
  to?: string;
  comboType?: string;
  customerName?: string;
  phone?: string;
  sortBy?: string;
  order?: string;
  page?: string | number;
  limit?: string | number;
}

/** Build the Mongoose filter object for a given homestay + query params */
export const buildBookingDbQuery = (
  homestayId: string,
  opts: BookingQueryOptions,
): Record<string, unknown> => {
  const q: Record<string, unknown> = { homestayId };

  if (opts.status && typeof opts.status === "string") {
    q.status = opts.status;
  }

  if (opts.from || opts.to) {
    q.checkIn = {} as Record<string, Date>;
    const checkInFilter = q.checkIn as Record<string, Date>;
    if (opts.from && typeof opts.from === "string") {
      checkInFilter.$gte = new Date(opts.from);
    }
    if (opts.to && typeof opts.to === "string") {
      checkInFilter.$lte = new Date(opts.to);
    }
  }

  return q;
};

type PopulatedBooking = IBooking & {
  userId: unknown;
  customerInfo?: { name?: string; phone?: string };
};

/** In-memory filter for customer name/phone and comboType */
export const filterBookingRows = (
  rows: PopulatedBooking[],
  opts: BookingQueryOptions,
  pricingRules: IPricingRule[],
): PopulatedBooking[] => {
  let result = rows;

  // Name / phone search (in-memory because they may be in customerInfo OR user object)
  if (opts.customerName || opts.phone) {
    result = result.filter((b) => {
      const userObj = b.userId as { name?: string; phone?: string } | null;
      const cName = (b.customerInfo?.name ?? userObj?.name ?? "").toLowerCase();
      const cPhone = (b.customerInfo?.phone ?? userObj?.phone ?? "").toLowerCase();

      const matchName = opts.customerName
        ? cName.includes(opts.customerName.toLowerCase())
        : true;
      const matchPhone = opts.phone
        ? cPhone.includes(opts.phone.toLowerCase())
        : true;

      return matchName && matchPhone;
    });
  }

  // ComboType filter
  const validComboTypes = ["hourly", "overnight", "daynight"];
  if (opts.comboType && validComboTypes.includes(opts.comboType)) {
    result = result.filter((b) => {
      const hours = b.hours ?? calcHours(new Date(b.checkIn), new Date(b.checkOut));
      const matched = calculatePriceWithRules(
        new Date(b.checkIn),
        hours,
        pricingRules,
      );
      return matched?.ruleType === opts.comboType;
    });
  }

  return result;
};

type SortableField = "checkIn" | "checkOut" | "createdAt" | "finalPrice";

const SORT_FIELD_MAP: Record<string, SortableField> = {
  checkIn: "checkIn",
  checkOut: "checkOut",
  createdAt: "createdAt",
  finalPrice: "finalPrice",
};

/** In-memory sort */
export const sortBookingRows = (
  rows: PopulatedBooking[],
  sortBy: string | undefined,
  order: string | undefined,
): PopulatedBooking[] => {
  const field = SORT_FIELD_MAP[String(sortBy)] ?? "createdAt";
  const asc = String(order).toLowerCase() === "asc";

  return [...rows].sort((a, b) => {
    const av = (a as unknown as Record<string, number | string | Date>)[field];
    const bv = (b as unknown as Record<string, number | string | Date>)[field];

    if (av instanceof Date && bv instanceof Date) {
      return asc ? av.getTime() - bv.getTime() : bv.getTime() - av.getTime();
    }
    if (typeof av === "number" && typeof bv === "number") {
      return asc ? av - bv : bv - av;
    }
    return asc
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });
};

/** Paginate an in-memory array */
export const paginateRows = <T>(
  rows: T[],
  page: string | number | undefined,
  limit: string | number | undefined,
): { paged: T[]; total: number; pageNum: number; limitNum: number } => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);
  const total = rows.length;
  const start = (pageNum - 1) * limitNum;
  return { paged: rows.slice(start, start + limitNum), total, pageNum, limitNum };
};
