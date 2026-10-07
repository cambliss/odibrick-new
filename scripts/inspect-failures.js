const fs = require('fs');
const path = require('path');

const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'functional-test-results.json'), 'utf8'));
const failures = results.filter(r => r.status !== 'PASS');

console.log(`=== FOUND ${failures.length} FAILED / NON-PASS TESTS ===\n`);
failures.forEach((f, idx) => {
  console.log(`[${idx + 1}] ID: ${f.id} | Role: ${f.role} | Module: ${f.module}`);
  console.log(`    Feature: ${f.feature}`);
  console.log(`    Action: ${f.action}`);
  console.log(`    Expected: ${f.expected}`);
  console.log(`    Actual: ${f.actual}`);
  console.log(`    API: ${f.api}`);
  console.log(`    HTTP Status: ${f.httpStatus}`);
  console.log(`    Error Details:`, f.errorDetails);
  console.log('----------------------------------------------------');
});
