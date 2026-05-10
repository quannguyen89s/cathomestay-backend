import { Response } from "express";
import Booking from "../models/Booking.js";
import Homestay from "../models/Homestay.js";
import { AuthRequest } from "../middlewares/auth.js";
import { calcHours, calculatePriceWithRules, calcExtraGuestFee } from "../utils/pricingUtils.js";

// @desc   Create booking
// @route  POST /api/bookings
export const createBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { homestayId, checkIn, checkOut, guests, note } = req.body;

    if (!homestayId || !checkIn || !checkOut || !guests) {
      res.status(400).json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
      return;
    }

    const homestay = await Homestay.findById(homestayId);
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    if (!homestay.isAvailable) {
      res.status(400).json({ success: false, message: "Homestay hiện không khả dụng" });
      return;
    }

    if (Number(guests) > homestay.maxGuests) {
      res.status(400).json({
        success: false,
        message: `Homestay này chỉ chứa tối đa ${homestay.maxGuests} khách`,
      });
      return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkInDate >= checkOutDate) {
      res.status(400).json({ success: false, message: "Ngày trả phòng phải sau ngày nhận phòng" });
      return;
    }

    if (checkInDate < new Date()) {
      res.status(400).json({ success: false, message: "Thời gian nhận phòng phải từ hiện tại trở đi" });
      return;
    }

    // Check for conflicting bookings
    const conflicting = await Booking.findOne({
      homestayId,
      status: { $in: ["pending", "confirmed"] },
      $or: [
        { checkIn: { $lt: checkOutDate }, checkOut: { $gt: checkInDate } },
      ],
    });

    if (conflicting) {
      res.status(400).json({ success: false, message: "Homestay đã được đặt trong khoảng thời gian này" });
      return;
    }

    // ── Pricing ──────────────────────────────────────────────────────────────
    const hours = calcHours(checkInDate, checkOutDate);
    const guestCount = Number(guests);

    let basePrice: number;
    if (homestay.pricing && homestay.pricing.length > 0) {
      const result = calculatePriceWithRules(checkInDate, hours, homestay.pricing);
      basePrice = result ? result.basePrice : homestay.price;
    } else {
      const nights = Math.ceil(hours / 24) || 1;
      basePrice = nights * homestay.price;
    }

    const extraGuestFee = calcExtraGuestFee(guestCount);
    const originalPrice = basePrice + extraGuestFee;
    // ────────────────────────────────────────────────────────────────────────

    const booking = await Booking.create({
      userId: req.user?._id,
      homestayId,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      hours,
      guests: guestCount,
      originalPrice,
      extraGuestFee,
      finalPrice: originalPrice,
      totalPrice: originalPrice,
      note,
    });

    const populated = await booking.populate([
      { path: "homestayId", select: "title location images price pricing city" },
      { path: "userId", select: "name email phone" },
    ]);

    res.status(201).json({
      success: true,
      message: "Đặt phòng thành công",
      booking: populated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get user bookings
// @route  GET /api/bookings/my
export const getMyBookings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookings = await Booking.find({ userId: req.user?._id })
      .populate("homestayId", "title location images price city")
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Cancel booking
// @route  PUT /api/bookings/:id/cancel
export const cancelBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      res.status(404).json({ success: false, message: "Không tìm thấy đặt phòng" });
      return;
    }

    if (booking.userId.toString() !== req.user?._id.toString()) {
      res.status(403).json({ success: false, message: "Bạn không có quyền hủy đặt phòng này" });
      return;
    }

    if (booking.status === "cancelled") {
      res.status(400).json({ success: false, message: "Đặt phòng đã được hủy trước đó" });
      return;
    }

    if (booking.status === "completed") {
      res.status(400).json({ success: false, message: "Không thể hủy đặt phòng đã hoàn thành" });
      return;
    }

    booking.status = "cancelled";
    await booking.save();

    res.json({ success: true, message: "Hủy đặt phòng thành công", booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get single booking
// @route  GET /api/bookings/:id
export const getBooking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("homestayId", "title location images price city")
      .populate("userId", "name email phone");

    if (!booking) {
      res.status(404).json({ success: false, message: "Không tìm thấy đặt phòng" });
      return;
    }

    if (
      booking.userId._id.toString() !== req.user?._id.toString() &&
      req.user?.role !== "admin"
    ) {
      res.status(403).json({ success: false, message: "Không có quyền truy cập" });
      return;
    }

    res.json({ success: true, booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};
