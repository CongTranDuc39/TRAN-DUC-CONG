[CmdletBinding()]
param(
    [ValidateSet('Validate', 'Up', 'Ps', 'Start', 'Stop', 'Down', 'Login', 'GrafanaLogin')]
    [string]$Action = 'Up'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localDirectory = Join-Path $projectRoot '.local'
$credentialsPath = Join-Path $localDirectory 'credentials.xml'
$monitoringCredentialsPath = Join-Path $localDirectory 'monitoring-credentials.xml'
$secretsDirectory = Join-Path $localDirectory 'secrets'
$composeEnvFile = Join-Path $localDirectory 'empty.env'
$composeFile = Join-Path $projectRoot 'docker-compose.yml'
$projectName = 'qlsv-trancong'
$mysqlVolumeName = $projectName + '_mysql_data'
$grafanaVolumeName = $projectName + '_grafana_data'

function New-LocalCredential {
    param([string]$UserName, [switch]$Hex)

    $secretBytes = New-Object byte[] 32
    $secretRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $secretRng.GetBytes($secretBytes)
        $secretValue = if ($Hex) {
            ([BitConverter]::ToString($secretBytes)).Replace('-', '').ToLowerInvariant()
        } else {
            [Convert]::ToBase64String($secretBytes)
        }
        $secureValue = ConvertTo-SecureString -String $secretValue -AsPlainText -Force
        return [System.Management.Automation.PSCredential]::new($UserName, $secureValue)
    } finally {
        [Array]::Clear($secretBytes, 0, $secretBytes.Length)
        $secretValue = $null
        $secretRng.Dispose()
    }
}

function Assert-NoExistingGrafanaVolume {
    # Không thay mật khẩu đã được Grafana lưu trong volume hiện có.
    $savedErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $inspectOutput = & docker volume inspect $grafanaVolumeName --format '{{.Name}}' 2>&1
        $inspectExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorPreference
    }

    if ($inspectExitCode -eq 0) {
        throw "Volume $grafanaVolumeName đã tồn tại nhưng thiếu .local/monitoring-credentials.xml. Hãy khôi phục file bí mật bằng đúng tài khoản Windows đã tạo; script không đổi mật khẩu hoặc xóa dữ liệu."
    }
    if (($inspectOutput | Out-String) -notmatch 'no such volume') {
        throw 'Không thể kiểm tra volume Grafana. Hãy chạy Docker Desktop và kiểm tra quyền truy cập Docker trước khi thử lại; chưa tạo mật khẩu mới.'
    }
}

function Initialize-MonitoringSecrets {
    if (-not (Test-Path -LiteralPath $monitoringCredentialsPath -PathType Leaf)) {
        Assert-NoExistingGrafanaVolume
        $newMonitoringCredentials = [pscustomobject]@{
            FormatVersion = 1
            MySQLExporter = New-LocalCredential -UserName 'qlsv_exporter' -Hex
            Grafana = New-LocalCredential -UserName 'admin' -Hex
        }
        $newMonitoringCredentials | Export-Clixml -LiteralPath $monitoringCredentialsPath -Depth 5
        $newMonitoringCredentials = $null
        Write-Host 'Đã tạo mật khẩu giám sát ngẫu nhiên và lưu bằng DPAPI vào .local/monitoring-credentials.xml; không in mật khẩu.'
    }

    $monitoringCredentials = $null
    $rootPassword = $null
    $exporterPassword = $null
    $grafanaPassword = $null
    $exporterClientConfiguration = $null
    try {
        try {
            $monitoringCredentials = Import-Clixml -LiteralPath $monitoringCredentialsPath
            if ($monitoringCredentials.FormatVersion -ne 1 -or
                $monitoringCredentials.MySQLExporter -isnot [System.Management.Automation.PSCredential] -or
                $monitoringCredentials.Grafana -isnot [System.Management.Automation.PSCredential] -or
                $monitoringCredentials.MySQLExporter.UserName -ne 'qlsv_exporter' -or
                $monitoringCredentials.Grafana.UserName -ne 'admin') {
                throw 'Định dạng thông tin đăng nhập giám sát không hợp lệ.'
            }
            $exporterPassword = $monitoringCredentials.MySQLExporter.GetNetworkCredential().Password
            $grafanaPassword = $monitoringCredentials.Grafana.GetNetworkCredential().Password
            if ($exporterPassword -notmatch '^[0-9a-f]{64}$' -or $grafanaPassword -notmatch '^[0-9a-f]{64}$') {
                throw 'Định dạng mật khẩu giám sát không hợp lệ.'
            }
        } catch {
            throw 'Không đọc được .local/monitoring-credentials.xml. Hãy dùng đúng tài khoản Windows và máy đã tạo file; không xóa file hoặc tạo mật khẩu mới cho volume hiện có.'
        }

        New-Item -ItemType Directory -Path $secretsDirectory -Force | Out-Null
        $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
        $rootPassword = $credentials.Root.GetNetworkCredential().Password
        $exporterClientConfiguration = "[client]`nuser=qlsv_exporter`npassword=$exporterPassword`nhost=db`nport=3306`n"
        [System.IO.File]::WriteAllText((Join-Path $secretsDirectory 'mysql-root-password.txt'), $rootPassword, $utf8WithoutBom)
        [System.IO.File]::WriteAllText((Join-Path $secretsDirectory 'mysql-exporter-password.txt'), $exporterPassword, $utf8WithoutBom)
        [System.IO.File]::WriteAllText((Join-Path $secretsDirectory 'mysql-exporter.cnf'), $exporterClientConfiguration, $utf8WithoutBom)
        [System.IO.File]::WriteAllText((Join-Path $secretsDirectory 'grafana-admin-password.txt'), $grafanaPassword, $utf8WithoutBom)
    } finally {
        $monitoringCredentials = $null
        $rootPassword = $null
        $exporterPassword = $null
        $grafanaPassword = $null
        $exporterClientConfiguration = $null
    }
}

function Assert-NoExistingMysqlVolume {
    # Không tạo mật khẩu mới cho dữ liệu đã được khởi tạo bằng mật khẩu khác.
    $savedErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $inspectOutput = & docker volume inspect $mysqlVolumeName --format '{{.Name}}' 2>&1
        $inspectExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorPreference
    }

    if ($inspectExitCode -eq 0) {
        throw "Volume $mysqlVolumeName đã tồn tại nhưng thiếu .local/credentials.xml. Hãy khôi phục file bí mật bằng đúng tài khoản Windows đã tạo, hoặc sử dụng mật khẩu hiện có bằng các lệnh Compose thủ công. Script không đổi mật khẩu hoặc xóa dữ liệu."
    }
    if (($inspectOutput | Out-String) -notmatch 'no such volume') {
        throw 'Không thể kiểm tra volume MySQL. Hãy chạy Docker Desktop và kiểm tra quyền truy cập Docker trước khi thử lại; chưa tạo mật khẩu mới.'
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Script này dùng DPAPI của Windows. Hãy chạy bằng Windows PowerShell với tài khoản Windows đang dùng.'
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Không tìm thấy Docker. Hãy cài và khởi động Docker Desktop trước khi chạy script.'
}

if (-not (Test-Path -LiteralPath $credentialsPath -PathType Leaf)) {
    Assert-NoExistingMysqlVolume
    New-Item -ItemType Directory -Path $localDirectory -Force | Out-Null
    $newCredentials = [pscustomobject]@{
        FormatVersion = 1
        Database = New-LocalCredential -UserName 'qlsv_app'
        Root = New-LocalCredential -UserName 'root'
    }
    $newCredentials | Export-Clixml -LiteralPath $credentialsPath -Depth 5
    $newCredentials = $null
    Write-Host 'Đã tạo mật khẩu ngẫu nhiên và lưu bằng DPAPI vào .local/credentials.xml; không in mật khẩu.'
}

try {
    $credentials = Import-Clixml -LiteralPath $credentialsPath
    if ($credentials.FormatVersion -ne 1 -or
        $credentials.Database -isnot [System.Management.Automation.PSCredential] -or
        $credentials.Root -isnot [System.Management.Automation.PSCredential] -or
        $credentials.Database.UserName -ne 'qlsv_app' -or
        $credentials.Root.UserName -ne 'root') {
        throw 'Định dạng thông tin đăng nhập không hợp lệ.'
    }
} catch {
    throw 'Không đọc được .local/credentials.xml. Hãy dùng đúng tài khoản Windows và máy đã tạo file; không xóa file hoặc tạo mật khẩu mới cho volume hiện có.'
}

if ($Action -eq 'Login') {
    $applicationPassword = $null
    try {
        $applicationPassword = $credentials.Database.GetNetworkCredential().Password
        Set-Clipboard -Value $applicationPassword
        Write-Host 'Tài khoản phpMyAdmin: qlsv_app. Mật khẩu đã được sao chép vào clipboard; hãy dán vào ô mật khẩu.'
        Write-Host 'Đang mở http://localhost:5056. Sau khi đăng nhập, hãy xóa nội dung clipboard nếu cần.'
        Start-Process -FilePath 'http://localhost:5056'
    } finally {
        $applicationPassword = $null
        $credentials = $null
    }
    return
}

Initialize-MonitoringSecrets

if ($Action -eq 'GrafanaLogin') {
    $grafanaCredentials = $null
    $grafanaPassword = $null
    try {
        $grafanaCredentials = Import-Clixml -LiteralPath $monitoringCredentialsPath
        $grafanaPassword = $grafanaCredentials.Grafana.GetNetworkCredential().Password
        Set-Clipboard -Value $grafanaPassword
        Write-Host 'Tài khoản Grafana: admin. Mật khẩu đã được sao chép vào clipboard; hãy dán vào ô mật khẩu.'
        Write-Host 'Đang mở http://localhost:3001. Sau khi đăng nhập, hãy xóa nội dung clipboard nếu cần.'
        Start-Process -FilePath 'http://localhost:3001'
    } finally {
        $grafanaCredentials = $null
        $grafanaPassword = $null
        $credentials = $null
    }
    return
}

# Chỉ truyền file rỗng được quản lý riêng; Docker Compose không đọc file .env.
[System.IO.File]::WriteAllText($composeEnvFile, [string]::Empty)
$environmentKeys = @('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'COMPOSE_ENV_FILES')
$originalEnvironment = @{}
foreach ($environmentKey in $environmentKeys) {
    $originalEnvironment[$environmentKey] = [Environment]::GetEnvironmentVariable($environmentKey, 'Process')
}

$locationChanged = $false
try {
    [Environment]::SetEnvironmentVariable('DB_NAME', 'qlsv', 'Process')
    [Environment]::SetEnvironmentVariable('DB_USER', 'qlsv_app', 'Process')
    [Environment]::SetEnvironmentVariable('DB_PASSWORD', $credentials.Database.GetNetworkCredential().Password, 'Process')
    [Environment]::SetEnvironmentVariable('MYSQL_ROOT_PASSWORD', $credentials.Root.GetNetworkCredential().Password, 'Process')
    [Environment]::SetEnvironmentVariable('COMPOSE_ENV_FILES', $null, 'Process')

    $composeArguments = @(switch ($Action) {
        'Validate' { @('config', '--quiet') }
        'Up' { @('up', '-d', '--build') }
        'Ps' { @('ps') }
        'Start' { @('start') }
        'Stop' { @('stop') }
        'Down' { @('down') }
    })

    Push-Location -LiteralPath $projectRoot
    $locationChanged = $true
    $savedErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker compose --env-file $composeEnvFile --project-name $projectName --file $composeFile @composeArguments
        $composeExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedErrorPreference
    }
    if ($composeExitCode -ne 0) {
        throw "Docker Compose thất bại, mã thoát $composeExitCode. Kiểm tra Docker Desktop và thông báo phía trên."
    }
} finally {
    foreach ($environmentKey in $environmentKeys) {
        [Environment]::SetEnvironmentVariable($environmentKey, $originalEnvironment[$environmentKey], 'Process')
    }
    if ($locationChanged) {
        Pop-Location
    }
    $credentials = $null
}
