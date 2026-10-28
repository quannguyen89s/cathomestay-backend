import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "booking_success"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_completed"
  | "system";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Tiêu đề không được để trống"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Nội dung thông báo không được để trống"],
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "booking_success",
        "booking_confirmed",
        "booking_cancelled",
        "booking_completed",
        "system",
      ],
      default: "system",
    },
    link: {
      type: String,
      default: "/dashboard",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

export default mongoose.model<INotification>("Notification", NotificationSchema);
