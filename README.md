# Hệ thống quản lý sinh viên — Giai đoạn 2

Ứng dụng Express.js, EJS, MySQL và mysql2 với giao diện tiếng Việt, chạy bằng Docker Compose. Giai đoạn 2 bổ sung Nginx reverse proxy và các header bảo mật. phpMyAdmin hỗ trợ xem dữ liệu và thao tác cơ sở dữ liệu khi demo.

| Thông tin | Nội dung |
| --- | --- |
| Sinh viên | Trần Đức Công |
| MSSV | DTC245200418 |
| Lớp | CNTT K23I |
| Trường | Đại học Công nghệ Thông tin và Truyền thông |
| Giảng viên | Lê Khánh Dương |

## Chức năng

- Dashboard đếm sinh viên, lớp, môn học và bản ghi điểm.
- Thêm, xem, sửa, xóa lớp học, sinh viên, môn học và điểm số.
- Gán sinh viên vào lớp hoặc để chưa xếp lớp.
- Gán điểm theo sinh viên, môn học, học kỳ và năm học.
- Tìm kiếm, lọc dữ liệu và kiểm tra dữ liệu đầu vào.
- Tính điểm tổng kết môn học và điểm trung bình theo số tín chỉ.
- Endpoint `/health` kiểm tra kết nối MySQL bằng `SELECT 1`.

Giai đoạn 2 giữ toàn bộ CRUD và dữ liệu của giai đoạn 1; chưa triển khai Prometheus, Grafana, Loki hoặc Promtail.

## Nginx reverse proxy

```text
Trình duyệt http://localhost:8082 → nginx:80 → app:3000 → db:3306
phpMyAdmin http://localhost:5056 → phpmyadmin:80 → db:3306
```

Chỉ service `nginx` publish cổng website `127.0.0.1:8082:80`. Service Express tên `app` chỉ expose cổng nội bộ `3000`, không publish cổng ra host. Nginx gọi `app:3000` qua DNS của Docker; cấu hình upstream tự cập nhật địa chỉ khi container `app` được tạo lại. MySQL và volume `mysql_data` giữ nguyên.

Cấu hình trong `nginx/default.conf`:

| Header trả về | Giá trị |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

Các header được thêm với `always`, áp dụng cả phản hồi lỗi. Nginx ẩn bốn header tương ứng từ Express để mỗi header chỉ có một giá trị. CSP của ứng dụng dùng `frame-ancestors 'none'` để thống nhất với `X-Frame-Options: DENY`; các bảo vệ Helmet khác được giữ nguyên. Nginx giới hạn request body ở `32k` và ẩn số phiên bản trong header `Server`.

Nginx truyền `Host` giữ cả cổng truy cập, `X-Real-IP` bằng địa chỉ kết nối đến Nginx, `X-Forwarded-For` bằng địa chỉ đó và `X-Forwarded-Proto` bằng giao thức của request. Đây là proxy biên duy nhất nên `X-Forwarded-For` do client tự gửi bị ghi đè để tránh giả mạo. Express tiếp tục tắt `trust proxy`; chưa có chức năng cần tin các header này để xác định IP hoặc giao thức.

Access log theo JSON được ghi ra stdout, error log ra stderr, sẵn sàng cho giai đoạn thu thập log sau. Access log dùng đường dẫn không kèm query string để giảm ghi lại dữ liệu tìm kiếm. Chưa cấu hình HTTPS, đăng nhập hoặc phân quyền trong giai đoạn này.

## Yêu cầu

- Docker Desktop đã chạy, bật Linux containers và có Docker Compose v2.
- Cổng `8082` và `5056` đang trống.
- Node.js 24 và npm chỉ cần nếu chạy kiểm tra bằng npm trực tiếp trên máy.

MySQL và Express không mở cổng ra máy chủ. Nginx và phpMyAdmin chỉ bind `127.0.0.1`, dành cho demo trên máy cá nhân.

## Cấu hình mật khẩu

### Cách thuận tiện trên Windows, không dùng file `.env`

Script `scripts/local-stack.ps1` tự tạo hai mật khẩu ngẫu nhiên, lưu dưới dạng `PSCredential` trong `.local/credentials.xml` bằng DPAPI của Windows. File chỉ giải mã được bởi **cùng tài khoản Windows trên cùng máy**; `.local/` bị loại khỏi Git và Docker build. Script truyền một file rỗng riêng `.local/empty.env` cho Compose, không đọc, sửa hoặc in file `.env`. Biến môi trường chỉ được đặt trong tiến trình đang chạy và được khôi phục khi script kết thúc.

Chạy Docker Desktop rồi mở Windows PowerShell tại thư mục dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps
```

`Up` tương ứng `docker compose up -d --build`; `Validate` tương ứng `docker compose config --quiet`. Mặc định khi không truyền `-Action` là `Up`. Cả hai cách chạy thủ công và script dùng project `qlsv-trancong`, cơ sở dữ liệu `qlsv`, tài khoản `qlsv_app`.

Để đăng nhập phpMyAdmin, tự chạy lệnh sau. Script mở trình duyệt và sao chép mật khẩu ứng dụng vào clipboard; chỉ in tên tài khoản `qlsv_app`. Hãy dán mật khẩu vào màn hình đăng nhập, rồi xóa nội dung clipboard nếu cần.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Login
```

Các thao tác vòng đời giữ nguyên mật khẩu đã tạo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Stop
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Start
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Down
```

`Down` chỉ gỡ container và mạng, giữ volume. Script không cung cấp thao tác xóa volume. Giữ `.local/credentials.xml` để chạy lại sau này. Nếu volume MySQL đã tồn tại nhưng thiếu file này, script dừng để tránh tạo mật khẩu không khớp; hãy khôi phục file bí mật trên đúng tài khoản/máy, hoặc dùng thông tin đăng nhập hiện có với lệnh Compose thủ công. Nếu chuyển máy, hãy chủ động sao lưu dữ liệu và quản lý thông tin đăng nhập theo cách phù hợp; sao chép file XML sang máy/tài khoản khác không cho phép giải mã.

### Cấu hình thủ công nếu không dùng script

`.env.example` mô tả các biến cần thiết và chỉ chứa giá trị mẫu. Không sử dụng nguyên giá trị placeholder. `.gitignore` và `.dockerignore` loại trừ `.env`; không commit mật khẩu thật hoặc đưa chúng vào báo cáo. Quy trình dưới đây dùng biến môi trường và một file rỗng riêng, không cần đọc, in hoặc sửa `.env`.

Với lần khởi tạo mới, đặt biến môi trường trong cửa sổ PowerShell hiện tại bằng lệnh dưới đây. Các lệnh này không in mật khẩu và chỉ tạo mật khẩu ngẫu nhiên cho lần triển khai cục bộ này. Nếu đang dùng volume hiện có, hãy lấy lại thông tin đăng nhập tương ứng từ nơi quản lý bí mật thay cho việc tạo mật khẩu mới:

```powershell
function New-DemoSecret {
    $secretBytes = New-Object byte[] 32
    $secretRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $secretRng.GetBytes($secretBytes)
        [Convert]::ToBase64String($secretBytes)
    } finally {
        $secretRng.Dispose()
    }
}
$env:DB_NAME = 'qlsv'
$env:DB_USER = 'qlsv_app'
$env:DB_PASSWORD = New-DemoSecret
$env:MYSQL_ROOT_PASSWORD = New-DemoSecret
```

Hãy lưu mật khẩu vào nơi quản lý bí mật phù hợp nếu cần dùng lại dữ liệu sau khi đóng cửa sổ terminal. MySQL lưu tài khoản trong volume; đổi các biến môi trường sau lần khởi tạo đầu tiên không tự đổi mật khẩu tài khoản đã có. Nếu đã có volume, dùng lại thông tin khởi tạo của volume đó.

## Khởi chạy

Tại thư mục dự án, dùng script Windows đã giới thiệu ở trên:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps
```

Nếu cấu hình biến môi trường thủ công, tạo file rỗng riêng rồi chỉ định rõ cho Compose, tránh việc tự động đọc `.env`:

```powershell
New-Item -ItemType Directory -Path .local -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path (Get-Location) '.local/empty.env'), [string]::Empty)
docker compose --env-file .local/empty.env --project-name qlsv-trancong config --quiet
docker compose --env-file .local/empty.env --project-name qlsv-trancong up -d --build
docker compose --env-file .local/empty.env --project-name qlsv-trancong ps
```

Lần đầu cần tải image, cài dependencies và khởi tạo MySQL. Đợi `db`, `app` và `nginx` báo `healthy` trước khi demo. `Dockerfile` của Express giữ nguyên, dùng Node.js 24 Alpine và chạy bằng user `node`.

- Website qua Nginx: <http://localhost:8082>
- Kiểm tra Nginx, ứng dụng và MySQL: <http://localhost:8082/health>
- phpMyAdmin: <http://localhost:5056>

Đăng nhập phpMyAdmin bằng tài khoản `DB_USER` (mặc định `qlsv_app`) cùng mật khẩu ứng dụng đã tự đặt. Server MySQL đã được cấu hình là `db`. Không cần dùng tài khoản root để demo dữ liệu.

Nếu Docker Desktop cảnh báo cổng đang được dùng, dừng ứng dụng đang chiếm cổng rồi chạy lại. Không đổi cổng ngầm vì đề tài yêu cầu `8082` và `5056`.

## Kiểm tra

```powershell
npm ci
npm run check
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Validate
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Ps
docker exec qlsv-trancong-nginx-1 nginx -t
npm run test:integration
npm run test:proxy
curl.exe --fail --silent --show-error http://localhost:8082/health
curl.exe --silent --show-error --head http://localhost:8082/
curl.exe --fail --silent --show-error --output NUL --write-out 'phpMyAdmin HTTP %{http_code}' http://localhost:5056/
```

`npm run check` kiểm tra cú pháp JavaScript. `npm test` kiểm tra các quy tắc dữ liệu và tính điểm. `npm run test:integration` kiểm tra CRUD, gán lớp, gán điểm, tìm kiếm, lọc và xác thực qua `http://localhost:8082`; dữ liệu tạm được dọn sau khi hoàn thành. `npm run test:proxy` kiểm tra các header bảo mật, CSP, phản hồi `200/404/403/413` và CSS qua Nginx, không tạo dữ liệu. Lệnh `curl.exe --head` phải hiển thị đủ bốn header trong bảng trên, đặc biệt ba header `X-Content-Type-Options`, `X-Frame-Options` và `Referrer-Policy`.

Healthcheck MySQL đăng nhập bằng tài khoản ứng dụng qua TCP và chạy `SELECT 1`, vì vậy kiểm tra được cả thông tin xác thực và cơ sở dữ liệu đích. Healthcheck ứng dụng gọi `/health` có giới hạn thời gian; endpoint này cũng thực hiện truy vấn MySQL. Healthcheck Nginx dùng `wget` gọi `http://127.0.0.1/health` bên trong container và đi qua proxy tới Express/MySQL. `depends_on` đợi MySQL healthy trước khi chạy ứng dụng và phpMyAdmin, rồi đợi ứng dụng healthy trước khi chạy Nginx. Cả bốn service có `restart: unless-stopped`.

Xem nhật ký phục vụ chẩn đoán, không chia sẻ thông tin bí mật trong nhật ký:

```powershell
docker logs --tail=80 qlsv-trancong-nginx-1
docker logs --tail=80 qlsv-trancong-app-1
docker logs --tail=80 qlsv-trancong-db-1
docker logs --tail=80 qlsv-trancong-phpmyadmin-1
```

## Dữ liệu và cách tính điểm

`database/init.sql` tạo 4 bảng sử dụng InnoDB và `utf8mb4`:

| Bảng | Nội dung và ràng buộc chính |
| --- | --- |
| `classes` | Mã lớp duy nhất, tên lớp, niên khóa |
| `students` | MSSV duy nhất, email duy nhất nếu có, lớp có thể để trống |
| `subjects` | Mã môn duy nhất, số tín chỉ từ 1 đến 10 |
| `scores` | Điểm thành phần từ 0 đến 10; duy nhất theo sinh viên, môn, học kỳ, năm học |

Dữ liệu mẫu có 3 lớp, 8 sinh viên, 4 môn học và 12 bản ghi điểm. Bản ghi Trần Đức Công có MSSV `DTC245200418`; các thông tin liên hệ và dữ liệu sinh viên khác là minh họa. Miền email `example.test` dùng cho dữ liệu demo.

Điểm tổng kết môn được MySQL tự tính và lưu trong cột generated `total_score`:

```text
Điểm tổng kết = ROUND(chuyên cần × 10% + giữa kỳ × 30% + cuối kỳ × 60%, 2)
Điểm trung bình = ROUND(Σ(điểm tổng kết × số tín chỉ) / Σ(số tín chỉ), 2)
```

Điểm trung bình chỉ dùng các bản ghi điểm hiện có trong phạm vi hiển thị/lọc; chưa có quy tắc chọn lần thi cao nhất hay xử lý học lại. Cùng một môn có thể xuất hiện ở các kỳ/năm khác nhau và được tính theo từng bản ghi. Sinh viên chưa có điểm hiển thị chưa có dữ liệu, không xem là điểm 0. Mốc đạt phục vụ demo là điểm tổng kết từ 5,0; đây không phải quy chế đào tạo chính thức của trường.

Khóa ngoại đều dùng `RESTRICT`: không xóa lớp đang có sinh viên, sinh viên đang có điểm, hoặc môn đang có điểm. Hãy chuyển sinh viên ra khỏi lớp hoặc xóa bản ghi phụ thuộc trước. Các mã không được trùng; không nhập trùng bộ sinh viên/môn/học kỳ/năm học.

Script khởi tạo chỉ chạy khi volume MySQL còn trống. Sửa `init.sql` rồi khởi động lại không tự thay đổi dữ liệu đang có. Named volume `mysql_data` giữ dữ liệu khi khởi động lại container.

## Dừng và chạy lại

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Stop
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Start
```

Hoặc gỡ container và mạng, vẫn giữ dữ liệu:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Down
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-stack.ps1 -Action Up
```

Chỉ khi chủ động muốn **xóa toàn bộ dữ liệu MySQL của dự án và nạp lại seed**, tự chạy các lệnh sau. Hành động này không thể hoàn tác nếu chưa sao lưu:

```powershell
docker compose --env-file .local/empty.env --project-name qlsv-trancong down --volumes
docker compose --env-file .local/empty.env --project-name qlsv-trancong up -d --build
```

## Cấu trúc chính

```text
app.js                  Khởi tạo Express và các route
Dockerfile              Image Node.js 24 Alpine, chạy bằng user node
docker-compose.yml      Nginx, app nội bộ, MySQL 8.4, phpMyAdmin
nginx/default.conf      Reverse proxy, security headers, log stdout/stderr
.env.example            Mẫu biến môi trường, không có mật khẩu thật
database/init.sql       Schema, ràng buộc và dữ liệu demo
scripts/local-stack.ps1 Quản lý stack Windows, giữ mật khẩu bằng DPAPI
views/                  Các trang EJS tiếng Việt
public/                 CSS và tài nguyên tĩnh
src/                    Route, kết nối MySQL, truy vấn và kiểm tra dữ liệu
scripts/proxy-test.js   Kiểm tra bảo mật và phản hồi qua Nginx
scripts/                Kiểm tra cú pháp, kiểm thử tích hợp, chạy local Windows
tests/                  Kiểm thử quy tắc nhập liệu và tính điểm
README.md               Hướng dẫn chạy và kiểm tra
KIEM_TRA.md              Báo cáo lệnh và kết quả kiểm tra thực tế
```
