# Hệ thống quản lý sinh viên — Giai đoạn 1

Ứng dụng Express.js, EJS, MySQL và mysql2 với giao diện tiếng Việt, chạy bằng Docker Compose. phpMyAdmin hỗ trợ xem dữ liệu và thao tác cơ sở dữ liệu khi demo.

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

Phạm vi giai đoạn 1 không gồm Nginx, Prometheus, Grafana, Loki, Promtail. Dự án không thực hiện push GitHub.

## Yêu cầu

- Docker Desktop đã chạy, bật Linux containers và có Docker Compose v2.
- Cổng `8082` và `5056` đang trống.
- Node.js 24 và npm chỉ cần nếu chạy kiểm tra bằng npm trực tiếp trên máy.

MySQL không mở cổng ra máy chủ. Website và phpMyAdmin chỉ bind `127.0.0.1`, dành cho demo trên máy cá nhân. Giai đoạn này chưa có đăng nhập và phân quyền, vì vậy không dùng để triển khai công khai hoặc lưu hồ sơ sinh viên thật.

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

`.env.example` chỉ chứa giá trị mẫu. Bạn có thể tự tạo file `.env` cục bộ dựa trên mẫu và tự điền hai mật khẩu riêng, đủ dài vào `DB_PASSWORD` và `MYSQL_ROOT_PASSWORD`. Không sử dụng nguyên giá trị placeholder. `.gitignore` và `.dockerignore` loại trừ `.env`; không commit mật khẩu thật hoặc đưa chúng vào báo cáo.

Hoặc đặt biến môi trường trong cửa sổ PowerShell hiện tại bằng lệnh dưới đây. Các lệnh này không đọc, sửa hay in file `.env`, không in mật khẩu và chỉ tạo mật khẩu ngẫu nhiên cho lần triển khai cục bộ này:

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

Tại thư mục dự án, sau khi đã chuẩn bị biến môi trường hoặc cấu hình cục bộ:

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Lần đầu cần tải image, cài dependencies và khởi tạo MySQL. Đợi `db` và `app` báo `healthy` trước khi demo.

- Website: <http://localhost:8082>
- Kiểm tra ứng dụng và MySQL: <http://localhost:8082/health>
- phpMyAdmin: <http://localhost:5056>

Đăng nhập phpMyAdmin bằng tài khoản `DB_USER` (mặc định `qlsv_app`) cùng mật khẩu ứng dụng đã tự đặt. Server MySQL đã được cấu hình là `db`. Không cần dùng tài khoản root để demo dữ liệu.

Nếu Docker Desktop cảnh báo cổng đang được dùng, dừng ứng dụng đang chiếm cổng rồi chạy lại. Không đổi cổng ngầm vì đề tài yêu cầu `8082` và `5056`.

## Kiểm tra

```powershell
npm ci
npm run check
npm test
docker compose config --quiet
docker compose up -d --build
docker compose ps
npm run test:integration
Invoke-WebRequest -Uri 'http://localhost:8082/health' -UseBasicParsing
Invoke-WebRequest -Uri 'http://localhost:5056/' -UseBasicParsing
```

`npm run check` kiểm tra cú pháp JavaScript. `npm test` kiểm tra các quy tắc dữ liệu và tính điểm. Kiểm tra tích hợp cần website đang chạy tại `http://localhost:8082`; kiểm tra có thể tạo dữ liệu tạm và dọn dữ liệu đó sau khi hoàn thành.

Healthcheck MySQL đăng nhập bằng tài khoản ứng dụng qua TCP và chạy `SELECT 1`, vì vậy kiểm tra được cả thông tin xác thực và cơ sở dữ liệu đích. Healthcheck ứng dụng gọi `/health` có giới hạn thời gian; endpoint này cũng thực hiện truy vấn MySQL. `depends_on` đợi MySQL healthy trước khi chạy website và phpMyAdmin. Cả ba service có `restart: unless-stopped`.

Xem nhật ký phục vụ chẩn đoán, không chia sẻ thông tin bí mật trong nhật ký:

```powershell
docker compose logs --tail=80 app db phpmyadmin
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
docker compose stop
docker compose start
```

Hoặc gỡ container và mạng, vẫn giữ dữ liệu:

```powershell
docker compose down
docker compose up -d
```

Chỉ khi chủ động muốn **xóa toàn bộ dữ liệu MySQL của dự án và nạp lại seed**, tự chạy các lệnh sau. Hành động này không thể hoàn tác nếu chưa sao lưu:

```powershell
docker compose down --volumes
docker compose up -d --build
```

## Cấu trúc chính

```text
app.js                  Khởi tạo Express và các route
Dockerfile              Image Node.js 24 Alpine, chạy bằng user node
docker-compose.yml      App, MySQL 8.4, phpMyAdmin
.env.example            Mẫu biến môi trường, không có mật khẩu thật
database/init.sql       Schema, ràng buộc và dữ liệu demo
scripts/local-stack.ps1 Quản lý stack Windows, giữ mật khẩu bằng DPAPI
views/                  Các trang EJS tiếng Việt
public/                 CSS và tài nguyên tĩnh
src/                    Route, kết nối MySQL, truy vấn và kiểm tra dữ liệu
scripts/                Kiểm tra cú pháp, kiểm thử tích hợp, chạy local Windows
tests/                  Kiểm thử quy tắc nhập liệu và tính điểm
README.md               Hướng dẫn chạy và kiểm tra
KIEM_TRA.md              Báo cáo lệnh và kết quả kiểm tra thực tế
```
