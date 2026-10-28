import rateLimit from "express-rate-limit";

/**
 * Global rate limiter for general API endpoints
 * 300 requests per 15 minutes per IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Hệ thống phát hiện quá nhiều yêu cầu từ bạn. Vui lòng thử lại sau 15 phút.",
  },
});

/**
 * Strict limiter for login & registration to prevent brute-force attacks
 * 10 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Bạn đã thử đăng nhập/đăng ký quá nhiều lần. Vui lòng thử lại sau 15 phút.",
  },
});

/**
 * Very strict limiter for password reset & OTP requests to prevent spamming and brute-force
 * 5 attempts per 15 minutes per IP
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Bạn đã yêu cầu hoặc nhập mã xác thực quá nhiều lần. Vui lòng thử lại sau 15 phút.",
  },
});
