# Trae Environment Tips & Troubleshooting

## 1. PowerShell Curl Alias Trap
**Problem**: In Trae's PowerShell terminal, `curl` is an alias for `Invoke-WebRequest`. 
Running `curl -I http://...` often fails or hangs because PowerShell expects `-Uri` parameter or misinterprets flags.

**Symptoms**:
- Command hangs with no output.
- Prompt appears asking for "Uri".
- Error: "The request was aborted: The connection was closed unexpectedly."

**Solution**:
1. **Always use `curl.exe`**: This forces Windows to use the actual curl executable.
   ```powershell
   curl.exe -I http://127.0.0.1:53121/
   ```
2. **Use the Healthcheck Script**:
   We have provided a safe, non-interactive script:
   ```powershell
   ./scripts/healthcheck_53121.ps1
   ```
3. **Avoid Chaining**: Do not use `;` to chain curl commands in the terminal as it can cause parsing issues.

## 2. Port Standard
- All local development servers for `arb-validate-web` must run on port **53121**.
