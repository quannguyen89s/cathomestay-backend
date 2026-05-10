import mongoose, { Document, Schema } from "mongoose";

export type PricingRuleType = "hourly" | "overnight" | "daynight";

export interface IPricingRule {
  /** Reference to PricingTemplate (null for fully-custom rules) */
  templateId?: mongoose.Types.ObjectId;
  /** Display name — copied from template or entered by admin */
  name?: string;
  type: PricingRuleType;
  /** For 'hourly': max hours covered by this flat price */
  maxHours?: number;
  /** For 'overnight' / 'daynight': check-in hour threshold (0–23) */
  startHour?: number;
  /** Informational end hour */
  endHour?: number;
  price: number;
  /** Whether this rule is active for this room */
  isActive: boolean;
}

/** @deprecated Use IPricingRule */
export type IPricingTier = IPricingRule;

export interface IHomestay extends Document {
  title: string;
  description: string;
  /** Base daily price — fallback if no pricing rules defined */
  price: number;
  /** Mixed pricing rules (hourly tiers, overnight, day-night) */
  pricing: IPricingRule[];
  location: string;
  city: string;
  images: string[];
  amenities: string[];
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  isAvailable: boolean;
  rating: number;
  reviewCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HomestaySchema = new Schema<IHomestay>(
  {
    title: {
      type: String,
      required: [true, "Vui lòng nhập tên homestay"],
      trim: true,
      maxlength: [200, "Tên không được quá 200 ký tự"],
    },
    description: {
      type: String,
      required: [true, "Vui lòng nhập mô tả"],
    },
    price: {
      type: Number,
      required: [true, "Vui lòng nhập giá"],
      min: [0, "Giá không được âm"],
    },
    pricing: {
      type: [
        {
          templateId: { type: Schema.Types.ObjectId, ref: "PricingTemplate" },
          name:      { type: String },
          type: {
            type: String,
            enum: ["hourly", "overnight", "daynight"],
            default: "hourly",
          },
          maxHours:  { type: Number, min: 1 },
          startHour: { type: Number, min: 0, max: 23 },
          endHour:   { type: Number, min: 0, max: 23 },
          price:     { type: Number, required: true, min: 0 },
          isActive:  { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    location:    { type: String, required: [true, "Vui lòng nhập địa chỉ"] },
    city:        { type: String, required: [true, "Vui lòng nhập thành phố"], trim: true },
    images:      { type: [String], default: [] },
    amenities:   { type: [String], default: [] },
    maxGuests:   { type: Number, required: [true, "Vui lòng nhập số khách tối đa"], min: 1 },
    bedrooms:    { type: Number, default: 1, min: 1 },
    bathrooms:   { type: Number, default: 1, min: 1 },
    isAvailable: { type: Boolean, default: true },
    rating:      { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    createdBy:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

HomestaySchema.index({ title: "text", description: "text", location: "text", city: "text" });

export default mongoose.model<IHomestay>("Homestay", HomestaySchema);
