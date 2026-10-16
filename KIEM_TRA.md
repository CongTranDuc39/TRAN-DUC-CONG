# Báo cáo triển khai và kiểm tra — Giai đoạn 3

Ngày: 16/10/2026. Đề tài: **Hệ thống quản lý sinh viên** — Trần Đức Công, MSSV DTC245200418, lớp CNTT K23I. Giảng viên: Lê Khánh Dương, Đại học Công nghệ Thông tin và Truyền thông.

## Phạm vi giai đoạn 3

Bổ sung Prometheus tại `http://localhost:9091`, Grafana tại `http://localhost:3001`, cAdvisor, MySQL exporter và Nginx exporter. Website giữ `http://localhost:8082` qua Nginx, phpMyAdmin giữ `http://localhost:5056`. Không publish Express, MySQL hoặc exporter ra host. Giữ nguyên volume MySQL, seed và CRUD. Chưa triển khai Loki hoặc Promtail.

Prometheus scrape 6 job: `prometheus`, `express`, `cadvisor`, `docker-metadata`, `mysql`, `nginx`, đáp ứng đủ 5 targets bắt buộc. Grafana tự provision datasource UID `prometheus` và dashboard **Student Management Monitoring**, UID `student-management`, thư mục **QLSV**, 17 panel dữ liệu trong hai nhóm Container & Web, Database & Nginx.

Không đọc, in, sửa hoặc commit `.env`. Các lệnh Compose đi qua `scripts/local-stack.ps1` với file rỗng riêng `.local/empty.env`. Mật khẩu DB/root hiện có được giữ nguyên trong DPAPI; mật khẩu monitoring được lưu riêng, đưa vào container bằng Docker secrets. Không ghi mật khẩu vào source, provisioning, minh chứng hoặc báo cáo.

| File/nhóm file | Thay đổi giai đoạn 3 |
| --- | --- |
| `docker-compose.yml` | Thêm Prometheus/Grafana, cAdvisor, exporter, service khởi tạo user; healthcheck, volume và Docker secrets |
| `.dockerignore` | Loại `docs/evidence/` khỏi image, vẫn lưu minh chứng trong Git |
| `nginx/default.conf` | Status listener Docker nội bộ `8080`, ngăn endpoint metrics/status qua website |
| `package.json`, `package-lock.json` | Thêm `prom-client`, lệnh kiểm thử monitoring |
| `src/app.js`, `src/metrics.js` | Instrumentation request/status/độ trễ/lỗi, endpoint `/metrics` nội bộ |
| `monitoring/prometheus/prometheus.yml` | Scrape 6 targets mỗi 15 giây |
| `monitoring/grafana/provisioning/` | Datasource Prometheus và dashboard provider tự động |
| `monitoring/grafana/dashboards/student-management.json` | 17 panel dữ liệu container/web/database/Nginx |
| `scripts/bootstrap-monitoring.js` | Tạo/cập nhật user exporter trên MySQL hiện có, không chạy lại seed |
| `scripts/container-metadata.js` | Metadata Docker chỉ đọc, giới hạn project; join số liệu cAdvisor theo service |
| `scripts/local-stack.ps1` | Giữ DB/root; sinh secret monitoring riêng, DPAPI, action `GrafanaLogin` |
| `scripts/monitoring-test.js`, `tests/metrics.test.js`, `tests/container-metadata.test.js` | Kiểm tra instrumentation, metadata và monitoring thực tế |
| `scripts/capture-monitoring-evidence.js` | Chụp Targets và hai nhóm dashboard bằng trình duyệt; không log thông tin đăng nhập |
| `README.md`, `PROGRESS.md`, `KIEM_TRA.md` | Hướng dẫn, tiến độ và kết quả kiểm tra |
| `docs/evidence/phase3/` | Trạng thái Compose, targets, truy vấn/API và ảnh dashboard sau kiểm tra |

`qlsv_http_requests_total`, `qlsv_http_request_duration_seconds`, `qlsv_http_errors_total` có label `method`, `route`, `status_code`; lỗi tính cả 4xx/5xx. Route dùng template thay vì ID, query hoặc dữ liệu người dùng. Request scrape metrics không tự tăng counter web. Nginx vẫn trả đủ bốn security headers và log stdout/stderr của giai đoạn 2.

`mysql-exporter-init` đọc root/exporter password từ Docker secrets, cấp `PROCESS`, `REPLICATION CLIENT`, `SELECT` cho `qlsv_exporter`, tối đa 3 kết nối. Service chạy một lần, exit 0 là bình thường. cAdvisor cần quyền privileged và các mount chỉ đọc để quan sát Docker Linux host; không publish cổng.

Trên Docker Desktop, cAdvisor dùng containerd socket chỉ đọc và namespace `moby` để thu thập CPU/RAM thực tế; nhãn Compose có thể thiếu khi quan sát qua containerd. Service `container-metadata:9256` chỉ gọi Docker API `GET /containers/json` với filter project `qlsv-trancong`, xuất `qlsv_container_info{container_id,service,name,project}=1`. Dashboard join theo ID để hiển thị tài nguyên đúng 10 service đang chạy của dự án, không lẫn các container khác trên máy. Helper không tạo CPU/RAM giả hoặc đọc thông tin xác thực; socket và filesystem chỉ đọc, bỏ capability, bật `no-new-privileges`, không publish cổng. Service init chạy một lần được kiểm tra riêng qua exit code.

## Kết quả kiểm tra giai đoạn 3

**Đã hoàn thành kiểm tra thực tế giai đoạn 3; tất cả kiểm tra dưới đây đạt.** Các kết quả giai đoạn 1/2 phía dưới là lịch sử. Minh chứng được lưu trước khi tạo commit giai đoạn 3.

| Kiểm tra | Lệnh/thao tác | Kết quả giai đoạn 3 |
| --- | --- | --- |
| Compose config | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate` | Đạt, exit 0 |
| Build và khởi chạy | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up` | Đạt, `docker compose up -d --build` exit 0 |
| Trạng thái container | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps` | 10 service đang chạy; `db`, `app`, `nginx`, `cadvisor`, `prometheus`, `grafana` healthy; init `Exited (0)` |
| Service init và cổng app | Docker inspect `mysql-exporter-init` và `app` | Init `exited`, exit code 0; app `HostConfig.PortBindings: {}` |
| Bảo vệ helper metadata | Docker inspect `container-metadata` | User `node`, root filesystem chỉ đọc; không publish cổng |
| Cấu hình Prometheus | `docker exec qlsv-trancong-prometheus-1 promtool check config /etc/prometheus/prometheus.yml` | Đạt, cấu hình hợp lệ |
| Cú pháp Nginx | `docker exec qlsv-trancong-nginx-1 nginx -t` | Đạt, syntax ok/test successful |
| Cú pháp JavaScript | `npm run check` | Đạt, 17 file JavaScript |
| Kiểm thử đơn vị/instrumentation/metadata | `npm test` | Đạt, 16/16 test |
| Website và MySQL | `GET http://localhost:8082/`, `GET /health` | HTTP 200; health có `database: connected` |
| CRUD qua Nginx | `npm run test:integration` | Đạt, 9 nhóm; đã dọn dữ liệu tạm |
| Reverse proxy/security headers | `npm run test:proxy`, `curl.exe --head http://localhost:8082/` | Đạt, 6 kiểm tra; giữ đủ bốn security headers |
| phpMyAdmin | `GET http://localhost:5056/` | HTTP 200 |
| Endpoint monitoring không public | Gọi `/metrics` và `/stub_status` qua website | HTTP 404, kể cả các biến thể được kiểm thử |
| Prometheus ready và targets | `GET :9091/-/ready`, `GET :9091/api/v1/targets` | Ready HTTP 200; cả 6 targets UP, scrape mới |
| Truy vấn Prometheus | `GET :9091/api/v1/query?query=up` | Đạt, 6 giá trị bằng 1 |
| CPU/RAM đúng project | Truy vấn cAdvisor join `qlsv_container_info` | Đạt, dữ liệu thực đủ 10 service của project, không lẫn container khác |
| Exporter kết nối đích | Truy vấn `mysql_up`, `nginx_up` | Cả hai bằng 1; MySQL có 6 kết nối/giới hạn 151 tại thời điểm chụp |
| Grafana health | `GET http://localhost:3001/api/health` | HTTP 200, `database: ok` |
| Datasource Prometheus | Grafana datasource health và truy vấn qua datasource UID `prometheus` | Đạt, datasource healthy, provision tự động và không cho sửa |
| Dashboard | Mở Student Management Monitoring, kiểm tra 17 panel và dữ liệu thực | Đạt, 21 truy vấn có dữ liệu hữu hạn, mới; ảnh cả hai nhóm hiển thị dữ liệu |
| Kiểm thử monitoring tổng hợp | `npm run test:monitoring` | Đạt, 9 nhóm kiểm tra |
| Dữ liệu demo | Truy vấn đếm trực tiếp bốn bảng sau kiểm thử | Giữ nguyên 8 sinh viên, 3 lớp, 4 môn, 12 điểm |

Các lệnh curl kiểm tra nhanh, không chứa bí mật:

```powershell
curl.exe --fail --silent --show-error http://localhost:8082/health
curl.exe --fail --silent --show-error http://localhost:9091/-/ready
curl.exe --fail --silent --show-error 'http://localhost:9091/api/v1/query?query=up'
curl.exe --fail --silent --show-error http://localhost:3001/api/health
```

## Minh chứng giai đoạn 3

Đã lưu trong `docs/evidence/phase3/`; chỉ chứa dữ liệu vận hành, không có thông tin đăng nhập:

| Minh chứng | Nội dung |
| --- | --- |
| `compose-ps.txt` | `docker compose ps` sau khi các container sẵn sàng |
| `prometheus-targets.png` | Trang Targets hiển thị 6 targets UP |
| `container-web.png` | Nhóm panel CPU/RAM container, request/status/độ trễ |
| `database-nginx.png` | Nhóm panel trạng thái/kết nối MySQL, Nginx |
| `prometheus-targets.json`, `prometheus-up.json` | Trạng thái 6 targets và truy vấn `up` |
| `grafana-health.json`, `grafana-datasource-health.json` | Grafana health và kiểm tra datasource |
| `dashboard-query-results.json`, `summary.json` | 21 truy vấn dashboard và tổng hợp kiểm thử monitoring |

Đã mở xem trực tiếp cả ba ảnh: Targets có 6 targets UP; hai ảnh dashboard hiển thị đồ thị và giá trị thực, không có panel “No data”. Ảnh được chụp sau khi tạo traffic và đủ chu kỳ scrape. `compose-ps.txt` lưu UTF-8; 6 file JSON lưu kết quả API. Không đưa file DPAPI, secret runtime, cookie đăng nhập hoặc Authorization header vào minh chứng. `docs/evidence/` được loại khỏi Docker build, vẫn nằm trong Git.

Có thể tạo lại ba ảnh bằng `node scripts/capture-monitoring-evidence.js`; nếu cần đặt `CHROME_PATH` tới trình duyệt Chromium đã cài. Script giữ mật khẩu trong bộ nhớ và chỉ in đường dẫn ảnh. Grafana provider dùng polling mỗi 30 giây để cập nhật JSON dashboard ổn định trên Docker Desktop.

## Git và tiến độ

- Giai đoạn 1: `0fff1baf583f974a5a965cde9083de76e42674d1` — `feat: implement student management CRUD with MySQL`.
- Giai đoạn 2: `78279da4c4d5b2465963683cae495a46313874f0` — `feat: configure nginx reverse proxy and security headers`.
- Giai đoạn 3 đã đạt kiểm tra kỹ thuật; commit dùng message `feat: add prometheus and grafana monitoring`.
- Branch đích `master`, remote `https://github.com/CongTranDuc39/TRAN-DUC-CONG.git`. Kết quả commit/hash và push `master` lên `origin` được báo lúc bàn giao; không force push.

## Báo cáo triển khai và kiểm tra — Giai đoạn 2

Ngày: 16/10/2026. Đề tài: **Hệ thống quản lý sinh viên** — Trần Đức Công, DTC245200418, CNTT K23I. Giảng viên: Lê Khánh Dương, Đại học Công nghệ Thông tin và Truyền thông.

### Phạm vi giai đoạn 2

Thêm Nginx reverse proxy và bảo mật cơ bản. Website đi qua `127.0.0.1:8082 → nginx:80 → app:3000`; `app` chỉ expose nội bộ, không publish cổng ra host. phpMyAdmin vẫn tại `http://localhost:5056`, MySQL không publish cổng, giữ volume `mysql_data` và dữ liệu demo. Chưa triển khai Prometheus, Grafana, Loki hoặc Promtail.

Đã đọc `docker-compose.yml`, `Dockerfile` và `README.md` trước khi chỉnh sửa. `Dockerfile`, logic CRUD, schema và seed giữ nguyên. Không đọc, in, sửa hoặc commit `.env`; mọi lệnh Compose dùng `scripts/local-stack.ps1` với `--env-file .local/empty.env`. Mật khẩu được truyền bằng biến môi trường tiến trình, không ghi vào mã nguồn hoặc báo cáo.

| File | Thay đổi |
| --- | --- |
| `docker-compose.yml` | Thêm service `nginx`, healthcheck và phụ thuộc vào `app` healthy; chuyển publish `127.0.0.1:8082` sang Nginx; bỏ publish cổng của `app` |
| `nginx/default.conf` | Proxy tới `app:3000` bằng DNS Docker; bốn security headers; các proxy headers; giới hạn body; access log stdout, error log stderr |
| `package.json` | Thêm lệnh `npm run test:proxy` |
| `src/app.js` | Đặt CSP `frame-ancestors 'none'`, thống nhất chính sách chống nhúng trang với `X-Frame-Options: DENY` |
| `scripts/proxy-test.js` | Kiểm tra phản hồi và các header qua Nginx |
| `README.md` | Hướng dẫn kiến trúc, khởi chạy, kiểm tra và xem log giai đoạn 2 |
| `KIEM_TRA.md` | Báo cáo giai đoạn 2 và giữ lịch sử kết quả giai đoạn 1 bên dưới |

Nginx trả `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` và `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Bốn header được áp dụng bằng `always`, ẩn các bản tương ứng từ upstream để tránh trùng. `Host`, `X-Real-IP`, `X-Forwarded-For` và `X-Forwarded-Proto` được cấu hình tại proxy; XFF do client tự gửi bị ghi đè tại proxy biên.

### Kết quả kiểm tra giai đoạn 2

Các kiểm tra dưới đây đã chạy trên stack giai đoạn 2, sau khi build lại cấu hình CSP. Image `nginx:stable-alpine` tại thời điểm kiểm tra chạy Nginx `1.30.5`.

| Kiểm tra | Lệnh hoặc thao tác | Kết quả |
| --- | --- | --- |
| Compose config | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate` → `docker compose config --quiet` | Đạt, exit 0 |
| Build và khởi chạy | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up` → `docker compose up -d --build` | Đạt, exit 0; đã build lại sau khi cập nhật CSP |
| Trạng thái container | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps` → `docker compose ps` | `app`, `db`, `nginx`: healthy; `phpmyadmin`: Up |
| Cú pháp Nginx | `docker exec qlsv-trancong-nginx-1 nginx -t` | Đạt, `syntax is ok`, `test is successful` |
| Cú pháp JavaScript | `npm run check` | Đạt, 10 file JavaScript |
| Kiểm thử đơn vị | `npm test` | Đạt, 10/10 nhóm test |
| MySQL qua Nginx | `curl.exe --fail --silent --show-error http://localhost:8082/health` | HTTP 200, `{"status":"ok","database":"connected"}` |
| Website CRUD qua Nginx | `npm run test:integration` | Đạt, 9 nhóm kiểm tra; đã dọn dữ liệu tạm |
| Security headers bằng curl | `curl.exe --silent --show-error --head http://localhost:8082/` và kiểm tra header `/health` | Đạt, đủ bốn header đúng giá trị, mỗi header một lần; `Server: nginx` không lộ phiên bản; CSP `frame-ancestors 'none'` |
| Kiểm thử reverse proxy | `npm run test:proxy` | Đạt, 6 request: health 200, dashboard 200, CSS 200, 404, CSRF 403 và body quá lớn 413 do Nginx trả; bốn header đúng, CSP chống nhúng đúng trên phản hồi ứng dụng |
| phpMyAdmin | `GET http://localhost:5056/` | HTTP 200 |
| Cổng publish của Express | Kiểm tra `HostConfig.PortBindings` của container `app` | `{}`; Nginx publish `127.0.0.1:8082`, phpMyAdmin publish `127.0.0.1:5056` |
| Dữ liệu demo sau kiểm thử | Truy vấn trực tiếp số bản ghi bốn bảng | Giữ nguyên: 8 sinh viên, 3 lớp, 4 môn học, 12 bản ghi điểm |
| Log Nginx | Tách stdout/stderr từ `docker logs` | Đạt, 214 dòng JSON access log ở stdout; lỗi body quá lớn ở stderr |
| Mất kết nối MySQL qua Nginx | Tạm dừng riêng `qlsv-trancong-db-1`, gọi `/health`, khôi phục DB | Khi ngắt: HTTP 503; sau khôi phục: HTTP 200; `db`, `app`, `nginx` trở lại healthy |

Healthcheck Nginx gọi `http://127.0.0.1/health` bên trong container, đi qua Express và truy vấn MySQL. Access log ghi JSON ra stdout, error log ra stderr; dùng `docker logs --tail=80 qlsv-trancong-nginx-1` để kiểm tra, chưa cần Loki hoặc Promtail.

### Git

- Giai đoạn 1 đã được lưu trước khi sửa: commit `0fff1baf583f974a5a965cde9083de76e42674d1`, message `feat: implement student management CRUD with MySQL`.
- Chỉ tạo commit giai đoạn 2 sau khi các kiểm tra đạt, message `feat: configure nginx reverse proxy and security headers`.
- Branch hiện tại: `master`. `origin`: `https://github.com/CongTranDuc39/TRAN-DUC-CONG.git`.
- Push `master` lên `origin` sau khi kiểm tra; hash commit giai đoạn 2 và kết quả push được báo riêng khi hoàn tất, không dùng force push.

### Lịch sử kiểm tra giai đoạn 1

Phần sau lưu kết quả tại thời điểm hoàn thành giai đoạn 1, trước khi thêm Nginx. Trạng thái hiện tại của dự án được mô tả trong các phần giai đoạn 2 ở trên.

#### Các file đã tạo ở giai đoạn 1

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

#### Lệnh đã chạy và kết quả ở giai đoạn 1

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

#### Trạng thái bàn giao giai đoạn 1

- Website: <http://localhost:8082>.
- phpMyAdmin: <http://localhost:5056>.
- Dữ liệu demo còn nguyên: 8 sinh viên, 3 lớp, 4 môn học, 12 bản ghi điểm.
- MySQL không publish cổng ra máy chủ; hai giao diện chỉ bind `127.0.0.1`.
- `.env` không được tạo, đọc, sửa hoặc in trong quá trình triển khai.
- Mật khẩu demo được mã hóa bằng Windows DPAPI trong `.local/credentials.xml`; `.local/`, `.env` và `node_modules/` đã được xác nhận nằm trong danh sách Git ignore. Không có mật khẩu thật trong mã nguồn hoặc `.env.example`.
- Để đăng nhập phpMyAdmin, chạy `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Login`, dùng user `qlsv_app` và dán mật khẩu đã được script sao chép vào clipboard. Không chia sẻ file bí mật hoặc clipboard.
- Giữ `.local/credentials.xml` để các lần chạy tiếp dùng đúng mật khẩu của volume hiện tại.
- Tại thời điểm bàn giao giai đoạn 1 chưa triển khai Nginx, Prometheus, Grafana, Loki hoặc Promtail. Các container dự án khác trên máy được giữ nguyên.
- Giai đoạn 1 ban đầu chưa commit hoặc push GitHub; commit lưu mốc trước giai đoạn 2 được ghi ở phần Git phía trên.

Ảnh QA cục bộ trong `test-results/` được loại khỏi Git; hướng dẫn vận hành đầy đủ trong `README.md`.
