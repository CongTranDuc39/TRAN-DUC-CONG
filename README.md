# Hệ thống quản lý sinh viên — Giai đoạn 3

Ứng dụng Express.js, EJS, MySQL và mysql2 với giao diện tiếng Việt, chạy bằng Docker Compose. Giai đoạn 3 bổ sung Prometheus, Grafana, cAdvisor và các exporter để giám sát hệ thống. Website tiếp tục đi qua Nginx, giữ toàn bộ CRUD và dữ liệu demo.

| Thông tin | Nội dung |
| --- | --- |
| Sinh viên | Trần Đức Công |
| MSSV | DTC245200418 |
| Lớp | CNTT K23I |
| Trường | Đại học Công nghệ Thông tin và Truyền thông |
| Giảng viên | Lê Khánh Dương |

## Chức năng và địa chỉ

- Dashboard đếm sinh viên, lớp, môn học và bản ghi điểm.
- CRUD lớp, sinh viên, môn học và điểm; gán sinh viên vào lớp, gán điểm theo môn/học kỳ/năm học.
- Tìm kiếm, lọc, kiểm tra đầu vào; tính điểm môn và trung bình theo tín chỉ.
- `/health` kiểm tra MySQL bằng `SELECT 1`.
- Giám sát container, Express, MySQL và Nginx qua Prometheus/Grafana.

| Giao diện | Địa chỉ trên máy cá nhân |
| --- | --- |
| Website qua Nginx | <http://localhost:8082> |
| Health của website và MySQL | <http://localhost:8082/health> |
| phpMyAdmin | <http://localhost:5056> |
| Prometheus | <http://localhost:9091> |
| Prometheus Targets | <http://localhost:9091/targets> |
| Grafana | <http://localhost:3001> |
| Dashboard | <http://localhost:3001/d/student-management/student-management-monitoring> |

Các cổng trên chỉ bind `127.0.0.1`. Express, MySQL, cAdvisor và exporter không publish cổng ra host. Giai đoạn 3 chưa triển khai Loki hoặc Promtail.

## Kiến trúc

```text
Trình duyệt :8082 → nginx:80 → app:3000 → db:3306
phpMyAdmin :5056 → phpmyadmin:80 → db:3306
Grafana :3001 → grafana:3000 → prometheus:9090 ← :9091
                                   ├─ prometheus:9090
                                   ├─ app:3000/metrics
                                   ├─ cadvisor:8080/metrics
                                   ├─ container-metadata:9256/metrics → Docker socket
                                   ├─ mysql-exporter:9104/metrics → db:3306
                                   └─ nginx-exporter:9113/metrics → nginx:8080/stub_status
```

Prometheus scrape mỗi 15 giây, giữ dữ liệu 7 ngày trong `prometheus_data`. Grafana lưu tài khoản/cấu hình trong `grafana_data`. Volume `mysql_data`, schema và seed hiện có được giữ nguyên.

| Thành phần bổ sung | Image |
| --- | --- |
| Prometheus | `prom/prometheus:v3.15.0` |
| Grafana | `grafana/grafana:13.2.3` |
| cAdvisor | `ghcr.io/google/cadvisor:0.55.1` |
| MySQL exporter | `prom/mysqld-exporter:v0.20.0` |
| Nginx exporter | `nginx/nginx-prometheus-exporter:1.4.1` |

cAdvisor cần `privileged` và các mount chỉ đọc của Docker socket, containerd socket, rootfs, `/sys`, `/var/lib/docker` để thu thập CPU/RAM container. Trên Docker Desktop, đây là tài nguyên của máy ảo Linux chạy Docker. Cấu hình dùng containerd namespace `moby` để lấy được số liệu thực tế trong môi trường này. cAdvisor không có giao diện publish ra host.

Docker Desktop/containerd có thể không cung cấp nhãn Compose cho cAdvisor. Service nội bộ `container-metadata` dùng Node.js, cổng `9256`, chỉ gọi Docker API `GET /containers/json` với bộ lọc project `qlsv-trancong`. Metric `qlsv_container_info{container_id,service,name,project}=1` ánh xạ ID thành tên service; dashboard ghép metric này với CPU/RAM thực tế từ cAdvisor để chỉ hiển thị container của dự án. Service này không tạo số liệu CPU/RAM và không đọc thông tin xác thực. Docker socket được mount chỉ đọc, container dùng filesystem chỉ đọc, bỏ toàn bộ capability và bật `no-new-privileges`; không publish cổng ra host.

## Khởi chạy trên Windows

Cần Docker Desktop đang chạy với Linux containers, Docker Compose v2 và các cổng `8082`, `5056`, `9091`, `3001` còn trống. Node.js 24 và npm cần thiết khi chạy kiểm tra trực tiếp trên máy.

Mở Windows PowerShell tại thư mục dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps
```

Các action lần lượt chạy `docker compose config --quiet`, `docker compose up -d --build` và `docker compose ps`. Script dùng project `qlsv-trancong`, truyền rõ `--env-file .local/empty.env` là file rỗng để Compose không tự đọc `.env`. Script không đọc, sửa hoặc in `.env`; biến môi trường tiến trình được khôi phục khi kết thúc.

Lần đầu cần tải image, build Express và đợi healthcheck. `mysql-exporter-init` là service chạy một lần, kết thúc với exit code 0 sau khi chuẩn bị user giám sát; trạng thái `Exited (0)` của service này là bình thường. Các service có healthcheck gồm MySQL, Express, Nginx, Prometheus và Grafana.

### Mật khẩu và đăng nhập

Script giữ nguyên thông tin MySQL hiện có trong `.local/credentials.xml`; không tạo lại mật khẩu DB/root khi nâng giai đoạn. Mật khẩu mới cho exporter và Grafana được tạo ngẫu nhiên từ 32 byte, lưu riêng bằng Windows DPAPI trong `.local/monitoring-credentials.xml`. Hai file này chỉ giải mã được bởi cùng tài khoản Windows trên cùng máy.

`Validate` hoặc `Up` chuẩn bị các file runtime sau, UTF-8 không BOM, nằm trong `.local/` bị loại khỏi Git và Docker build:

| File runtime | Mục đích |
| --- | --- |
| `.local/secrets/mysql-root-password.txt` | Chỉ service khởi tạo exporter dùng để quản lý tài khoản |
| `.local/secrets/mysql-exporter-password.txt` | Mật khẩu user `qlsv_exporter` cho service khởi tạo |
| `.local/secrets/mysql-exporter.cnf` | Cấu hình đăng nhập Docker secret của MySQL exporter |
| `.local/secrets/grafana-admin-password.txt` | Docker secret mật khẩu quản trị Grafana |

Prometheus không cần mật khẩu database. Grafana dùng `GF_SECURITY_ADMIN_PASSWORD__FILE` để đọc Docker secret; source và datasource provisioning không chứa mật khẩu. `mysql-exporter-init` tạo/cập nhật user `qlsv_exporter`, giới hạn 3 kết nối và cấp `PROCESS`, `REPLICATION CLIENT`, `SELECT` phục vụ exporter. Việc này hoạt động trên volume MySQL hiện có, không chạy lại seed và không sửa dữ liệu CRUD.

Đăng nhập bằng các lệnh sau. Script chỉ in tên tài khoản, sao chép mật khẩu vào clipboard và mở trình duyệt; dán mật khẩu vào ô đăng nhập rồi xóa clipboard nếu cần.

```powershell
# phpMyAdmin: qlsv_app
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Login
# Grafana: admin
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action GrafanaLogin
```

Giữ cả hai file DPAPI để chạy lại. Nếu volume MySQL hoặc Grafana đã tồn tại nhưng thiếu file DPAPI tương ứng, script dừng để tránh tạo mật khẩu không khớp; khôi phục bí mật bằng đúng tài khoản/máy đã tạo. Sao chép file XML sang máy/tài khoản khác không giải mã được. Với cách triển khai ngoài Windows, cần cung cấp lại mật khẩu DB/root của volume hiện có và bốn file Docker secret đúng các đường dẫn trên bằng công cụ quản lý bí mật; không đặt mật khẩu vào source hoặc commit `.env`. `.env.example` chỉ mô tả biến cấu hình và giá trị mẫu.

## Metrics và dashboard

Datasource `Prometheus` có UID `prometheus`, URL nội bộ `http://prometheus:9090`, được provision tự động và đặt làm mặc định. Dashboard **Student Management Monitoring**, UID `student-management`, nằm trong thư mục **QLSV**, được nạp từ JSON trong repository. Provider kiểm tra file mỗi 30 giây bằng polling để nhận thay đổi ổn định qua mount của Docker Desktop. Dashboard có 17 panel dữ liệu, chia thành hai nhóm:

- **Container & Web**: CPU, RAM container; tổng request, lỗi HTTP, request/giây, phân bố HTTP status; độ trễ p95 và trung bình.
- **Database & Nginx**: trạng thái MySQL, kết nối hiện tại/giới hạn; trạng thái Nginx, kết nối và request/giây; bảng 6 Prometheus targets.

Express dùng `prom-client`, endpoint nội bộ `app:3000/metrics`:

| Metric | Ý nghĩa |
| --- | --- |
| `qlsv_http_requests_total` | Số response hoàn tất, label `method`, `route`, `status_code` |
| `qlsv_http_request_duration_seconds` | Histogram thời gian phản hồi theo cùng label, đơn vị giây |
| `qlsv_http_errors_total` | Response có status từ 400, gồm lỗi 4xx/5xx |
| `qlsv_process_*`, `qlsv_nodejs_*` | Tài nguyên tiến trình Node.js do `prom-client` thu thập |

Label route dùng mẫu như `/students/:id/edit`, không chứa MSSV, query string, nội dung request hoặc đường dẫn tùy ý; request scrape `/metrics` không tự tăng bộ đếm web. Số liệu Express phản ánh request tới ứng dụng; lỗi do chính Nginx trả trước khi proxy được quan sát ở phía Nginx.

Nginx chỉ mở `stub_status` ở cổng Docker nội bộ `8080`. `/metrics` và `/stub_status` không được cung cấp qua website `:8082`. Exporter dùng `http://nginx:8080/stub_status`.

Sau khi khởi chạy, mở vài trang hoặc chạy kiểm thử CRUD rồi đợi ít nhất hai chu kỳ scrape, khoảng 30–60 giây, để biểu đồ `rate()` có dữ liệu. Counter trở về 0 khi tiến trình ứng dụng khởi động lại; Prometheus xử lý việc reset khi tính tốc độ.

Một số truy vấn demo:

```promql
up
sum(rate(qlsv_http_requests_total[5m]))
sum by (status_code) (qlsv_http_requests_total)
histogram_quantile(0.95, sum by (le) (rate(qlsv_http_request_duration_seconds_bucket[5m])))
mysql_up
mysql_global_status_threads_connected
nginx_up
```

## Reverse proxy và bảo mật hiện có

Website chỉ được publish qua `nginx:80` tại `127.0.0.1:8082`; Express chỉ expose `3000`. Nginx dùng DNS Docker để tìm `app:3000`, cập nhật địa chỉ khi container được tạo lại. Các header sau áp dụng cả phản hồi lỗi và không bị lặp từ Express:

| Header | Giá trị |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

Proxy truyền `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`; ghi đè chuỗi XFF do client tự gửi tại proxy biên. Express tắt `trust proxy`. CSP dùng `frame-ancestors 'none'`, body tối đa `32k`, ẩn phiên bản Nginx. Access log JSON ra stdout, error log ra stderr, không ghi query string hay request body. Chưa triển khai HTTPS, đăng nhập/phân quyền ứng dụng hoặc thu thập log tập trung ở giai đoạn này.

## Kiểm tra thực tế

```powershell
npm ci
npm run check
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps
docker exec qlsv-trancong-nginx-1 nginx -t
docker exec qlsv-trancong-prometheus-1 promtool check config /etc/prometheus/prometheus.yml
npm run test:integration
npm run test:proxy
npm run test:monitoring
curl.exe --fail --silent --show-error http://localhost:8082/health
curl.exe --fail --silent --show-error http://localhost:9091/-/ready
curl.exe --fail --silent --show-error 'http://localhost:9091/api/v1/query?query=up'
curl.exe --fail --silent --show-error http://localhost:3001/api/health
curl.exe --silent --show-error --head http://localhost:8082/
curl.exe --fail --silent --show-error --output NUL --write-out 'phpMyAdmin HTTP %{http_code}' http://localhost:5056/
```

`npm run check` kiểm tra cú pháp JavaScript; `npm test` kiểm tra dữ liệu, tính điểm và instrumentation. Kiểm thử tích hợp chạy CRUD qua Nginx và dọn dữ liệu tạm; kiểm thử proxy kiểm tra header, CSP và các phản hồi HTTP. Kiểm thử monitoring kiểm tra targets, truy vấn, datasource/dashboard và dữ liệu thực tế; không đưa mật khẩu vào lệnh hoặc báo cáo. Chi tiết kết quả và minh chứng được ghi trong `KIEM_TRA.md`, `docs/evidence/phase3/`.

Kết quả nghiệm thu ngày 16/10/2026: Compose build/up và cấu hình đạt; 10 service đang chạy, service init exit 0; 6 targets UP; 16/16 kiểm thử đơn vị, 9 nhóm CRUD, 6 kiểm tra proxy và 9 nhóm monitoring đạt. Dashboard có dữ liệu thật ở cả 17 panel với 21 truy vấn, CPU/RAM bao phủ đủ 10 service của dự án. Website, `/health`, phpMyAdmin và Grafana health đều HTTP 200.

Có thể chụp lại minh chứng bằng Chrome/Edge trên máy sau khi stack sẵn sàng:

```powershell
node scripts/capture-monitoring-evidence.js
```

Script tự tìm trình duyệt Chromium; nếu trình duyệt ở vị trí khác, đặt biến môi trường `CHROME_PATH` tới file thực thi trước khi chạy. Script giữ mật khẩu Grafana trong bộ nhớ khi đăng nhập và chỉ in đường dẫn ảnh đã lưu. Bộ minh chứng hiện có gồm Compose ps, 3 ảnh và 6 file JSON, được lưu trong Git nhưng loại khỏi Docker build.

Trong Prometheus Targets, 6 job `prometheus`, `express`, `cadvisor`, `docker-metadata`, `mysql`, `nginx` phải **UP**; truy vấn `up` trả 6 giá trị bằng 1. Cấu hình đáp ứng đủ 5 targets bắt buộc và bổ sung metadata để tương thích Docker Desktop. `mysql_up = 1` và `nginx_up = 1` xác nhận exporter kết nối được đích. Grafana `/api/health` phải có `database: ok`; đăng nhập, mở datasource Prometheus và **Save & test**, sau đó mở dashboard để xem dữ liệu.

Healthcheck MySQL chạy `SELECT 1` với user ứng dụng; Express gọi `/health`; Nginx gọi `/health` qua proxy; Prometheus dùng `/-/ready`; Grafana dùng `/api/health`. `depends_on` bảo đảm khởi tạo database/exporter và chờ các service cần thiết sẵn sàng.

Xem log khi cần:

```powershell
docker logs --tail=80 qlsv-trancong-prometheus-1
docker logs --tail=80 qlsv-trancong-grafana-1
docker logs --tail=80 qlsv-trancong-mysql-exporter-1
docker logs --tail=80 qlsv-trancong-nginx-exporter-1
docker logs --tail=80 qlsv-trancong-nginx-1
```

## Dữ liệu và cách tính điểm

`database/init.sql` tạo 4 bảng InnoDB/`utf8mb4`: `classes`, `students`, `subjects`, `scores`. Seed gồm 3 lớp, 8 sinh viên, 4 môn và 12 bản ghi điểm; Trần Đức Công có MSSV `DTC245200418`. Email miền `example.test` và thông tin sinh viên khác là dữ liệu minh họa.

```text
Điểm môn = ROUND(chuyên cần × 10% + giữa kỳ × 30% + cuối kỳ × 60%, 2)
Điểm trung bình = ROUND(Σ(điểm môn × số tín chỉ) / Σ(số tín chỉ), 2)
```

MySQL tự tính cột generated `total_score`. Trung bình tính theo các bản ghi trong phạm vi lọc; chưa chọn lần thi cao nhất hoặc xử lý học lại. Chưa có điểm được hiển thị là chưa có dữ liệu. Mốc đạt demo 5,0 không thay thế quy chế chính thức của trường.

Khóa ngoại dùng `RESTRICT`: không xóa lớp còn sinh viên, sinh viên còn điểm hoặc môn còn điểm. Mã lớp/MSSV/mã môn và email nếu có phải duy nhất. Điểm trong 0–10; tín chỉ trong 1–10; bộ sinh viên/môn/học kỳ/năm học không trùng. Seed chỉ chạy khi volume MySQL trống; giai đoạn 3 không khởi tạo lại seed.

## Dừng và chạy lại

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Stop
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Start
# Gỡ container/mạng, giữ cả ba volume dữ liệu:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Down
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
```

Không xóa volume khi nâng giai đoạn hoặc chạy lại demo. Sao lưu MySQL và giữ file DPAPI trước khi chuyển máy. Nếu cổng bị chiếm, dừng ứng dụng đang dùng cổng rồi chạy lại; các cổng của đề tài được giữ cố định.

## Cấu trúc chính

```text
docker-compose.yml             Website, database và toàn bộ monitoring
Dockerfile                     Node.js 24 Alpine, chạy bằng user node
nginx/default.conf             Proxy, security headers, status nội bộ, log
monitoring/prometheus/         Cấu hình scrape 6 targets
monitoring/grafana/provisioning/ Datasource và dashboard provider
monitoring/grafana/dashboards/  Student Management Monitoring
src/metrics.js                 Metrics HTTP và tài nguyên Node.js
scripts/bootstrap-monitoring.js Khởi tạo user exporter trên volume hiện có
scripts/container-metadata.js  Ánh xạ container ID/service của riêng project
scripts/capture-monitoring-evidence.js Chụp Targets và hai nhóm dashboard
scripts/local-stack.ps1        Chạy stack, DPAPI và Docker secret runtime
scripts/                       Kiểm tra cú pháp, CRUD, proxy, monitoring
tests/                         Validation, metrics và Docker metadata
src/, views/, public/          CRUD Express/EJS và giao diện tiếng Việt
database/init.sql              Schema, ràng buộc và seed
README.md                      Hướng dẫn chạy
PROGRESS.md                    Tiến độ các giai đoạn
KIEM_TRA.md                     Báo cáo kiểm tra thực tế
docs/evidence/phase3/           Minh chứng giai đoạn 3, không chứa bí mật
```
