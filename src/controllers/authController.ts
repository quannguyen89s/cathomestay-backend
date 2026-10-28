import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { AuthRequest } from "../middlewares/auth.js";
import { env } from "../config/env.js";
import { sendPasswordResetEmail } from "../utils/emailService.js";

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

// @desc   Login / Register with Google
// @route  POST /api/auth/google
export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ success: false, message: "Thiếu mã xác thực từ Google" });
      return;
    }

    let payload: {
      sub: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
    } | undefined;

    // 1. Verify token using google-auth-library
    if (env.GOOGLE_CLIENT_ID) {
      try {
        const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload() as typeof payload;
      } catch (err) {
        console.warn("[Google Auth] Library verification failed, attempting tokeninfo fallback:", err);
      }
    }

    // 2. Fallback: verify via Google tokeninfo endpoint
    if (!payload?.email) {
      try {
        const resp = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        );
        if (resp.ok) {
          const data = (await resp.json()) as Record<string, string>;
          if (data.email) {
            payload = {
              sub: data.sub,
              email: data.email,
              email_verified: data.email_verified,
              name: data.name,
              picture: data.picture,
            };
          }
        }
      } catch (err) {
        console.error("[Google Auth] Fallback verification error:", err);
      }
    }

    if (!payload || !payload.email) {
      res.status(401).json({
        success: false,
        message: "Xác thực tài khoản Google không hợp lệ hoặc đã hết hạn",
      });
      return;
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || email.split("@")[0];
    const picture = payload.picture || "";
    const googleId = payload.sub;

    // Find existing user by email
    let user = await User.findOne({ email });

    if (user) {
      let changed = false;
      if (!user.googleId) {
        user.googleId = googleId;
        changed = true;
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        name,
        email,
        googleId,
        avatar: picture,
        role: "user",
      });
    }

    const token = generateToken(user._id.toString(), user.role);

    res.json({
      success: true,
      message: "Đăng nhập Google thành công",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || "",
        avatar: user.avatar || "",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server khi đăng nhập Google";
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

// @desc   Change user password
// @route  PUT /api/auth/change-password
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
      return;
    }

    const user = await User.findById(req.user?._id).select("+password");
    if (!user) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }

    // If user already has a password set (normal accounts)
    if (user.password) {
      if (!currentPassword) {
        res.status(400).json({
          success: false,
          message: "Vui lòng nhập mật khẩu hiện tại",
        });
        return;
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        res.status(400).json({
          success: false,
          message: "Mật khẩu hiện tại không chính xác",
        });
        return;
      }
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Đổi mật khẩu thành công!",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server khi đổi mật khẩu";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Request password reset OTP via email
// @route  POST /api/auth/forgot-password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: "Vui lòng nhập địa chỉ email" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản với email này",
      });
      return;
    }

    // Generate cryptographically secure random 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();

    user.resetPasswordOtp = otp;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    user.resetPasswordAttempts = 0;
    await user.save();

    // Send email with OTP
    await sendPasswordResetEmail(user.email, otp, user.name);

    res.json({
      success: true,
      message: "Mã xác thực đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư (kể cả hòm thư Spam/Rác).",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server khi gửi mã xác thực";
    res.status(500).json({ success: false, message });
  }
};

// @desc   Reset password using OTP
// @route  POST /api/auth/reset-password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Vui lòng điền đầy đủ email, mã xác thực và mật khẩu mới",
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      "+password +resetPasswordOtp +resetPasswordExpires +resetPasswordAttempts"
    );

    if (!user) {
      res.status(404).json({ success: false, message: "Không tìm thấy tài khoản" });
      return;
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires.getTime() < Date.now()) {
      res.status(400).json({
        success: false,
        message: "Mã xác thực đã hết hạn (chỉ có hiệu lực trong 15 phút). Vui lòng yêu cầu mã mới.",
      });
      return;
    }

    // Check maximum failed attempts
    const attempts = user.resetPasswordAttempts || 0;
    if (attempts >= 5) {
      user.resetPasswordOtp = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordAttempts = 0;
      await user.save();
      res.status(400).json({
        success: false,
        message: "Bạn đã nhập sai mã xác thực quá 5 lần. Mã đã bị hủy vì lý do an toàn, vui lòng yêu cầu mã mới.",
      });
      return;
    }

    if (!user.resetPasswordOtp || user.resetPasswordOtp !== otp.trim()) {
      user.resetPasswordAttempts = attempts + 1;
      await user.save();
      const remaining = 5 - (attempts + 1);
      res.status(400).json({
        success: false,
        message: `Mã xác thực không chính xác. Bạn còn ${remaining > 0 ? remaining : 0} lần thử.`,
      });
      return;
    }

    // Set new password (pre-save hook will hash it)
    user.password = newPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;
    await user.save();

    res.json({
      success: true,
      message: "Đặt lại mật khẩu thành công! Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server khi đặt lại mật khẩu";
    res.status(500).json({ success: false, message });
  }
};
