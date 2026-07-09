# Quản lý thiện pháp và sao kê Techcombank

Ứng dụng Next.js phân loại nội dung chuyển khoản từ file sao kê Techcombank theo danh sách thiện pháp và bộ từ khóa đã quản lý trước.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- PostgreSQL qua Prisma ORM
- Import Excel bằng `xlsx`
- Deploy phù hợp với Vercel

## Cấu trúc sao kê Techcombank đã hỗ trợ

File mẫu `/Users/jigmewangchuk/Downloads/Account statement.xlsx` có sheet `Account statement`.

Metadata nằm ở các dòng đầu:

- `Tu ngay`, `Toi ngay`
- `So tai khoan`
- `Ten tai khoan`
- `Loai tien`
- `So du dau ky`
- `So du cuoi ky`

Bảng giao dịch bắt đầu ở dòng header:

- `NGAY`
- `DIEN GIAI`
- `CHI TIET`
- `NO`
- `CO`
- `SO DU`

Ứng dụng dùng `CHI TIET` làm khóa unique để chống import trùng.

## Database đề xuất trên Vercel

Dùng PostgreSQL managed trên Vercel Marketplace. Các lựa chọn phù hợp:

- Neon: Postgres serverless phổ biến cho Next.js/Vercel.
- Prisma Postgres: phù hợp nếu muốn đi theo hệ sinh thái Prisma.
- Supabase: Postgres có dashboard và auth/storage nếu sau này cần mở rộng.

Sau khi provision database trên Vercel, lấy biến `DATABASE_URL` và cấu hình cho Production/Preview/Development.

## Schema chính

- `BankAccount`: thông tin tài khoản ngân hàng, số dư hiện tại theo kỳ import mới nhất.
- `ImportBatch`: mỗi lần import file sao kê, lưu số dòng mới/trùng/chưa phân loại.
- `Campaign`: thiện pháp, mã như `cntt10`, `kathina-pm`.
- `CampaignKeyword`: danh sách từ khóa của từng thiện pháp, đã chuẩn hóa không dấu để match linh hoạt.
- `BankTransaction`: giao dịch sao kê, unique theo `detail` tương ứng cột `CHI TIET`.
- `Expense`: khoản chi ra, có thể gắn vào thiện pháp hoặc chi chung.

## Chạy local

```bash
cp .env.example .env
```

Cập nhật `DATABASE_URL` trong `.env`, sau đó:

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

Mở `http://localhost:3000`.

## Deploy Vercel

1. Push project lên GitHub.
2. Import project vào Vercel.
3. Tạo PostgreSQL từ Vercel Marketplace hoặc kết nối resource có sẵn.
4. Đảm bảo `DATABASE_URL` được inject vào project.
5. Chạy migration và seed:

```bash
pnpm db:deploy
pnpm db:seed
```

## Luồng sử dụng

1. Tạo thiện pháp và nhập từ khóa liên quan.
2. Upload file sao kê Techcombank `.xlsx`.
3. Hệ thống parse các dòng giao dịch, bỏ qua `CHI TIET` đã tồn tại.
4. Giao dịch được phân loại theo keyword đang active.
5. Giao dịch chưa khớp có thể gán thủ công hoặc bổ sung keyword rồi bấm `Phân loại lại`.
6. Nhập khoản chi để theo dõi tồn quỹ từng thiện pháp và số dư ngân hàng hiện tại.
