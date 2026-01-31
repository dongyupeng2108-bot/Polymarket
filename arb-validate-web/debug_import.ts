
import path from 'path';
import fs from 'fs';

// Load .env manually
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            process.env[key] = value;
        }
    });
}

async function main() {
  try {
    console.log('Importing db...');
    const db = await import('./src/lib/db');
    console.log('DB imported');
    
    console.log('Importing kalshi...');
    const k = await import('./src/lib/adapters/kalshi');
    console.log('Kalshi imported');
    
    console.log('Importing polymarket...');
    const p = await import('./src/lib/adapters/polymarket');
    console.log('Polymarket imported');

  } catch (e) {
    console.error('Error:', e);
  }
}
main();
