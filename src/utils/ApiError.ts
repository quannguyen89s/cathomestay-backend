/**
 * Structured operational error for HTTP responses.
 *
 * Controllers throw ApiError for known failure conditions (404, 400, 403, …).
 * The global error handler in app.ts converts these into JSON responses.
 *
 * Unknown errors (5xx) should be plain Error objects and are handled as
 * "Lỗi server" by the global error handler.
 */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
    // Preserve prototype chain when compiled to ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string) {
    return new ApiError(400, message);
  }

  static unauthorized(message = "Không có quyền truy cập") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Không có quyền thực hiện") {
    return new ApiError(403, message);
  }

  static notFound(message = "Không tìm thấy") {
    return new ApiError(404, message);
  }
}
