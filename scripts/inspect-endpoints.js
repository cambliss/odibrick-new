const fs = require('fs');
const path = require('path');

const inv = JSON.parse(fs.readFileSync(path.join(__dirname, 'feature-inventory.json'), 'utf8'));
console.log('Total API Endpoints:', inv.apiEndpoints.length);

const grouped = {};
for (const ep of inv.apiEndpoints) {
  if (!grouped[ep.module]) grouped[ep.module] = [];
  grouped[ep.module].push(`${ep.method} ${ep.path} (Roles: ${ep.roles}, Perms: ${ep.permissions})`);
}

for (const [mod, list] of Object.entries(grouped)) {
  console.log(`\n=== MODULE: ${mod} (${list.length} endpoints) ===`);
  list.forEach(item => console.log('  ' + item));
}
