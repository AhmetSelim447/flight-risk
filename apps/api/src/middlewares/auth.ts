import { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Authorization header missing or invalid",
      });
    }

    const token = header.replace("Bearer ", "").trim();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        ok: false,
        error: "invalid_token",
        message: "Invalid or expired access token",
      });
    }

    (req as any).user = {
      id: user.id,
      email: user.email,
    };

    return next();
  } catch {
    return res.status(401).json({
      ok: false,
      error: "auth_failed",
      message: "Authentication failed",
    });
  }
}