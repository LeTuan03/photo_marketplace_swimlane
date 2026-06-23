import { type NextRequest, NextResponse } from "next/server";
import { verifyWebhookAuth } from "@/lib/bankqr";
import { normalizeBankPayload, ingestBankTransaction } from "@/lib/bank-ingest";

/**
 * Webhook BIẾN ĐỘNG SỐ DƯ (server-to-server, POST JSON) — NGUỒN xác nhận thanh toán CHÍNH.
 * Khi có tiền VÀO tài khoản, nguồn auto-detect (SePay/Casso/SMS forwarder) gọi endpoint này;
 * hệ thống tự ghi sổ (chống trùng), khớp đơn/gói qua mã PIC trong nội dung + đúng số tiền
 * rồi fulfill ngay (realtime, không phí cổng, không qua cổng trung gian giữ tiền).
 * Trả {success:true} để nguồn ngừng retry ngay cả khi không khớp (đã lưu sổ để admin đối soát).
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookAuth({ authHeader: req.headers.get("authorization"), secureToken: req.headers.get("secure-token") })) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: "Bad request" }, { status: 400 });
  }

  const norm = normalizeBankPayload(body);
  if (!norm) return NextResponse.json({ success: true }); // payload thiếu khoá tối thiểu -> bỏ qua

  // Ghi sổ + tự khớp (idempotent qua refCode UNIQUE; lệch tiền sẽ cảnh báo admin in-app).
  let result: Awaited<ReturnType<typeof ingestBankTransaction>>;
  try {
    result = await ingestBankTransaction(norm, JSON.stringify(body));
  } catch (err) {
    console.error("bank webhook ingest error:", err);
    return NextResponse.json({ success: false, message: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, result });
}
