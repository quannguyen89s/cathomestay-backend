import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  avatar?: string;
  phone?: string;
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Vui lòng nhập tên"],
      trim: true,
      maxlength: [100, "Tên không được quá 100 ký tự"],
    },
    email: {
      type: String,
      required: [true, "Vui lòng nhập email"],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Email không hợp lệ"],
    },
    password: {
      type: String,
      required: [true, "Vui lòng nhập mật khẩu"],
      minlength: [6, "Mật khẩu phải có ít nhất 6 ký tự"],
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    avatar: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre<IUser>("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
