import type { Response } from "express";

/**
 * Send a successful JSON response.
 *
 * Usage:
 *   sendSuccess(res, { user }, "Đăng nhập thành công");
 *   sendSuccess(res, { bookings, pagination }, undefined, 200);
 */
export const sendSuccess = (
  res: Response,
  data: Record<string, unknown> = {},
  message?: string,
  statusCode = 200,
): void => {
  const body: Record<string, unknown> = { success: true, ...data };
  if (message) body.message = message;
  res.status(statusCode).json(body);
};

/**
 * Send an error JSON response.
 *
 * Prefer throwing ApiError inside route handlers and letting the global
 * error middleware call this — but it can also be called directly.
 */
export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
): void => {
  res.status(statusCode).json({ success: false, message });
};
