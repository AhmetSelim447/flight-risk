import rateLimit from "express-rate-limit";

export const apiRateLimit = rateLimit({
  windowMs: 60_000, // 1 dk
  max: 120,         // IP başına 120 req/dk (ayarla)
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Rate limit. Too many requests." },
});
