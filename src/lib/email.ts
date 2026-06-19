import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.smtp.host) return null; // dev mode: in ra console
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    // Không cấu hình SMTP -> log để dev quan sát luồng thông báo.
    console.log(
      `\n[EMAIL:dev] To: ${opts.to}\n  Subject: ${opts.subject}\n  ${opts.text ?? opts.html.replace(/<[^>]+>/g, " ").trim().slice(0, 200)}\n`,
    );
    return false;
  }
  try {
    await t.sendMail({
      from: env.smtp.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return true;
  } catch (e) {
    console.error("[EMAIL] gửi thất bại:", e);
    return false;
  }
}

/** Khung email cơ bản (HTML). */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f5f7;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee">
      <div style="background:#1e1b4b;color:#fff;padding:16px 20px;font-size:18px;font-weight:600">Picseo</div>
      <div style="padding:20px;color:#1a1a2e">
        <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:14px 20px;color:#888;font-size:12px;border-top:1px solid #eee">
        Email tự động từ hệ thống Picseo. Vui lòng không trả lời email này.
      </div>
    </div>
  </body></html>`;
}
