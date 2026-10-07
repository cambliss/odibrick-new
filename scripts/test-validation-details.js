async function testDtos() {
  await new Promise(r => setTimeout(r, 6000)); // wait for throttle window reset
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'tenant1@demo.odibrick.test', password: 'OdibrickDemo2026' }),
  });
  console.log('Login status:', loginRes.status);
  const { accessToken } = await loginRes.json();
  console.log('Token exists:', !!accessToken);

  // 1. Test POST /api/applications
  const appRes = await fetch('http://localhost:4000/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({
      propertyId: 1,
      occupants: 2,
      householdType: 'FAMILY',
      moveInDate: '2026-11-01T00:00:00.000Z',
      tenureMonths: 11,
      offeredRent: 40000,
      message: 'Software engineers at Microsoft, looking for 11 months stay.',
    }),
  });
  console.log('POST /api/applications response:', appRes.status, await appRes.json());

  // 2. Test POST /api/maintenance
  const maintRes = await fetch('http://localhost:4000/api/maintenance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({
      tenancyId: 1,
      category: 'PLUMBING',
      priority: 'NORMAL',
      title: 'Kitchen faucet aerator replacement',
      description: 'Water pressure low due to mineral clogging in tap filter.',
    }),
  });
  console.log('POST /api/maintenance response:', maintRes.status, await maintRes.json());
}

testDtos().catch(console.error);
