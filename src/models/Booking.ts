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
    },
    guests: {
      type: Number,
      required: [true, "Vui lòng nhập số khách"],
      min: 1,
    },
    originalPrice: {
      type: Number,
      required: true,
      min: 0,
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
    },
    // Backward-compat alias — always mirrors finalPrice
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
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

export default mongoose.model<IBooking>("Booking", BookingSchema);
