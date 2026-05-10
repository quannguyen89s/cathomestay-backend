import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import homestayRoutes from "./routes/homestays.js";
import bookingRoutes from "./routes/bookings.js";
import adminRoutes from "./routes/admin.js";
import pricingTemplateRoutes from "./routes/pricingTemplates.js";
import { seedDefaultTemplates } from "./models/PricingTemplate.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// Connect to MongoDB and seed default data
connectDB().then(() => seedDefaultTemplates());

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/homestays", homestayRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/pricing-templates", pricingTemplateRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "Server đang hoạt động" });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route không tồn tại" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

export default app;
