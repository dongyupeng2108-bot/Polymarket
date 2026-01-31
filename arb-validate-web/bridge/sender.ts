
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usage: 
// 1. Send File: npx tsx bridge/sender.ts <file_path>
// 2. Send Text: npx tsx bridge/sender.ts --text "Hello ChatGPT"

const args = process.argv.slice(2);

(async () => {
    let content = '';
    let sourcePath = '';

    if (args[0] === '--text') {
        content = args[1];
        console.log(`[Sender] Mode: Text Message`);
    } else {
        const filePath = args[0];
        if (!filePath) {
            console.error(`[Sender] Error: Please provide a file path or use --text "message"`);
            process.exit(1);
        }
        const absPath = path.resolve(filePath);
        if (!fs.existsSync(absPath)) {
            console.error(`[Sender] File not found: ${absPath}`);
            process.exit(1);
        }
        sourcePath = absPath;
        try {
            content = fs.readFileSync(absPath, 'utf-8');
            console.log(`[Sender] Mode: File (${absPath})`);

            // === Protocol v3.7 Validation ===
            if (path.basename(absPath).startsWith('notify_')) {
                const requiredMarkers = ['RESULT_READY', 'RESULT_JSON', 'LOG_HEAD', 'LOG_TAIL', 'INDEX'];
                const missing = requiredMarkers.filter(m => !content.includes(m));
                
                if (missing.length > 0) {
                    console.error(`\n[Sender] 🛑 FATAL: Protocol v3.7 Violation!`);
                    console.error(`[Sender] The notify file is missing required envelopes: ${missing.join(', ')}`);
                    console.error(`[Sender] Refusing to send invalid payload.`);
                    console.error(`[Sender] Please ensure you are using 'finalize_task_v3.4.mjs' (v3.7 patched).`);
                    process.exit(1);
                }
                console.log(`[Sender] ✅ Protocol v3.7 Validation Passed (Full Envelope).`);
            }
            // ================================

        } catch (e) {
            console.error(`[Sender] Failed to read file:`, e);
            process.exit(1);
        }
    }

    // 1. Copy to Clipboard
    await new Promise<void>((resolve, reject) => {
        try {
            const child = spawn('clip');
            child.stdin.write(content);
            child.stdin.end();
            child.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Sender] ✅ Content copied to clipboard.`);
                    resolve();
                } else {
                    console.error(`[Sender] Clip exited with code ${code}`);
                    reject(new Error(`Clip failed with code ${code}`));
                }
            });
            child.on('error', (err) => {
                console.error(`[Sender] Failed to spawn clip:`, err);
                reject(err);
            });
        } catch (e) {
            console.error(`[Sender] Failed to copy to clipboard:`, e);
            reject(e);
        }
    });

    // 2. Trigger External Automation (upload_hook)
    // Priority:
    // 1. CHATGPT_UPLOAD_SCRIPT env var
    // 2. upload_hook.exe (User compiled script)
    // 3. upload.ahk (AutoHotkey script)
    // 4. upload.ps1 (PowerShell fallback)

    const hookExe = path.join(__dirname, 'upload_hook.exe');
    const hookAhk = path.join(__dirname, 'upload.ahk');
    const hookPs1 = path.join(__dirname, 'upload.ps1');
    const customHook = process.env.CHATGPT_UPLOAD_SCRIPT;

    let targetScript = customHook;
    let scriptType = 'exe'; // exe, ahk, ps1

    if (!targetScript) {
        if (fs.existsSync(hookExe)) {
            targetScript = hookExe;
            scriptType = 'exe';
        } else if (fs.existsSync(hookAhk)) {
            targetScript = hookAhk;
            scriptType = 'ahk';
        } else if (fs.existsSync(hookPs1)) {
            targetScript = hookPs1;
            scriptType = 'ps1';
        }
    }

    if (targetScript) {
        console.log(`[Sender] 🚀 Triggering automation: ${targetScript} (${scriptType})`);
        
        let cmd = '';
        if (scriptType === 'ps1') {
            const keyword = process.env.CHATGPT_WINDOW_TITLE || "套利项目";
            // Pass the keyword as argument, ensure quoting
            cmd = `powershell -ExecutionPolicy Bypass -File "${targetScript}" -BaseKeyword "${keyword}"`;
        } else if (scriptType === 'ahk') {
            // Assume .ahk is associated, or use start
            cmd = `start "" "${targetScript}"`;
        } else {
            // exe or custom
            cmd = `"${targetScript}" "${sourcePath}"`;
        }
        
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.log(`[Sender] Automation triggered (Status: ${err.code}).`);
                console.log(`[Sender] Stdout:`, stdout);
                console.log(`[Sender] Stderr:`, stderr);
            } else {
                console.log(`[Sender] Automation output:`, stdout);
            }
        });
    } else {
        console.log(`[Sender] ℹ️ No 'upload_hook.exe' or 'upload.ahk' found in bridge/.`);
        console.log(`[Sender] content is in clipboard. Please paste manually.`);
    }

})().catch(err => {
    console.error(err);
    process.exit(1);
});
