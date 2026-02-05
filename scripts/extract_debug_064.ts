
import fs from 'fs';

const files = [
    'sse_capture_auto_limit50_064.out',
    'sse_capture_topic_aligned_limit50_064.out'
];

const output = 'ui_copy_details_completed_064.json';

let finalDebug: any = {};

files.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`Processing ${file}...`);
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        let lastDebug = null;
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.substring(6));
                    if (data.debug) {
                        lastDebug = data.debug;
                    }
                } catch (e) {}
            }
        }
        
        if (lastDebug) {
            console.log(`Found debug in ${file}:`);
            console.log(`- universe_auto_switched: ${lastDebug.universe_auto_switched}`);
            console.log(`- from_mode -> to_mode: ${lastDebug.from_mode} -> ${lastDebug.to_mode}`);
            console.log(`- domain_mismatch_guess:`, JSON.stringify(lastDebug.domain_mismatch_guess));
            console.log(`- pm_keywords_used (top 5):`, (lastDebug.pm_keywords_used || []).slice(0, 5));
            console.log(`- kh_prefix_counts_top10:`, JSON.stringify(lastDebug.kh_prefix_counts_top10));
            console.log(`- candidate_count: ${lastDebug.candidate_count}`);
            
            if (file.includes('auto')) {
                finalDebug = lastDebug;
            }
        }
    } else {
        console.log(`${file} not found.`);
    }
});

fs.writeFileSync(output, JSON.stringify(finalDebug, null, 2));
console.log(`Saved ${output}`);
