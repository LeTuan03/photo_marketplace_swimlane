import "server-only";
import { prisma } from "./prisma";
import { extractTxnRef } from "./bankqr";
import { confirmGatewayPayment } from "./payment-confirm";
import type { BankTxnStatus } from "@prisma/client";

/**
 * Tiếp nhận BIẾN ĐỘNG SỐ DƯ (tiền VÀO) từ nguồn auto-detect rồi tự khớp đơn/gói.
 *
 * Provider-agnostic: chuẩn hoá payload của nhiều nguồn về một dạng chung trước khi xử lý,
 * nên cùng một endpoint dùng được cho:
 *  - SePay  : { id, transferType, transferAmount, content, referenceCode, accountNumber, gateway, transactionDate }
 *  - Casso  : { id, tid, amount (âm = tiền ra), description, when, subAccId/bank_sub_acc_id }
 *  - SMS tự host: tự định nghĩa { id, amount, content, account } (đặt theo các khoá dưới)
 *
 * Chống xử lý TRÙNG ở tầng giao dịch: "giành" refCode bằng BankTransaction.refCode UNIQUE
 * (create-rồi-bắt P2002) TRƯỚC khi gọi confirmGatewayPayment -> webhook retry / chạy song
 * song chỉ fulfill đúng một lần, đồng thời lưu vết mọi khoản tiền vào để admin đối soát.
 */

export type NormalizedBankTxn = {
  gateway: string;
  refCode: string;
  amountVnd: number;
  content: string;
  accountNumber?: string;
  transactionAt?: Date;
  transferType: "in" | "out";
};

function parseDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Chuẩn hoá payload thô từ nhiều nguồn về NormalizedBankTxn. null nếu thiếu khoá tối thiểu. */
export function normalizeBankPayload(body: Record<string, unknown>): NormalizedBankTxn | null {
  const s = (k: string): string | undefined => (body[k] == null ? undefined : String(body[k]));

  // refCode (khoá chống trùng): referenceCode (SePay) -> tid (Casso) -> id.
  const refCode = s("referenceCode") ?? s("tid") ?? s("id");
  if (!refCode) return null;

  // Số tiền + loại giao dịch: SePay dùng transferAmount + transferType; Casso dùng amount (âm = ra).
  let amount: number | undefined;
  let transferType: "in" | "out" = "in";
  if (body.transferAmount != null) {
    amount = Number(body.transferAmount);
    transferType = String(body.transferType ?? "in").toLowerCase() === "out" ? "out" : "in";
  } else if (body.amount != null) {
    const raw = Number(body.amount);
    transferType = raw < 0 ? "out" : "in";
    amount = Math.abs(raw);
  }
  if (amount == null || !Number.isFinite(amount)) return null;

  const content = s("content") ?? s("description") ?? "";
  const gateway = s("gateway") ?? (body.tid != null ? "Casso" : "SePay");
  const accountNumber = s("accountNumber") ?? s("subAccId") ?? s("bank_sub_acc_id") ?? s("account");
  const transactionAt = parseDate(s("transactionDate") ?? s("when"));

  return {
    gateway,
    refCode,
    amountVnd: Math.round(amount),
    content,
    accountNumber,
    transactionAt,
    transferType,
  };
}

export type IngestResult = "matched" | "mismatch" | "unmatched" | "duplicate" | "ignored_out";

/**
 * Ghi sổ + tự khớp một giao dịch đã chuẩn hoá.
 * - Tiền RA -> bỏ qua (chỉ quan tâm tiền vào).
 * - Giành refCode (UNIQUE) -> trùng thì trả "duplicate", không xử lý lại.
 * - Trích mã PIC từ nội dung -> confirmGatewayPayment (idempotent) -> cập nhật trạng thái sổ.
 */
export async function ingestBankTransaction(
  norm: NormalizedBankTxn,
  rawJson?: string,
): Promise<IngestResult> {
  if (norm.transferType !== "in") return "ignored_out";

  const txnRef = extractTxnRef(norm.content);

  // GIÀNH refCode nguyên tử: chỉ luồng tạo được dòng mới đi tiếp xử lý khớp/fulfill.
  let txnRowId: string;
  try {
    const row = await prisma.bankTransaction.create({
      data: {
        gateway: norm.gateway,
        refCode: norm.refCode,
        amountVnd: norm.amountVnd,
        content: norm.content,
        txnRef: txnRef ?? null,
        accountNumber: norm.accountNumber ?? null,
        transactionAt: norm.transactionAt ?? null,
        status: "UNMATCHED",
        rawJson: rawJson ?? null,
      },
      select: { id: true },
    });
    txnRowId = row.id;
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") return "duplicate";
    throw e;
  }

  // Không trích được mã -> để UNMATCHED cho admin đối chiếu thủ công.
  if (!txnRef) return "unmatched";

  const res = await confirmGatewayPayment({
    txnRef,
    paidVnd: norm.amountVnd,
    success: true, // tiền ĐÃ vào tài khoản
    provider: `BANKQR/${norm.gateway}`,
    txnId: norm.refCode,
  });

  let status: BankTxnStatus = "UNMATCHED";
  let matchedKind: string | null = null;
  let matchedId: string | null = null;

  if (res.kind !== "none") {
    matchedKind = res.kind; // "order" | "sub"
    if (res.outcome === "fulfilled" || res.outcome === "already") status = "MATCHED";
    else if (res.outcome === "mismatch") status = "MISMATCH";
    // Lấy id đơn/gói để hiển thị/đối soát.
    if (res.kind === "order") {
      const o = await prisma.order.findUnique({ where: { providerTxnRef: txnRef }, select: { id: true } });
      matchedId = o?.id ?? null;
    } else {
      const sub = await prisma.subscription.findUnique({ where: { providerTxnRef: txnRef }, select: { id: true } });
      matchedId = sub?.id ?? null;
    }
  }

  await prisma.bankTransaction.update({
    where: { id: txnRowId },
    data: { status, matchedKind, matchedId },
  });

  if (status === "MATCHED") return "matched";
  if (status === "MISMATCH") return "mismatch";
  return "unmatched";
}
