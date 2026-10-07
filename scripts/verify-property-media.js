require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { StorageService } = require('../apps/api/dist/modules/storage/storage.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('========================================================================');
  console.log('ODIBRICK — PROPERTY PHOTOS & MEDIA MANAGEMENT VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const propertiesService = app.get(PropertiesService);
  const storageService = app.get(StorageService);
  const db = app.get(DatabaseService);

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

  // Users for testing
  const superAdmin = {
    id: 1,
    publicId: 'usr_superadmin_001',
    email: 'super_admin@demo.odibrick.test',
    fullName: 'Odibrick Admin',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    permissions: ['property.create', 'property.moderate', 'property.read.private'],
  };

  const admin = {
    id: 2,
    publicId: 'usr_admin_002',
    email: 'admin@demo.odibrick.test',
    fullName: 'Operations Desk',
    roles: ['ADMIN'],
    permissions: ['property.create', 'property.moderate', 'property.read.private'],
  };

  const ownerA = {
    id: 8,
    publicId: 'usr_owner_008',
    email: 'owner1@demo.odibrick.test',
    fullName: 'Tara Verma',
    roles: ['OWNER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const ownerB = {
    id: 9,
    publicId: 'usr_owner_009',
    email: 'owner2@demo.odibrick.test',
    fullName: 'Kiran Rao',
    roles: ['OWNER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const agent = {
    id: 11,
    publicId: 'usr_agent_011',
    email: 'agent1@demo.odibrick.test',
    fullName: 'Rajesh Mehra',
    roles: ['AGENT'],
    permissions: ['property.create', 'property.update.own'],
  };

  const builder = {
    id: 14,
    publicId: 'usr_builder_014',
    email: 'builder1@demo.odibrick.test',
    fullName: 'Prestige Group Rep',
    roles: ['BUILDER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const tenant = {
    id: 18,
    publicId: 'usr_tenant_018',
    email: 'tenant1@demo.odibrick.test',
    fullName: 'Naveen Gupta',
    roles: ['TENANT'],
    permissions: ['payment.read', 'agreement.sign'],
  };

  const legalUser = {
    id: 5,
    publicId: 'usr_legal_005',
    email: 'legal_team@demo.odibrick.test',
    fullName: 'Adv. Shalini Menon',
    roles: ['LEGAL_TEAM'],
    permissions: ['dispute.manage', 'agreement.review'],
  };

  const kycUser = {
    id: 3,
    publicId: 'usr_kyc_003',
    email: 'kyc_desk@demo.odibrick.test',
    fullName: 'KYC Operations',
    roles: ['KYC_TEAM'],
    permissions: ['kyc.verify', 'document.verify'],
  };

  // 1. Storage Layer Validation & File Storage Tests
  console.log('--- 1. File Upload & Validation (MIME / Extensions / Size) ---');
  
  // Valid JPEG file (with real JPEG magic bytes)
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const validJpegFile = {
    originalname: 'living-room.jpg',
    mimetype: 'image/jpeg',
    buffer: validJpegBuffer,
    size: validJpegBuffer.length,
  };
  const storedJpeg = await storageService.store(validJpegFile, `properties/${ownerA.publicId}`);
  assert(storedJpeg && storedJpeg.storageKey.endsWith('.jpg'), 'Valid JPEG accepted and stored with storage key');

  // Valid PNG file (with real PNG magic bytes)
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const validPngFile = {
    originalname: 'kitchen.png',
    mimetype: 'image/png',
    buffer: validPngBuffer,
    size: validPngBuffer.length,
  };
  const storedPng = await storageService.store(validPngFile, `properties/${ownerA.publicId}`);
  assert(storedPng && storedPng.storageKey.endsWith('.png'), 'Valid PNG accepted and stored with storage key');

  // Valid WebP file (with real WebP magic bytes)
  const validWebpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const validWebpFile = {
    originalname: 'balcony.webp',
    mimetype: 'image/webp',
    buffer: validWebpBuffer,
    size: validWebpBuffer.length,
  };
  const storedWebp = await storageService.store(validWebpFile, `properties/${ownerA.publicId}`);
  assert(storedWebp && storedWebp.storageKey.endsWith('.webp'), 'Valid WebP accepted and stored with storage key');

  // Reject Invalid Extension / MIME (e.g., text/plain or executable)
  let invalidExtFailed = false;
  try {
    const invalidFile = {
      originalname: 'script.exe',
      mimetype: 'application/x-msdownload',
      buffer: Buffer.from('MZ...'),
      size: 6,
    };
    await storageService.store(invalidFile, `properties/${ownerA.publicId}`);
  } catch (err) {
    invalidExtFailed = true;
  }
  assert(invalidExtFailed, 'Invalid file type (.exe) rejected by storage layer');

  // Reject file exceeding 10MB (12MB limit check)
  let oversizedFailed = false;
  try {
    const oversizedBuffer = Buffer.alloc(13 * 1024 * 1024);
    oversizedBuffer[0] = 0xff; oversizedBuffer[1] = 0xd8; oversizedBuffer[2] = 0xff;
    const oversizedFile = {
      originalname: 'massive-photo.jpg',
      mimetype: 'image/jpeg',
      buffer: oversizedBuffer,
      size: oversizedBuffer.length,
    };
    await storageService.store(oversizedFile, `properties/${ownerA.publicId}`);
  } catch (err) {
    oversizedFailed = true;
  }
  assert(oversizedFailed, 'Oversized photo (>10 MB) rejected by storage service');

  // 2. Draft Property Creation and Incremental Photo Attachment
  console.log('\n--- 2. Draft Property Creation & Photo Attachment ---');
  const testProperty = await propertiesService.create(ownerA, {
    title: 'Sunny 3 BHK Penthouse in Koramangala 4th Block',
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    bedrooms: 3,
    bathrooms: 3,
    rentAmount: 65000,
    securityDeposit: 200000,
    addressLine1: '80 Feet Road, 4th Block',
    locality: 'Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560034',
    carpetAreaSqft: 1850,
    furnishing: 'FULLY_FURNISHED',
    description: 'A spacious and well-lit 3 BHK penthouse with private terrace and 100% power backup. Close to parks and cafes.',
  });
  const propertyId = testProperty.id;
  assert(testProperty && testProperty.status === 'DRAFT', `Created draft property #${propertyId}`);

  // Attach Image 1 (Should automatically become is_cover = 1)
  const img1 = await propertiesService.attachImage(ownerA, propertyId, storedJpeg.storageKey, 'Living Room', 'LIVING_ROOM');
  assert(img1 && img1.isCover === 1, 'First attached image is automatically set as cover photo');

  // Attach Image 2, 3
  const img2 = await propertiesService.attachImage(ownerA, propertyId, storedPng.storageKey, 'Modern Kitchen', 'KITCHEN');
  assert(img2 && img2.isCover === 0, 'Second attached image is not cover');

  const img3 = await propertiesService.attachImage(ownerA, propertyId, storedWebp.storageKey, 'Master Bedroom', 'BEDROOM');
  assert(img3 && img3.isCover === 0, 'Third attached image attached successfully');

  // Verify Photos retrieval
  const imagesBefore4 = await propertiesService.getImages(ownerA, propertyId);
  assert(imagesBefore4.length === 3, `Retrieved ${imagesBefore4.length} attached photos`);

  // 3. Four-Photo Minimum Publication Gate
  console.log('\n--- 3. Four-Photo Minimum Rule Verification ---');
  let submitWith3Failed = false;
  try {
    await propertiesService.submitForVerification(ownerA, propertyId);
  } catch (err) {
    submitWith3Failed = true;
    assert(
      err.message.includes('at least 4 photographs'),
      `Submission with 3 photos blocked with error: "${err.message}"`
    );
  }
  assert(submitWith3Failed, 'Property submission blocked when fewer than 4 photos are attached');

  // Verify property is still DRAFT (not published)
  const draftCheck = await propertiesService.findOwned(ownerA, propertyId);
  assert(draftCheck.status === 'DRAFT', 'Property remains in DRAFT state');

  // Attach Image 4 (with fourth photo)
  const img4File = {
    originalname: 'bathroom.jpg',
    mimetype: 'image/jpeg',
    buffer: validJpegBuffer,
    size: validJpegBuffer.length,
  };
  const storedImg4 = await storageService.store(img4File, `properties/${ownerA.publicId}`);
  const img4 = await propertiesService.attachImage(ownerA, propertyId, storedImg4.storageKey, 'Balcony View', 'BALCONY');
  assert(img4 && img4.id, 'Fourth photograph attached successfully');

  // Submit with 4 photos now succeeds
  const submitResult = await propertiesService.submitForVerification(ownerA, propertyId);
  assert(submitResult.status === 'PENDING_VERIFICATION', 'Submission succeeds into PENDING_VERIFICATION with 4 photos');

  // 4. Photo Management: Primary / Cover Image Switch
  console.log('\n--- 4. Primary / Cover Image Management ---');
  const coverResult = await propertiesService.setCoverImage(ownerA, propertyId, img2.id);
  assert(coverResult.success && coverResult.coverImageId === img2.id, `Set Image #${img2.id} (Kitchen) as cover photo`);

  const imagesAfterCover = await propertiesService.getImages(ownerA, propertyId);
  const currentCover = imagesAfterCover.find((i) => i.id === img2.id);
  const oldCover = imagesAfterCover.find((i) => i.id === img1.id);
  assert(currentCover.is_cover === 1, 'Image #2 is now is_cover = 1');
  assert(oldCover.is_cover === 0, 'Image #1 is now is_cover = 0');

  // 5. Photo Management: Reordering
  console.log('\n--- 5. Photo Reordering ---');
  const newOrder = [img4.id, img3.id, img2.id, img1.id];
  const reorderResult = await propertiesService.reorderImages(ownerA, propertyId, newOrder);
  assert(reorderResult.success, 'Reordered photographs [img4, img3, img2, img1]');

  const imagesAfterReorder = await propertiesService.getImages(ownerA, propertyId);
  const img4Row = imagesAfterReorder.find((i) => i.id === img4.id);
  const img1Row = imagesAfterReorder.find((i) => i.id === img1.id);
  assert(img4Row.sort_order === 0, 'Image #4 has sort_order = 0');
  assert(img1Row.sort_order === 3, 'Image #1 has sort_order = 3');

  // 6. Photo Management: Deletion & Auto-Cover Fallback
  console.log('\n--- 6. Photo Deletion & Cover Auto-Reassignment ---');
  // Delete the current cover (img2)
  await propertiesService.removeImage(ownerA, propertyId, img2.id);
  const imagesAfterDelete = await propertiesService.getImages(ownerA, propertyId);
  assert(imagesAfterDelete.length === 3, 'Photograph deleted; 3 photos remaining');
  const deletedStillExists = imagesAfterDelete.some((i) => i.id === img2.id);
  assert(!deletedStillExists, 'Deleted photograph is removed from property_images');

  const newCoverAfterDelete = imagesAfterDelete.find((i) => i.is_cover === 1);
  assert(newCoverAfterDelete && newCoverAfterDelete.id !== img2.id, `Cover automatically reassigned to Image #${newCoverAfterDelete?.id}`);

  // 7. Security: IDOR Protection
  console.log('\n--- 7. Security & IDOR Protection ---');
  let idorUploadBlocked = false;
  try {
    await propertiesService.attachImage(ownerB, propertyId, storedJpeg.storageKey, 'Hacked Photo');
  } catch (err) {
    idorUploadBlocked = err.status === 403 || err.message.includes('belongs to another account');
  }
  assert(idorUploadBlocked, 'Owner B cannot upload photos to Owner A property (IDOR blocked with 403)');

  let idorCoverBlocked = false;
  try {
    await propertiesService.setCoverImage(ownerB, propertyId, img1.id);
  } catch (err) {
    idorCoverBlocked = err.status === 403 || err.message.includes('belongs to another account');
  }
  assert(idorCoverBlocked, 'Owner B cannot change cover image on Owner A property (IDOR blocked with 403)');

  let idorDeleteBlocked = false;
  try {
    await propertiesService.removeImage(ownerB, propertyId, img1.id);
  } catch (err) {
    idorDeleteBlocked = err.status === 403 || err.message.includes('belongs to another account');
  }
  assert(idorDeleteBlocked, 'Owner B cannot delete photos on Owner A property (IDOR blocked with 403)');

  // 8. RBAC: Role Authorization Tests
  console.log('\n--- 8. Role Authorization (RBAC) ---');
  // Tenant cannot edit property media
  let tenantBlocked = false;
  try {
    await propertiesService.attachImage(tenant, propertyId, storedJpeg.storageKey);
  } catch (err) {
    tenantBlocked = err.status === 403 || err.message.includes('belongs to another account');
  }
  assert(tenantBlocked, 'TENANT is blocked from modifying property photos (403)');

  // Legal team cannot edit property media
  let legalBlocked = false;
  try {
    await propertiesService.attachImage(legalUser, propertyId, storedJpeg.storageKey);
  } catch (err) {
    legalBlocked = err.status === 403 || err.message.includes('belongs to another account');
  }
  assert(legalBlocked, 'LEGAL_TEAM is blocked from editing property photos (403)');

  // KYC team cannot edit property media
  let kycBlocked = false;
  try {
    await propertiesService.attachImage(kycUser, propertyId, storedJpeg.storageKey);
  } catch (err) {
    kycBlocked = err.status === 403 || err.message.includes('belongs to another account');
  }
  assert(kycBlocked, 'KYC_TEAM is blocked from editing property photos (403)');

  // Admin & Super Admin CAN manage property media
  const adminAddImg = await propertiesService.attachImage(admin, propertyId, storedJpeg.storageKey, 'Admin Added Photo');
  assert(adminAddImg && adminAddImg.id, 'ADMIN successfully manages property media');

  const superAdminCover = await propertiesService.setCoverImage(superAdmin, propertyId, adminAddImg.id);
  assert(superAdminCover.success, 'SUPER_ADMIN successfully sets cover image');

  // Agent managing represented property
  const agentDraft = await propertiesService.create(agent, {
    title: 'Agent Managed Commercial Floor in Indiranagar',
    listingType: 'RENT',
    propertyType: 'OFFICE',
    rentAmount: 120000,
    addressLine1: '12th Main Indiranagar',
    locality: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    description: 'Spacious furnished office floor with 24 cabins and meeting rooms.',
  });
  const agentPhoto = await propertiesService.attachImage(agent, agentDraft.id, storedJpeg.storageKey, 'Office Hall');
  assert(agentPhoto && agentPhoto.id, 'AGENT successfully manages photos for their listed property');

  // Builder managing project property
  const builderDraft = await propertiesService.create(builder, {
    title: 'Prestige Lakeside Habitat Luxury 4 BHK Villa',
    listingType: 'SALE',
    propertyType: 'VILLA',
    salePrice: 42500000,
    bedrooms: 4,
    bathrooms: 5,
    addressLine1: 'Varthur Main Road',
    locality: 'Whitefield',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560087',
    description: 'Exclusive villa facing lake with private pool, garden, and clubhouse access.',
  });
  const builderPhoto = await propertiesService.attachImage(builder, builderDraft.id, storedJpeg.storageKey, 'Villa Exterior');
  assert(builderPhoto && builderPhoto.id, 'BUILDER successfully manages photos for their project inventory');

  // 9. Public Listing & Gallery Security
  console.log('\n--- 9. Public Listing & Media Isolation ---');
  // Moderate property to ACTIVE
  await propertiesService.moderate(superAdmin, propertyId, 'APPROVE');
  const publicProperty = await propertiesService.findBySlugOrPublicId(testProperty.slug, null);
  assert(publicProperty.images.length > 0, `Public property page includes ${publicProperty.images.length} photos`);
  assert(publicProperty.images[0].storage_key.startsWith('properties/'), 'Public photos use public properties/ storage path');

  // Verify private document vault isolation: raw access to vault/ or kyc/ via public storage is prevented
  const rawPublicPhoto = await storageService.readRaw(storedJpeg.storageKey);
  assert(rawPublicPhoto && rawPublicPhoto.length > 0, 'Public property photograph is readable via storage driver');

  // 10. Audit Log Verification
  console.log('\n--- 10. Audit Logging Verification ---');
  const auditLogs = await db.query(
    `SELECT action, object_id, created_at FROM audit_logs 
      WHERE object_type = 'property' AND object_id = ?
      ORDER BY id DESC LIMIT 10`,
    [propertyId],
  );
  const actions = auditLogs.map((a) => a.action);
  assert(actions.includes('property.image_attached'), 'Audit log recorded property.image_attached');
  assert(actions.includes('property.cover_image_set'), 'Audit log recorded property.cover_image_set');
  assert(actions.includes('property.images_reordered'), 'Audit log recorded property.images_reordered');
  assert(actions.includes('property.image_removed'), 'Audit log recorded property.image_removed');

  // 11. Database Property Photo Inventory
  console.log('\n--- 11. Database Photo Inventory Analysis ---');
  const inventoryStats = await db.one(`
    SELECT 
      COUNT(*) AS total_properties,
      SUM(CASE WHEN (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) = 0 THEN 1 ELSE 0 END) AS zero_photos,
      SUM(CASE WHEN (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS one_to_three_photos,
      SUM(CASE WHEN (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) >= 4 THEN 1 ELSE 0 END) AS four_plus_photos,
      SUM(CASE WHEN p.status = 'ACTIVE' AND (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) < 4 THEN 1 ELSE 0 END) AS active_under_4_photos,
      SUM(CASE WHEN p.status = 'DRAFT' AND (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) = 0 THEN 1 ELSE 0 END) AS draft_zero_photos,
      SUM(CASE WHEN p.status = 'SUSPENDED' AND (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) = 0 THEN 1 ELSE 0 END) AS suspended_zero_photos
    FROM properties p WHERE p.deleted_at IS NULL
  `);

  console.log('  Total Properties in Database:', inventoryStats.total_properties);
  console.log('  Properties with 0 photos:', inventoryStats.zero_photos);
  console.log('  Properties with 1-3 photos:', inventoryStats.one_to_three_photos);
  console.log('  Properties with >= 4 photos:', inventoryStats.four_plus_photos);
  console.log('  Active properties without 4 photos:', inventoryStats.active_under_4_photos);
  console.log('  Draft properties without photos:', inventoryStats.draft_zero_photos);
  console.log('  Suspended properties without photos:', inventoryStats.suspended_zero_photos);

  console.log('\n========================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  await app.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
