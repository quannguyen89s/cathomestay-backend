import { Request, Response } from "express";
import Homestay from "../models/Homestay.js";
import type { IPricingTier } from "../models/Homestay.js";
import Booking from "../models/Booking.js";
import { AuthRequest } from "../middlewares/auth.js";
import { uploadImage, deleteImage, getPublicIdFromUrl } from "../utils/cloudinary.js";
import { validatePricingRules, sortTiers } from "../utils/pricingUtils.js";
import fs from "fs";

// @desc   Get all homestays with search & filter
// @route  GET /api/homestays
export const getHomestays = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search,
      city,
      minPrice,
      maxPrice,
      guests,
      page = "1",
      limit = "9",
    } = req.query;

    const query: Record<string, unknown> = { isAvailable: true };

    if (search) {
      query.$text = { $search: search as string };
    }
    if (city) {
      query.city = { $regex: city as string, $options: "i" };
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) (query.price as Record<string, number>).$gte = Number(minPrice);
      if (maxPrice) (query.price as Record<string, number>).$lte = Number(maxPrice);
    }
    if (guests) {
      query.maxGuests = { $gte: Number(guests) };
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [homestays, total] = await Promise.all([
      Homestay.find(query)
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Homestay.countDocuments(query),
    ]);

    res.json({
      success: true,
      homestays,
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

// @desc   Get single homestay
// @route  GET /api/homestays/:id
export const getHomestay = async (req: Request, res: Response): Promise<void> => {
  try {
    const homestay = await Homestay.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }
    res.json({ success: true, homestay });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Create homestay (admin)
// @route  POST /api/homestays
export const createHomestay = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      price,
      pricing,
      location,
      city,
      amenities,
      maxGuests,
      bedrooms,
      bathrooms,
    } = req.body;

    // Parse and validate pricing tiers
    let parsedPricing: IPricingTier[] = [];
    if (pricing) {
      parsedPricing = typeof pricing === "string" ? JSON.parse(pricing) : pricing;
      const err = validatePricingRules(parsedPricing);
      if (err) {
        res.status(400).json({ success: false, message: err });
        return;
      }
      parsedPricing = sortTiers(parsedPricing);
    }

    const images: string[] = [];

    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        try {
          const url = await uploadImage(file.path);
          images.push(url);
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error("Upload image error:", err);
        }
      }
    }

    const homestay = await Homestay.create({
      title,
      description,
      price: Number(price),
      pricing: parsedPricing,
      location,
      city,
      images,
      amenities: amenities ? JSON.parse(amenities) : [],
      maxGuests: Number(maxGuests),
      bedrooms: Number(bedrooms) || 1,
      bathrooms: Number(bathrooms) || 1,
      createdBy: req.user?._id,
    });

    res.status(201).json({ success: true, message: "Tạo homestay thành công", homestay });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Update homestay (admin)
// @route  PUT /api/homestays/:id
export const updateHomestay = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const homestay = await Homestay.findById(req.params.id);
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    const updates = { ...req.body };

    if (updates.amenities && typeof updates.amenities === "string") {
      updates.amenities = JSON.parse(updates.amenities);
    }
    if (updates.price) updates.price = Number(updates.price);
    if (updates.maxGuests) updates.maxGuests = Number(updates.maxGuests);

    // Parse and validate pricing tiers if provided
    if (updates.pricing !== undefined) {
      let parsedPricing: IPricingTier[] =
        typeof updates.pricing === "string"
          ? JSON.parse(updates.pricing)
          : updates.pricing;
      const err = validatePricingRules(parsedPricing);
      if (err) {
        res.status(400).json({ success: false, message: err });
        return;
      }
      updates.pricing = sortTiers(parsedPricing);
    }

    // Upload new images if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const newImages: string[] = [];
      for (const file of req.files as Express.Multer.File[]) {
        try {
          const url = await uploadImage(file.path);
          newImages.push(url);
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error("Upload image error:", err);
        }
      }
      updates.images = [...(homestay.images || []), ...newImages];
    }

    const updated = await Homestay.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, message: "Cập nhật homestay thành công", homestay: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Delete homestay (admin)
// @route  DELETE /api/homestays/:id
export const deleteHomestay = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const homestay = await Homestay.findById(req.params.id);
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    // Delete images from cloudinary
    for (const imageUrl of homestay.images) {
      try {
        const publicId = getPublicIdFromUrl(imageUrl);
        await deleteImage(publicId);
      } catch (err) {
        console.error("Delete image error:", err);
      }
    }

    await homestay.deleteOne();
    res.json({ success: true, message: "Xóa homestay thành công" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Delete specific image from homestay
// @route  DELETE /api/homestays/:id/images
export const deleteHomestayImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { imageUrl } = req.body;
    const homestay = await Homestay.findById(req.params.id);
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    const publicId = getPublicIdFromUrl(imageUrl);
    await deleteImage(publicId);

    homestay.images = homestay.images.filter((img) => img !== imageUrl);
    await homestay.save();

    res.json({ success: true, message: "Xóa ảnh thành công", homestay });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get booked time slots for a homestay on a specific calendar date
// @route  GET /api/homestays/:id/booked-slots?date=YYYY-MM-DD
export const getBookedSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.query;

    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ success: false, message: "Tham số date không hợp lệ (YYYY-MM-DD)" });
      return;
    }

    const homestay = await Homestay.findById(req.params.id).select("_id");
    if (!homestay) {
      res.status(404).json({ success: false, message: "Không tìm thấy homestay" });
      return;
    }

    // Treat date as Vietnam local time (UTC+7) to match what the user sees on their calendar
    const startOfDay = new Date(`${date}T00:00:00+07:00`);
    const endOfDay = new Date(`${date}T23:59:59+07:00`);

    const bookings = await Booking.find({
      homestay: req.params.id,
      status: "confirmed",
      checkIn: { $lt: endOfDay },
      checkOut: { $gt: startOfDay },
    }).select("checkIn checkOut");

    const slots = bookings.map((b) => ({
      checkIn: b.checkIn.toISOString(),
      checkOut: b.checkOut.toISOString(),
    }));

    res.json({ success: true, slots });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};
