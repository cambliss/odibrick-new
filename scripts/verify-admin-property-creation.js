require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const propertiesService = app.get(PropertiesService);
  const db = app.get(DatabaseService);

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

  const verifiedOwner = {
    id: 8,
    publicId: 'usr_owner_008',
    email: 'owner1@demo.odibrick.test',
    fullName: 'Tara Verma',
    roles: ['OWNER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const tenantUser = {
    id: 18,
    publicId: 'usr_tenant_018',
    email: 'tenant1@demo.odibrick.test',
    fullName: 'Naveen Gupta',
    roles: ['TENANT'],
    permissions: ['payment.read', 'agreement.sign'],
  };

  console.log('=== 1. SUPER ADMIN CREATES PROPERTY LISTING DRAFT ===');
  const superDraft = await propertiesService.create(superAdmin, {
    title: 'Super Admin Managed Luxury Suite in Indiranagar',
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    bedrooms: 3,
    bathrooms: 3,
    rentAmount: 85000,
    securityDeposit: 255000,
    addressLine1: '100 Feet Road, Indiranagar',
    locality: 'Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    description: 'Exclusive luxury managed apartment with full modern amenities and round the clock security.',
  });
  console.log(`✓ Super Admin created property #${superDraft.id} (${superDraft.title}), Status: ${superDraft.status}`);

  console.log('\n=== 2. SUPER ADMIN ATTACHES IMAGES & SUBMITS ===');
  await propertiesService.attachImage(superAdmin, superDraft.id, 'img_living_001', 'Living Room', 'LIVING_ROOM');
  await propertiesService.attachImage(superAdmin, superDraft.id, 'img_master_002', 'Master Bedroom', 'BEDROOM');
  await propertiesService.attachImage(superAdmin, superDraft.id, 'img_kitchen_003', 'Modular Kitchen', 'KITCHEN');
  await propertiesService.attachImage(superAdmin, superDraft.id, 'img_balcony_004', 'Balcony View', 'BALCONY');
  
  const submitRes = await propertiesService.submitForVerification(superAdmin, superDraft.id);
  console.log(`✓ Property #${superDraft.id} submitted for verification. Status: ${submitRes.status}`);

  console.log('\n=== 3. SUPER ADMIN MODERATES/APPROVES LISTING TO ACTIVE ===');
  const modRes = await propertiesService.moderate(superAdmin, superDraft.id, 'APPROVE');
  console.log(`✓ Property #${superDraft.id} moderated. Status: ${modRes.status}`);

  console.log('\n=== 4. VERIFY ADMIN LISTS MINE ===');
  const adminMine = await propertiesService.listMine(superAdmin, undefined, 1, 10);
  const foundInMine = adminMine.data.find(p => p.id === superDraft.id);
  console.log(`✓ Property #${superDraft.id} visible in Super Admin listMine: ${Boolean(foundInMine)}`);
  if (!foundInMine) throw new Error('Created property not found in listMine');

  console.log('\n=== 5. ADMIN CREATES PROPERTY LISTING DRAFT ===');
  const adminDraft = await propertiesService.create(admin, {
    title: 'Admin Operations Managed Studio in Koramangala',
    listingType: 'RENT',
    propertyType: 'STUDIO',
    bedrooms: 1,
    bathrooms: 1,
    rentAmount: 32000,
    securityDeposit: 96000,
    addressLine1: '80 Feet Road, 4th Block',
    locality: 'Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560034',
    description: 'Cosy managed studio unit in the heart of Koramangala with power backup and wifi.',
  });
  console.log(`✓ Admin created property #${adminDraft.id} (${adminDraft.title}), Status: ${adminDraft.status}`);

  console.log('\n=== 6. VERIFIED OWNER CREATES PROPERTY LISTING ===');
  const ownerDraft = await propertiesService.create(verifiedOwner, {
    title: 'Tara Verma Sunset View Villa in Whitefield',
    listingType: 'RENT',
    propertyType: 'VILLA',
    bedrooms: 4,
    bathrooms: 4,
    rentAmount: 120000,
    securityDeposit: 360000,
    addressLine1: 'Prestige Boulevard',
    locality: 'Whitefield',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560066',
    description: 'Spacious independent 4BHK villa with private garden and clubhouse access.',
  });
  console.log(`✓ Verified Owner created property #${ownerDraft.id}`);

  console.log('\n=== 7. NEGATIVE SECURITY TESTS ===');
  let tenantBlocked = false;
  try {
    await propertiesService.create(tenantUser, {
      title: 'Tenant Rogue Listing',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      city: 'Bengaluru',
    });
  } catch (err) {
    tenantBlocked = err.status === 403;
  }
  console.log(`✓ Tenant without provider profile or permissions blocked from creating listing: ${tenantBlocked}`);
  if (!tenantBlocked) throw new Error('Tenant was not blocked from creating listing!');

  // Cleanup test properties
  console.log('\n=== 8. CLEANING UP TEST PROPERTIES ===');
  await db.execute('DELETE FROM property_timeline WHERE property_id IN (?, ?, ?)', [superDraft.id, adminDraft.id, ownerDraft.id]);
  await db.execute('DELETE FROM property_verifications WHERE property_id IN (?, ?, ?)', [superDraft.id, adminDraft.id, ownerDraft.id]);
  await db.execute('DELETE FROM property_images WHERE property_id IN (?, ?, ?)', [superDraft.id, adminDraft.id, ownerDraft.id]);
  await db.execute('DELETE FROM property_amenities WHERE property_id IN (?, ?, ?)', [superDraft.id, adminDraft.id, ownerDraft.id]);
  await db.execute('DELETE FROM properties WHERE id IN (?, ?, ?)', [superDraft.id, adminDraft.id, ownerDraft.id]);
  console.log('✓ Cleaned up test properties.');

  console.log('\n🎉 ALL ADMIN PROPERTY CREATION & KYC GATE TESTS PASSED 100%!');
  await app.close();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
