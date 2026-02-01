
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const FILE_TO_WATCH = path.join(__dirname, 'INSTRUCTION.md');

console.log(`[Watcher] Starting...`);
console.log(`[Watcher] Monitoring: ${FILE_TO_WATCH}`);
console.log(`[Watcher] Whenever you save this file, I will auto-copy its content to your clipboard.`);

// Create file if not exists
if (!fs.existsSync(FILE_TO_WATCH)) {
    fs.writeFileSync(FILE_TO_WATCH, 'Paste ChatGPT instructions here and save.', 'utf-8');
}

let lastMd5 = '';

function copyToClipboard(text: string) {
    const proc = spawn('powershell', ['Set-Clipboard', '-Value', `"${text.replace(/"/g, '`"')}"`]);
    proc.on('close', (code) => {
        if (code === 0) {
            console.log(`[Watcher] ✅ Content copied to clipboard! Just Ctrl+V in Trae.`);
            // Beep sound (Windows)
            process.stdout.write('\x07');
        }
    });
}

fs.watchFile(FILE_TO_WATCH, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        console.log(`[Watcher] 📝 File changed detected.`);
        try {
            const content = fs.readFileSync(FILE_TO_WATCH, 'utf-8');
            if (content.trim().length > 0) {
                // Use a simpler clipboard command for large text safety
                // We pipe it to clip.exe which is standard on Windows
                const child = spawn('clip');
                child.stdin.write(content);
                child.stdin.end();
                
                console.log(`[Watcher] ✅ Instructions copied! (${content.length} chars)`);
                console.log(`[Watcher] 👉 Go to Trae and paste.`);
            }
        } catch (e) {
            console.error(`[Watcher] Error reading file:`, e);
        }
    }
});
