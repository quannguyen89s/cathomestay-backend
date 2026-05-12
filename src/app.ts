import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { env } from "./config/env.js";
import { ApiError } from "./utils/ApiError.js";
import { sendError } from "./utils/response.js";

import authRoutes from "./routes/auth.js";
import homestayRoutes from "./routes/homestays.js";
import bookingRoutes from "./routes/bookings.js";
import adminRoutes from "./routes/admin.js";
import pricingTemplateRoutes from "./routes/pricingTemplates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists at startup
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
console.log(env.ALLOWED_ORIGINS);
// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Static files ──────────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/homestays", homestayRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/pricing-templates", pricingTemplateRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "Server đang hoạt động" });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route không tồn tại" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof ApiError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    const message =
      err instanceof Error ? err.message : "Lỗi server không xác định";
    console.error("[ERROR]", err);
    sendError(res, message, 500);
  },
);

export default app;
