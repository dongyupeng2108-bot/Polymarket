# scripts/healthcheck_53121.ps1
# 必须使用 curl.exe 避免 PowerShell Alias 问题
$ErrorActionPreference = "Stop"

function Check-Endpoint ($path) {
    $url = "http://localhost:53121$path"
    Write-Host "Checking $url ..." -NoNewline
    try {
        # -f (fail), -s (silent), -o NUL (output null), -w (write code)
        $code = curl.exe -f -s -o NUL -w "%{http_code}" $url
        if ($code -eq "200") {
            Write-Host " OK ($code)" -ForegroundColor Green
        } else {
            Write-Host " FAIL ($code)" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host " ERROR (Connection Refused or Timeout)" -ForegroundColor Red
        exit 1
    }
}

Check-Endpoint "/"
Check-Endpoint "/pairs"

Write-Host "Healthcheck Passed." -ForegroundColor Green
exit 0
