const fs = require('fs');
const path = require('path');

const inv = JSON.parse(fs.readFileSync(path.join(__dirname, 'feature-inventory.json'), 'utf8'));

console.log('Total endpoints:', inv.apiEndpoints.length);
fs.writeFileSync(
  path.join(__dirname, 'all-endpoints-list.txt'),
  inv.apiEndpoints.map(e => `${e.method.padEnd(7)} ${e.path.padEnd(65)} [${e.module}] (Roles: ${e.roles})`).join('\n')
);
console.log('Saved detailed list to scripts/all-endpoints-list.txt');
