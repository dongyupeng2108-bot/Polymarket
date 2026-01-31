$ErrorActionPreference = "Stop"

function Check-Url ($url) {
    Write-Host "Checking $url ..." -NoNewline
    try {
        # explicit use of curl.exe to bypass PowerShell alias
        $output = & curl.exe -I -s $url 2>&1
        
        if ($LASTEXITCODE -ne 0) { 
            Write-Host " [FAIL] curl.exe exit code $LASTEXITCODE" -ForegroundColor Red
            exit 1 
        }
        
        # Check for 200 OK (HTTP/1.1 or HTTP/2)
        if ($output -match "200 OK") {
            Write-Host " [OK] 200" -ForegroundColor Green
        } else {
            Write-Host " [FAIL] Non-200 Response" -ForegroundColor Red
            Write-Host "Raw Output:"
            Write-Host $output
            exit 1
        }
    } catch {
        Write-Host " [ERROR] Exception" -ForegroundColor Red
        Write-Host $_
        exit 1
    }
}

Write-Host "Starting Healthcheck on Port 53121..."
Check-Url "http://127.0.0.1:53121/"
Check-Url "http://127.0.0.1:53121/pairs"

Write-Host "All Checks Passed." -ForegroundColor Green
exit 0
