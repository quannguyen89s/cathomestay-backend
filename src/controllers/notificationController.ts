import { Response } from "express";
import mongoose from "mongoose";
import Notification, { NotificationType } from "../models/Notification.js";
import { AuthRequest } from "../middlewares/auth.js";

// Helper to create a notification from any controller/service
export const createNotificationHelper = async (params: {
  userId: string | mongoose.Types.ObjectId;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  try {
    if (!params.userId) return;
    await Notification.create({
      userId: params.userId,
      title: params.title,
      message: params.message,
      type: params.type || "system",
      link: params.link || "/dashboard",
      metadata: params.metadata,
      isRead: false,
    });
  } catch (error) {
    console.error("[createNotificationHelper] Error creating notification:", error);
  }
};

// @desc   Get user notifications
// @route  GET /api/notifications
export const getNotifications = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Chưa đăng nhập" });
      return;
    }

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Mark single notification as read
// @route  PUT /api/notifications/:id/read
export const markAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
      return;
    }

    res.json({ success: true, message: "Đã đánh dấu đã đọc", notification });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Mark all notifications as read
// @route  PUT /api/notifications/read-all
export const markAllAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;

    await Notification.updateMany({ userId, isRead: false }, { isRead: true });

    res.json({ success: true, message: "Đã đánh dấu tất cả là đã đọc" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Delete notification
// @route  DELETE /api/notifications/:id
export const deleteNotification = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const notification = await Notification.findOneAndDelete({ _id: id, userId });
    if (!notification) {
      res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
      return;
    }

    res.json({ success: true, message: "Đã xóa thông báo" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};
