import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function main() {
  const reportDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  console.log('Checking Health...');
  
  try {
    const rootRes = await fetchWithTimeout('http://localhost:53121/');
    const rootText = `GET / -> ${rootRes.status} ${rootRes.statusText}`;
    fs.writeFileSync(path.join(reportDir, 'healthcheck_root.txt'), rootText);
    console.log(rootText);

    const pairsRes = await fetchWithTimeout('http://localhost:53121/pairs');
    const pairsText = `GET /pairs -> ${pairsRes.status} ${pairsRes.statusText}`;
    fs.writeFileSync(path.join(reportDir, 'healthcheck_pairs.txt'), pairsText);
    console.log(pairsText);
    
    // Also write to root healthcheck_53121.txt as per requirement
    const combined = `${rootText}\n${pairsText}`;
    fs.writeFileSync(path.join(process.cwd(), 'healthcheck_53121.txt'), combined);

  } catch (e: any) {
    console.error('Healthcheck failed:', e);
    // Write failure to files so we know it ran but failed
    fs.writeFileSync(path.join(reportDir, 'healthcheck_root.txt'), `FAILED: ${e.message}`);
    fs.writeFileSync(path.join(reportDir, 'healthcheck_pairs.txt'), `FAILED: ${e.message}`);
    process.exit(1);
  }
}

main();
