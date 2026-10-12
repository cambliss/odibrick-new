const fs = require('fs');
const path = require('path');

async function auditProduction() {
  console.log('=== AUDITING PRODUCTION ENVIRONMENT (RENDER + AIVEN) ===');
  const prodBase = 'https://odibrick-new-backend.onrender.com';

  // 1. Health check
  const healthRes = await fetch(`${prodBase}/api/health`);
  const health = await healthRes.json();
  console.log('Production Health Check:', health);

  // 2. Auth test with super_admin
  const loginRes = await fetch(`${prodBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'super_admin@demo.odibrick.test',
      password: 'OdibrickDemo2026',
    }),
  });

  if (!loginRes.ok) {
    console.error('Failed to log in to production API:', loginRes.status, await loginRes.text());
    return;
  }

  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Production Super Admin Login: SUCCESS', {
    user: loginData.user?.email,
    roles: loginData.user?.roles,
  });

  const headers = { Authorization: `Bearer ${token}` };

  // 3. Test canonical demo users login against production
  const testAccounts = [
    { email: 'super_admin@demo.odibrick.test', role: 'SUPER_ADMIN' },
    { email: 'admin@demo.odibrick.test', role: 'ADMIN' },
    { email: 'tenant1@demo.odibrick.test', role: 'TENANT' },
    { email: 'tenant2@demo.odibrick.test', role: 'TENANT' },
    { email: 'owner1@demo.odibrick.test', role: 'OWNER' },
    { email: 'owner2@demo.odibrick.test', role: 'OWNER' },
    { email: 'legal1@demo.odibrick.test', role: 'LEGAL_TEAM' },
    { email: 'agent1@demo.odibrick.test', role: 'AGENT' },
    { email: 'builder1@demo.odibrick.test', role: 'BUILDER' },
    { email: 'finance1@demo.odibrick.test', role: 'FINANCE_HEAD' },
    { email: 'ops1@demo.odibrick.test', role: 'OPS_MANAGER' },
  ];

  const authResults = [];
  for (const acc of testAccounts) {
    try {
      const res = await fetch(`${prodBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: 'OdibrickDemo2026' }),
      });
      if (res.ok) {
        const d = await res.json();
        authResults.push({ email: acc.email, role: acc.role, status: 'SUCCESS', returnedRoles: d.user?.roles });
      } else {
        authResults.push({ email: acc.email, role: acc.role, status: `FAILED (${res.status})` });
      }
    } catch (e) {
      authResults.push({ email: acc.email, role: acc.role, status: `ERROR (${e.message})` });
    }
  }
  console.log('Production Demo Accounts Auth Results:');
  console.table(authResults);

  // 4. Query modules on production
  const endpoints = [
    { name: 'marketplace_all', url: '/api/admin/marketplace?perPage=100' },
    { name: 'public_properties', url: '/api/properties?perPage=100' },
    { name: 'admin_users', url: '/api/admin/users?perPage=100' },
    { name: 'admin_kyc', url: '/api/admin/kyc?perPage=100' },
    { name: 'admin_applications', url: '/api/admin/applications?perPage=100' },
    { name: 'admin_agreements', url: '/api/admin/agreements?perPage=100' },
    { name: 'admin_tenancies', url: '/api/admin/tenancies?perPage=100' },
    { name: 'admin_invoices', url: '/api/admin/invoices?perPage=100' },
    { name: 'admin_payouts', url: '/api/admin/payouts?perPage=100' },
    { name: 'admin_disputes', url: '/api/admin/disputes?perPage=100' },
    { name: 'admin_maintenance', url: '/api/admin/maintenance?perPage=100' },
    { name: 'admin_legal_cases', url: '/api/admin/legal/cases?perPage=100' },
    { name: 'admin_audit_logs', url: '/api/admin/audit-logs?perPage=10' },
    { name: 'admin_risk_cases', url: '/api/admin/risk/cases?perPage=100' },
    { name: 'admin_automation_rules', url: '/api/admin/automation/rules?perPage=100' },
  ];

  const prodModuleCounts = {};
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${prodBase}${ep.url}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const total = data.total ?? (Array.isArray(data) ? data.length : Array.isArray(data.data) ? data.data.length : 'OK');
        prodModuleCounts[ep.name] = { status: 'OK', count: total, rawDataSample: Array.isArray(data.data) ? data.data.slice(0, 2) : undefined };
      } else {
        prodModuleCounts[ep.name] = { status: `HTTP ${res.status}` };
      }
    } catch (e) {
      prodModuleCounts[ep.name] = { status: `Error: ${e.message}` };
    }
  }

  console.log('Production Module Counts:');
  console.log(JSON.stringify(prodModuleCounts, null, 2));

  return { health, authResults, prodModuleCounts };
}

auditProduction().catch(console.error);
