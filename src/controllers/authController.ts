import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { AuthRequest } from "../middlewares/auth.js";
import { env } from "../config/env.js";

const generateToken = (id: string, role: string): string => {
  return jwt.sign({ id, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRE,
  } as jwt.SignOptions);
};

// @desc   Register user
// @route  POST /api/auth/register
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ success: false, message: "Email đã được sử dụng" });
      return;
    }

    const user = await User.create({ name, email, password, phone });
    const token = generateToken(user._id.toString(), user.role);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Login user
// @route  POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: "Vui lòng nhập email và mật khẩu" });
      return;
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      res.status(401).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Email hoặc mật khẩu không đúng" });
      return;
    }

    const token = generateToken(user._id.toString(), user.role);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Get current user profile
// @route  GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id);
    if (!user) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }
    res.json({ success: true, user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Update user profile
// @route  PUT /api/auth/profile
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user?._id,
      { name, phone },
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: "Cập nhật thành công", user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    res.status(500).json({ success: false, message });
  }
};
