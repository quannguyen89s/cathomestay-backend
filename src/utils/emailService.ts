import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * Creates a nodemailer transporter using configuration from env.
 */
const createTransporter = () => {
  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });
};

/**
 * Sends a password reset email containing a 6-digit OTP.
 */
export const sendPasswordResetEmail = async (
  email: string,
  otp: string,
  name: string,
): Promise<{ success: boolean; simulated?: boolean }> => {
  const transporter = createTransporter();

  // If no SMTP configured, print OTP to console for seamless dev/testing
  if (!transporter) {
    console.log("=================================================");
    console.log(`[EMAIL SERVICE] 📧 PASSWORD RESET OTP FOR ${email}`);
    console.log(`[EMAIL SERVICE] 🔑 OTP CODE: ${otp}`);
    console.log(`[EMAIL SERVICE] ⏳ EXPIRES IN: 15 minutes`);
    console.log("=================================================");
    return { success: true, simulated: true };
  }

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
        .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 30px 20px; text-align: center; color: white; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
        .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
        .content { padding: 30px 24px; }
        .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
        .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .otp-box { text-align: center; margin: 24px 0; background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 12px; padding: 18px; }
        .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; font-family: monospace; }
        .otp-note { font-size: 12px; color: #64748b; margin-top: 6px; }
        .warning { font-size: 12px; color: #ef4444; background: #fef2f2; border-left: 3px solid #ef4444; padding: 10px 12px; border-radius: 6px; margin-top: 20px; line-height: 1.5; }
        .footer { padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #f8fafc; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>CathomeStay</h1>
          <p>Hệ thống Đặt phòng & Quản lý Homestay</p>
        </div>
        <div class="content">
          <div class="greeting">Xin chào ${name || "bạn"},</div>
          <div class="message">
            Chúng tôi nhận được yêu cầu lấy lại mật khẩu cho tài khoản <strong>${email}</strong> của bạn trên hệ thống CathomeStay.
            <br>Vui lòng sử dụng mã xác thực dưới đây để tiếp tục:
          </div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="otp-note">Mã xác thực có hiệu lực trong vòng 15 phút</div>
          </div>
          <div class="warning">
            ⚠️ <strong>Lưu ý bảo mật:</strong> Tuyệt đối không cung cấp mã này cho người khác. Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email hoặc liên hệ với chúng tôi để bảo vệ tài khoản.
          </div>
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} HomeStay. Mọi thắc mắc vui lòng liên hệ hotline 1900 6868 hoặc gửi email về hotro@homestay.vn.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: email,
      subject: `[CathomeStay] Mã xác thực lấy lại mật khẩu: ${otp}`,
      html,
    });
    return { success: true };
  } catch (err) {
    console.error("[EMAIL SERVICE] Error sending email via SMTP:", err);
    // Print OTP to console as fallback so users can continue during dev/testing
    console.log(`[EMAIL SERVICE FALLBACK] 🔑 OTP for ${email}: ${otp}`);
    return { success: true, simulated: true };
  }
};
