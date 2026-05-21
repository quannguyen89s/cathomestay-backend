import { Router } from "express";
import {
  getStats,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllBookings,
  updateBookingStatus,
  getBookingById,
  updateBooking,
  deleteBooking,
  getAllHomestays,
  createAdminBooking,
  getHomestayBookings,
  exportHomestayBookings,
} from "../controllers/adminController.js";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../controllers/pricingTemplateController.js";
import { protect, adminOnly } from "../middlewares/auth.js";

const router = Router();

router.use(protect, adminOnly);

router.get("/stats", getStats);
router.get("/users", getAllUsers);
router.put("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);
router.get("/bookings", getAllBookings);
router.post("/bookings", createAdminBooking);
router.get("/bookings/:id", getBookingById);
router.put("/bookings/:id", updateBooking);
router.put("/bookings/:id/status", updateBookingStatus);
router.delete("/bookings/:id", deleteBooking);
router.get("/homestays", getAllHomestays);
router.get("/homestays/:id/bookings", getHomestayBookings);
router.get("/homestays/:id/export", exportHomestayBookings);

// Pricing templates (admin CRUD)
router.post("/pricing-templates", createTemplate);
router.put("/pricing-templates/:id", updateTemplate);
router.delete("/pricing-templates/:id", deleteTemplate);

export default router;
