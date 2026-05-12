/**
 * Centralised environment config.
 * All process.env reads happen here — controllers/services import from this file,
 * never from process.env directly.
 */

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 5000),
  MONGODB_URI:
    process.env.MONGODB_URI ?? "mongodb://localhost:27017/BookingRoom",

  JWT_SECRET: process.env.JWT_SECRET ?? "secret",
  /** JWT expiry accepts any jsonwebtoken `expiresIn` value, e.g. "7d", "1h" */
  JWT_EXPIRE: process.env.JWT_EXPIRE ?? "7d",

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? "",

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim()),
} as const;
