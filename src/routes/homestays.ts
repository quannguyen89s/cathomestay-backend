import { Router } from "express";
import {
  getHomestays,
  getHomestay,
  createHomestay,
  updateHomestay,
  deleteHomestay,
  deleteHomestayImage,
  getBookedSlots,
} from "../controllers/homestayController.js";
import { protect, adminOnly } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

const router = Router();

router.get("/", getHomestays);
router.get("/:id/booked-slots", getBookedSlots);
router.get("/:id", getHomestay);
router.post("/", protect, adminOnly, upload.array("images", 10), createHomestay);
router.put("/:id", protect, adminOnly, upload.array("images", 10), updateHomestay);
router.delete("/:id", protect, adminOnly, deleteHomestay);
router.delete("/:id/images", protect, adminOnly, deleteHomestayImage);

export default router;
