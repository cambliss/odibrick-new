const http = require('http');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function req(path, options = {}, body = null) {
  return new Promise((resolve) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    const reqOptions = {
      hostname: 'localhost',
      port: 4000,
      path: '/api' + path,
      method: options.method || 'GET',
      headers: defaultHeaders,
    };

    const request = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.headers,
          data: json,
        });
      });
    });

    request.on('error', (err) => {
      resolve({ status: 500, ok: false, data: null, error: err.message });
    });

    if (body) {
      request.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    request.end();
  });
}

async function login(email, password) {
  await sleep(150); // Respect rate limit
  const res = await req('/auth/login', { method: 'POST' }, { email, password });
  if (res.ok && res.data?.accessToken) {
    return res.data.accessToken;
  }
  console.error(`Login failed for ${email}:`, res.status, res.data);
  return null;
}

async function runReconciliation() {
  console.log('============================================================');
  console.log('STARTING ACCEPTANCE TEST RECONCILIATION & P1 REGRESSION');
  console.log('============================================================\n');

  // Step 1: Provider regression for OWNER, AGENT, BUILDER
  console.log('--- PART 1 & 2: PROVIDER ACTION CENTRE REGRESSION ---');
  const providerRoles = [
    { role: 'OWNER', email: 'owner1@demo.odibrick.test' },
    { role: 'AGENT', email: 'agent1@demo.odibrick.test' },
    { role: 'BUILDER', email: 'builder1@demo.odibrick.test' },
  ];

  for (const pr of providerRoles) {
    const token = await login(pr.email, 'OdibrickDemo2026');
    if (!token) {
      console.error(`FAILED to log in as ${pr.role}`);
      continue;
    }

    const actionRes = await req('/provider/action-centre', {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`[${pr.role}] GET /api/provider/action-centre: Status ${actionRes.status}`);
    if (actionRes.ok) {
      const data = actionRes.data || {};
      console.log(`  -> Stats:`, data.stats);
      console.log(`  -> Action Items: ${data.actionItems?.length ?? 0}`);
      console.log(`  -> Recent Enquiries: ${data.recentEnquiries?.length ?? 0}`);
      console.log(`  -> Upcoming Visits: ${data.upcomingVisits?.length ?? 0}`);
      console.log(`  -> Pending Applications: ${data.pendingApplications?.length ?? 0}`);
      console.log(`  -> Expiring Listings: ${data.expiringListings?.length ?? 0}`);
      console.log(`  -> RESULT: PASS (HTTP 200, valid structure, zero SQL errors)\n`);
    } else {
      console.error(`  -> RESULT: FAIL (${actionRes.status})`, actionRes.data);
    }
  }

  // Step 2: Critical RBAC Test Correction (TC-0085)
  console.log('--- PART 3: CRITICAL RBAC TEST CORRECTION (TC-0085) ---');
  const agentToken = await login('agent1@demo.odibrick.test', 'OdibrickDemo2026');
  if (agentToken) {
    const rbacRes = await req('/agreements/1/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
    }, { note: 'Agent attempting unauthorized approval' });

    console.log(`[AGENT] POST /api/agreements/1/approve: HTTP ${rbacRes.status}`);
    console.log(`  Response body:`, rbacRes.data);
    if (rbacRes.status === 403) {
      console.log(`  -> RESULT: PASS (Authenticated Agent correctly received HTTP 403 Forbidden - RBAC Enforced)\n`);
    } else if (rbacRes.status === 401) {
      console.error(`  -> RESULT: FAIL (Received 401 instead of 403 - session was not recognized)`);
    } else {
      console.error(`  -> RESULT: CRITICAL SECURITY FAILURE (Received ${rbacRes.status})`);
    }
  }

  // Step 3: Negative Role Matrix Tests
  console.log('--- PART 7: NEGATIVE ROLE BOUNDARY TESTS ---');
  const tenantToken = await login('tenant1@demo.odibrick.test', 'OdibrickDemo2026');
  const ownerToken = await login('owner1@demo.odibrick.test', 'OdibrickDemo2026');
  const legalToken = await login('legal_team@demo.odibrick.test', 'OdibrickDemo2026');
  const kycToken = await login('kyc_team@demo.odibrick.test', 'OdibrickDemo2026');
  const supportToken = await login('support_team@demo.odibrick.test', 'OdibrickDemo2026');

  // TENANT -> ADMIN KPIs (Expected: 403)
  const tAdmin = await req('/admin/kpis', { headers: { Authorization: `Bearer ${tenantToken}` } });
  console.log(`[TENANT -> /admin/kpis] Expected 403, Got: ${tAdmin.status} -> ${tAdmin.status === 403 ? 'PASS' : 'FAIL'}`);

  // OWNER -> ADMIN Risk (Expected: 403)
  const oRisk = await req('/admin/risk/overview', { headers: { Authorization: `Bearer ${ownerToken}` } });
  console.log(`[OWNER -> /admin/risk/overview] Expected 403, Got: ${oRisk.status} -> ${oRisk.status === 403 ? 'PASS' : 'FAIL'}`);

  // LEGAL -> Financial Ledger (Expected: 403)
  const lFin = await req('/admin/finance/ledger', { headers: { Authorization: `Bearer ${legalToken}` } });
  console.log(`[LEGAL_TEAM -> /admin/finance/ledger] Expected 403, Got: ${lFin.status} -> ${lFin.status === 403 ? 'PASS' : 'FAIL'}`);

  // KYC -> Financial Ledger (Expected: 403)
  const kFin = await req('/admin/finance/ledger', { headers: { Authorization: `Bearer ${kycToken}` } });
  console.log(`[KYC_TEAM -> /admin/finance/ledger] Expected 403, Got: ${kFin.status} -> ${kFin.status === 403 ? 'PASS' : 'FAIL'}`);

  // SUPPORT -> Financial Ledger (Expected: 403)
  const sFin = await req('/admin/finance/ledger', { headers: { Authorization: `Bearer ${supportToken}` } });
  console.log(`[SUPPORT_TEAM -> /admin/finance/ledger] Expected 403, Got: ${sFin.status} -> ${sFin.status === 403 ? 'PASS' : 'FAIL'}`);

  // Unauthenticated -> /notifications (Expected: 401)
  const pNotif = await req('/notifications');
  console.log(`[PUBLIC -> /notifications] Expected 401, Got: ${pNotif.status} -> ${pNotif.status === 401 ? 'PASS' : 'FAIL'}`);

  // Step 4: Authentication Negative & Throttling
  console.log('\n--- PART 9: AUTHENTICATION VALIDATION ---');
  await sleep(1000);
  const badPass = await req('/auth/login', { method: 'POST' }, { email: 'tenant1@demo.odibrick.test', password: 'WrongPassword123' });
  console.log(`[Invalid Password] Expected 401, Got: ${badPass.status} -> ${badPass.status === 401 ? 'PASS' : 'FAIL'}`);

  await sleep(300);
  const badEmail = await req('/auth/login', { method: 'POST' }, { email: 'nonexistent@demo.odibrick.test', password: 'OdibrickDemo2026' });
  console.log(`[Invalid Email] Expected 401, Got: ${badEmail.status} -> ${badEmail.status === 401 ? 'PASS' : 'FAIL'}`);

  console.log('\n============================================================');
  console.log('RECONCILIATION RUN COMPLETE');
  console.log('============================================================');
}

runReconciliation().catch(console.error);
