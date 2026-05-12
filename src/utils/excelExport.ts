/**
 * Excel export utility for booking reports
 * Requires: npm install xlsx
 */

import {
  calculatePriceWithRules,
  calcHours,
} from "./pricingUtils.js";
import type { IPricingRule } from "../models/Homestay.js";


export interface ExportBookingData {
  "Booking ID": string;
  "Khách hàng": string;
  "Số điện thoại": string;
  "Check-in": string;
  "Check-out": string;
  "Thời lượng (h)": number;
  "Loại combo": string;
  "Số khách": number;
  "Giá gốc (₫)": number;
  "Phí khách thêm (₫)": number;
  "Giá cuối (₫)": number;
  "Trạng thái": string;
  "Tạo bởi": string;
  "Thời gian tạo": string;
  "Ghi chú admin": string;
}

/**
 * Parse a value that might be a Date, ISO string, or undefined/null.
 * Returns a valid Date or null — never throws, never returns Invalid Date.
 */
const safeDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Format a date-like value as DD/MM/YYYY HH:mm (Vietnamese locale).
 * Returns "—" for any undefined / null / invalid input — never throws.
 */
export const formatDateTimeVN = (date: unknown): string => {
  const d = safeDate(date);
  if (!d) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/** Ensure a value is a finite number; return fallback otherwise. */
const safeNum = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Ensure a value is a non-empty string; return fallback otherwise. */
const safeStr = (value: unknown, fallback = "—"): string => {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
};

/**
 * Derive a human-readable combo/pricing label for a booking by running the
 * same rule-matching logic used in the booking-table UI.
 *
 * Resolution order (mirrors `getComboUsed` in HomestayManagement.tsx):
 *   1. Match checkIn + hours against the homestay's active pricing rules
 *      → use the rule's `name`, or a formatted fallback ("Theo giờ / Qua đêm / …")
 *   2. If no pricing rules exist (old homestay) → "Theo giờ"
 */
const resolveComboLabel = (
  booking: any,
  pricingRules: IPricingRule[],
): string => {
  const checkInDate = safeDate(booking.checkIn);
  if (!checkInDate) return "Theo giờ";

  const checkOutDate = safeDate(booking.checkOut);
  let hours = safeNum(booking.hours, 0);
  if (hours <= 0 && checkInDate && checkOutDate) {
    hours = Math.max(1, calcHours(checkInDate, checkOutDate));
  }
  if (hours <= 0) return "Theo giờ";

  const activeRules = (pricingRules || []).filter((r) => r.isActive !== false);
  if (activeRules.length === 0) return "Theo giờ";

  const result = calculatePriceWithRules(checkInDate, hours, activeRules);
  if (!result) return "Theo giờ";

  const { rule, ruleType } = result;
  const baseName =
    rule.name ||
    (ruleType === "overnight"
      ? "Qua đêm"
      : ruleType === "daynight"
        ? "Ngày-đêm"
        : "Theo giờ");

  if (ruleType === "hourly") {
    return rule.maxHours ? `${baseName} (≤${rule.maxHours}h)` : baseName;
  }
  return rule.startHour != null
    ? `${baseName} (từ ${rule.startHour}:00)`
    : baseName;
};

/**
 * Normalize a single raw booking document into a flat, safe row object
 * ready for XLSX — every field is a primitive (string | number), never
 * undefined, null, NaN, Infinity, or a nested object / Date.
 */
const normalizeRow = (booking: any, pricingRules: IPricingRule[]): ExportBookingData => {
  // Populated sub-documents (may be plain objects after toJSON)
  const userObj =
    booking.userId && typeof booking.userId === "object"
      ? booking.userId
      : null;
  const createdByObj =
    booking.createdBy && typeof booking.createdBy === "object"
      ? booking.createdBy
      : null;

  // Dates
  const checkInDate = safeDate(booking.checkIn);
  const checkOutDate = safeDate(booking.checkOut);

  // Hours — prefer stored value; derive from dates as fallback
  let hours = safeNum(booking.hours, 0);
  if (hours <= 0 && checkInDate && checkOutDate) {
    const ms = checkOutDate.getTime() - checkInDate.getTime();
    hours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
  }
  if (hours <= 0) hours = 0;

  // Price cascade: finalPrice → totalPrice → originalPrice → 0
  const rawFinal = booking.finalPrice ?? booking.totalPrice ?? booking.originalPrice;
  const finalPrice = safeNum(rawFinal, 0);
  const originalPrice = safeNum(booking.originalPrice ?? rawFinal, finalPrice);
  const extraGuestFee = safeNum(booking.extraGuestFee, 0);

  // Created-at fallback chain
  const createdAtStr =
    formatDateTimeVN(booking.createdAt) !== "—"
      ? formatDateTimeVN(booking.createdAt)
      : formatDateTimeVN(booking.checkIn);

  return {
    "Booking ID": safeStr(booking._id?.toString(), "—"),
    "Khách hàng": safeStr(
      booking.customerInfo?.name || userObj?.name,
      "Khách ẩn danh",
    ),
    "Số điện thoại": safeStr(
      booking.customerInfo?.phone || userObj?.phone,
      "—",
    ),
    "Check-in": formatDateTimeVN(booking.checkIn),
    "Check-out": formatDateTimeVN(booking.checkOut),
    "Thời lượng (h)": hours,
    "Loại combo": resolveComboLabel(booking, pricingRules),
    "Số khách": Math.max(1, safeNum(booking.guests, 1)),
    "Giá gốc (₫)": Math.round(originalPrice),
    "Phí khách thêm (₫)": Math.round(extraGuestFee),
    "Giá cuối (₫)": Math.round(finalPrice),
    "Trạng thái": safeStr(booking.status, "confirmed"),
    "Tạo bởi": safeStr(
      createdByObj?.name || (booking.createdBy ? "Admin" : "Khách"),
      "Khách",
    ),
    "Thời gian tạo": createdAtStr,
    "Ghi chú admin": safeStr(booking.adminNote, "—"),
  };
};

const HEADERS: (keyof ExportBookingData)[] = [
  "Booking ID",
  "Khách hàng",
  "Số điện thoại",
  "Check-in",
  "Check-out",
  "Thời lượng (h)",
  "Loại combo",
  "Số khách",
  "Giá gốc (₫)",
  "Phí khách thêm (₫)",
  "Giá cuối (₫)",
  "Trạng thái",
  "Tạo bởi",
  "Thời gian tạo",
  "Ghi chú admin",
];

const COL_WIDTHS = [
  { wch: 26 }, // Booking ID
  { wch: 22 }, // Khách hàng
  { wch: 16 }, // Số điện thoại
  { wch: 20 }, // Check-in
  { wch: 20 }, // Check-out
  { wch: 13 }, // Thời lượng
  { wch: 15 }, // Loại combo
  { wch: 10 }, // Số khách
  { wch: 16 }, // Giá gốc
  { wch: 18 }, // Phí khách thêm
  { wch: 16 }, // Giá cuối
  { wch: 14 }, // Trạng thái
  { wch: 16 }, // Tạo bởi
  { wch: 20 }, // Thời gian tạo
  { wch: 28 }, // Ghi chú admin
];

/**
 * Generate an Excel (.xlsx) buffer from a list of raw booking documents.
 * Handles any combination of legacy and new-schema records without crashing.
 *
 * @param pricingRules - Active pricing rules for the homestay, used to
 *   derive the combo label exactly the same way the booking-table UI does.
 */
export const generateBookingExcel = async (
  bookings: any[],
  homestayTitle: string,
  pricingRules: IPricingRule[] = [],
): Promise<Buffer> => {
  const XLSX = await import("xlsx");

  // Guard: ensure inputs are always arrays
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  const safeRules = Array.isArray(pricingRules) ? pricingRules : [];

  // Map every booking through the normalizer — no exceptions can escape
  const data: ExportBookingData[] = safeBookings.map((b) => {
    try {
      return normalizeRow(b, safeRules);
    } catch {
      // Ultimate fallback: return an all-placeholder row so one bad record
      // cannot abort the entire export.
      return {
        "Booking ID": safeStr(b?._id?.toString(), "—"),
        "Khách hàng": "—",
        "Số điện thoại": "—",
        "Check-in": "—",
        "Check-out": "—",
        "Thời lượng (h)": 0,
        "Loại combo": "N/A",
        "Số khách": 1,
        "Giá gốc (₫)": 0,
        "Phí khách thêm (₫)": 0,
        "Giá cuối (₫)": 0,
        "Trạng thái": "confirmed",
        "Tạo bởi": "—",
        "Thời gian tạo": "—",
        "Ghi chú admin": "—",
      };
    }
  });

  // Build worksheet
  const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS });
  ws["!cols"] = COL_WIDTHS;

  // Style header row
  const headerStyle = {
    fill: { fgColor: { rgb: "FF4472C4" } },
    font: { color: { rgb: "FFFFFFFF" }, bold: true },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
  };
  for (let i = 0; i < HEADERS.length; i++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c: i });
    if (ws[ref]) ws[ref].s = headerStyle;
  }

  // Summary row (2 rows below last data row)
  if (data.length > 0) {
    const summaryRow = data.length + 2;
    const totalRevenue = data.reduce(
      (sum, row) => sum + safeNum(row["Giá cuối (₫)"], 0),
      0,
    );

    ws[XLSX.utils.encode_cell({ r: summaryRow, c: 0 })] = {
      v: "TỔNG CỘNG",
      t: "s",
      s: { font: { bold: true }, alignment: { horizontal: "right" } },
    };
    ws[XLSX.utils.encode_cell({ r: summaryRow, c: 1 })] = {
      v: `${data.length} booking(s)`,
      t: "s",
      s: { font: { bold: true } },
    };
    ws[XLSX.utils.encode_cell({ r: summaryRow, c: 10 })] = {
      v: Math.round(totalRevenue),
      t: "n",
      s: { font: { bold: true } },
    };

    // Extend the worksheet ref range to include the summary row
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    range.e.r = summaryRow;
    ws["!ref"] = XLSX.utils.encode_range(range);
  }

  // Build workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Booking Report");

  wb.Props = {
    Title: `${safeStr(homestayTitle, "Homestay")} - Booking Report`,
    Subject: "Booking Report",
    Author: "Homestay Management System",
    CreatedDate: new Date(),
  };

  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
};
