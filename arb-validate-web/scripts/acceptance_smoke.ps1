# scripts/acceptance_smoke.ps1
# GatePack M2.4: 最短主路径 E2E 冒烟测试
# 目标: 快速验证核心功能 (Health, Scan, Add, Delete)
# 限制: 运行时长 < 60s, Fail-Fast

$ErrorActionPreference = "Stop"
$StartTime = Get-Date
$TimeoutSec = 60

function Check-Timeout {
    $Elapsed = (Get-Date) - $StartTime
    if ($Elapsed.TotalSeconds -gt $TimeoutSec) {
        Write-Host "TIMEOUT: Test exceeded ${TimeoutSec}s" -ForegroundColor Red
        exit 1
    }
}

function Fail-Test ($msg) {
    Write-Host "FAIL: $msg" -ForegroundColor Red
    exit 1
}

function Assert-Http200 ($url, $label) {
    Check-Timeout
    $ts = (Get-Date).ToString("HH:mm:ss")
    Write-Host "[$ts] Checking $label ($url)..." -NoNewline
    try {
        # Use 127.0.0.1 to avoid localhost DNS lag
        $url = $url -replace "localhost", "127.0.0.1"
        # -m 10: max time 10s
        $code = curl.exe -m 10 -s -o NUL -w "%{http_code}" $url
        if ($code -eq "200") {
            Write-Host " PASS ($code)" -ForegroundColor Green
        } else {
            Write-Host " FAIL ($code)" -ForegroundColor Red
            # Try to get more info
            $verbose = curl.exe -m 5 -v $url 2>&1 | Out-String
            Write-Host "DEBUG INFO:"
            Write-Host $verbose
            Fail-Test "$label returned $code"
        }
    } catch {
        $err = $_
        Fail-Test "Exception checking $label : $err"
    }
}

function Get-PairCount {
    Check-Timeout
    $ts = (Get-Date).ToString("HH:mm:ss")
    $url = "http://127.0.0.1:53121/api/pairs"
    $tempFile = "smoke_temp.json"
    Write-Host "[$ts] Get-PairCount..." -NoNewline
    try {
        if (Test-Path $tempFile) { Remove-Item $tempFile }
        # -m 10: max time 10s
        curl.exe -m 10 -s -o $tempFile $url
        if (-not (Test-Path $tempFile)) { Fail-Test "File not created" }
        $len = (Get-Item $tempFile).Length
        if ($len -eq 0) { 
            Write-Host " Empty Response" -ForegroundColor Yellow
            return 0 
        }
        
        $jsonContent = Get-Content $tempFile -Raw -Encoding UTF8
        $data = $jsonContent | ConvertFrom-Json
        Write-Host " Done ($($data.Count))" -ForegroundColor Green
        return $data.Count
    } catch {
        Write-Host " Error" -ForegroundColor Red
        Write-Host "Exception: $_"
        Fail-Test "Failed to get pair count"
    } finally {
        if (Test-Path $tempFile) { Remove-Item $tempFile }
    }
}

# Wrapper to safely get int count (handling potential pipeline garbage)
function Get-SafePairCount {
    $res = Get-PairCount
    # If array, take last element which should be the return value
    if ($res -is [array]) {
        return [int]($res | Select-Object -Last 1)
    }
    return [int]$res
}


Write-Host "=== GatePack Smoke Test (Limit ${TimeoutSec}s) ===" -ForegroundColor Cyan

# 1. Healthcheck
Assert-Http200 "http://localhost:53121/" "Root Page"
Assert-Http200 "http://localhost:53121/pairs" "Pairs Page"

# 2. Get Initial Count
$InitialCount = Get-SafePairCount
Write-Host "Initial Pair Count: $InitialCount"

# 3. Test Scan (Trigger Only)
$ScanUrl = "http://127.0.0.1:53121/api/pairs/auto-match/stream?limit=5"
Assert-Http200 $ScanUrl "Scan Trigger"

# 4. Test Add (POST)
Write-Host "Testing Add Pair..." -NoNewline
$NewPairTitle = "SmokeTest_$(Get-Random)"
$Body = @{
    title_pm = "${NewPairTitle}_PM"
    title_kh = "${NewPairTitle}_KH"
    status   = "unverified"
} | ConvertTo-Json -Compress
# Escape quotes for cmd/curl if necessary, but writing to temp file is safer for curl -d @file
$BodyFile = "$env:TEMP\smoke_body.json"
$Body | Set-Content $BodyFile -Encoding UTF8

$AddUrl = "http://127.0.0.1:53121/api/pairs"
try {
    # -d @file automatically sets content-type to application/x-www-form-urlencoded if not specified? 
    # Better specify header.
    $ResultJson = curl.exe -s -X POST -H "Content-Type: application/json" -d "@$BodyFile" $AddUrl
    $NewPair = $ResultJson | ConvertFrom-Json
    if ($NewPair.id) {
        Write-Host " PASS (ID: $($NewPair.id))" -ForegroundColor Green
        $CreatedId = $NewPair.id
    } else {
        Write-Host " FAIL (No ID returned)" -ForegroundColor Red
        Write-Host $ResultJson
        exit 1
    }
} catch {
    Fail-Test "Add Pair failed: $_"
}

# Verify Count Increased
$AfterAddCount = Get-SafePairCount
Write-Host "DEBUG: Initial=$InitialCount, AfterAdd=$AfterAddCount"
if ($AfterAddCount -le $InitialCount) {
    Fail-Test "Count did not increase after ADD (Old: $InitialCount, New: $AfterAddCount)"
} else {
    Write-Host "Count check passed: $InitialCount -> $AfterAddCount" -ForegroundColor Green
}

# 5. Test Delete (DELETE)
Write-Host "Testing Delete Pair #$CreatedId..." -NoNewline
$DeleteUrl = "http://127.0.0.1:53121/api/pairs/$CreatedId"
try {
    # -m 10: max time 10s
    $code = curl.exe -m 10 -s -o NUL -w "%{http_code}" -X DELETE $DeleteUrl
    if ($code -eq "200") {
        Write-Host " PASS" -ForegroundColor Green
    } else {
        Fail-Test "Delete failed with code $code"
    }
} catch {
    Fail-Test "Exception during delete: $_"
}

# Verify Count Decreased (Soft Delete logic: getPairs filters deleted_at != null)
$FinalCount = Get-SafePairCount
if ($FinalCount -ge $AfterAddCount) {
    Fail-Test "Count did not decrease after DELETE (AfterAdd: $AfterAddCount, Final: $FinalCount)"
} else {
    Write-Host "Count check passed: $AfterAddCount -> $FinalCount" -ForegroundColor Green
}

# Cleanup
if (Test-Path $BodyFile) { Remove-Item $BodyFile }

$Duration = (Get-Date) - $StartTime
Write-Host "=== Smoke Test Passed in $($Duration.TotalSeconds.ToString("F2"))s ===" -ForegroundColor Green
exit 0
