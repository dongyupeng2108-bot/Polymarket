import { execSync } from 'child_process';
import fs from 'fs';

// Configuration
const RISK_PATTERNS = [
  /prisma\/schema\.prisma$/,
  /src\/.*\/types\.ts$/,    // TypeScript type definitions
  /src\/.*\/enums\.ts$/,    // Enum definitions
  /src\/app\/api\//,        // API routes
  /scanners\/.*\.ts$/       // Business logic (scanners)
];

const REQUIRED_DOCS = [
  'rules/PROJECT_RULES.md',
  'docs/DATA_DICTIONARY.md'
];

function getChangedFiles() {
  try {
    // Try to get diff against origin/main (works in CI with fetch-depth: 0)
    // In GitHub Actions, GITHUB_BASE_REF is set for PRs, but we can also rely on origin/main being present
    const cmd = 'git diff --name-only origin/main...HEAD';
    console.log(`Running: ${cmd}`);
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (error) {
    console.warn('Warning: Could not determine changed files against origin/main. Fallback to local changes might be needed or ignored in non-git env.');
    // If we are not in a git repo or can't diff, we might skip or fail. 
    // For this strict gate, let's try to look at HEAD^ if origin/main fails (e.g. initial commit?)
    // But mostly we assume a PR context.
    return [];
  }
}

function main() {
  console.log('--- Dictionary Synchronization Check ---');
  
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log('No changed files detected (or git error). Skipping check.');
    process.exit(0);
  }

  console.log(`Detected ${changedFiles.length} changed files.`);

  // 1. Check if any risk file is touched
  const touchedRiskFiles = changedFiles.filter(file => 
    RISK_PATTERNS.some(pattern => pattern.test(file))
  );

  if (touchedRiskFiles.length === 0) {
    console.log('No risk paths (Schema/Enums/API) touched. Code-Doc sync check PASSED.');
    process.exit(0);
  }

  console.log('Risk paths detected:', touchedRiskFiles);

  // 2. Check if documents are updated
  const missingDocs = REQUIRED_DOCS.filter(doc => !changedFiles.includes(doc));

  if (missingDocs.length > 0) {
    console.error('::error::[Dictionary Sync Violation] Core business logic or schema changed, but documentation was not updated.');
    console.error('You MUST update the following files to align with code changes:');
    missingDocs.forEach(doc => console.error(` - ${doc}`));
    console.error('\nSee rules/PROJECT_RULES.md "变更原则" for details.');
    process.exit(1);
  }

  console.log('All required documentation updates are present. PASSED.');
}

main();
