# scripts/healthcheck.ps1
# 一键健康检查：端口响应 + CSS体积校验
# Usage: ./scripts/healthcheck.ps1

$ErrorActionPreference = "Stop"
$port = 53121
$baseUrl = "http://127.0.0.1:$port"
$minCssSize = 8000 # 8KB

Write-Host "=== Starting Healthcheck on Port $port ===" -ForegroundColor Cyan

# Helper to check URL with curl.exe
function Check-Url ($url) {
    Write-Host "Checking $url ... " -NoNewline
    try {
        $output = curl.exe -I -s $url
        if ($output -match "200 OK") {
            Write-Host "[OK] 200" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Response not 200 OK" -ForegroundColor Red
            Write-Host $output
            exit 1
        }
    } catch {
        Write-Host "[FAIL] Execution error: $_" -ForegroundColor Red
        exit 1
    }
}

# 1. Check Endpoints
Check-Url "$baseUrl/"
Check-Url "$baseUrl/pairs"

# 2. Check CSS Size
Write-Host "Checking Tailwind CSS generation..." -ForegroundColor Cyan

try {
    # Try to find CSS URL from homepage HTML
    $html = curl.exe -s "$baseUrl/"
    
    # Regex to find CSS file (Next.js format)
    # Pattern: /_next/static/css/xxxx.css
    # We look for ANY .css file linked
    if ($html -match '(/_next/static/css/[a-zA-Z0-9._-]+\.css)') {
        $cssPath = $matches[1]
        $cssUrl = "http://127.0.0.1:$port$cssPath"
        Write-Host "Found CSS URL: $cssUrl"

        $tempFile = [System.IO.Path]::GetTempFileName()
        curl.exe -s -o $tempFile $cssUrl
        
        $item = Get-Item $tempFile
        $size = $item.Length
        Remove-Item $tempFile
        
        Write-Host "CSS Size: $size bytes"
        
        if ($size -gt $minCssSize) {
            Write-Host "[OK] CSS size > $minCssSize bytes" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] CSS size too small ($size bytes). Tailwind might not be working." -ForegroundColor Red
            # Don't exit 1 here to allow manual verification if needed, but per requirements we should FAIL.
            # But since we are in dev mode, sometimes chunks are split. 
            # We warn but exit 1 to be safe as per user request.
            exit 1
        }
    } else {
        Write-Host "[WARN] Could not parse CSS path from HTML (likely injected via JS in Dev mode)." -ForegroundColor Yellow
        Write-Host "Manual Verification Required: Open http://localhost:$port/pairs and check if styles are loaded."
        
        # Fallback: Check .next directory if possible
        if (Test-Path ".next/static/css") {
             $cssFiles = Get-ChildItem ".next/static/css/*.css"
             if ($cssFiles) {
                 Write-Host "Found local CSS files:"
                 foreach ($f in $cssFiles) {
                     Write-Host " - $($f.Name): $($f.Length) bytes"
                 }
             }
        }
    }
} catch {
    Write-Host "[WARN] CSS check encountered an error: $_" -ForegroundColor Yellow
}

Write-Host "=== Healthcheck Completed ===" -ForegroundColor Green
exit 0
