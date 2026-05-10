import mongoose, { Document, Schema } from "mongoose";
import type { PricingRuleType } from "./Homestay.js";

export interface IPricingTemplate extends Document {
  /** Display name shown in admin and booking UI */
  name: string;
  type: PricingRuleType;
  /** For 'hourly': max hours covered by this flat price */
  maxHours?: number;
  /** For 'overnight' / 'daynight': check-in hour threshold (0–23) */
  startHour?: number;
  /** Optional end hour — informational only, not used in calculation */
  endHour?: number;
  /** Suggested default price — rooms can override this */
  defaultPrice: number;
  /** System templates cannot be deleted by admin */
  isSystem: boolean;
  /** Sort order in the UI */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const PricingTemplateSchema = new Schema<IPricingTemplate>(
  {
    name:         { type: String, required: true, trim: true, maxlength: 100 },
    type:         { type: String, enum: ["hourly", "overnight", "daynight"], required: true },
    maxHours:     { type: Number, min: 1 },
    startHour:    { type: Number, min: 0, max: 23 },
    endHour:      { type: Number, min: 0, max: 23 },
    defaultPrice: { type: Number, required: true, min: 0 },
    isSystem:     { type: Boolean, default: false },
    order:        { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IPricingTemplate>("PricingTemplate", PricingTemplateSchema);

// ── Default system templates ──────────────────────────────────────────────────

export interface IDefaultTemplate {
  name: string;
  type: PricingRuleType;
  maxHours?: number;
  startHour?: number;
  endHour?: number;
  defaultPrice: number;
  isSystem: true;
  order: number;
}

export const DEFAULT_TEMPLATES: IDefaultTemplate[] = [
  { name: "COMBO 2H",   type: "hourly",    maxHours: 2,  defaultPrice: 150_000, isSystem: true, order: 1 },
  { name: "COMBO 4H",   type: "hourly",    maxHours: 4,  defaultPrice: 250_000, isSystem: true, order: 2 },
  { name: "COMBO 8H",   type: "hourly",    maxHours: 8,  defaultPrice: 400_000, isSystem: true, order: 3 },
  { name: "NGÀY ĐÊM",   type: "daynight",  startHour: 14, endHour: 11, defaultPrice: 500_000, isSystem: true, order: 4 },
  { name: "QUA ĐÊM",    type: "overnight", startHour: 21, endHour: 10, defaultPrice: 350_000, isSystem: true, order: 5 },
];

/**
 * Ensure all system templates exist in the database.
 * Safe to call on every server start — skips existing ones.
 */
export const seedDefaultTemplates = async (): Promise<void> => {
  const PricingTemplate = mongoose.model<IPricingTemplate>("PricingTemplate");
  for (const t of DEFAULT_TEMPLATES) {
    await PricingTemplate.findOneAndUpdate(
      { name: t.name, isSystem: true },
      { $setOnInsert: t },
      { upsert: true, new: false }
    );
  }
};
