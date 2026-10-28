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

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",

  EMAIL_HOST: process.env.EMAIL_HOST ?? "smtp.gmail.com",
  EMAIL_PORT: Number(process.env.EMAIL_PORT ?? 587),
  EMAIL_SECURE: process.env.EMAIL_SECURE === "true",
  EMAIL_USER: process.env.EMAIL_USER ?? "",
  EMAIL_PASS: process.env.EMAIL_PASS ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "HomeStay Support <no-reply@homestay.vn>",

  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim()),
} as const;

if (env.NODE_ENV === "production" && (env.JWT_SECRET === "secret" || env.JWT_SECRET.length < 16)) {
  console.error(
    "⚠️ [SECURITY WARNING]: JWT_SECRET đang sử dụng giá trị mặc định hoặc quá ngắn trong môi trường production! Hãy cấu hình một chuỗi ngẫu nhiên mạnh (>= 32 ký tự) trong .env để bảo vệ token."
  );
}
