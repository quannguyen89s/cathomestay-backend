import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/User.js";
import { env } from "../config/env.js";

export interface AuthRequest extends Request {
  user?: IUser;
}

interface JwtPayload {
  id: string;
  role: string;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      res.status(401).json({ success: false, message: "Không có quyền truy cập" });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ success: false, message: "Token không hợp lệ" });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token không hợp lệ hoặc đã hết hạn" });
  }
};

export const adminOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ success: false, message: "Chỉ admin mới có quyền thực hiện" });
    return;
  }
  next();
};
