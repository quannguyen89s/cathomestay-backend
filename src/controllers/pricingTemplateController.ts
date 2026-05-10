import { Request, Response } from "express";
import PricingTemplate from "../models/PricingTemplate.js";
import { AuthRequest } from "../middlewares/auth.js";

// @desc   List all pricing templates
// @route  GET /api/pricing-templates
export const listTemplates = async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await PricingTemplate.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, templates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Create a pricing template (admin)
// @route  POST /api/admin/pricing-templates
export const createTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, type, maxHours, startHour, endHour, defaultPrice, order } = req.body;

    if (!name || !type || defaultPrice == null) {
      res.status(400).json({ success: false, message: "Thiếu thông tin bắt buộc (name, type, defaultPrice)" });
      return;
    }
    if (!["hourly", "overnight", "daynight"].includes(type)) {
      res.status(400).json({ success: false, message: "type không hợp lệ" });
      return;
    }
    if (type === "hourly" && (!maxHours || maxHours < 1)) {
      res.status(400).json({ success: false, message: "hourly template cần maxHours ≥ 1" });
      return;
    }
    if ((type === "overnight" || type === "daynight") && startHour == null) {
      res.status(400).json({ success: false, message: "overnight/daynight template cần startHour" });
      return;
    }

    const template = await PricingTemplate.create({
      name: name.trim().toUpperCase(),
      type,
      maxHours:     type === "hourly"    ? Number(maxHours) : undefined,
      startHour:    type !== "hourly"    ? Number(startHour) : undefined,
      endHour:      endHour != null      ? Number(endHour)   : undefined,
      defaultPrice: Number(defaultPrice),
      isSystem:     false,
      order:        order != null        ? Number(order)     : 99,
    });

    res.status(201).json({ success: true, template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Update a pricing template (admin)
// @route  PUT /api/admin/pricing-templates/:id
export const updateTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = await PricingTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ success: false, message: "Không tìm thấy template" });
      return;
    }

    const { name, defaultPrice, order, startHour, endHour, maxHours } = req.body;

    if (name)          template.name         = String(name).trim().toUpperCase();
    if (defaultPrice != null) template.defaultPrice = Number(defaultPrice);
    if (order != null) template.order        = Number(order);
    // Non-system templates can have their structure changed
    if (!template.isSystem) {
      if (maxHours  != null) template.maxHours  = Number(maxHours);
      if (startHour != null) template.startHour = Number(startHour);
      if (endHour   != null) template.endHour   = Number(endHour);
    }

    await template.save();
    res.json({ success: true, template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Delete a pricing template (admin, non-system only)
// @route  DELETE /api/admin/pricing-templates/:id
export const deleteTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = await PricingTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ success: false, message: "Không tìm thấy template" });
      return;
    }
    if (template.isSystem) {
      res.status(403).json({ success: false, message: "Không thể xóa template hệ thống" });
      return;
    }

    await template.deleteOne();
    res.json({ success: true, message: "Đã xóa template" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};
