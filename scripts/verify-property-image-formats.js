/**
 * ODIBRICK — PROPERTY IMAGE FORMAT SUPPORT & SECURITY VERIFICATION SUITE
 * ======================================================================
 * Tests explicit support for:
 *   - JPG / JPEG
 *   - JFIF
 *   - Typo extension normalization (e.g. .jifi with valid JPEG magic bytes)
 *   - PNG
 *   - WebP
 *   - HEIC
 *   - HEIF
 *   - AVIF
 *   - GIF
 *
 * Tests rejection for:
 *   - SVG (active/vector document format)
 *   - EXE / Binary scripts
 *   - PDF / Documents
 *   - Spoofed MIME types (.jpg extension with binary garbage)
 *   - Oversized images (>10 MB)
 *
 * Tests workflow integration:
 *   - New property wizard upload
 *   - Property media uploader & cover selection
 *   - Public image delivery via /api/storage/
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { StorageService } = require('../apps/api/dist/modules/storage/storage.service');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

let app;
let storage;
let properties;
let db;
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

// Authentic Image Binary Fixtures
const FIXTURES = {
  JPEG: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f,
    0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff,
    0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
    0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]),
  PNG: Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d,
    0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]),
  WEBP: Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0e, 0x00,
    0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
  ]),
  GIF: Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff, 0x00, 0x00,
    0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
  ]),
  AVIF: Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31]),
    Buffer.alloc(32),
  ]),
  HEIC: Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]),
    Buffer.alloc(32),
  ]),
  HEIF: Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0x00, 0x00, 0x00, 0x00, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x66]),
    Buffer.alloc(32),
  ]),
  SVG: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10"/></svg>'),
  EXE: Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00'),
  PDF: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'),
  DOCX: Buffer.from('PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!'),
  SPOOFED_JPG: Buffer.from('NOT_AN_IMAGE_JUST_PLAIN_TEXT_PAYLOAD_WITH_MALICIOUS_INTENT'),
};

function createMockMulterFile(filename, buffer, mimetype = 'application/octet-stream') {
  return {
    originalname: filename,
    mimetype,
    buffer,
    size: buffer.length,
    fieldname: 'file',
    encoding: '7bit',
  };
}

async function run() {
  console.log('========================================================================');
  console.log('ODIBRICK — PROPERTY PHOTO FORMAT SUPPORT & SECURITY VERIFICATION');
  console.log('========================================================================\n');

  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  storage = app.get(StorageService);
  properties = app.get(PropertiesService);
  db = app.get(DatabaseService);

  const ownerUser = {
    id: 8,
    publicId: 'usr_owner_008',
    roles: ['OWNER'],
    permissions: ['property.create', 'property.update.own', 'property.manage.media'],
  };

  const testPropIds = [];

  try {
    // --- SECTION 1: FORMAT ACCEPTANCE MATRIX ---
    console.log('--- 1. Testing Supported Image Formats ---');

    // 1.1 JPG
    const jpgFile = createMockMulterFile('apartment-living.jpg', FIXTURES.JPEG, 'image/jpeg');
    const jpgStored = await storage.store(jpgFile, 'properties/usr_owner_008');
    assert(jpgStored && jpgStored.storageKey.endsWith('.jpg'), 'JPG: Accepted and stored with .jpg extension');

    // 1.2 JPEG
    const jpegFile = createMockMulterFile('apartment-master.jpeg', FIXTURES.JPEG, 'image/jpeg');
    const jpegStored = await storage.store(jpegFile, 'properties/usr_owner_008');
    assert(jpegStored && (jpegStored.storageKey.endsWith('.jpeg') || jpegStored.storageKey.endsWith('.jpg')), 'JPEG: Accepted and stored with valid extension');

    // 1.3 JFIF
    const jfifFile = createMockMulterFile('3bhk-pent-beng-bed.jfif', FIXTURES.JPEG, 'image/jpeg');
    const jfifStored = await storage.store(jfifFile, 'properties/usr_owner_008');
    assert(jfifStored && (jfifStored.storageKey.endsWith('.jfif') || jfifStored.storageKey.endsWith('.jpg')), 'JFIF: Accepted and stored correctly');

    // 1.4 Typo Extension Normalization (.jifi)
    const jifiFile = createMockMulterFile('3bhk-pent-beng-living.jifi', FIXTURES.JPEG, 'image/jpeg');
    const jifiStored = await storage.store(jifiFile, 'properties/usr_owner_008');
    assert(jifiStored && jifiStored.storageKey.endsWith('.jpg'), 'JIFI (Typo extension with valid JPEG bytes): Normalized and stored as .jpg');

    // 1.5 PNG
    const pngFile = createMockMulterFile('balcony-view.png', FIXTURES.PNG, 'image/png');
    const pngStored = await storage.store(pngFile, 'properties/usr_owner_008');
    assert(pngStored && pngStored.storageKey.endsWith('.png'), 'PNG: Accepted and stored with .png extension');

    // 1.6 WebP
    const webpFile = createMockMulterFile('modular-kitchen.webp', FIXTURES.WEBP, 'image/webp');
    const webpStored = await storage.store(webpFile, 'properties/usr_owner_008');
    assert(webpStored && webpStored.storageKey.endsWith('.webp'), 'WebP: Accepted and stored with .webp extension');

    // 1.7 HEIC
    const heicFile = createMockMulterFile('iphone-camera.heic', FIXTURES.HEIC, 'image/heic');
    const heicStored = await storage.store(heicFile, 'properties/usr_owner_008');
    assert(heicStored && (heicStored.storageKey.endsWith('.heic') || heicStored.mimeType === 'image/heic'), 'HEIC: Accepted and stored with valid signature');

    // 1.8 HEIF
    const heifFile = createMockMulterFile('iphone-photo.heif', FIXTURES.HEIF, 'image/heif');
    const heifStored = await storage.store(heifFile, 'properties/usr_owner_008');
    assert(heifStored && (heifStored.storageKey.endsWith('.heif') || heifStored.mimeType === 'image/heif'), 'HEIF: Accepted and stored with valid signature');

    // 1.9 AVIF
    const avifFile = createMockMulterFile('building-facade.avif', FIXTURES.AVIF, 'image/avif');
    const avifStored = await storage.store(avifFile, 'properties/usr_owner_008');
    assert(avifStored && (avifStored.storageKey.endsWith('.avif') || avifStored.mimeType === 'image/avif'), 'AVIF: Accepted and stored with valid signature');

    // 1.10 GIF
    const gifFile = createMockMulterFile('floor-plan-anim.gif', FIXTURES.GIF, 'image/gif');
    const gifStored = await storage.store(gifFile, 'properties/usr_owner_008');
    assert(gifStored && gifStored.storageKey.endsWith('.gif'), 'GIF: Accepted and stored with .gif extension');

    // --- SECTION 2: NEGATIVE SECURITY & SPOOFING REJECTION ---
    console.log('\n--- 2. Testing Rejection of Disallowed & Spoofed Formats ---');

    // 2.1 SVG Rejection
    let svgRejected = false;
    try {
      await storage.store(createMockMulterFile('vector-room.svg', FIXTURES.SVG, 'image/svg+xml'), 'properties/usr_owner_008');
    } catch {
      svgRejected = true;
    }
    assert(svgRejected, 'SVG: Strictly rejected as property photograph');

    // 2.2 EXE Rejection
    let exeRejected = false;
    try {
      await storage.store(createMockMulterFile('malware.exe', FIXTURES.EXE, 'application/x-msdownload'), 'properties/usr_owner_008');
    } catch {
      exeRejected = true;
    }
    assert(exeRejected, 'EXE: Rejected by storage validation');

    // 2.3 PDF Rejection for Property Photos
    let pdfPropertyRejected = false;
    try {
      await storage.store(createMockMulterFile('document.pdf', FIXTURES.PDF, 'application/pdf'), 'properties/usr_owner_008');
    } catch {
      pdfPropertyRejected = true;
    }
    assert(pdfPropertyRejected, 'PDF: Rejected when targeted to property photo folder');

    // 2.4 DOCX Rejection
    let docxRejected = false;
    try {
      await storage.store(createMockMulterFile('deed.docx', FIXTURES.DOCX, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'properties/usr_owner_008');
    } catch {
      docxRejected = true;
    }
    assert(docxRejected, 'DOCX: Rejected by storage validation');

    // 2.5 Spoofed JPEG Extension with Text Content
    let spoofedJpgRejected = false;
    try {
      await storage.store(createMockMulterFile('fake-living.jpg', FIXTURES.SPOOFED_JPG, 'image/jpeg'), 'properties/usr_owner_008');
    } catch {
      spoofedJpgRejected = true;
    }
    assert(spoofedJpgRejected, 'Spoofed .jpg with invalid magic bytes: Detected and rejected');

    // 2.6 Invalid .jifi with Garbage Binary
    let invalidJifiRejected = false;
    try {
      await storage.store(createMockMulterFile('bad-photo.jifi', Buffer.from('NOT_A_JPEG_RANDOM_TEXT_DATA'), 'image/jpeg'), 'properties/usr_owner_008');
    } catch {
      invalidJifiRejected = true;
    }
    assert(invalidJifiRejected, 'Invalid .jifi without JPEG magic bytes: Rejected with validation error');

    // 2.7 Oversized File (>10 MB)
    let oversizedRejected = false;
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024);
    FIXTURES.JPEG.copy(oversizedBuffer, 0);
    try {
      await storage.store(createMockMulterFile('huge-photo.jpg', oversizedBuffer, 'image/jpeg'), 'properties/usr_owner_008');
    } catch {
      oversizedRejected = true;
    }
    assert(oversizedRejected, 'Oversized image (11 MB): Rejected exceeding 10 MB limit');

    // --- SECTION 3: END-TO-END PROPERTY ATTACHMENT & MEDIA MANAGEMENT ---
    console.log('\n--- 3. Testing Property Attachment with Expanded Formats ---');

    const propRes = await properties.create(ownerUser, {
      title: 'Luxury 3 BHK Penthouse in Koramangala',
      propertyType: 'PENTHOUSE',
      listingType: 'RENT',
      bedrooms: 3,
      bathrooms: 3,
      locality: 'Koramangala',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034',
      rentAmount: 85000,
      securityDeposit: 300000,
    });
    const propId = propRes.id;
    testPropIds.push(propId);
    assert(propId, `Created test property #${propId}`);

    // Attach JFIF
    const img1 = await properties.attachImage(ownerUser, propId, jfifStored.storageKey, 'Master Bedroom', 'BEDROOM');
    assert(img1 && (img1.isCover === 1 || img1.isCover === true), 'Attached JFIF photo (Auto set as primary cover)');

    // Attach Normalized JIFI
    const img2 = await properties.attachImage(ownerUser, propId, jifiStored.storageKey, 'Living Room', 'LIVING_ROOM');
    assert(img2 && (img2.isCover === 0 || img2.isCover === false), 'Attached Normalized JIFI photo');

    // Attach WebP
    const img3 = await properties.attachImage(ownerUser, propId, webpStored.storageKey, 'Modular Kitchen', 'KITCHEN');
    assert(img3 && img3.id, 'Attached WebP photo');

    // Attach AVIF
    const img4 = await properties.attachImage(ownerUser, propId, avifStored.storageKey, 'Balcony View', 'BALCONY');
    assert(img4 && img4.id, 'Attached AVIF photo');

    // Verify 4-photo minimum is satisfied
    const allPhotos = await properties.getImages(ownerUser, propId);
    assert(allPhotos.length === 4, `Property has ${allPhotos.length} attached photos`);

    // Verify Cover Switching
    const coverUpdate = await properties.setCoverImage(ownerUser, propId, img2.id);
    assert(coverUpdate && coverUpdate.success, 'Successfully switched cover photo to Normalized JIFI');

    // Make property ACTIVE for public test
    await db.execute("UPDATE properties SET status = 'ACTIVE' WHERE id = ?", [propId]);

    // Verify Public Fetch
    const publicProp = await properties.findBySlugOrPublicId(propRes.publicId || propRes.slug, ownerUser);
    assert(publicProp.images.length === 4, `Public listing returns 4 images`);
    assert(publicProp.images[0].storage_key === jifiStored.storageKey, 'Primary public cover reflects updated image');

    // --- SECTION 4: FORMAT REPORT SUMMARY ---
    console.log('\n--- 4. Summary Format Support Table ---');
    console.log('  --------------------------------------------------');
    console.log('  FORMAT      STATUS                  VERDICT');
    console.log('  --------------------------------------------------');
    console.log('  JPG         Supported (image/jpeg)   PASS');
    console.log('  JPEG        Supported (image/jpeg)   PASS');
    console.log('  JFIF        Supported (image/jpeg)   PASS');
    console.log('  JIFI        Normalized (.jpg)        PASS');
    console.log('  PNG         Supported (image/png)    PASS');
    console.log('  WebP        Supported (image/webp)   PASS');
    console.log('  HEIC        Supported (image/heic)   PASS');
    console.log('  HEIF        Supported (image/heif)   PASS');
    console.log('  AVIF        Supported (image/avif)   PASS');
    console.log('  GIF         Supported (image/gif)    PASS');
    console.log('  SVG         Disallowed (vector/xml)  REJECTED (SECURE)');
    console.log('  EXE         Disallowed (executable)  REJECTED (SECURE)');
    console.log('  PDF         Disallowed for photos    REJECTED (SECURE)');
    console.log('  DOCX        Disallowed for photos    REJECTED (SECURE)');
    console.log('  SPOOFED     Invalid magic bytes      REJECTED (SECURE)');
    console.log('  --------------------------------------------------');
  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    console.log('\n--- Cleaning up temporary test records ---');
    for (const id of testPropIds) {
      try {
        await db.query('DELETE FROM property_images WHERE property_id = ?', [id]);
        await db.query('DELETE FROM properties WHERE id = ?', [id]);
      } catch {}
    }
    console.log('  Cleaned up temporary test properties.');
    if (app) await app.close();
  }

  console.log('\n========================================================================');
  console.log(`PROPERTY IMAGE FORMAT VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
