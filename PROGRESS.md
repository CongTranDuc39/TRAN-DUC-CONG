# Tiến độ — Hệ thống quản lý sinh viên

Sinh viên Trần Đức Công — DTC245200418 — CNTT K23I. Giảng viên Lê Khánh Dương, Đại học Công nghệ Thông tin và Truyền thông. Cập nhật ngày 16/10/2026.

| Giai đoạn | Phạm vi | Trạng thái |
| --- | --- | --- |
| 1 | Express/EJS, MySQL/mysql2, CRUD, dữ liệu demo, Compose, phpMyAdmin | Hoàn thành; commit `0fff1ba` |
| 2 | Nginx reverse proxy, security headers, log stdout/stderr, healthcheck | Hoàn thành; commit `78279da` |
| 3 | Prometheus, Grafana, cAdvisor, MySQL/Nginx exporter, metrics Express, dashboard | Hoàn thành triển khai/nghiệm thu; hash commit và kết quả push xem lịch sử Git/báo cáo bàn giao |
| Sau giai đoạn 3 | Loki, Promtail và các phần mở rộng theo yêu cầu tiếp theo | Chưa triển khai |

## Giai đoạn 3 đã triển khai

- Prometheus `localhost:9091`, Grafana `localhost:3001`; giữ website/Nginx `localhost:8082` và phpMyAdmin `localhost:5056`.
- Scrape 6 job: Prometheus, Express, cAdvisor, Docker metadata, MySQL exporter, Nginx exporter; đáp ứng đủ 5 targets bắt buộc.
- Metrics Express: số request, HTTP status, histogram độ trễ, số lỗi 4xx/5xx; label route không chứa dữ liệu sinh viên.
- Datasource Prometheus được provision tự động, dashboard **Student Management Monitoring** gồm 17 panel dữ liệu container/web/database/Nginx.
- Healthcheck Prometheus/Grafana, volume lưu metrics/Grafana, giữ dữ liệu MySQL hiện có.
- Mật khẩu giám sát sinh ngẫu nhiên và lưu DPAPI riêng; Docker secrets cho exporter/Grafana, không mật khẩu trong source.
- `mysql-exporter-init` chuẩn bị user giám sát trên volume hiện có, không chạy lại seed; `GrafanaLogin` mở đăng nhập bằng clipboard.
- Tương thích Docker Desktop/containerd namespace `moby`: ghép CPU/RAM thực tế từ cAdvisor với metadata giới hạn project `qlsv-trancong`, tránh lẫn container dự án khác. Helper metadata chỉ gọi Docker API GET cố định, socket/filesystem chỉ đọc, bỏ capability, bật `no-new-privileges`.

## Kết quả nghiệm thu

- [x] Compose config, build/up đạt; 10 service đang chạy và service init exit 0.
- [x] Cú pháp 17 file JavaScript; 16/16 unit test; 9 nhóm CRUD; 6 kiểm tra proxy; 9 nhóm monitoring đạt.
- [x] Prometheus có 6 targets UP; `up`, `mysql_up`, `nginx_up` bằng 1; CPU/RAM đủ 10 service của dự án.
- [x] Grafana health, datasource và 17 panel/21 truy vấn có dữ liệu thật, hợp lệ và mới.
- [x] Website, `/health`, phpMyAdmin HTTP 200; dữ liệu còn 8 sinh viên, 3 lớp, 4 môn, 12 điểm.
- [x] Lưu Compose ps, ảnh Prometheus Targets, dashboard container/web, database/Nginx và 6 file JSON.
- [x] Cập nhật kết quả thực tế trong `KIEM_TRA.md`.

Commit dự kiến: `feat: add prometheus and grafana monitoring`. Kết quả commit và push branch `master` lên `origin` được báo lúc bàn giao; không force push.

Quy trình chạy và đăng nhập nằm trong `README.md`. Kết quả kiểm tra, lịch sử giai đoạn 1/2 và danh sách minh chứng nằm trong `KIEM_TRA.md`. `.env` không được đọc, in, sửa hoặc commit.
