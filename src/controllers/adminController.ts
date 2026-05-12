import { Response } from "express";
import User from "../models/User.js";
import Homestay from "../models/Homestay.js";
import Booking from "../models/Booking.js";
import { AuthRequest } from "../middlewares/auth.js";
import {
  calcHours,
  calculatePriceWithRules,
  calcExtraGuestFee,
} from "../utils/pricingUtils.js";
import { generateBookingExcel } from "../utils/excelExport.js";
import {
  buildBookingDbQuery,
  filterBookingRows,
  sortBookingRows,
  paginateRows,
  type BookingQueryOptions,
} from "../services/bookingFilterService.js";

/**
 * @types/express v5 widens req.params values to `string | string[]`.
 * This helper always returns a plain `string` so typed helpers like
 * buildBookingDbQuery (which expect `string`) remain type-safe.
 */
const paramId = (p: string | string[] | undefined): string =>
  Array.isArray(p) ? (p[0] ?? "") : (p ?? "");

// @desc   Get dashboard stats
// @route  GET /api/admin/stats
export const getStats = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const [totalUsers, totalHomestays, totalBookings, bookingStats] =
      await Promise.all([
        User.countDocuments({ role: "user" }),
        Homestay.countDocuments(),
        Booking.countDocuments(),
        Booking.aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              revenue: { $sum: "$totalPrice" },
            },
          },
        ]),
      ]);

    const stats: Record<string, number> = {
      totalUsers,
      totalHomestays,
      totalBookings,
      totalRevenue: 0,
    };

    bookingStats.forEach((s) => {
      if (s._id === "confirmed" || s._id === "completed") {
        stats.totalRevenue += s.revenue;
      }
    });

    res.json({ success: true, stats, bookingStats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get all users
// @route  GET /api/admin/users
export const getAllUsers = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Update user role
// @route  PUT /api/admin/users/:id/role
export const updateUserRole = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      res.status(400).json({ success: false, message: "Role không hợp lệ" });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true },
    );

    if (!user) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }

    res.json({ success: true, message: "Cập nhật quyền thành công", user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Delete user
// @route  DELETE /api/admin/users/:id
export const deleteUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }
    res.json({ success: true, message: "Xóa người dùng thành công" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get all bookings (admin)
// @route  GET /api/admin/bookings
export const getAllBookings = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const bookings = await Booking.find()
      .populate("userId", "name email phone")
      .populate("homestayId", "title location city images price")
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Update booking status (admin)
// @route  PUT /api/admin/bookings/:id/status
export const updateBookingStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "confirmed", "cancelled", "completed"];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
      return;
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    )
      .populate("userId", "name email phone")
      .populate("homestayId", "title location city images price");

    if (!booking) {
      res.status(404).json({ success: false, message: "Không tìm thấy đặt phòng" });
      return;
    }

    res.json({ success: true, message: "Cập nhật trạng thái thành công", booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Delete a booking (admin only)
// @route  DELETE /api/admin/bookings/:id
export const deleteBooking = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = paramId(req.params.id);

    // Validate ObjectId format before hitting the database so Mongoose never
    // throws a CastError (which would produce a confusing 500 response).
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      res.status(400).json({ success: false, message: "ID đặt phòng không hợp lệ" });
      return;
    }

    // findByIdAndDelete only needs the _id — no ownership or createdBy check.
    // Admins can delete any booking regardless of who created it or whether the
    // booking has a userId / customerInfo / createdBy field.
    const booking = await Booking.findByIdAndDelete(id);

    if (!booking) {
      res.status(404).json({ success: false, message: "Không tìm thấy đặt phòng (có thể đã bị xóa trước đó)" });
      return;
    }

    res.json({ success: true, message: "Xóa đặt phòng thành công" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    console.error("[deleteBooking] error:", error);
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get all homestays (admin - includes unavailable)
// @route  GET /api/admin/homestays
export const getAllHomestays = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const homestays = await Homestay.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
    res.json({ success: true, homestays });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Admin creates a booking manually
// @route  POST /api/admin/bookings
export const createAdminBooking = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const {
      homestayId,
      userId,
      checkIn,
      checkOut,
      guests,
      note,
      adminNote,
      finalPrice: overridePrice,
      status = "confirmed",
      customerInfo,
    } = req.body;

    if (!homestayId || !checkIn || !checkOut || !guests) {
      res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc" });
      return;
    }
    if (!["pending", "confirmed", "cancelled"].includes(status)) {
      res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
      return;
    }
    if (!userId) {
      const guestName = customerInfo?.name?.trim();
      const guestPhone = customerInfo?.phone?.trim();
      if (!guestName || !guestPhone) {
        res.status(400).json({
          success: false,
          message: "Khi không chọn user có sẵn, cần nhập tên và số điện thoại khách",
        });
        return;
      }
    }

    const homestay = await Homestay.findById(homestayId);
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkInDate >= checkOutDate) {
      res.status(400).json({ success: false, message: "Thời gian trả phòng phải sau nhận phòng" });
      return;
    }

    if (Number(guests) > homestay.maxGuests) {
      res.status(400).json({
        success: false,
        message: `Homestay này chỉ chứa tối đa ${homestay.maxGuests} khách`,
      });
      return;
    }

    // Check for conflicting bookings
    const conflicting = await Booking.findOne({
      homestayId,
      status: { $in: ["pending", "confirmed"] },
      $or: [{ checkIn: { $lt: checkOutDate }, checkOut: { $gt: checkInDate } }],
    });
    if (conflicting) {
      res.status(400).json({ success: false, message: "Homestay đã được đặt trong khoảng thời gian này" });
      return;
    }

    // Resolve guest user — fallback to admin's own userId when not supplied
    const guestUserId = userId || req.user?._id;

    // Calculate price
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

    // Admin may override the final price
    const finalPrice =
      overridePrice !== undefined && overridePrice !== null && overridePrice !== ""
        ? Number(overridePrice)
        : originalPrice;

    const booking = await Booking.create({
      userId: guestUserId,
      homestayId,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      hours,
      guests: guestCount,
      originalPrice,
      extraGuestFee,
      finalPrice,
      totalPrice: finalPrice,
      status,
      note: note || "",
      adminNote: adminNote || "",
      createdBy: req.user?._id,
      customerInfo: customerInfo || {},
    });

    const populated = await booking.populate([
      { path: "homestayId", select: "title location images price pricing city" },
      { path: "userId", select: "name email phone" },
      { path: "createdBy", select: "name email" },
    ]);

    res.status(201).json({ success: true, message: "Tạo đặt phòng thành công", booking: populated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get booking management list by homestay (admin)
// @route  GET /api/admin/homestays/:id/bookings
export const getHomestayBookings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const opts = req.query as BookingQueryOptions;

    const homestayId = paramId(req.params.id);
    const homestay = await Homestay.findById(homestayId).select("_id pricing");
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    const dbQuery = buildBookingDbQuery(homestayId, opts);
    const docs = await Booking.find(dbQuery)
      .populate("userId", "name phone email role")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    const filtered = filterBookingRows(
      docs as Parameters<typeof filterBookingRows>[0],
      opts,
      homestay.pricing || [],
    );
    const sorted = sortBookingRows(
      filtered as Parameters<typeof sortBookingRows>[0],
      opts.sortBy,
      opts.order,
    );
    const { paged, total, pageNum, limitNum } = paginateRows(
      sorted,
      opts.page,
      opts.limit,
    );

    res.json({
      success: true,
      bookings: paged,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Export homestay bookings to Excel
// @route  GET /api/admin/homestays/:id/export
export const exportHomestayBookings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const opts = { ...req.query, limit: "10000" } as BookingQueryOptions;

    const homestayId = paramId(req.params.id);
    const homestay = await Homestay.findById(homestayId).select("_id title pricing");
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    const dbQuery = buildBookingDbQuery(homestayId, opts);
    const docs = await Booking.find(dbQuery)
      .populate("userId", "name phone email role")
      .populate("createdBy", "name email role")
      .sort({ createdAt: -1 });

    const filtered = filterBookingRows(
      docs as Parameters<typeof filterBookingRows>[0],
      opts,
      homestay.pricing || [],
    );
    const sorted = sortBookingRows(
      filtered as Parameters<typeof sortBookingRows>[0],
      opts.sortBy,
      opts.order,
    );

    const excelBuffer = await generateBookingExcel(
      sorted,
      homestay.title || "Homestay",
      homestay.pricing || [],
    );

    const safeTitle = (homestay.title || "Report")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "Report";

    const dateStamp = new Date().toISOString().split("T")[0];
    const filename = `Booking-${safeTitle}-${dateStamp}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};
