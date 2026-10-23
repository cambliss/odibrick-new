const http = require('http');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runSmokeTests() {
  console.log('============================================================');
  console.log('ODIBRICK — NEXT.JS 15.5.28 RUNTIME SMOKE TEST SUITE');
  console.log('Testing Web (http://localhost:3000) & API (http://localhost:4000)');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  [PASS]', message);
      passed++;
    } else {
      console.error('  [FAIL]', message);
      failed++;
    }
  }

  try {
    // Test 1: API Health directly
    console.log('--- 1. Testing API Health & Web Proxy Rewrites ---');
    const apiHealth = await request('http://127.0.0.1:4000/api/health');
    assert(apiHealth.status === 200, 'Direct API /api/health returned 200 OK');
    const healthJson = JSON.parse(apiHealth.body);
    assert(healthJson.status === 'ok', 'API health status is "ok"');

    const webApiHealth = await request('http://127.0.0.1:3000/api/health');
    assert(webApiHealth.status === 200, 'Next.js rewrite proxy /api/health returned 200 OK');

    // Test 2: Public Pages & Metadata
    console.log('\n--- 2. Testing Public Static & Dynamic Pages ---');
    const homePage = await request('http://127.0.0.1:3000/');
    assert(homePage.status === 200, 'Landing page / returned 200 OK');
    assert(homePage.body.includes('Odibrick'), 'Landing page contains "Odibrick"');

    const loginPage = await request('http://127.0.0.1:3000/login');
    assert(loginPage.status === 200, 'Login page /login returned 200 OK');
    assert(loginPage.body.includes('Sign in'), 'Login page rendered Sign in UI');

    const registerPage = await request('http://127.0.0.1:3000/register');
    assert(registerPage.status === 200, 'Register page /register returned 200 OK');

    // Test 3: Search Parameters on Public & Auth Pages (Next.js 15 Promise searchParams)
    console.log('\n--- 3. Testing Next.js 15 Asynchronous searchParams Handling ---');
    const registerParams = await request('http://127.0.0.1:3000/register?role=OWNER&next=%2Fdashboard');
    assert(registerParams.status === 200, '/register with searchParams role=OWNER returned 200 OK');
    assert(registerParams.body.includes('Put your project in front of buyers') || registerParams.body.includes('List your property'), 'Search parameter role=OWNER customized copy rendered');

    const propertiesSearch = await request('http://127.0.0.1:3000/properties?city=Bengaluru&listingType=RENT');
    assert(propertiesSearch.status === 200, '/properties with searchParams city=Bengaluru&listingType=RENT returned 200 OK');
    assert(propertiesSearch.body.includes('Homes for rent') && propertiesSearch.body.includes('Bengaluru'), 'Rendered search header with listingType and city parameters');

    // Test 4: Authentication & Cookie Issuance
    console.log('\n--- 4. Testing User Authentication & Cookie Issuance ---');
    // Login with Super Admin demo account
    const loginRes = await request('http://127.0.0.1:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@demo.odibrick.test',
        password: 'OdibrickDemo2026',
      }),
    });

    assert(loginRes.status === 200 || loginRes.status === 201, 'POST /api/auth/login authenticated successfully');
    const setCookieHeaders = loginRes.headers['set-cookie'] || [];
    assert(setCookieHeaders.length > 0, 'Login response set session cookies');

    // Extract cookies for SSR forwarding
    const cookies = setCookieHeaders.map((c) => c.split(';')[0]).join('; ');
    assert(cookies.includes('odb_at='), 'Cookie header includes odb_at access token');

    // Test 5: Cookie Forwarding to Protected Dashboard Pages (Next.js 15 await headers())
    console.log('\n--- 5. Testing Cookie Forwarding & Protected SSR Dashboard Routes ---');
    const dashboardRes = await request('http://127.0.0.1:3000/dashboard', {
      headers: { Cookie: cookies },
    });
    assert(dashboardRes.status === 200, 'Authenticated SSR /dashboard returned 200 OK');

    const myPropertiesRes = await request('http://127.0.0.1:3000/dashboard/properties?status=ACTIVE', {
      headers: { Cookie: cookies },
    });
    assert(myPropertiesRes.status === 200, 'Authenticated SSR /dashboard/properties?status=ACTIVE returned 200 OK');

    const kycRes = await request('http://127.0.0.1:3000/dashboard/kyc?reason=listing', {
      headers: { Cookie: cookies },
    });
    assert(kycRes.status === 200, 'Authenticated SSR /dashboard/kyc?reason=listing returned 200 OK');
    assert(kycRes.body.includes('verified identity before publishing'), 'Rendered KYC reason alert from awaited searchParams');

    // Authenticate with legal_team for legal queue and case details
    const legalLoginRes = await request('http://127.0.0.1:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'legal_team@demo.odibrick.test',
        password: 'OdibrickDemo2026',
      }),
    });
    assert(legalLoginRes.status === 200, 'Legal team authenticated successfully');
    const legalCookies = (legalLoginRes.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');

    const legalQueueRes = await request('http://127.0.0.1:3000/dashboard/legal?status=INTAKE', {
      headers: { Cookie: legalCookies },
    });
    assert(legalQueueRes.status === 200, 'Authenticated SSR /dashboard/legal?status=INTAKE returned 200 OK');

    // Test 6: Next.js 15 Asynchronous Route params on Protected Dynamic Pages
    console.log('\n--- 6. Testing Next.js 15 Dynamic Route params on Detail Pages ---');
    const tenancyDetail = await request('http://127.0.0.1:3000/dashboard/tenancy/1', {
      headers: { Cookie: cookies },
    });
    assert(tenancyDetail.status === 200, 'Dynamic route /dashboard/tenancy/1 returned 200 OK');

    const legalDetail = await request('http://127.0.0.1:3000/dashboard/legal/1', {
      headers: { Cookie: legalCookies },
    });
    assert(legalDetail.status === 200, 'Dynamic route /dashboard/legal/1 returned 200 OK');

    const operationsTaskDetail = await request('http://127.0.0.1:3000/dashboard/admin/operations/1', {
      headers: { Cookie: cookies },
    });
    assert(operationsTaskDetail.status === 200, 'Dynamic route /dashboard/admin/operations/1 returned 200 OK');

    console.log('\n============================================================');
    console.log(`SMOKE TEST COMPLETE: ${passed} Passed, ${failed} Failed`);
    console.log('============================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Smoke test error:', err);
    process.exit(1);
  }
}

runSmokeTests();
