import { Router } from "express";

import {
  signup,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
} from "../controllers/authController";

import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/signup", signup);

router.post("/login", login);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.get("/profile", authMiddleware, getProfile);

router.patch("/profile", authMiddleware, updateProfile);

export default router;
