import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

/** So sánh CRON_SECRET an toàn theo thời gian (chống timing side-channel). */
export function isValidCronSecret(provided: string): boolean {
  const expected = env.cronSecret;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
