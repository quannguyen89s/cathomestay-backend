import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler and forwards any thrown errors
 * to Express's next(err) so our global error handler can catch them.
 *
 * Usage:
 *   router.get("/", asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
