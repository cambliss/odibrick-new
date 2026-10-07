const fs = require('fs');
const path = require('path');

function scanDirectory(dir, filter) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(scanDirectory(fullPath, filter));
    } else if (filter(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

// 1. Scan API Controllers
const apiDir = path.join(__dirname, '..', 'apps', 'api', 'src', 'modules');
const controllerFiles = scanDirectory(apiDir, (p) => p.endsWith('.controller.ts'));

const apiEndpoints = [];
for (const file of controllerFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const moduleName = path.basename(path.dirname(file));
  const controllerMatch = content.match(/@Controller\((['"`])(.*)\1\)/);
  const basePath = controllerMatch ? controllerMatch[2] : '';

  // Match method decorators like @Get, @Post, @Patch, @Delete, @Put
  const methodRegex = /@(Get|Post|Patch|Put|Delete)\s*\(\s*(['"`])?(.*?)\2?\s*\)[\s\S]*?(?:@Roles\s*\((.*?)\))?[\s\S]*?(?:@RequirePermissions\s*\((.*?)\))?[\s\S]*?(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/g;
  
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const httpMethod = match[1].toUpperCase();
    const subPath = match[3] || '';
    const fullPath = ('/api/' + basePath + '/' + subPath).replace(/\/+/g, '/').replace(/\/$/, '');
    const roles = match[4] ? match[4].replace(/['"`\s]/g, '') : 'AUTHENTICATED';
    const permissions = match[5] ? match[5].replace(/['"`\s]/g, '') : 'NONE';
    const methodName = match[6];
    
    apiEndpoints.push({
      module: moduleName,
      file: path.relative(path.join(__dirname, '..'), file),
      method: httpMethod,
      path: fullPath,
      roles,
      permissions,
      handler: methodName,
    });
  }
}

// 2. Scan Web Routes
const webAppDir = path.join(__dirname, '..', 'apps', 'web', 'app');
const pageFiles = scanDirectory(webAppDir, (p) => p.endsWith('page.tsx'));

const webPages = [];
for (const file of pageFiles) {
  let relative = path.relative(webAppDir, file).replace(/\\/g, '/');
  let route = '/' + relative.replace(/\/page\.tsx$/, '').replace(/^page\.tsx$/, '');
  route = route.replace(/\/+/g, '/');
  webPages.push({
    route,
    file: path.relative(path.join(__dirname, '..'), file),
  });
}

console.log(`Discovered ${apiEndpoints.length} API controller endpoints across ${controllerFiles.length} controllers.`);
console.log(`Discovered ${webPages.length} frontend page routes.`);

fs.writeFileSync(
  path.join(__dirname, '..', 'scripts', 'feature-inventory.json'),
  JSON.stringify({ apiEndpoints, webPages }, null, 2)
);
console.log('Saved inventory to scripts/feature-inventory.json');
