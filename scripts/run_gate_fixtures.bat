@echo off
echo Running Gate Light Fixtures (Requires Conftest)...
where conftest >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARN] Conftest not found in PATH. Please install it to run tests.
    echo See https://www.openpolicyagent.org/docs/latest/conftest/
    exit /b 1
)

echo.
echo [1/4] Testing Good Minimal (Expect PASS)
conftest test rules/gates/fixtures/good_minimal.json -p rules/gates/rego
if %errorlevel% neq 0 echo [FAIL] good_minimal.json failed!

echo.
echo [2/4] Testing Bad HC (Expect FAIL)
conftest test rules/gates/fixtures/bad_hc_missing_endpoint.json -p rules/gates/rego
if %errorlevel% equ 0 echo [FAIL] bad_hc_missing_endpoint.json PASSED (Should FAIL)!

echo.
echo [3/4] Testing Bad Index (Expect FAIL)
conftest test rules/gates/fixtures/bad_index_size0_or_badsha.json -p rules/gates/rego
if %errorlevel% equ 0 echo [FAIL] bad_index_size0_or_badsha.json PASSED (Should FAIL)!

echo.
echo [4/4] Testing Bad Wording (Expect FAIL)
conftest test rules/gates/fixtures/bad_forbidden_wording.json -p rules/gates/rego
if %errorlevel% equ 0 echo [FAIL] bad_forbidden_wording.json PASSED (Should FAIL)!

echo.
echo Done.
