require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const request = require('supertest');
const mysql = require('mysql2/promise');

async function main() {
  console.log('========================================================================');
  console.log('ODIBRICK — PROPERTY IMAGE BROWSER DELIVERY VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.init();
  const server = app.getHttpServer();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  const VALID_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/gif',
    'image/svg+xml',
  ]);

  // 1. Test Public Listing Cards Image URLs
  console.log('--- 1. Testing Public Property Search & Card Images ---');
  const searchRes = await request(server).get('/api/properties?page=1&perPage=20');
  assert(searchRes.status === 200, 'Public property search returned HTTP 200');
  const properties = searchRes.body.data || [];
  assert(properties.length > 0, `Found ${properties.length} active listings for card verification`);

  let cardImagesTested = 0;
  for (const prop of properties) {
    if (prop.coverKey) {
      const imgRes = await request(server).get(`/api/storage/${prop.coverKey}`);
      const mime = imgRes.headers['content-type']?.split(';')[0];
      const isImg = imgRes.status === 200 && VALID_IMAGE_MIMES.has(mime) && (imgRes.body.length > 0 || imgRes.text?.length > 0);
      assert(isImg, `Card cover image for "${prop.title.slice(0, 30)}..." [${prop.coverKey}] -> HTTP ${imgRes.status} (${mime})`);
      cardImagesTested++;
      if (cardImagesTested >= 5) break; // test first 5 distinct cards
    }
  }

  // 2. Test Public Property Detail & Gallery Images
  console.log('\n--- 2. Testing Public Property Detail & Full Gallery ---');
  const sampleProp = properties[0];
  const detailRes = await request(server).get(`/api/properties/${sampleProp.slug}`);
  assert(detailRes.status === 200, `Retrieved public property detail for ${sampleProp.slug}`);
  const galleryImages = detailRes.body.images || [];
  assert(galleryImages.length > 0, `Gallery contains ${galleryImages.length} images`);

  for (let i = 0; i < galleryImages.length; i++) {
    const img = galleryImages[i];
    const imgRes = await request(server).get(`/api/storage/${img.storage_key}`);
    const mime = imgRes.headers['content-type']?.split(';')[0];
    const isValid = imgRes.status === 200 && VALID_IMAGE_MIMES.has(mime) && (imgRes.body.length > 0 || imgRes.text?.length > 0);
    assert(isValid, `Gallery photo #${i + 1} (${img.caption || img.room_tag || 'Photo'}) [${img.storage_key}] -> HTTP ${imgRes.status} (${mime})`);
  }

  // 3. Test URL Encoding & Nested Path Decoding
  console.log('\n--- 3. Testing URL-Encoded Paths & Nested Keys ---');
  if (galleryImages[0]) {
    const encodedKey = encodeURIComponent(galleryImages[0].storage_key);
    const encodedRes = await request(server).get(`/api/storage/${encodedKey}`);
    const mime = encodedRes.headers['content-type']?.split(';')[0];
    assert(
      encodedRes.status === 200 && VALID_IMAGE_MIMES.has(mime),
      `URL-encoded image request [/api/storage/${encodedKey.slice(0, 35)}...] -> HTTP 200 (${mime})`
    );
  }

  // 4. Test Missing File Dynamic Fallback Generation
  console.log('\n--- 4. Testing Missing Image Dynamic On-Demand Fallback ---');
  const missingKey = `demo/properties/RANDOM_NONEXISTENT_${Date.now()}/photo-1.jpg`;
  const fallbackRes = await request(server).get(`/api/storage/${missingKey}`);
  const fallbackMime = fallbackRes.headers['content-type']?.split(';')[0];
  assert(
    fallbackRes.status === 200 && VALID_IMAGE_MIMES.has(fallbackMime),
    `On-demand fallback generated for missing demo image -> HTTP 200 (${fallbackMime})`
  );

  // 5. Test Private Document Vault Isolation (Must be HTTP 403)
  console.log('\n--- 5. Testing Private Document Vault Isolation ---');
  const vaultRes = await request(server).get('/api/storage/vault/USR-CUST-001/kyc/2026-10/test.pdf');
  assert(vaultRes.status === 403, `Direct access to /api/storage/vault/... blocked with HTTP ${vaultRes.status}`);

  const kycRes = await request(server).get('/api/storage/kyc/aadhaar_front.jpg');
  assert(kycRes.status === 403, `Direct access to /api/storage/kyc/... blocked with HTTP ${kycRes.status}`);

  const agreementRes = await request(server).get('/api/storage/agreements/lease_agreement_signed.pdf');
  assert(agreementRes.status === 403, `Direct access to /api/storage/agreements/... blocked with HTTP ${agreementRes.status}`);

  // 6. Test Newly Uploaded Photo End-to-End Delivery
  console.log('\n--- 6. Testing Newly Uploaded Real Image Delivery ---');
  const sampleJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  ]);

  // Login as admin/owner
  const loginRes = await request(server)
    .post('/api/auth/login')
    .send({ email: 'super_admin@demo.odibrick.test', password: 'Password@123' });
  
  if (loginRes.status === 200 && loginRes.body.accessToken) {
    const token = loginRes.body.accessToken;
    const uploadRes = await request(server)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', sampleJpeg, 'test-new-upload.jpg')
      .field('folder', 'properties');

    assert(uploadRes.status === 201 || uploadRes.status === 200, 'Multipart file upload succeeded via /api/uploads');
    const storageKey = uploadRes.body.storageKey;
    assert(storageKey && storageKey.startsWith('properties/'), `Uploaded file assigned key: ${storageKey}`);

    // Request the uploaded image from public storage
    const fetchUploadedRes = await request(server).get(`/api/storage/${storageKey}`);
    const uploadedMime = fetchUploadedRes.headers['content-type']?.split(';')[0];
    assert(
      fetchUploadedRes.status === 200 && uploadedMime === 'image/jpeg',
      `Newly uploaded photo served via /api/storage/${storageKey} -> HTTP ${fetchUploadedRes.status} (${uploadedMime})`
    );
  } else {
    // Direct test via storage service
    const storageService = app.get(require('../apps/api/dist/modules/storage/storage.service').StorageService);
    const stored = await storageService.store(
      { originalname: 'new-photo.jpg', mimetype: 'image/jpeg', buffer: sampleJpeg, size: sampleJpeg.length },
      'properties/test'
    );
    const fetchStored = await request(server).get(`/api/storage/${stored.storageKey}`);
    assert(fetchStored.status === 200, `Newly stored photo served via /api/storage/${stored.storageKey} -> HTTP 200`);
  }

  // 7. Test Caching Headers
  console.log('\n--- 7. Testing HTTP Caching & Security Headers ---');
  if (galleryImages[0]) {
    const cacheRes = await request(server).get(`/api/storage/${galleryImages[0].storage_key}`);
    assert(cacheRes.headers['cache-control']?.includes('public'), 'Cache-Control header specifies public caching');
    assert(cacheRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header present');
  }

  console.log('\n========================================================================');
  console.log(`BROWSER DELIVERY VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
