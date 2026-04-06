import type { Request, Response, NextFunction } from "express";

export function requestTimeout(ms = 15_000) {
  return function (req: Request, res: Response, next: NextFunction) {
    const t = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ ok: false, error: "Request timeout" });
      }
    }, ms);

    res.on("finish", () => clearTimeout(t));
    res.on("close", () => clearTimeout(t));
    next();
  };
}
