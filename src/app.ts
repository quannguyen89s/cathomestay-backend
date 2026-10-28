import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { env } from "./config/env.js";
import { ApiError } from "./utils/ApiError.js";
import { sendError } from "./utils/response.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";

import authRoutes from "./routes/auth.js";
import homestayRoutes from "./routes/homestays.js";
import bookingRoutes from "./routes/bookings.js";
import adminRoutes from "./routes/admin.js";
import pricingTemplateRoutes from "./routes/pricingTemplates.js";
import notificationRoutes from "./routes/notifications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists at startup
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// ── Security Headers & Protections ────────────────────────────────────────────
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allows static images to be served across origins
    contentSecurityPolicy: false, // CSP is kept off so local dev/Cloudinary/Google assets load without friction
  })
);

// ── Rate Limiting & NoSQL Sanitization ─────────────────────────────────────────
app.use("/api", globalLimiter);
app.use(mongoSanitize());

// ── CORS ──────────────────────────────────────────────────────────────────────
// Build a Set of allowed origins. Normalise each entry to lowercase and also
// add the www ↔ non-www counterpart so that both variants always work.
const buildAllowedSet = (origins: readonly string[]): Set<string> => {
  const set = new Set<string>();
  for (const o of origins) {
    const norm = o.trim().toLowerCase();
    set.add(norm);
    // Add www ↔ non-www mirror
    try {
      const url = new URL(norm);
      if (url.hostname.startsWith("www.")) {
        url.hostname = url.hostname.slice(4);
      } else {
        url.hostname = `www.${url.hostname}`;
      }
      set.add(url.toString().replace(/\/$/, "")); // strip trailing slash
    } catch {
      // not a parseable URL (e.g. localhost) — skip mirroring
    }
  }
  return set;
};

const ALLOWED_ORIGINS_SET = buildAllowedSet(env.ALLOWED_ORIGINS);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (ALLOWED_ORIGINS_SET.has(origin.toLowerCase())) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

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
app.use("/api/notifications", notificationRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "Server đang hoạt động" });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: "Route không tồn tại" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof ApiError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    const message =
      err instanceof Error ? err.message : "Lỗi server không xác định";
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
    sendError(res, message, 500);
  },
);

export default app;
