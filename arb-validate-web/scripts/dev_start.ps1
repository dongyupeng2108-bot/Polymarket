# scripts/dev_start.ps1
# 一键启动脚本：清理端口、清理缓存、禁用Turbopack启动
# Usage: ./scripts/dev_start.ps1

$ErrorActionPreference = "Stop"
$port = 53121

Write-Host "=== [Step 1] Check & Kill Port $port ===" -ForegroundColor Cyan
try {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pidVal = $conn.OwningProcess
            Write-Host "Found process $pidVal on port $port. Killing..." -ForegroundColor Yellow
            Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "Port $port is free." -ForegroundColor Green
    }
} catch {
    Write-Host "Port check ignored (permission or no process)." -ForegroundColor Gray
}

Write-Host "=== [Step 2] Clean .next Cache ===" -ForegroundColor Cyan
# PowerShell 正确删除目录写法 (Remove-Item -Recurse -Force)
# 避免使用 rmdir /s /q (CMD写法在PS中报错)
if (Test-Path ".next") {
    Write-Host "Removing .next directory..."
    Remove-Item -Recurse -Force ".next"
    Write-Host ".next removed." -ForegroundColor Green
} else {
    Write-Host ".next does not exist. Skipping."
}

Write-Host "=== [Step 3] Start Server (Force Webpack) ===" -ForegroundColor Cyan
Write-Host "Setting NEXT_DISABLE_TURBOPACK=1 and using --webpack flag..."
$env:NEXT_DISABLE_TURBOPACK="1"

Write-Host "Running 'npm run dev'..."
# Use -- --webpack to pass the flag to the underlying next command
npm run dev -- --webpack
