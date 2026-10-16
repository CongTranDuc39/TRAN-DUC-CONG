# Tiến độ — Hệ thống quản lý sinh viên

Sinh viên Trần Đức Công — DTC245200418 — CNTT K23I. Giảng viên Lê Khánh Dương, Đại học Công nghệ Thông tin và Truyền thông. Cập nhật ngày 16/10/2026.

| Giai đoạn | Phạm vi | Trạng thái |
| --- | --- | --- |
| 1 | Express/EJS, MySQL/mysql2, CRUD, dữ liệu demo, Compose, phpMyAdmin | Hoàn thành; commit `0fff1ba` |
| 2 | Nginx reverse proxy, security headers, log stdout/stderr, healthcheck | Hoàn thành; commit `78279da` |
| 3 | Prometheus, Grafana, cAdvisor, MySQL/Nginx exporter, metrics Express, dashboard | Hoàn thành; commit `dedd6cb` |
| 4 | Loki, Promtail, datasource Loki, LogQL và log HTTP an toàn | Hoàn thành; commit `7690551`, đã push `origin/master` |
| 5 | Hardening, kiểm thử tổng thể, minh chứng và báo cáo | Đã nghiệm thu 15/15 bước, 15 ảnh và kiểm tra sau capture; commit/push thực hiện sau staged audit |

## Giai đoạn 5

- [x] Giữ nguyên commit giai đoạn 1–4, tên project Compose và named volume; đọc trạng thái Git/container trước khi sửa.
- [x] User web/PID1 UID 1000, CapEff 0, NoNewPrivs 1; rootfs trả EROFS, tmpfs ghi được; 14 container đúng chính sách runtime.
- [x] MySQL ứng dụng chỉ CRUD trên bốn bảng; đọc `mysql.user`/tạo bảng tạm bị từ chối; không GRANT OPTION.
- [x] Compose validate/build/up/ps đạt; 24 file JavaScript, 19/19 unit test đạt; 12 service chạy và hai init exit 0.
- [x] 9 nhóm CRUD, 6 kiểm tra proxy/headers đạt; website, health, phpMyAdmin HTTP 200; bốn bảng giữ nguyên hash và số dòng.
- [x] 9 nhóm monitoring đạt, Prometheus 6/6 UP; 17 panel/21 truy vấn thật, CPU/RAM đủ 12 service.
- [x] 9 nhóm log đạt; Loki ready 200, datasource OK, 7 truy vấn và log thật bốn service; 404 an toàn; không có 5xx trong cửa sổ sau startup đã ghi.
- [x] Lưu minh chứng giai đoạn 5 riêng: 15 ảnh đã mở xem, transcript/API/baseline/headers/Git history; giữ nguyên phase3/phase4. Hardening sau capture vẫn đạt 7 nhóm.
- [x] Hoàn thiện `BAO_CAO.md` đủ 14 mục, README, tiến độ và kết quả; ghi rõ ngoại lệ/hạn chế, backup/restore chỉ là chính sách đề xuất.

Chi tiết nghiệm thu nằm ở đầu `KIEM_TRA.md` và `docs/evidence/phase5/README.md`. Git paths/ignore và `diff --check` đã đạt; staged secret audit là bước bảo vệ trước commit. Message bàn giao là `security: harden deployment and verify project requirements`; hash cuối, đối chiếu HEAD với `origin/master` và working tree được báo sau khi commit/push thực hiện. Ảnh GitHub trong evidence là snapshot trước commit giai đoạn 5; tài liệu này không dùng ảnh đó để khẳng định trạng thái push mới.

## Giai đoạn 4 đã triển khai

- Bổ sung `grafana/loki:3.7.8`, `grafana/promtail:3.5.8`; không publish cổng mới ra host. Giữ nguyên bốn URL và metrics giai đoạn 3.
- Loki TSDB v13/filesystem, named volume `loki_data`, WAL; retention 7 ngày (`168h`) qua compactor và filesystem delete-request store.
- Promtail Docker discovery lọc chính xác project Compose `qlsv-trancong`, relabel tiếp tục giữ đúng project và chỉ `app|nginx|db|phpmyadmin`; log gắn `project="student-management"`, `service`, `container`, `stream`.
- Giữ tên project Compose và các volume cũ để bảo toàn MySQL/Grafana/Prometheus; không đổi Compose project thành tên label logic `student-management`.
- Datasource Loki UID `loki` provision tự động tại `http://loki:3100`; truy vấn toàn bộ log, health, HTTP 4xx/5xx, `count_over_time` và từng service lưu trong `monitoring/logql/queries.json`.
- Express log JSON theo route chuẩn hóa; Nginx access log văn bản hỗ trợ các truy vấn yêu cầu. Không ghi request body, query hoặc header trong access log; MySQL chỉ thu error/startup log hiện có.
- Promtail lưu vị trí đọc vào named volume `promtail_positions`, socket chỉ đọc, root filesystem chỉ đọc, bỏ capability và `no-new-privileges`. Ngoại lệ chạy root/socket Docker cùng giới hạn API được ghi trong README.
- Thêm kiểm thử log, chụp minh chứng Grafana datasource/Explore và báo cáo riêng tại `docs/evidence/phase4/`.

## Nghiệm thu giai đoạn 4

- [x] Compose config, build/up/ps; 12 service đang chạy, named volume và bốn cổng host giữ nguyên; kiểm tra cú pháp 21 file JavaScript đạt.
- [x] Loki `/ready` HTTP 200; Grafana health OK và datasource Loki kết nối thành công.
- [x] LogQL trả log thật của app, Nginx, MySQL, phpMyAdmin; nhãn đúng project/service/container; 9 nhóm kiểm tra, 7 truy vấn đạt.
- [x] GET `http://localhost:8082/__loki_probe_404` an toàn xuất hiện trong truy vấn 4xx/5xx; không cố ý tạo lỗi 5xx.
- [x] Prometheus vẫn 6 targets UP; dashboard có dữ liệu thực tại 17 panel/21 truy vấn, CPU/RAM đủ 12 service; 9 nhóm kiểm tra monitoring đạt.
- [x] Website, `/health`, phpMyAdmin HTTP 200; 9 nhóm CRUD, 19/19 unit test và 6 kiểm tra proxy đạt; dữ liệu demo giữ 8 sinh viên, 3 lớp, 4 môn, 12 điểm.
- [x] Lưu Compose ps, kiểm tra runtime, năm ảnh Grafana đã mở xem và 12 JSON API gồm phần tái kiểm tra metrics; cập nhật `KIEM_TRA.md`.

Commit giai đoạn 4 dùng message `feat: add loki and promtail centralized logging`; đích push là `master` lên `origin`, không force push. Hash commit và kết quả push được báo riêng sau khi thực hiện; kiểm tra bằng `git log -1 --oneline` và `git status -sb`.

Giới hạn: Promtail đã EOL ngày 02/03/2026, giữ theo yêu cầu đề tài và cần chuyển Alloy trước production. Mount socket `:ro` không giới hạn các API ghi của Docker daemon. Loki filesystem một node không HA; retention xóa bất đồng bộ qua compactor và delay 2 giờ, chưa có quan sát đủ 7 ngày. Image Loki distroless không có công cụ chạy Docker healthcheck; readiness kiểm tra qua HTTP từ Grafana datasource proxy.

## Giai đoạn 3 đã triển khai

- Prometheus `localhost:9091`, Grafana `localhost:3001`; giữ website/Nginx `localhost:8082` và phpMyAdmin `localhost:5056`.
- Scrape 6 job: Prometheus, Express, cAdvisor, Docker metadata, MySQL exporter, Nginx exporter; đáp ứng đủ 5 targets bắt buộc.
- Metrics Express: số request, HTTP status, histogram độ trễ, số lỗi 4xx/5xx; label route không chứa dữ liệu sinh viên.
- Datasource Prometheus được provision tự động, dashboard **Student Management Monitoring** gồm 17 panel dữ liệu container/web/database/Nginx.
- Healthcheck Prometheus/Grafana, volume lưu metrics/Grafana, giữ dữ liệu MySQL hiện có.
- Mật khẩu giám sát sinh ngẫu nhiên và lưu DPAPI riêng; Docker secrets cho exporter/Grafana, không mật khẩu trong source.
- `mysql-exporter-init` chuẩn bị user giám sát trên volume hiện có, không chạy lại seed; `GrafanaLogin` mở đăng nhập bằng clipboard.
- Tương thích Docker Desktop/containerd namespace `moby`: ghép CPU/RAM thực tế từ cAdvisor với metadata giới hạn project `qlsv-trancong`, tránh lẫn container dự án khác. Helper metadata chỉ gọi Docker API GET cố định, socket/filesystem chỉ đọc, bỏ capability, bật `no-new-privileges`.

## Kết quả nghiệm thu giai đoạn 3

- [x] Compose config, build/up đạt; 10 service đang chạy và service init exit 0.
- [x] Cú pháp 17 file JavaScript; 16/16 unit test; 9 nhóm CRUD; 6 kiểm tra proxy; 9 nhóm monitoring đạt.
- [x] Prometheus có 6 targets UP; `up`, `mysql_up`, `nginx_up` bằng 1; CPU/RAM đủ 10 service của dự án.
- [x] Grafana health, datasource và 17 panel/21 truy vấn có dữ liệu thật, hợp lệ và mới.
- [x] Website, `/health`, phpMyAdmin HTTP 200; dữ liệu còn 8 sinh viên, 3 lớp, 4 môn, 12 điểm.
- [x] Lưu Compose ps, ảnh Prometheus Targets, dashboard container/web, database/Nginx và 6 file JSON.
- [x] Cập nhật kết quả thực tế trong `KIEM_TRA.md`.

Commit giai đoạn 3: `dedd6cb` — `feat: add prometheus and grafana monitoring`, đã push lên `origin/master` trước khi triển khai giai đoạn 4.

Quy trình chạy và đăng nhập nằm trong `README.md`. Kết quả kiểm tra, lịch sử giai đoạn 1/2 và danh sách minh chứng nằm trong `KIEM_TRA.md`. `.env` không được đọc, in, sửa hoặc commit.
