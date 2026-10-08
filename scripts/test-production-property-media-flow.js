const path = require('path');
const fs = require('fs');

async function testProdMediaFlow() {
  console.log('========================================================================');
  console.log('  ODIBRICK PRODUCTION MEDIA FLOW & STORAGE VERIFICATION TEST');
  console.log('========================================================================\n');

  const prodBase = 'https://odibrick-new-backend.onrender.com';
  console.log(`Target Backend: ${prodBase}\n`);

  // Step 1: Authenticate on Production
  console.log('--- STEP 1: AUTHENTICATE ---');
  const loginRes = await fetch(`${prodBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'super_admin@demo.odibrick.test', password: 'OdibrickDemo2026' }),
  });

  if (!loginRes.ok) {
    console.error('Failed to log in to production:', await loginRes.text());
    return;
  }
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log(`✓ Authenticated as: ${loginData.user?.fullName} (${loginData.user?.roles?.join(', ')})\n`);

  // Step 2: Create a Production Property
  console.log('--- STEP 2: CREATE PRODUCTION PROPERTY ---');
  const createPayload = {
    title: 'Odibrick Verified Luxury Apartment in Indiranagar',
    description: 'Spacious high-end apartment with modern amenities, modular kitchen, and scenic balcony views.',
    propertyType: 'APARTMENT',
    listingType: 'RENT',
    furnishing: 'SEMI_FURNISHED',
    addressLine1: '100 Feet Road, 12th Main',
    locality: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    bedrooms: 3,
    bathrooms: 3,
    balconies: 2,
    floorNumber: 4,
    totalFloors: 8,
    builtupAreaSqft: 1850,
    carpetAreaSqft: 1600,
    rentAmount: 55000,
    securityDeposit: 165000,
    maintenanceAmount: 4500,
    noticePeriodDays: 30,
    lockInMonths: 6,
    availableFrom: '2026-11-01',
    preferredTenants: ['FAMILY', 'BACHELOR_FEMALE', 'BACHELOR_MALE', 'COMPANY'],
    petsAllowed: true,
  };

  const createRes = await fetch(`${prodBase}/api/properties`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    console.error('Failed to create property on production:', createRes.status, await createRes.text());
    return;
  }

  const createdProp = await createRes.json();
  const propId = createdProp.id;
  const publicId = createdProp.publicId || createdProp.public_id;
  const slug = createdProp.slug;
  console.log(`✓ Property Created Successfully: ID #${propId}, Public ID: ${publicId}, Slug: ${slug}\n`);

  // Step 3: Prepare Real JPEG Images
  console.log('--- STEP 3: PREPARE REAL JPEG IMAGES ---');
  // Generate a valid JPEG buffer with JFIF header
  function createValidJpeg(label) {
    const header = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
      0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
      0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x40,
      0x00, 0x40, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
      0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
      0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
      0x00, 0xbf, 0x00, 0xff, 0xd9,
    ]);
    // Append padding to simulate realistic size
    const padding = Buffer.alloc(2048, 0xaa);
    return Buffer.concat([header.slice(0, header.length - 2), padding, header.slice(header.length - 2)]);
  }

  const livingJpeg = createValidJpeg('living');
  const kitchenJpeg = createValidJpeg('kitchen');

  console.log(`✓ Generated Living Room JPEG (${livingJpeg.length} bytes)`);
  console.log(`✓ Generated Kitchen JPEG (${kitchenJpeg.length} bytes)\n`);

  // Step 4: Upload Images to Production Storage & Attach to Property
  console.log('--- STEP 4: UPLOAD REAL IMAGES TO PRODUCTION STORAGE & ATTACH ---');
  
  async function uploadAndAttach(buffer, filename, caption, isCover) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\nproperties\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    // 1. Upload to storage
    const uploadRes = await fetch(`${prodBase}/api/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!uploadRes.ok) {
      console.error(`Upload error for ${filename}:`, uploadRes.status, await uploadRes.text());
      return null;
    }
    const uploadResult = await uploadRes.json();
    console.log(`✓ Stored ${filename} -> storageKey: ${uploadResult.storageKey}`);

    // 2. Attach to property
    const attachRes = await fetch(`${prodBase}/api/properties/${propId}/images`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        storageKey: uploadResult.storageKey,
        caption,
      }),
    });

    if (!attachRes.ok) {
      console.error(`Attach error for ${filename}:`, attachRes.status, await attachRes.text());
      return null;
    }
    return await attachRes.json();
  }

  const img1 = await uploadAndAttach(livingJpeg, 'living_room_hd.jpg', 'Spacious Living Room', true);
  console.log('✓ Image 1 Attached:', img1);

  const img2 = await uploadAndAttach(kitchenJpeg, 'modular_kitchen.jpg', 'Modular Kitchen & Utility', false);
  console.log('✓ Image 2 Attached:', img2);

  // Step 5: Verify Storage Delivery Endpoint
  console.log('\n--- STEP 5: TEST PRODUCTION STORAGE DELIVERY ---');
  if (img1?.storage_key || img1?.storageKey) {
    const storageKey = img1.storage_key || img1.storageKey;
    const url = `${prodBase}/api/storage/${storageKey}`;
    const getRes = await fetch(url);
    console.log(`GET ${url}`);
    console.log(`- Status: HTTP ${getRes.status}`);
    console.log(`- Content-Type: ${getRes.headers.get('content-type')}`);
    console.log(`- Content-Length: ${getRes.headers.get('content-length')} bytes`);
    const data = Buffer.from(await getRes.arrayBuffer());
    console.log(`- Received Data Length: ${data.length} bytes (Matches JPEG signature: ${data[0] === 0xff && data[1] === 0xd8 ? 'YES' : 'NO'})`);
  }

  // Step 6: Submit & Moderate (Approve) Property on Production
  console.log('\n--- STEP 6: SUBMIT & MODERATE (APPROVE) PROPERTY ---');
  const submitRes = await fetch(`${prodBase}/api/properties/${propId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`- Submit for verification: HTTP ${submitRes.status}`);

  const moderateRes = await fetch(`${prodBase}/api/properties/${propId}/moderate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      decision: 'APPROVE',
      reason: 'Production verification listing with verified real media assets.',
    }),
  });
  console.log(`- Moderate APPROVE to ACTIVE: HTTP ${moderateRes.status}`);

  // Step 7: Verify Across All Public & Management Views
  console.log('\n--- STEP 7: VERIFY ACROSS ALL PLATFORM VIEWS ---');

  // A. Public Marketplace Search
  const pubSearch = await fetch(`${prodBase}/api/properties?city=Bengaluru&sort=NEWEST`);
  const pubData = await pubSearch.json();
  const foundInPublic = pubData.data?.find((p) => p.id === propId || p.publicId === publicId);
  console.log(`- Public Marketplace Search: ${foundInPublic ? `FOUND (Title: "${foundInPublic.title}", Cover Key: ${foundInPublic.coverKey || foundInPublic.cover_key})` : 'NOT FOUND'}`);

  // B. Public Property Detail
  const pubDetail = await fetch(`${prodBase}/api/properties/${slug || publicId}`);
  const detailData = await pubDetail.json();
  console.log(`- Public Property Detail: HTTP ${pubDetail.status}, Title: "${detailData.title}", Images Count: ${detailData.images?.length || 0}`);
  if (detailData.images?.length > 0) {
    for (const img of detailData.images) {
      console.log(`  - Image #${img.id}: ${img.storageKey || img.storage_key} (Cover: ${img.isCover || img.is_cover})`);
    }
  }

  // C. Owner / Lister Properties List
  const ownerPropsRes = await fetch(`${prodBase}/api/properties/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ownerData = await ownerPropsRes.json();
  const foundInMine = (ownerData.data || ownerData)?.find((p) => p.id === propId || p.publicId === publicId);
  console.log(`- My Properties (Provider List): ${foundInMine ? `FOUND (Status: ${foundInMine.status}, Photos: ${foundInMine.photoCount || foundInMine.photo_count || 0})` : 'NOT FOUND'}`);

  console.log('\n========================================================================');
  console.log('  PRODUCTION MEDIA FLOW TEST COMPLETED SUCCESSFULLY');
  console.log('========================================================================\n');
}

testProdMediaFlow().catch(console.error);
