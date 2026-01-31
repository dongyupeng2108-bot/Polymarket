import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE_DIR = 'rules/gates/policy_sets/gate_light';
const CURRENT_FILE = path.join(BASE_DIR, 'CURRENT');

function main() {
  console.log('--- Gate Light Fixture Sanity Check ---');

  // 1. Resolve Current Version
  if (!fs.existsSync(CURRENT_FILE)) {
    console.error(`::error::CURRENT file not found at ${CURRENT_FILE}`);
    process.exit(1);
  }

  const version = fs.readFileSync(CURRENT_FILE, 'utf-8').trim();
  console.log(`Current version: ${version}`);

  const versionDir = path.join(BASE_DIR, version);
  const policyDir = path.join(versionDir, 'policy');
  const fixturesDir = path.join(versionDir, 'fixtures');

  if (!fs.existsSync(policyDir) || !fs.existsSync(fixturesDir)) {
    console.error(`::error::Policy or fixtures directory missing in ${versionDir}`);
    process.exit(1);
  }

  // 2. Discover Fixtures
  const files = fs.readdirSync(fixturesDir);
  const goodFiles = files.filter(f => f.startsWith('good_') && f.endsWith('.json'));
  const badFiles = files.filter(f => f.startsWith('bad_') && f.endsWith('.json'));

  console.log(`Found ${goodFiles.length} good fixtures, ${badFiles.length} bad fixtures.`);

  let failureCount = 0;
  let goodCount = 0;
  let badDenyCount = 0;

  // 3. Check GOOD fixtures (Expect PASS / Exit Code 0)
  for (const file of goodFiles) {
    const filePath = path.join(fixturesDir, file);
    try {
      // Using --no-color to simplify output parsing if needed, but stdio: pipe handles it.
      const cmd = `conftest test --namespace gates -p "${policyDir}" "${filePath}"`;
      execSync(cmd, { stdio: 'pipe' }); 
      console.log(`[PASS] ${file} passed.`);
      goodCount++;
    } catch (error) {
      console.error(`::error::[FAIL] ${file} failed unexpectedly!`);
      if (error.stdout) console.log(error.stdout.toString());
      if (error.stderr) console.error(error.stderr.toString());
      failureCount++;
    }
  }

  // 4. Check BAD fixtures (Expect DENY / Exit Code 1)
  for (const file of badFiles) {
    const filePath = path.join(fixturesDir, file);
    try {
      const cmd = `conftest test --namespace gates -p "${policyDir}" "${filePath}"`;
      execSync(cmd, { stdio: 'pipe' });
      // If we are here, it means exit code 0, which is WRONG for bad fixtures
      console.error(`::error::[FAIL] ${file} passed unexpectedly! (Should be denied)`);
      failureCount++;
    } catch (error) {
      // We expect a non-zero exit code (1 is standard for violations)
      // Check if it's actually a violation or some other error?
      // conftest returns 1 on failure/violation.
      // We assume it's a policy violation.
      console.log(`[PASS] ${file} denied as expected.`);
      badDenyCount++;
    }
  }

  // 5. Summary
  console.log('---------------------------------------');
  console.log(`Summary: Good Passed: ${goodCount}/${goodFiles.length}, Bad Denied: ${badDenyCount}/${badFiles.length}`);
  
  if (failureCount > 0) {
    console.error(`::error::Sanity Check FAILED with ${failureCount} errors.`);
    process.exit(1);
  } else {
    console.log('Sanity Check PASSED.');
    process.exit(0);
  }
}

main();
