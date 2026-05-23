import { NextFunction, Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import jwt from "jsonwebtoken";
import User from "../models/User";

export interface AuthRequest<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  file?: Express.Multer.File;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : undefined;

  if (!token) {
    return res.status(401).json({ error: "Authorization token is required" });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET must be configured");
    }

    const payload = jwt.verify(token, secret) as {
      userId: string;
      email: string;
      name: string;
      role: string;
    };

    const user = await User.findById(payload.userId).lean();
    if (!user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized access" });
  }
}
