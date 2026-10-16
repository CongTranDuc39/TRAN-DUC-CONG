# Báo cáo triển khai và kiểm tra giai đoạn 1

Ngày: 16/10/2026. Đề tài: **Hệ thống quản lý sinh viên** — Trần Đức Công, DTC245200418, CNTT K23I. Giảng viên: Lê Khánh Dương, Đại học Công nghệ Thông tin và Truyền thông.

## Các file đã tạo

| Nhóm | File |
| --- | --- |
| Docker và cấu hình | `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example` |
| Database | `database/init.sql` |
| Node.js | `package.json`, `package-lock.json`, `app.js` |
| Backend | `src/app.js`, `src/db.js`, `src/repository.js`, `src/validation.js` |
| EJS | `views/dashboard.ejs`, `views/error.ejs`, `views/partials/header.ejs`, `views/partials/footer.ejs` |
| CRUD EJS | `views/classes/index.ejs`, `views/classes/form.ejs`, `views/students/index.ejs`, `views/students/form.ejs`, `views/subjects/index.ejs`, `views/subjects/form.ejs`, `views/scores/index.ejs`, `views/scores/form.ejs` |
| Giao diện | `public/css/style.css`, `public/js/app.js` |
| Chạy local | `scripts/local-stack.ps1` |
| Kiểm thử | `scripts/check-syntax.js`, `scripts/integration-test.js`, `tests/validation.test.js` |
| Tài liệu | `README.md`, `KIEM_TRA.md` |

## Lệnh đã chạy và kết quả

Để không đọc hoặc sửa `.env`, các lệnh Compose được thực thi qua `scripts/local-stack.ps1`, dùng `--env-file .local/empty.env` và project `qlsv-trancong`. Mật khẩu được truyền bằng biến môi trường của tiến trình, không in ra terminal.

| Kiểm tra | Lệnh hoặc thao tác | Kết quả |
| --- | --- | --- |
| Cài dependencies và lockfile | `npm install --no-audit --no-fund --offline=false` | Đạt, 86 packages; Docker build cũng chạy `npm ci --omit=dev` thành công |
| Compose config | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate` → `docker compose config --quiet` | Đạt, exit 0 |
| Cú pháp JavaScript | `npm run check` | Đạt, 9 file JavaScript |
| Kiểm thử đơn vị | `npm test` | Đạt, 10/10 nhóm test |
| Build và khởi chạy | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up` → `docker compose up -d --build` | Đạt |
| Trạng thái container | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps` → `docker compose ps` | `app`: healthy; `db`: healthy; `phpmyadmin`: Up |
| Kiểm thử tích hợp | `npm run test:integration` | Đạt, 9 nhóm kiểm tra; dữ liệu kiểm thử đã được xóa |
| Website | `GET http://localhost:8082/` | HTTP 200 |
| Kết nối MySQL | `GET http://localhost:8082/health` | HTTP 200, `{"status":"ok","database":"connected"}` |
| phpMyAdmin | `GET http://localhost:5056/` | HTTP 200 |
| Đăng nhập phpMyAdmin | Đăng nhập HTTP bằng tài khoản ứng dụng `qlsv_app` | HTTP 200, xác nhận giao diện đã đăng nhập |
| Mất kết nối MySQL | Tạm dừng riêng `qlsv-trancong-db-1`, gọi `/health`, khởi động lại trong `finally` | Khi ngắt: HTTP 503; sau khôi phục: HTTP 200; cả db và app trở lại healthy |
| EJS | Render toàn bộ template với dữ liệu theo contract | Đạt, 12 template |
| Bố cục trình duyệt | Chrome headless: dashboard 1440px; danh sách sinh viên và form điểm 390px | Đạt; CSS được tải, không tràn ngang toàn trang; bảng cuộn trong vùng riêng |

Kiểm thử tích hợp bao gồm CRUD cả 4 nhóm, gán/bỏ gán lớp, tìm kiếm và lọc có loại trừ dữ liệu không khớp, điểm tổng kết 10/30/60, trung bình theo tín chỉ, trùng dữ liệu HTTP 409, bảo vệ khóa ngoại HTTP 409, điểm ngoài miền HTTP 422, CSRF HTTP 403, escape HTML, truy vấn tìm kiếm chứa ký tự SQL và trang không tồn tại HTTP 404. Các trường hợp làm tròn sát mốc được kiểm thử để JavaScript khớp MySQL DECIMAL.

## Trạng thái bàn giao

- Website: <http://localhost:8082>.
- phpMyAdmin: <http://localhost:5056>.
- Dữ liệu demo còn nguyên: 8 sinh viên, 3 lớp, 4 môn học, 12 bản ghi điểm.
- MySQL không publish cổng ra máy chủ; hai giao diện chỉ bind `127.0.0.1`.
- `.env` không được tạo, đọc, sửa hoặc in trong quá trình triển khai.
- Mật khẩu demo được mã hóa bằng Windows DPAPI trong `.local/credentials.xml`; `.local/`, `.env` và `node_modules/` đã được xác nhận nằm trong danh sách Git ignore. Không có mật khẩu thật trong mã nguồn hoặc `.env.example`.
- Để đăng nhập phpMyAdmin, chạy `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Login`, dùng user `qlsv_app` và dán mật khẩu đã được script sao chép vào clipboard. Không chia sẻ file bí mật hoặc clipboard.
- Giữ `.local/credentials.xml` để các lần chạy tiếp dùng đúng mật khẩu của volume hiện tại.
- Không triển khai Nginx, Prometheus, Grafana, Loki hoặc Promtail trong dự án này. Các container dự án khác trên máy được giữ nguyên.
- Không commit hoặc push GitHub.

Ảnh QA cục bộ trong `test-results/` được loại khỏi Git; hướng dẫn vận hành đầy đủ trong `README.md`.
