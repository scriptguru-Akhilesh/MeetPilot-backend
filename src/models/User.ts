import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: "user" | "admin";
  resetToken?: string;
  resetTokenExpires?: Date;
  createdAt: Date;
  updatedAt: Date;

  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleCalendarConnected?: boolean;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    resetToken: String,
    resetTokenExpires: Date,

    googleAccessToken: { type: String, select: false },
    googleRefreshToken: { type: String, select: false },
    googleCalendarConnected: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model<IUser>("User", UserSchema);