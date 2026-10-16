[CmdletBinding()]
param([switch]$SkipBuild, [switch]$Capture)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidenceDirectory = Join-Path $projectRoot 'docs/evidence/phase5'
$checksDirectory = Join-Path $evidenceDirectory 'checks'
$utf8 = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $checksDirectory -Force | Out-Null
$results = [Collections.Generic.List[object]]::new()

function Invoke-Verification {
    param([string]$Name, [string]$Program, [string[]]$Arguments)
    Write-Host "Running $Name"
    $stepStarted = [DateTime]::UtcNow
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $lines = @(& $Program @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $stepExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    $lines | ForEach-Object { Write-Host $_ }
    $transcript = (($lines | ForEach-Object { $_.TrimEnd() }) -join "`n").TrimEnd()
    [IO.File]::WriteAllText((Join-Path $checksDirectory ($Name + '.txt')), $(if ($transcript) { $transcript + "`n" } else { [string]::Empty }), $utf8)
    $results.Add([pscustomobject]@{ name=$Name; command=($Program + ' ' + ($Arguments -join ' ')); startedAt=$stepStarted.ToString('o'); completedAt=[DateTime]::UtcNow.ToString('o'); exitCode=$stepExitCode })
    if ($stepExitCode -ne 0) { throw "$Name failed with exit code $stepExitCode. See docs/evidence/phase5/checks/$Name.txt" }
}

$variableNames = @('MONITORING_EVIDENCE_DIR','MONITORING_EVIDENCE_PHASE','LOGGING_EVIDENCE_DIR','LOGGING_EVIDENCE_PHASE','FINAL_EVIDENCE_DIR','FINAL_VERIFY_STARTED_AT')
$savedVariables = @{}
foreach($name in $variableNames) { $savedVariables[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$passed = $false
$verificationStarted = [DateTime]::UtcNow
Push-Location -LiteralPath $projectRoot
try {
    $baseline = Join-Path $evidenceDirectory 'baseline-data.json'
    if (-not (Test-Path -LiteralPath $baseline -PathType Leaf)) { throw 'Capture a pre-deployment data baseline first; do not invent or replace it after making changes.' }
    $env:MONITORING_EVIDENCE_DIR='docs/evidence/phase5/monitoring'
    $env:MONITORING_EVIDENCE_PHASE='5'
    $env:LOGGING_EVIDENCE_DIR='docs/evidence/phase5/logging'
    $env:LOGGING_EVIDENCE_PHASE='5'
    $env:FINAL_EVIDENCE_DIR='docs/evidence/phase5/website'
    Invoke-Verification 'compose-config' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/local-stack.ps1','-Action','Validate')
    if (-not $SkipBuild) { Invoke-Verification 'compose-up' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/local-stack.ps1','-Action','Up') }
    Invoke-Verification 'compose-ps' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/local-stack.ps1','-Action','Ps')
    Copy-Item -LiteralPath (Join-Path $checksDirectory 'compose-ps.txt') -Destination (Join-Path $evidenceDirectory 'compose-ps.txt')
    # Availability during deployment is not an acceptance window. Begin after startup.
    $env:FINAL_VERIFY_STARTED_AT=[DateTime]::UtcNow.ToString('o')
    Invoke-Verification 'javascript-syntax' 'npm.cmd' @('run','check')
    Invoke-Verification 'unit-tests' 'npm.cmd' @('test')
    Invoke-Verification 'nginx-config' 'docker' @('exec','qlsv-trancong-nginx-1','nginx','-t')
    Invoke-Verification 'prometheus-config' 'docker' @('exec','qlsv-trancong-prometheus-1','promtool','check','config','/etc/prometheus/prometheus.yml')
    Invoke-Verification 'loki-config' 'docker' @('exec','qlsv-trancong-loki-1','/usr/bin/loki','-config.file=/etc/loki/loki.yml','-verify-config=true')
    Invoke-Verification 'promtail-config' 'docker' @('exec','qlsv-trancong-promtail-1','/usr/bin/promtail','-config.file=/etc/promtail/promtail.yml','-check-syntax')
    Invoke-Verification 'crud-integration' 'npm.cmd' @('run','test:integration')
    Invoke-Verification 'nginx-proxy' 'npm.cmd' @('run','test:proxy')
    Invoke-Verification 'monitoring' 'npm.cmd' @('run','test:monitoring')
    Invoke-Verification 'logging' 'npm.cmd' @('run','test:logs')
    Invoke-Verification 'hardening' 'npm.cmd' @('run','test:hardening')
    Invoke-Verification 'compose-ps-final' 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/local-stack.ps1','-Action','Ps')
    Copy-Item -LiteralPath (Join-Path $checksDirectory 'compose-ps-final.txt') -Destination (Join-Path $evidenceDirectory 'compose-ps.txt')
    if ($Capture) {
        Invoke-Verification 'capture-monitoring' 'npm.cmd' @('run','capture:monitoring')
        Invoke-Verification 'capture-logging' 'npm.cmd' @('run','capture:logs')
        Invoke-Verification 'capture-website' 'npm.cmd' @('run','capture:final')
    }
    $passed=$true
} finally {
    $summary=[pscustomobject]@{ phase=5; passed=$passed; startedAt=$verificationStarted.ToString('o'); completedAt=[DateTime]::UtcNow.ToString('o'); acceptanceWindowStart=$env:FINAL_VERIFY_STARTED_AT; skippedBuild=[bool]$SkipBuild; capturesRequested=[bool]$Capture; steps=@($results.ToArray()) }
    [IO.File]::WriteAllText((Join-Path $evidenceDirectory 'verification-summary.json'), ($summary | ConvertTo-Json -Depth 8)+"`n",$utf8)
    foreach($name in $variableNames) { [Environment]::SetEnvironmentVariable($name,$savedVariables[$name],'Process') }
    Pop-Location
}
Write-Host 'PASS final verification; evidence saved to docs/evidence/phase5/'
