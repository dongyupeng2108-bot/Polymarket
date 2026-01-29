#!/usr/bin/env node
// scripts/gate_light.mjs
// Force CI update
import fs from 'fs';
import path from 'path';
import process from 'process';

const root = process.cwd();
const abs = (p) => path.join(root, p);
const errors = [];

function mustExist(relPath, description) {
  if (!fs.existsSync(abs(relPath))) {
    errors.push(`${description} missing: ${relPath}`);
  }
}

function validateJSON(relPath) {
  const p = abs(relPath);
  if (!fs.existsSync(p)) {
    errors.push(`File not found: ${relPath}`);
    return;
  }
  try {
    const content = fs.readFileSync(p, 'utf8');
    JSON.parse(content);
  } catch (e) {
    errors.push(`Invalid JSON in ${relPath}: ${e.message}`);
  }
}

console.log('Gate Light: basic repository checks...');

// Structure checks
mustExist('rules/gates/rego', 'Rules directory');
mustExist('rules/gates/fixtures', 'Fixtures directory');

// Syntax checks for a few expected fixtures
validateJSON('rules/gates/fixtures/good_minimal.json');
validateJSON('rules/gates/fixtures/bad_hc_missing_endpoint.json');

// Optional: check for .rego files exist in the rego dir
try {
  const regoDir = abs('rules/gates/rego');
  if (fs.existsSync(regoDir)) {
    const regoFiles = fs.readdirSync(regoDir).filter(f => f.endsWith('.rego'));
    if (regoFiles.length === 0) {
      errors.push('No .rego files found in rules/gates/rego');
    }
  }
} catch (e) {
  errors.push(`Error reading rego dir: ${e.message}`);
}

// Basic secret leak heuristic (example)
const leakPatterns = [/API_KEY/i, /SECRET/i, /PASSWORD/i];
// Only scan known safe directories to avoid noise/performance issues
const scanPaths = ['.github/workflows', 'scripts', 'rules']; 
for (const sp of scanPaths) {
  const p = abs(sp);
  if (!fs.existsSync(p)) continue;
  
  // Recursive scan helper could be here, but let's stick to top-level or specific depth for safety
  // For now, let's just scan files in these directories (non-recursive for simplicity unless needed)
  // Actually, let's do a simple recursive walk for these specific paths if they are dirs
  
  const walk = (dir) => {
      let results = [];
      try {
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) { 
                results = results.concat(walk(file));
            } else { 
                results.push(file);
            }
        });
      } catch(e) {
          // ignore access errors
      }
      return results;
  }

  const files = fs.statSync(p).isDirectory() ? walk(p) : [p];
  
  for (const f of files) {
      // Skip binary/large files if needed, but for text scripts/rules it's fine
      try {
        const content = fs.readFileSync(f, 'utf8');
        for (const pat of leakPatterns) {
            if (pat.test(content)) {
                // False positive reduction: if the line is "secret: true" or similar, maybe ignore?
                // But for now, just report
                // errors.push(`Potential secret pattern (${pat}) in ${path.relative(root, f)}`);
                // Actually, let's be careful not to fail on our own script mentioning SECRET
                if (f.endsWith('gate_light.mjs')) continue; 
                errors.push(`Potential secret pattern (${pat}) in ${path.relative(root, f)}`);
            }
        }
      } catch (e) {}
  }
}

if (errors.length) {
  console.error('Gate Light found problems:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('Gate Light: all checks passed.');
process.exit(0);
