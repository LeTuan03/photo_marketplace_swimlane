import bcrypt from "bcryptjs";

const COST = 12;

/**
 * Hash giả để LÀM ĐỀU thời gian khi email không tồn tại / tài khoản chỉ-Google.
 * Luôn chạy một phép so sánh bcrypt để không lộ "email có tồn tại không" qua timing.
 */
export const DUMMY_HASH = bcrypt.hashSync("picseo-timing-equalizer", COST);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
