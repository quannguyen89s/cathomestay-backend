import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  cancelBooking,
  getBooking,
} from "../controllers/bookingController.js";
import { protect } from "../middlewares/auth.js";

const router = Router();

router.use(protect);

router.post("/", createBooking);
router.get("/my", getMyBookings);
router.get("/:id", getBooking);
router.put("/:id/cancel", cancelBooking);

export default router;
