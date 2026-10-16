# Minh chứng giai đoạn 5 — Hardening và kiểm thử tổng thể

Đề tài **Hệ thống quản lý sinh viên** — Trần Đức Công, DTC245200418, CNTT K23I; Giảng viên Lê Khánh Dương, Đại học Công nghệ Thông tin và Truyền thông. Ngày kiểm tra 16/10/2026, múi giờ Asia/Saigon.

Đã chạy lại toàn bộ quy trình tổng thể: **15/15 bước đạt, exit 0**, từ `2026-10-16T08:00:25Z` đến `08:01:30Z`. Đã chụp và mở xem đủ **15 ảnh thật**, sau đó chạy lại 7 nhóm hardening đạt lúc `08:04:43Z`. Kết quả dưới đây lấy từ các transcript/API mới, không dùng dữ liệu phase3/phase4 thay thế. Thư mục không chứa `.env`, file DPAPI, mật khẩu, token, Authorization hoặc cookie.

## Kết quả và vị trí đối chiếu

| File/thư mục | Nội dung thực tế |
| --- | --- |
| `verification-summary.json` | Passed true, đủ 15 bước exit 0, command/timestamp và mốc sau startup |
| `compose-ps.txt`, `checks/compose-ps-final.txt` | Trạng thái cuối của 12 service thường trực; hai init exit 0 được đối chiếu trong hardening |
| `checks/*.txt` | Transcript Compose, JavaScript, unit, CRUD, proxy, monitoring, log và hardening |
| `checks/javascript-syntax.txt`, `checks/unit-tests.txt` | 24 file JavaScript hợp lệ, 19/19 unit test đạt |
| `checks/crud-integration.txt`, `checks/nginx-proxy.txt` | 9 nhóm CRUD, 6 kiểm tra proxy/security headers đạt |
| `hardening-summary.json`, `hardening-results.json` | 7 nhóm đạt; inspect 14 container, ngoại lệ; app non-root/CapEff 0/NoNewPrivs 1/EROFS; DB grants và denial |
| `baseline-data.json`, `hardening-results.json` | Trước/sau cùng 3 lớp, 8 sinh viên, 4 môn, 12 điểm; SHA-256 từng bảng khớp |
| `http-results.json` | Năm URL HTTP 200 sau redirect, health MySQL kết nối và đủ bốn security headers |
| `no-http-5xx.json` | Query Loki Nginx 5xx trả rỗng trong cửa sổ sau startup; có dòng health làm ingestion barrier |
| `monitoring/` | Sáu JSON mới: 6/6 targets UP, `up=1`, datasource/health, 17 panel/21 truy vấn thật và CPU/RAM đủ 12 service |
| `logging/` | Sáu JSON mới: Loki ready 200, Grafana/datasource OK, 7 truy vấn thật từ bốn service, health 200, 404 và count dương |
| `checks/initial-verification-summary.json`, `checks/initial-hardening.txt` | Lần kiểm tra đầu không đạt do healthcheck PHP stream; giữ nguyên để ghi nhận lỗi đã sửa |
| `checks/post-capture-hardening.txt` | Kiểm tra lại sau chụp: 7 nhóm hardening đạt, hash dữ liệu giữ nguyên |
| `website-health.json`, `security-headers.txt` | Kết quả curl thật: health/DB connected và đủ bốn header, không cookie |
| `capture-results.json`, `website/capture-summary.json` | Exit code, danh sách 15 ảnh, thời điểm, SHA-256 và xác nhận đã mở xem |
| `git-history.txt`, `website/github-commit-history.png` | Snapshot remote/master trước commit giai đoạn 5, xác nhận lịch sử qua `7690551` |

Loki không có host port; readiness đi qua Grafana datasource proxy có xác thực trong bộ nhớ. Cửa sổ xác nhận không có 5xx sau tái kiểm tra là **08:00:42.7451994Z–08:04:40.703Z ngày 16/10/2026** (15:00:42–15:04:40 giờ Việt Nam); kết quả không suy rộng ra lịch sử hoặc đảm bảo không gián đoạn lúc deploy. Dòng `/health` mới sau cutoff xuất hiện trong Loki trước khi truy vấn 5xx, tránh kết luận từ việc log chưa ingest.

## Danh mục 15 ảnh đã đối chiếu

| Ảnh | Nội dung |
| --- | --- |
| [website-dashboard.png](website/website-dashboard.png) | Trang tổng quan, số liệu 8 sinh viên/3 lớp/4 môn/12 điểm |
| [website-students.png](website/website-students.png) | Danh sách sinh viên và dữ liệu demo |
| [website-classes.png](website/website-classes.png) | Danh sách lớp |
| [website-subjects.png](website/website-subjects.png) | Danh sách môn học |
| [website-scores.png](website/website-scores.png) | Bảng điểm và tổng kết |
| [website-health.png](website/website-health.png) | JSON health status ok, database connected |
| [github-commit-history.png](website/github-commit-history.png) | Trang GitHub thật, lịch sử master trước commit giai đoạn 5 |
| [prometheus-targets.png](monitoring/prometheus-targets.png) | 6/6 targets UP |
| [container-web.png](monitoring/container-web.png) | Grafana CPU/RAM container, request, status và độ trễ có dữ liệu |
| [database-nginx.png](monitoring/database-nginx.png) | MySQL, kết nối, Nginx và targets có dữ liệu |
| [loki-datasource.png](logging/loki-datasource.png) | Datasource Loki provision, URL nội bộ và kiểm tra kết nối thành công |
| [explore-all.png](logging/explore-all.png) | `{project="student-management"}` trả log thật |
| [explore-health.png](logging/explore-health.png) | Truy vấn `GET /health` có status 200 |
| [explore-errors.png](logging/explore-errors.png) | Lọc HTTP 4xx/5xx hiển thị probe 404 an toàn |
| [explore-count.png](logging/explore-count.png) | `count_over_time` có dữ liệu số dương |

Các ảnh được chụp trực tiếp từ Chromium vào 08:02–08:03Z, không chỉnh sửa ảnh hoặc ghép dữ liệu giả. Giá trị counter/rate thay đổi theo traffic, không phải hằng số nghiệp vụ. Ảnh GitHub không khẳng định đã có commit giai đoạn 5 tại thời điểm chụp; hash mới và đối chiếu local/remote được báo sau commit/push.

Lần đầu phpMyAdmin HTTP vẫn 200 nhưng Docker healthcheck PHP `file_get_contents` không hoạt động vì `allow_url_fopen` đã tắt trong image. Đã đổi sang PHP cURL HEAD nội bộ, timeout 4 giây và yêu cầu status 200; giữ nguyên setting bị tắt. Đợt nghiệm thu sau sửa chạy build/up và toàn bộ 15 bước đạt. Monitoring chờ ba lượt scrape hữu hạn do p95/CPU metadata cần warm-up; transcript giữ cả các lần chờ.

## Phạm vi

Kiểm tra cấu hình và trạng thái container, user/capability/filesystem/tmpfs, cổng host, security headers, quyền MySQL tối thiểu, healthcheck; chạy lại syntax, unit, CRUD, proxy, monitoring và logging. Chụp website, Prometheus Targets, dashboard Grafana, datasource Loki và Explore. Giữ named volume và tên project; không dùng `down -v`, không tác động project khác.

## Tái tạo kiểm thử

Quy trình đầy đủ dùng baseline đã chụp trước thay đổi:

```powershell
npm run test:final
# Tùy chọn thêm ba nhóm chụp ảnh sau khi kiểm thử:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-final.ps1 -Capture
```

Runner chạy 15 bước mặc định, gồm Compose Ps cuối đợt, lưu trạng thái/timestamp/exit code trong `verification-summary.json`, transcript trong `checks/` và tự đặt đường dẫn evidence phase5. `-Capture` thêm ba bước, tổng 18. `-SkipBuild` chỉ dành tái kiểm tra stack vừa build. Không tự thay baseline để làm phép so sánh dữ liệu đạt. Lệnh tương đương từng nhóm và cách chụp riêng:

`baseline-data.json` gắn với nội dung database trước triển khai giai đoạn 5, gồm timestamp. Không bảo đảm hash khớp một database mới seed hoặc đã được sửa hợp lệ trong buổi demo. Không ghi đè minh chứng này để test đạt; phép so baseline của runner hiện dành cho database đã nghiệm thu. Nếu kiểm chứng database khác, lưu baseline/đợt kiểm tra độc lập trước thay đổi; các nhóm chức năng có thể chạy riêng như dưới đây.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps
npm run check
npm test
npm run test:integration
npm run test:proxy
$env:MONITORING_EVIDENCE_DIR = 'docs/evidence/phase5/monitoring'
npm run test:monitoring
node scripts/capture-monitoring-evidence.js
Remove-Item Env:\MONITORING_EVIDENCE_DIR
$env:LOGGING_EVIDENCE_DIR = 'docs/evidence/phase5/logging'
$env:LOGGING_EVIDENCE_PHASE = '5'
npm run test:logs
npm run capture:logs
Remove-Item Env:\LOGGING_EVIDENCE_DIR
Remove-Item Env:\LOGGING_EVIDENCE_PHASE
node scripts/capture-final-evidence.js
```

Các action Compose trên truyền file môi trường rỗng riêng để không tự đọc `.env`. `scripts/hardening-test.js` đã chạy đạt 7 nhóm, được runner gọi bằng `npm run test:hardening` với mốc `FINAL_VERIFY_STARTED_AT`; transcript nằm trong `checks/hardening.txt` và lần kiểm tra lại trong `checks/post-capture-hardening.txt`. Mật khẩu Grafana runtime chỉ dùng trong bộ nhớ của script, không truyền trong tham số lệnh hoặc lưu minh chứng.

## Giới hạn

Không cố ý tạo 5xx; kiểm tra lỗi LogQL bằng GET `/__loki_probe_404` trả 404. Kết quả không có 5xx chỉ áp dụng cửa sổ kiểm tra đã ghi. Retention cấu hình 168 giờ, xóa bất đồng bộ qua compactor; chưa quan sát đủ 7 ngày. Loki một node chưa HA, chưa backup/restore tự động. Promtail đã EOL; socket `:ro` không giới hạn quyền API Docker. Các ngoại lệ hardening được giải thích trong [báo cáo](../../../BAO_CAO.md) và [nhật ký kiểm tra](../../../KIEM_TRA.md).
