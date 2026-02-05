
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function fetchWithPowerShell(url: string) {
    try {
        const cmd = `powershell -Command "Invoke-RestMethod -Uri '${url}' | ConvertTo-Json -Depth 10"`;
        const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 }); 
        return JSON.parse(stdout);
    } catch (e: any) {
        throw new Error(`PowerShell fetch failed: ${e.message}`);
    }
}
