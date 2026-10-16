# Minh chứng giai đoạn 4 — Loki, Promtail và LogQL

Đề tài **Hệ thống quản lý sinh viên**, Trần Đức Công — DTC245200418 — CNTT K23I. Ngày kiểm tra: 16/10/2026, múi giờ Asia/Saigon. Thư mục này chỉ chứa dữ liệu vận hành và ảnh Grafana; không lưu thông tin đăng nhập, cookie hoặc nội dung `.env`.

Đã hoàn thành kiểm tra thực tế và mở xem đủ năm ảnh Grafana. Kết quả API xác nhận 9 nhóm log, 7 truy vấn LogQL, log thật của cả bốn service, HTTP 404 an toàn và health HTTP 200, Loki readiness HTTP 200, datasource Loki `OK`; Prometheus vẫn có 6 targets UP. Thư mục `monitoring/` xác nhận 17 panel/21 truy vấn và CPU/RAM của đủ 12 service.

| File | Nội dung cần đối chiếu |
| --- | --- |
| `compose-ps.txt` | Trạng thái 12 service đang chạy; các URL vẫn `8082`, `5056`, `9091`, `3001`, Loki/Promtail không publish cổng |
| `runtime-checks.txt` | Named volume, cổng và filesystem Loki/Promtail; Docker socket `RW=false`; cấu hình hợp lệ; 404 an toàn với đủ bốn security headers và health 200 |
| `loki-datasource.png` | Grafana datasource Loki được provision, URL nội bộ và kết nối thành công |
| `explore-all.png` | Grafana Explore, datasource Loki, `{project="student-management"}` trả log thật |
| `explore-health.png` | Grafana Explore, `{project="student-management", service="nginx"} \|= "GET /health"` hiển thị request health HTTP 200 |
| `explore-errors.png` | Grafana Explore, truy vấn regexp HTTP 4xx/5xx hiển thị request 404 an toàn |
| `explore-count.png` | Grafana Explore, `sum(count_over_time({project="student-management"}[5m]))` hiển thị dữ liệu số |
| `grafana-health.json` | Grafana `/api/health`, database `ok` |
| `loki-ready.json` | HTTP `/ready` của Loki qua Grafana datasource proxy, HTTP 200 và body `ready` |
| `loki-datasource-health.json` | Kết quả Grafana kiểm tra datasource UID `loki` |
| `logql-results.json` | Kết quả bảy truy vấn LogQL, gồm log Nginx, Express, MySQL, phpMyAdmin |
| `prometheus-targets.json` | Prometheus giữ 6 targets UP |
| `summary.json` | Tổng hợp kiểm thử log và thời điểm kiểm tra |
| `monitoring/` | Kết quả tái kiểm tra Prometheus, datasource/dashboard và CPU/RAM cho các container hiện tại; giữ nguyên lịch sử phase3 |

## Tái tạo minh chứng

Chạy tại thư mục gốc, Docker Desktop dùng Linux containers. Compose phải dùng script để không tự đọc `.env`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps |
  Set-Content -Encoding UTF8 .\docs\evidence\phase4\compose-ps.txt
$env:MONITORING_EVIDENCE_DIR = 'docs/evidence/phase4/monitoring'
npm run test:monitoring
Remove-Item Env:\MONITORING_EVIDENCE_DIR
npm run test:logs
npm run capture:logs
```

`test:logs` dùng bí mật Grafana runtime trong bộ nhớ để kiểm tra datasource và gọi Loki qua proxy Grafana. Loki không có cổng host; không dùng `localhost:3100`. Test chỉ tạo các GET an toàn, gồm `http://localhost:8082/__loki_probe_404` trả 404; không dừng database hay tạo lỗi 5xx. `capture:logs` tự tìm Chrome/Edge; nếu cần đặt `CHROME_PATH` tới trình duyệt Chromium trên máy. Không đưa mật khẩu/token vào tham số lệnh hoặc biến môi trường cho thao tác chụp.

Đợi Promtail discovery và gửi log khoảng 5–15 giây sau khi tạo traffic. Chọn khoảng thời gian bao phủ lúc MySQL khởi động để xem startup/error log; MySQL không bật general query log. Tất cả thời điểm trong JSON lấy từ API; nhãn thời gian trên ảnh có thể hiển thị theo múi giờ trình duyệt.

## Các truy vấn được chứng minh

```logql
{project="student-management"}

{project="student-management", service="nginx"} |= "GET /health"

sum(count_over_time({project="student-management"}[5m]))

{project="student-management", service="nginx"} |~ "\" [45][0-9]{2} "
```

Các truy vấn bổ sung tách `service="app"`, `service="db"`, `service="phpmyadmin"`. `db` là tên service MySQL hiện tại. `project="student-management"` là nhãn log logic; Compose vẫn dùng project `qlsv-trancong` để giữ volume và container hiện có. Promtail lọc chính xác project tại Docker discovery và relabel, sau đó whitelist bốn service. Số đếm trong cửa sổ 5 phút đếm dòng log từ các stream; có thể tăng vì cả Nginx và Express cùng ghi một request.

## Giới hạn của minh chứng

- Retention cấu hình `168h`, compactor bật xóa bất đồng bộ, chu kỳ 10 phút và delay 2 giờ. Kiểm tra trong ngày triển khai chưa chứng minh việc xóa sau 7 ngày thực tế.
- Loki lưu filesystem một node bằng named volume, chưa có HA hoặc backup tự động.
- Loki distroless không có công cụ HTTP chạy Docker healthcheck; `/ready` được kiểm tra qua Grafana datasource proxy. Trạng thái Compose `Up` của Loki không thay thế kiểm tra readiness.
- Docker socket mount `:ro` không giới hạn HTTP verb của Docker API. Promtail chạy root là ngoại lệ hardening; filesystem chỉ đọc, bỏ capability, `no-new-privileges`, không publish cổng.
- [Promtail EOL ngày 02/03/2026](https://grafana.com/docs/loki/latest/send-data/promtail/); giữ theo yêu cầu đề tài, cần chuyển Alloy trước production.
