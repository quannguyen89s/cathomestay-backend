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

// @desc   Get all bookings (admin) with pagination, status filter, and search
// @route  GET /api/admin/bookings
export const getAllBookings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const {
      page   = "1",
      limit  = "8",
      status,
      search,
    } = req.query as Record<string, string | undefined>;

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 8));
    const skip     = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search?.trim()) {
      const regex = new RegExp(search.trim(), "i");
      const [matchingHomestays, matchingUsers] = await Promise.all([
        Homestay.find({ title: regex }).select("_id").lean(),
        User.find({ $or: [{ name: regex }, { email: regex }] }).select("_id").lean(),
      ]);
      const homestayIds = matchingHomestays.map((h) => h._id);
      const userIds     = matchingUsers.map((u) => u._id);
      filter.$or = [
        { "customerInfo.name":  regex },
        { "customerInfo.phone": regex },
        { "customerInfo.email": regex },
        ...(homestayIds.length ? [{ homestayId: { $in: homestayIds } }] : []),
        ...(userIds.length     ? [{ userId:     { $in: userIds     } }] : []),
      ];
    }

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate("userId",    "name email phone")
        .populate("homestayId", "title location city images price")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Booking.countDocuments(filter),
    ]);

    res.json({
      success: true,
      bookings,
      pagination: {
        page:  pageNum,
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

// @desc   Get a single booking by ID (admin)
// @route  GET /api/admin/bookings/:id
export const getBookingById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = paramId(req.params.id);
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      res.status(400).json({ success: false, message: "ID đặt phòng không hợp lệ" });
      return;
    }
    const booking = await Booking.findById(id)
      .populate("userId", "name email phone")
      .populate("homestayId", "title location city images price pricing maxGuests")
      .populate("createdBy", "name email");
    if (!booking) {
      res.status(404).json({ success: false, message: "Không tìm thấy đặt phòng" });
      return;
    }
    res.json({ success: true, booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Update a booking (admin only)
// @route  PUT /api/admin/bookings/:id
export const updateBooking = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const id = paramId(req.params.id);
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      res.status(400).json({ success: false, message: "ID đặt phòng không hợp lệ" });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: "Không tìm thấy đặt phòng" });
      return;
    }

    const {
      checkIn,
      checkOut,
      guests,
      note,
      adminNote,
      status,
      finalPrice: overridePrice,
      customerInfo,
    } = req.body as {
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      note?: string;
      adminNote?: string;
      status?: string;
      finalPrice?: number | string;
      /**
       * Booking-snapshot customer info. Editing this NEVER touches the
       * linked User account — it only updates the per-booking fields
       * (booking.customerInfo.{name,phone,email}). For walk-in bookings
       * (no userId) this is the only source of customer info.
       */
      customerInfo?: { name?: string; phone?: string; email?: string };
    };

    // Validate status if provided
    const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
      return;
    }

    // Resolve effective dates and guest count (fall back to stored values)
    const checkInDate  = checkIn  ? new Date(checkIn)  : new Date(booking.checkIn);
    const checkOutDate = checkOut ? new Date(checkOut) : new Date(booking.checkOut);
    const guestCount   = guests != null ? Number(guests) : booking.guests;

    if (checkInDate >= checkOutDate) {
      res.status(400).json({ success: false, message: "Thời gian trả phòng phải sau nhận phòng" });
      return;
    }

    // Build the update patch
    const patch: Record<string, unknown> = {};
    if (checkIn)              patch.checkIn   = checkInDate;
    if (checkOut)             patch.checkOut  = checkOutDate;
    if (guests != null)       patch.guests    = guestCount;
    if (note      !== undefined) patch.note      = note;
    if (adminNote !== undefined) patch.adminNote = adminNote;
    if (status)               patch.status    = status;

    // Customer-info snapshot. We deliberately use dot-notation field paths
    // ($set: { "customerInfo.name": ..., ... }) so:
    //   1. Only the keys actually sent are written — partial updates are safe.
    //   2. The whole sub-document is never replaced, so legacy fields stay.
    //   3. The User account is NEVER modified by this endpoint.
    if (customerInfo && typeof customerInfo === "object") {
      if (typeof customerInfo.name === "string") {
        patch["customerInfo.name"] = customerInfo.name.trim();
      }
      if (typeof customerInfo.phone === "string") {
        patch["customerInfo.phone"] = customerInfo.phone.trim();
      }
      if (typeof customerInfo.email === "string") {
        patch["customerInfo.email"] = customerInfo.email.trim();
      }
    }

    // Re-price whenever dates, guests, or an explicit override are present.
    // The frontend always sends finalPrice equal to the combo-selected price so
    // the backend honours that value and never auto-switches the combo.
    const needsRepricing =
      checkIn != null ||
      checkOut != null ||
      guests != null ||
      (overridePrice !== undefined && overridePrice !== null && overridePrice !== "");

    if (needsRepricing) {
      const homestay = await Homestay.findById(booking.homestayId).select(
        "pricing price maxGuests",
      );

      const hours = calcHours(checkInDate, checkOutDate);
      patch.hours = hours;

      if (homestay) {
        let basePrice: number;
        if (homestay.pricing && homestay.pricing.length > 0) {
          const result = calculatePriceWithRules(checkInDate, hours, homestay.pricing);
          basePrice = result ? result.basePrice : homestay.price;
        } else {
          const nights = Math.ceil(hours / 24) || 1;
          basePrice = nights * homestay.price;
        }

        const extraGuestFee = calcExtraGuestFee(guestCount);

        // If the frontend sent an explicit finalPrice (i.e. a combo was selected),
        // trust it for originalPrice as well so the stored breakdown is consistent.
        if (overridePrice !== undefined && overridePrice !== null && overridePrice !== "") {
          const fp = Number(overridePrice);
          // Original price = override minus extra-guest portion
          patch.originalPrice = fp - extraGuestFee;
          patch.extraGuestFee = extraGuestFee;
          patch.finalPrice    = fp;
          patch.totalPrice    = fp;
        } else {
          patch.originalPrice = basePrice;
          patch.extraGuestFee = extraGuestFee;
          patch.finalPrice    = basePrice + extraGuestFee;
          patch.totalPrice    = basePrice + extraGuestFee;
        }
      } else if (overridePrice !== undefined && overridePrice !== null && overridePrice !== "") {
        const fp = Number(overridePrice);
        patch.finalPrice = fp;
        patch.totalPrice = fp;
      }
    }

    const updated = await Booking.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true },
    )
      .populate("userId",    "name email phone")
      .populate("homestayId", "title location city images price pricing maxGuests")
      .populate("createdBy", "name email");

    res.json({ success: true, message: "Cập nhật đặt phòng thành công", booking: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    console.error("[updateBooking] error:", error);
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

// @desc   Get ALL occupying bookings for a homestay's calendar view
// @route  GET /api/admin/homestays/:id/calendar-bookings
//
// Calendar must show every booking that occupies a time slot — regardless of
// pagination, filters, or schema version. This endpoint exists because the
// regular `getHomestayBookings` endpoint paginates and filters, which made
// some bookings invisible on the calendar.
//
// Returns:
//   - bookings with status "confirmed" or "pending"
//   - bookings whose `status` field is missing / null (legacy records) —
//     treated as "confirmed" for occupancy purposes
//   - cancelled bookings are NEVER returned (they don't occupy slots)
//
// Optionally accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD to narrow the range to
// the currently visible month for better performance on large datasets.
// When `from`/`to` are present, returns every booking that overlaps the
// range (checkIn < to AND checkOut > from), so overnight bookings spanning
// the range edges are still included.
export const getHomestayCalendarBookings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const homestayId = paramId(req.params.id);
    if (!homestayId || !/^[a-f\d]{24}$/i.test(homestayId)) {
      res.status(400).json({ success: false, message: "ID homestay không hợp lệ" });
      return;
    }

    const homestay = await Homestay.findById(homestayId).select("_id");
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    const { from, to } = req.query as { from?: string; to?: string };

    const filter: Record<string, unknown> = {
      homestayId,
      // Status filter — include legacy docs missing the status field
      $or: [
        { status: { $in: ["confirmed", "pending"] } },
        { status: { $exists: false } },
        { status: null },
      ],
    };

    // Optional overlap window — booking overlaps [from, to] iff
    //   checkIn < to AND checkOut > from
    if (from || to) {
      const overlap: Record<string, unknown>[] = [];
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          overlap.push({ checkIn: { $lt: toDate } });
        }
      }
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          overlap.push({ checkOut: { $gt: fromDate } });
        }
      }
      if (overlap.length > 0) {
        // Combine with the existing $or by AND-ing them under $and
        const existingStatusOr = filter.$or;
        delete filter.$or;
        filter.$and = [{ $or: existingStatusOr }, ...overlap];
      }
    }

    const bookings = await Booking.find(filter)
      .populate("userId", "name phone email")
      .select("_id checkIn checkOut status guests customerInfo userId homestayId hours adminNote note createdAt")
      .sort({ checkIn: 1 });

    res.json({ success: true, bookings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    console.error("[getHomestayCalendarBookings] error:", error);
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
