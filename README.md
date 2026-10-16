# Hệ thống quản lý sinh viên — Giai đoạn 4

Ứng dụng Express.js, EJS, MySQL và mysql2 với giao diện tiếng Việt, chạy bằng Docker Compose. Giai đoạn 4 bổ sung Loki, Promtail và LogQL để tra cứu log tập trung trong Grafana. Giữ hệ thống Prometheus/Grafana của giai đoạn 3, toàn bộ CRUD và dữ liệu demo; website tiếp tục đi qua Nginx.

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
- Thu log Express, Nginx, MySQL và phpMyAdmin qua Promtail/Loki; tra cứu bằng LogQL trong Grafana Explore.

| Giao diện | Địa chỉ trên máy cá nhân |
| --- | --- |
| Website qua Nginx | <http://localhost:8082> |
| Health của website và MySQL | <http://localhost:8082/health> |
| phpMyAdmin | <http://localhost:5056> |
| Prometheus | <http://localhost:9091> |
| Prometheus Targets | <http://localhost:9091/targets> |
| Grafana | <http://localhost:3001> |
| Dashboard | <http://localhost:3001/d/student-management/student-management-monitoring> |
| Grafana Explore — chọn datasource Loki | <http://localhost:3001/explore> |

Các cổng trên chỉ bind `127.0.0.1`. Express, MySQL, cAdvisor, exporter, Loki và Promtail không publish cổng ra host. Loki phục vụ tại `http://loki:3100`, Promtail tại `http://promtail:9080` trong mạng Docker; Grafana truy cập Loki bằng tên service.

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
Grafana Explore → loki:3100 ← promtail:9080 → Docker API socket (mount :ro)
                              └─ chỉ log app/nginx/db/phpmyadmin của qlsv-trancong
```

Prometheus scrape mỗi 15 giây, giữ dữ liệu 7 ngày trong `prometheus_data`. Grafana lưu tài khoản/cấu hình trong `grafana_data`. Loki lưu chunks, index, WAL và trạng thái compactor trong named volume `loki_data`; Promtail lưu vị trí đọc trong `promtail_positions`. Volume `mysql_data`, schema và seed hiện có được giữ nguyên. Không đổi tên project Compose `qlsv-trancong` để tiếp tục dùng đúng các volume hiện tại.

| Thành phần bổ sung | Image |
| --- | --- |
| Prometheus | `prom/prometheus:v3.15.0` |
| Grafana | `grafana/grafana:13.2.3` |
| cAdvisor | `ghcr.io/google/cadvisor:0.55.1` |
| MySQL exporter | `prom/mysqld-exporter:v0.20.0` |
| Nginx exporter | `nginx/nginx-prometheus-exporter:1.4.1` |
| Loki | `grafana/loki:3.7.8` |
| Promtail | `grafana/promtail:3.5.8` |

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

Lần đầu cần tải image, build Express và đợi healthcheck. `mysql-exporter-init` là service chạy một lần, kết thúc với exit code 0 sau khi chuẩn bị user giám sát; trạng thái `Exited (0)` của service này là bình thường. Các service có healthcheck gồm MySQL, Express, Nginx, Prometheus và Grafana. Loki dùng image distroless không có shell/curl/wget để chạy Docker healthcheck; kiểm tra readiness HTTP `/ready` qua datasource proxy nội bộ của Grafana. Grafana/Promtail khởi chạy sau khi container Loki được tạo và client tự kết nối lại khi Loki sẵn sàng.

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

Proxy truyền `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`; ghi đè chuỗi XFF do client tự gửi tại proxy biên. Express tắt `trust proxy`. CSP dùng `frame-ancestors 'none'`, body tối đa `32k`, ẩn phiên bản Nginx. Access log dùng định dạng văn bản gồm method, URI đã bỏ query string, protocol và HTTP status ra stdout; error log ra stderr. Không ghi header hoặc request body trong access log. Chưa triển khai HTTPS hoặc đăng nhập/phân quyền ứng dụng.

## Log tập trung và LogQL

Datasource **Loki**, UID `loki`, URL nội bộ `http://loki:3100` được provision tự động, không chứa thông tin xác thực trong source và không cho sửa trên giao diện. Đăng nhập Grafana bằng action `GrafanaLogin`, mở **Explore**, chọn **Loki**, chuyển sang **Code**, chọn khoảng thời gian **Last 15 minutes** rồi chạy các truy vấn sau. Nếu MySQL chưa phát sinh log mới trong khoảng này, mở rộng thời gian về lúc container MySQL khởi động.

```logql
{project="student-management"}

{project="student-management", service="nginx"} |= "GET /health"

sum(count_over_time({project="student-management"}[5m]))

{project="student-management", service="nginx"} |~ "\" [45][0-9]{2} "
```

Truy vấn thứ ba đếm số dòng log trong cửa sổ 5 phút, không phải số request duy nhất. Request xuất hiện trong cả log Nginx và Express được đếm ở cả hai stream. Có thể chọn truy vấn tức thời để xem tổng tại thời điểm hiện tại hoặc truy vấn theo khoảng thời gian để vẽ biểu đồ.

Tạo một GET tới đường dẫn không tồn tại để demo HTTP 404; thao tác chỉ đọc và không gây lỗi 5xx:

```powershell
curl.exe --silent --show-error --output NUL --write-out 'HTTP %{http_code}' http://localhost:8082/__loki_probe_404
curl.exe --fail --silent --show-error http://localhost:8082/health
```

Đợi khoảng 5–15 giây rồi chạy truy vấn lọc 4xx/5xx; sẽ thấy dòng request `GET /__loki_probe_404 HTTP/1.1` với status `404`. Các truy vấn được lưu trong `monitoring/logql/queries.json`; lọc Express bằng `{project="student-management", service="app"}`, MySQL bằng `{project="student-management", service="db"}`. Nhãn service giữ tên service Compose hiện có (`db` là MySQL).

Promtail dùng Docker service discovery, lọc chính xác label `com.docker.compose.project=qlsv-trancong` ngay tại Docker API, sau đó giữ lại đúng project và whitelist `app|nginx|db|phpmyadmin` bằng relabel. Chỉ log các container này được đọc và gửi sang Loki; không có glob đọc log container khác. Nhãn `project="student-management"` là tên logic dùng cho LogQL, độc lập với tên project Compose hiện tại. Mỗi stream có thêm `service`, `container` (tên container không có dấu `/` đầu) và `stream` (`stdout`/`stderr`). Không chuyển environment hoặc toàn bộ metadata Docker thành label log.

Express ghi log HTTP JSON với method, route chuẩn hóa, status và thời gian phản hồi; không ghi ID sinh viên, query, cookie, mật khẩu, header hoặc body. Nginx ghi access log văn bản để hỗ trợ trực tiếp các truy vấn trên. MySQL thu error/startup log hiện có qua stdout/stderr; không bật general query log hoặc ghi câu SQL. phpMyAdmin thu log Apache nếu có request. Promtail không thu log riêng của hệ giám sát để tránh vòng lặp tự thu thập.

Loki dùng TSDB v13, filesystem và index chu kỳ `24h`. `limits_config.retention_period: 168h` giới hạn log 7 ngày; compactor bật retention, chạy mỗi 10 phút, dùng filesystem delete-request store và chờ 2 giờ trước khi xóa chunks đã đánh dấu. Xóa log diễn ra bất đồng bộ, không đúng tức thời tại mốc 7 ngày. `max_query_lookback: 168h` giới hạn khoảng dữ liệu có thể truy vấn. Named volume giữ log qua lần tạo lại container; không chạy `docker compose down -v` khi cần giữ dữ liệu.

### Ngoại lệ hardening và giới hạn

Promtail chạy bằng root để truy cập Docker socket trên Docker Desktop, mount `/var/run/docker.sock:ro`, dùng root filesystem chỉ đọc, bỏ toàn bộ capability và bật `no-new-privileges`. Chỉ volume vị trí đọc `/run/promtail` được ghi. Mount socket `:ro` không chặn Docker API dùng HTTP POST/DELETE hoặc các API có quyền thay đổi hệ thống; process có socket vẫn có quyền mạnh đối với Docker daemon. Đây là ngoại lệ hardening cho môi trường demo; khi triển khai dùng socket proxy cho phép đúng các API đọc cần thiết hoặc collector không cần socket. Bộ lọc project giới hạn log được thu, không phải cơ chế phân quyền của Docker daemon.

Loki tắt authentication trong mạng Compose nội bộ và không publish cổng; chỉ dùng với stack local đáng tin cậy. Filesystem một node không cung cấp HA hoặc bản sao lưu; cần quản lý dung lượng đĩa và backup volume riêng. Readiness được xác minh khi nghiệm thu, chưa có healthcheck định kỳ của Docker cho Loki distroless.

Promtail đã hết vòng đời hỗ trợ ngày **02/03/2026** theo [tài liệu Grafana](https://grafana.com/docs/loki/latest/send-data/promtail/). Giai đoạn này giữ Promtail đúng yêu cầu đề tài; nên chuyển collector sang Grafana Alloy ở giai đoạn tiếp theo trước khi dùng cho môi trường production. Retention được cấu hình và kiểm tra hiện tại; chưa thể khẳng định đã chờ đủ 7 ngày để quan sát xóa log. Cấu hình dựa trên [hướng dẫn retention](https://grafana.com/docs/loki/latest/operations/storage/retention/) và [filesystem storage](https://grafana.com/docs/loki/latest/operations/storage/filesystem/) chính thức.

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
$env:MONITORING_EVIDENCE_DIR = 'docs/evidence/phase4/monitoring'
npm run test:monitoring
Remove-Item Env:\MONITORING_EVIDENCE_DIR
npm run test:logs
curl.exe --fail --silent --show-error http://localhost:8082/health
curl.exe --fail --silent --show-error http://localhost:9091/-/ready
curl.exe --fail --silent --show-error 'http://localhost:9091/api/v1/query?query=up'
curl.exe --fail --silent --show-error http://localhost:3001/api/health
curl.exe --silent --show-error --head http://localhost:8082/
curl.exe --fail --silent --show-error --output NUL --write-out 'phpMyAdmin HTTP %{http_code}' http://localhost:5056/
```

`npm run check` kiểm tra cú pháp JavaScript; `npm test` kiểm tra dữ liệu, tính điểm, instrumentation và log HTTP an toàn. Kiểm thử tích hợp chạy CRUD qua Nginx và dọn dữ liệu tạm; kiểm thử proxy kiểm tra header, CSP và các phản hồi HTTP. Kiểm thử monitoring kiểm tra targets, truy vấn, datasource/dashboard và dữ liệu thực tế; kiểm thử logs kiểm tra Loki readiness qua Grafana, datasource Loki, bảy truy vấn LogQL, log từng service, GET 404 và tính cô lập theo project. Các script không đưa mật khẩu vào lệnh hoặc báo cáo. Chi tiết kết quả và minh chứng được ghi trong `KIEM_TRA.md`, `docs/evidence/phase3/`, `docs/evidence/phase4/`.

Lưu kiểm tra metrics giai đoạn 4 riêng để giữ minh chứng lịch sử giai đoạn 3:

```powershell
$env:MONITORING_EVIDENCE_DIR = 'docs/evidence/phase4/monitoring'
npm run test:monitoring
Remove-Item Env:\MONITORING_EVIDENCE_DIR
npm run test:logs
npm run capture:logs
```

`test:logs` lưu kết quả API vào `docs/evidence/phase4/` và chỉ tạo traffic GET an toàn, gồm request `GET /__loki_probe_404` trả 404. `capture:logs` đăng nhập Grafana bằng bí mật runtime trong bộ nhớ, chụp datasource Loki và bốn màn hình Explore (toàn bộ log, health, lỗi HTTP, số dòng); không lưu cookie hoặc mật khẩu vào minh chứng. Xem `docs/evidence/phase4/README.md` để đối chiếu ảnh và truy vấn. Vì Loki không publish ra host, không gọi `localhost:3100`; readiness được script kiểm tra tại `/api/datasources/proxy/uid/loki/ready` sau khi xác thực Grafana.

Kết quả nghiệm thu giai đoạn 4 ngày 16/10/2026: cấu hình và 21 file JavaScript hợp lệ; 19/19 unit test, 9 nhóm CRUD, 6 kiểm tra proxy, 9 nhóm monitoring và 9 nhóm log đạt. Stack có 12 service đang chạy, 6 targets UP; dashboard giữ 17 panel/21 truy vấn có dữ liệu thực và CPU/RAM đủ 12 service. Loki readiness HTTP 200, datasource Loki `OK`, cả 7 truy vấn LogQL có dữ liệu thực của bốn service; GET `/__loki_probe_404` xuất hiện với HTTP 404 và health với HTTP 200. Năm ảnh Grafana cùng kết quả API và kiểm tra runtime lưu trong `docs/evidence/phase4/`; chi tiết ở `KIEM_TRA.md`.

Kết quả nghiệm thu giai đoạn 3 ngày 16/10/2026 được giữ làm lịch sử: Compose build/up và cấu hình đạt; 10 service đang chạy, service init exit 0; 6 targets UP; 16/16 kiểm thử đơn vị, 9 nhóm CRUD, 6 kiểm tra proxy và 9 nhóm monitoring đạt. Dashboard có dữ liệu thật ở cả 17 panel với 21 truy vấn, CPU/RAM bao phủ đủ 10 service của dự án. Website, `/health`, phpMyAdmin và Grafana health đều HTTP 200.

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

Khóa ngoại dùng `RESTRICT`: không xóa lớp còn sinh viên, sinh viên còn điểm hoặc môn còn điểm. Mã lớp/MSSV/mã môn và email nếu có phải duy nhất. Điểm trong 0–10; tín chỉ trong 1–10; bộ sinh viên/môn/học kỳ/năm học không trùng. Seed chỉ chạy khi volume MySQL trống; nâng giai đoạn không khởi tạo lại seed.

## Dừng và chạy lại

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Stop
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Start
# Gỡ container/mạng, giữ các named volume dữ liệu và vị trí đọc log:
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
monitoring/loki/loki.yml        TSDB/filesystem, WAL, retention 7 ngày
monitoring/promtail/promtail.yml Docker discovery và label log đúng project
monitoring/logql/queries.json    Các truy vấn LogQL dùng để demo/kiểm tra
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
docs/evidence/phase4/           Minh chứng Loki, Grafana Explore và LogQL
```
