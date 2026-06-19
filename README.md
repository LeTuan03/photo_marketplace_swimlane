# Picseo — Hệ thống mua bán & trao đổi ảnh online

Triển khai thực tế từ sơ đồ luồng `photo_marketplace_swimlane.html`. Một marketplace ảnh bản
quyền với kiểm duyệt, thanh toán qua **VNPay**, **escrow** giữ tiền, cấp **license + certificate**,
và link tải có thời hạn.

> **Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · TailwindCSS ·
> Auth tự quản (JWT/jose) · Sharp (watermark) · S3/MinIO hoặc lưu cục bộ · Nodemailer · VNPay.

---

## 1. Phạm vi đã triển khai (MVP luồng lõi)

Bám theo 6 lane trong sơ đồ:

| Lane | Đã có trong MVP |
|------|-----------------|
| **Admin** | Cấu hình danh mục (seed), hoa hồng theo tier, **duyệt/từ chối ảnh** (AD6), xử lý **tranh chấp/DMCA** (AD7/AD8), **quản lý người dùng + KYC + tier + khóa** (AD9), **báo cáo/BI** (AD10), duyệt payout |
| **Người bán** | Đăng ký bán (S1), **upload + watermark + metadata** (S2–S4), trạng thái duyệt (S5/S5b), **sửa/ẩn/xóa** (S6/S7), **xem thu nhập + escrow + rút tiền** (S8/S9) |
| **Người mua** | Đăng ký/đăng nhập (B1), **tìm kiếm + lọc** (B2), **chi tiết + preview watermark** (B3), **chọn license & size** (B4), **giỏ hàng + coupon** (B5), **tải file gốc** (B6), **thư viện + certificate + tải lại ≤3 lần** (B11), **báo cáo sự cố/DMCA** (B9/B10) |
| **Thanh toán & Escrow** | Tính tiền (TT1), **cổng VNPay** (TT2) + cổng giả lập, **escrow giữ 7 ngày** (TT3), **giải ngân** qua cron (TT4), **hoàn tiền** khi có khiếu nại (TT5), **rút tiền** (TT6) |
| **Thông báo** | Trung tâm thông báo + email cho: duyệt/từ chối ảnh (N1/N2), có người mua (N3), mua thành công (N4), swap (N5/N6/N7), hoàn tiền (N9), giải ngân (N10), quota gần hết (N11), alert admin (N12) |
| **Trao đổi (Swap)** | **Đầy đủ SW1–SW7**: gửi đề nghị (SW1), nhận + xem (SW2), chấp nhận/từ chối 48h (SW3/SW3b), khóa 2 ảnh (SW3), ký xác nhận cuối 2 bên (SW4), hoàn tất + cấp quyền chéo + certificate (SW5), huỷ giữa chừng mở khóa (SW6), gợi ý bù tiền khi lệch giá >30% (SW7) |
| **Subscription & quota** | **Đầy đủ**: gói Free/Pro (10 ảnh/tháng)/Unlimited (AD3), đăng ký + thanh toán (B7), tải bằng quota (“Còn quota?” → tải miễn phí), reset theo kỳ, cảnh báo quota gần hết (N11), hết hạn → hạ Free (TT7) |

---

## 2. Yêu cầu

- **Node.js ≥ 18** (khuyến nghị 20+)
- **PostgreSQL 14+** — chạy nhanh bằng Docker (đã kèm `docker-compose.yml`)
- *(tùy chọn)* MinIO hoặc S3 nếu muốn lưu file trên object storage

---

## 3. Cài đặt & chạy nhanh

```bash
# 1. Cài dependencies
npm install

# 2. Tạo file cấu hình
cp .env.example .env        # Windows: copy .env.example .env

# 3. Khởi động PostgreSQL (và MinIO) bằng Docker
docker compose up -d

# 4. Tạo bảng trong DB (gồm cả Swap & Subscription)
npx prisma migrate dev --name init
# Nếu đã migrate trước đó và vừa cập nhật schema (swap/subscription):
#   npx prisma migrate dev --name swap_subscription

# 5. Nạp dữ liệu mẫu (tài khoản demo + ảnh + coupon)
npm run db:seed

# 6. Chạy ứng dụng
npm run dev
# → http://localhost:3000
```

### Tài khoản demo (mật khẩu: `password123`)

| Vai trò | Email |
|--------|-------|
| Admin | `admin@picseo.local` |
| Người bán (Pro) | `seller@picseo.local` |
| Người mua | `buyer@picseo.local` |

---

## 4. Cấu hình môi trường (`.env`)

| Nhóm | Biến | Ghi chú |
|------|------|---------|
| App | `APP_URL`, `AUTH_SECRET`, `DOWNLOAD_SECRET`, `CRON_SECRET` | **Đổi các secret** khi lên production |
| DB | `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| Storage | `STORAGE_DRIVER=local\|s3` | `local` lưu `./storage`; `s3` dùng MinIO/S3 |
| | `S3_*` | Endpoint/bucket/key khi `STORAGE_DRIVER=s3` |
| Email | `SMTP_*` | Để trống → email in ra console (dev) |
| VNPay | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Lấy ở sandbox VNPay; để trống → dùng **cổng giả lập** |
| Nghiệp vụ | `ESCROW_HOLD_DAYS`, `DOWNLOAD_LINK_HOURS`, `MAX_DOWNLOADS`, `MIN_PAYOUT_VND` | Quy tắc theo sơ đồ |

### Dùng MinIO (S3) thay vì lưu cục bộ
`docker compose up -d` đã chạy MinIO ở `:9000` (console `:9001`, user/pass `minioadmin`) và tự tạo
bucket `picseo`. Trong `.env` đặt:
```
STORAGE_DRIVER="s3"
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
```

---

## 5. Thanh toán VNPay

1. Đăng ký merchant **sandbox** tại https://sandbox.vnpayment.vn → lấy `TmnCode` và `HashSecret`.
2. Điền vào `.env` (`VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`).
3. Cấu hình **Return URL** = `http://localhost:3000/api/payment/vnpay/callback` và
   **IPN URL** = `http://localhost:3000/api/payment/vnpay/ipn` (cần public URL như ngrok để VNPay
   gọi IPN tới máy local).

> Khi **chưa** cấu hình VNPay, hệ thống tự chuyển sang **cổng thanh toán giả lập** (`/payment/mock`)
> để bạn chạy thử toàn bộ luồng escrow mà không cần khóa thật.

Cơ chế ký theo chuẩn VNPay 2.1.0 (sort param → encode → HMAC-SHA512) trong [src/lib/vnpay.ts](src/lib/vnpay.ts).
IPN là nguồn xác nhận đáng tin cậy; callback dùng để hiển thị kết quả cho người dùng. Hàm
`fulfillPaidOrder` **idempotent** nên gọi từ cả hai đều an toàn.

---

## 6. Tác vụ định kỳ (cron)

Hai endpoint cron (bảo vệ bằng `CRON_SECRET`):

```bash
# Chỉ giải ngân escrow đến hạn (TT4)
curl "http://localhost:3000/api/cron/escrow-release?secret=<CRON_SECRET>"

# Bảo trì tổng hợp: giải ngân escrow + hết hạn swap 48h (SW3b) + hết hạn subscription -> hạ Free (TT7)
curl "http://localhost:3000/api/cron/maintenance?secret=<CRON_SECRET>"
```

Trên production: dùng cron hệ điều hành, Vercel Cron, hoặc scheduler gọi `/api/cron/maintenance`
(kèm header `x-cron-secret`) mỗi giờ. Swap hết hạn cũng được dọn “lười” mỗi khi mở trang `/swap`.

---

## 7. Lộ trình pha tiếp theo

Các phần trong sơ đồ chưa làm (đã chuẩn bị schema/enum để mở rộng):

- **Auto-charge định kỳ cho subscription**: hiện chưa trừ tiền tự động — hết kỳ sẽ hạ về Free (mô phỏng TT7).
  Cần tích hợp token thẻ / recurring của cổng thanh toán.
- **AI tagging / AI search** thực thụ (hiện dùng tag thủ công + tìm kiếm full-text).
- **Bù tiền mặt khi swap lệch giá (SW7)**: hiện chỉ *gợi ý* mức bù; chưa thu tiền top-up qua escrow.
- **KYC tự động**, **counter-claim DMCA 7 ngày**, **wishlist + alert giá** (B12), **bồi thường credit khi huỷ swap (SW6)**.

---

## 8. Cấu trúc dự án

```
src/
├─ app/
│  ├─ (auth)/            # đăng nhập, đăng ký, actions phiên
│  ├─ admin/             # duyệt ảnh, người dùng, tranh chấp, payout, BI
│  ├─ seller/            # upload, kho ảnh, thu nhập, rút tiền
│  ├─ photos/[id]/       # chi tiết ảnh + mua/báo cáo
│  ├─ cart, checkout/    # giỏ hàng, thanh toán
│  ├─ payment/           # kết quả + cổng giả lập
│  ├─ library/           # thư viện người mua + tải file
│  ├─ notifications/
│  └─ api/               # asset, download, vnpay callback/ipn, cron
├─ components/           # Navbar, UI kit, PhotoCard
├─ lib/                  # prisma, auth, storage, image, vnpay, email, commerce...
└─ middleware.ts         # bảo vệ route theo vai trò
prisma/
├─ schema.prisma         # mô hình dữ liệu đầy đủ
└─ seed.ts               # dữ liệu mẫu
```

## 9. Lệnh hữu ích

```bash
npm run dev            # chạy dev
npm run build          # build production (tự prisma generate)
npm run typecheck      # kiểm tra type
npm run db:seed        # nạp dữ liệu mẫu
npm run db:reset       # reset DB + seed lại
npx prisma studio      # xem/sửa dữ liệu trực quan
```

---

## 10. Ghi chú bảo mật/production

- Đổi tất cả `*_SECRET` sang chuỗi ngẫu nhiên đủ dài.
- File **gốc** không bao giờ phát công khai — chỉ qua link tải JWT 24h + giới hạn số lần tải.
- Preview luôn có watermark, phục vụ qua `/api/asset` (chặn truy cập `originals/`).
- Tiền lưu bằng số nguyên VND để tránh sai số dấu phẩy động.
- Đặt sau reverse proxy HTTPS; bật `secure cookie` tự động khi `NODE_ENV=production`.
