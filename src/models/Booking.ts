import mongoose, { Document, Schema } from "mongoose";

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface ICustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
}

export interface IBooking extends Document {
  userId: mongoose.Types.ObjectId;
  homestayId: mongoose.Types.ObjectId;
  checkIn: Date;
  checkOut: Date;
  /** Total booking duration in hours (rounded up) */
  hours: number;
  guests: number;
  /** Base price from pricing rules (hourly / overnight / daynight) */
  originalPrice: number;
  /** Extra charge for guests beyond the included 2 */
  extraGuestFee: number;
  /** Final charged price — admin may override this */
  finalPrice: number;
  /** @deprecated Use finalPrice. Kept for backward compatibility */
  totalPrice: number;
  status: BookingStatus;
  note?: string;
  /** Internal note for admins only */
  adminNote?: string;
  /** Admin who created this booking (null for self-service bookings) */
  createdBy?: mongoose.Types.ObjectId;
  /** Walk-in / guest info when booking is created by admin without a linked user */
  customerInfo?: ICustomerInfo;
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    homestayId: {
      type: Schema.Types.ObjectId,
      ref: "Homestay",
      required: true,
    },
    checkIn: {
      type: Date,
      required: [true, "Vui lòng chọn ngày nhận phòng"],
    },
    checkOut: {
      type: Date,
      required: [true, "Vui lòng chọn ngày trả phòng"],
    },
    hours: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    guests: {
      type: Number,
      required: [true, "Vui lòng nhập số khách"],
      min: 1,
      default: 1,
    },
    originalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    extraGuestFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // Backward-compat alias — always mirrors finalPrice
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "confirmed",
    },
    note: {
      type: String,
      default: "",
    },
    adminNote: {
      type: String,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    customerInfo: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

/**
 * Normalize a legacy booking document by filling in missing fields with
 * safe defaults. Called from toJSON / toObject transforms so that old
 * records read from MongoDB are always fully-hydrated before being sent
 * to the client or used in export logic.
 */
function normalizeLegacyBooking(ret: Record<string, unknown>): void {
  // Status
  if (!ret.status) ret.status = "confirmed";

  // Numeric price fields — cascade: finalPrice → totalPrice → originalPrice → 0
  const fp =
    ret.finalPrice != null
      ? (ret.finalPrice as number)
      : ret.totalPrice != null
        ? (ret.totalPrice as number)
        : ret.originalPrice != null
          ? (ret.originalPrice as number)
          : 0;

  if (ret.finalPrice == null) ret.finalPrice = fp;
  if (ret.totalPrice == null) ret.totalPrice = fp;
  if (ret.originalPrice == null) ret.originalPrice = fp;
  if (ret.extraGuestFee == null) ret.extraGuestFee = 0;

  // Guests / hours
  if (ret.guests == null || (ret.guests as number) < 1) ret.guests = 1;
  if ((ret.hours == null || (ret.hours as number) < 1) && ret.checkIn && ret.checkOut) {
    const ms =
      new Date(ret.checkOut as string).getTime() -
      new Date(ret.checkIn as string).getTime();
    ret.hours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
  }
  if (ret.hours == null || (ret.hours as number) < 1) ret.hours = 1;

  // Optional string fields
  if (ret.adminNote == null) ret.adminNote = "";
  if (ret.note == null) ret.note = "";
  if (ret.customerInfo == null) ret.customerInfo = { name: "", phone: "", email: "" };
}

const sharedTransform = (
  _doc: unknown,
  ret: Record<string, unknown>,
): Record<string, unknown> => {
  normalizeLegacyBooking(ret);
  return ret;
};

BookingSchema.set("toJSON", { transform: sharedTransform, virtuals: true });
BookingSchema.set("toObject", { transform: sharedTransform, virtuals: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
// Most frequent query patterns:
//  1. Lookup bookings for a specific homestay (getBookedSlots, getHomestayBookings)
//  2. Conflict detection: homestayId + status + checkIn/checkOut range
//  3. User's own bookings (getMyBookings)
//  4. Admin all-bookings list sorted by createdAt
BookingSchema.index({ homestayId: 1, status: 1, checkIn: 1, checkOut: 1 });
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ createdAt: -1 });

export default mongoose.model<IBooking>("Booking", BookingSchema);
