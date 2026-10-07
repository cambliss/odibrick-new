require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { MarketplaceOperationsService } = require('../apps/api/dist/modules/properties/marketplace-operations.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function main() {
  console.log('========================================================================');
  console.log('ODIBRICK — ADMIN PROPERTY MANAGEMENT WORKSPACE VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const propertiesService = app.get(PropertiesService);
  const marketplaceService = app.get(MarketplaceOperationsService);
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

  // Define actors
  const superAdmin = {
    id: 1,
    publicId: 'usr_superadmin_001',
    email: 'super_admin@demo.odibrick.test',
    fullName: 'Odibrick SuperAdmin',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    permissions: ['property.create', 'property.moderate', 'property.read.private', 'analytics.read', 'payment.manage'],
  };

  const admin = {
    id: 2,
    publicId: 'usr_admin_002',
    email: 'admin@demo.odibrick.test',
    fullName: 'Operations Desk Admin',
    roles: ['ADMIN'],
    permissions: ['property.create', 'property.moderate', 'property.read.private', 'analytics.read'],
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
    roles: ['TENANT'],
    permissions: ['payment.read', 'agreement.sign'],
  };

  const legalUser = {
    id: 5,
    publicId: 'usr_legal_005',
    email: 'legal_team@demo.odibrick.test',
    roles: ['LEGAL_TEAM'],
    permissions: ['legal.review', 'agreement.draft'],
  };

  const kycUser = {
    id: 6,
    publicId: 'usr_kyc_006',
    email: 'kyc_team@demo.odibrick.test',
    roles: ['KYC_TEAM'],
    permissions: ['kyc.verify'],
  };

  try {
    // -------------------------------------------------------------------------
    // Setup isolated test properties
    // -------------------------------------------------------------------------
    console.log('--- 1. Setting up test properties inventory ---');
    const propOwner = await propertiesService.create(ownerA, {
      title: 'Admin Mgmt Test Unit Koramangala 3 BHK',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 3,
      bathrooms: 3,
      rentAmount: 55000,
      securityDeposit: 180000,
      addressLine1: '88 80 Feet Road, 4th Block',
      locality: 'Koramangala',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034',
      description: 'Spacious 3 BHK apartment with modular fittings and modern club amenities.',
      amenityCodes: ['LIFT', 'GYM', 'SECURITY'],
    });

    const propAgent = await propertiesService.create(agent, {
      title: 'Admin Mgmt Agent Listed Penthouse',
      listingType: 'RENT',
      propertyType: 'PENTHOUSE',
      bedrooms: 4,
      bathrooms: 4,
      rentAmount: 110000,
      securityDeposit: 350000,
      addressLine1: 'Skyline Terrace, Indiranagar',
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      description: 'Penthouse with expansive private terrace and panoramic city views.',
      amenityCodes: ['LIFT', 'POOL', 'CLUBHOUSE', 'POWER_BACKUP'],
    });

    const propBuilder = await propertiesService.create(builder, {
      title: 'Admin Mgmt Builder Inventory Villa',
      listingType: 'SALE',
      propertyType: 'VILLA',
      bedrooms: 4,
      bathrooms: 5,
      salePrice: 28000000,
      addressLine1: 'Prestige Golfshire Villa 12',
      locality: 'Nandi Hills Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '562110',
      description: 'Ultra-luxury golf course facing villa with private pool and Italian fittings.',
      amenityCodes: ['POOL', 'GYM', 'GATED', 'SECURITY'],
    });

    assert(propOwner && propOwner.id, `Created Owner property #${propOwner.id}`);
    assert(propAgent && propAgent.id, `Created Agent property #${propAgent.id}`);
    assert(propBuilder && propBuilder.id, `Created Builder property #${propBuilder.id}`);

    // -------------------------------------------------------------------------
    // Test 1 & 2: Admin & Super Admin open Property Management & list all inventory
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Admin & Super Admin Global Inventory Access ---');
    const adminInventory = await marketplaceService.listMarketplaceListings(admin, { page: 1, perPage: 50 });
    assert(adminInventory && adminInventory.data && adminInventory.data.length > 0, `Admin listed ${adminInventory.data.length} properties across platform`);
    assert(adminInventory.meta && adminInventory.meta.total >= 3, `Admin sees total platform inventory (total: ${adminInventory.meta.total})`);

    const superAdminInventory = await marketplaceService.listMarketplaceListings(superAdmin, { page: 1, perPage: 50 });
    assert(superAdminInventory && superAdminInventory.data && superAdminInventory.data.length > 0, `Super Admin listed ${superAdminInventory.data.length} properties`);

    // Verify properties listed by different roles are visible to Admin
    const foundOwnerProp = adminInventory.data.find((p) => p.id === propOwner.id);
    const foundAgentProp = adminInventory.data.find((p) => p.id === propAgent.id);
    const foundBuilderProp = adminInventory.data.find((p) => p.id === propBuilder.id);

    assert(foundOwnerProp !== undefined, 'Admin sees Owner listed property');
    assert(foundAgentProp !== undefined, 'Admin sees Agent listed property');
    assert(foundBuilderProp !== undefined, 'Admin sees Builder inventory property');

    // -------------------------------------------------------------------------
    // Test 3: KPI Overview Data
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Property Management KPIs & Overview ---');
    const overview = await marketplaceService.getMarketplaceOverview(admin);
    assert(overview && overview.totals, 'Overview totals retrieved');
    assert(overview.totals.totalProperties >= 3, `Total properties metric calculated: ${overview.totals.totalProperties}`);
    assert(typeof overview.totals.activeListings === 'number', 'Active listings metric calculated');
    assert(typeof overview.totals.draftListings === 'number', 'Draft listings metric calculated');

    // -------------------------------------------------------------------------
    // Test 4: Search functionality
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Search Functionality ---');
    const searchResultTitle = await marketplaceService.listMarketplaceListings(admin, { q: 'Golfshire' });
    assert(searchResultTitle.data.some((p) => p.id === propBuilder.id), 'Search by keyword (Golfshire) returned target property');

    const searchResultLister = await marketplaceService.listMarketplaceListings(admin, { q: 'Tara Verma' });
    assert(searchResultLister.data.some((p) => p.id === propOwner.id), 'Search by lister name (Tara Verma) returned target property');

    const searchResultLocality = await marketplaceService.listMarketplaceListings(admin, { q: 'Koramangala' });
    assert(searchResultLocality.data.some((p) => p.id === propOwner.id), 'Search by locality (Koramangala) returned target property');

    // -------------------------------------------------------------------------
    // Test 5, 6, 7, 8: Filtering functionality
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Filtering Functionality ---');
    const filterDraft = await marketplaceService.listMarketplaceListings(admin, { status: 'DRAFT' });
    assert(filterDraft.data.every((p) => p.status === 'DRAFT'), 'Status filter DRAFT returned only draft properties');

    const filterPropertyType = await marketplaceService.listMarketplaceListings(admin, { propertyType: 'PENTHOUSE' });
    assert(filterPropertyType.data.some((p) => p.id === propAgent.id), 'Property Type filter PENTHOUSE returned target property');

    const filterListingType = await marketplaceService.listMarketplaceListings(admin, { listingType: 'SALE' });
    assert(filterListingType.data.some((p) => p.id === propBuilder.id), 'Listing Type filter SALE returned target property');

    const filterDeficientPhotos = await marketplaceService.listMarketplaceListings(admin, { photoFilter: 'DEFICIENT' });
    assert(filterDeficientPhotos.data.some((p) => p.id === propOwner.id), 'Photo filter DEFICIENT (<4 photos) returned target property');

    // -------------------------------------------------------------------------
    // Test 9 & 10: Admin Inspect & Edit Property
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Admin Property Detail & Edit Integration ---');
    const propDetail = await marketplaceService.getListingDetail(admin, propOwner.id);
    const detailId = propDetail?.id || propDetail?.property?.id;
    const listerName = propDetail?.lister?.name || propDetail?.property?.lister_name;
    assert(detailId === propOwner.id, `Admin inspected property #${detailId}`);
    assert(listerName === 'Tara Verma', `Inspect detail shows lister attribution (${listerName})`);

    const editRes = await propertiesService.update(admin, propOwner.id, {
      title: 'Admin Mgmt Verified & Updated Unit in Koramangala',
      rentAmount: 58000,
      description: 'Updated by Admin management team with enhanced specifications and compliance checks.',
    });
    assert(editRes.title === 'Admin Mgmt Verified & Updated Unit in Koramangala', 'Admin successfully updated property title');
    assert(Number(editRes.rentAmount) === 58000, 'Admin successfully updated property rent to ₹58,000');

    // -------------------------------------------------------------------------
    // Test 11: Media Management Integration
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Media Management by Admin ---');
    const img1 = await propertiesService.attachImage(admin, propOwner.id, 'properties/test_admin_living.jpg', 'Living Room', 'LIVING_ROOM');
    const img2 = await propertiesService.attachImage(admin, propOwner.id, 'properties/test_admin_bed.jpg', 'Master Bed', 'BEDROOM');
    const img3 = await propertiesService.attachImage(admin, propOwner.id, 'properties/test_admin_kitchen.jpg', 'Kitchen', 'KITCHEN');
    const img4 = await propertiesService.attachImage(admin, propOwner.id, 'properties/test_admin_balcony.jpg', 'Balcony', 'BALCONY');

    assert(img1 && img2 && img3 && img4, 'Admin attached 4 photographs to property');

    const coverRes = await propertiesService.setCoverImage(admin, propOwner.id, img2.id);
    assert(coverRes && (coverRes.success || coverRes.coverImageId === img2.id), 'Admin set photo #2 as cover');

    const imagesList = await propertiesService.getImages(admin, propOwner.id);
    assert(imagesList.length >= 4, `Admin retrieved ${imagesList.length} photos for property`);

    // -------------------------------------------------------------------------
    // Test 12: Moderation Governance Actions (Approve, Suspend, Restore)
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Moderation & Governance Workflows ---');
    const modApprove = await marketplaceService.moderateListing(admin, propOwner.id, {
      decision: 'APPROVE',
      reason: 'Listing satisfies all documentation and 4-photo publication requirements.',
    });
    assert(modApprove.status === 'ACTIVE', 'Admin approved listing -> Status transitioned to ACTIVE');

    const modSuspend = await marketplaceService.moderateListing(admin, propOwner.id, {
      decision: 'SUSPEND',
      reason: 'Temporary suspension for documentation audit.',
    });
    assert(modSuspend.status === 'SUSPENDED', 'Admin suspended listing -> Status transitioned to SUSPENDED');

    const modRestore = await marketplaceService.moderateListing(admin, propOwner.id, {
      decision: 'RESTORE',
      reason: 'Documentation audited and cleared.',
    });
    assert(modRestore.status === 'ACTIVE', 'Admin restored listing -> Status returned to ACTIVE');

    // -------------------------------------------------------------------------
    // Test 13: Promotion & Visibility Override
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Promotion Override Actions ---');
    const overrideRes = await marketplaceService.managementOverridePromotion(admin, propOwner.id, {
      action: 'FEATURE',
      durationDays: 30,
      reason: 'Management featured listing override for prime property.',
    });
    assert(overrideRes && (overrideRes.success || overrideRes.isFeatured !== undefined || overrideRes.message), 'Admin applied FEATURED visibility override');

    const propAfterOverride = await db.one('SELECT visibility_tier, is_featured FROM properties WHERE id = ?', [propOwner.id]);
    assert(propAfterOverride.visibility_tier === 'FEATURED' && propAfterOverride.is_featured === 1, 'Property visibility tier updated to FEATURED in database');

    // -------------------------------------------------------------------------
    // Test 14: Non-Management Scoping & IDOR Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Provider Scope & IDOR Security ---');
    const ownerListings = await marketplaceService.listMarketplaceListings(ownerA, { page: 1, perPage: 50 });
    assert(ownerListings.data.every((p) => p.lister.id === ownerA.id), 'Owner A only sees their own listings in marketplace query');

    let ownerIDORBlocked = false;
    try {
      await propertiesService.update(ownerA, propAgent.id, { rentAmount: 1000 });
    } catch (err) {
      if (err.status === 403 || err.message.includes('another account')) {
        ownerIDORBlocked = true;
      }
    }
    assert(ownerIDORBlocked, 'Owner A blocked from modifying Agent property (IDOR protected)');

    // -------------------------------------------------------------------------
    // Test 15: Unauthorized Roles Negative Testing
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Unauthorized Roles Negative Tests ---');
    let tenantBlocked = false;
    try {
      await propertiesService.update(tenant, propOwner.id, { title: 'Tenant Hacked Title' });
    } catch (err) {
      if (err.status === 403 || err.message.includes('permission') || err.message.includes('another account')) {
        tenantBlocked = true;
      }
    }
    assert(tenantBlocked, 'TENANT blocked from updating property (403 Forbidden)');

    let legalBlocked = false;
    try {
      await propertiesService.update(legalUser, propOwner.id, { title: 'Legal Edited Title' });
    } catch (err) {
      if (err.status === 403 || err.message.includes('permission') || err.message.includes('another account')) {
        legalBlocked = true;
      }
    }
    assert(legalBlocked, 'LEGAL_TEAM blocked from general property editing (403 Forbidden)');

    let kycBlocked = false;
    try {
      await propertiesService.update(kycUser, propOwner.id, { rentAmount: 1000 });
    } catch (err) {
      if (err.status === 403 || err.message.includes('permission') || err.message.includes('another account')) {
        kycBlocked = true;
      }
    }
    assert(kycBlocked, 'KYC_TEAM blocked from general property editing (403 Forbidden)');

    // -------------------------------------------------------------------------
    // Test 16: Public Listing Access
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Public Listing Verification ---');
    const lookupIdentifier = propOwner.publicId || propOwner.slug || String(propOwner.id);
    const publicProp = await propertiesService.findBySlugOrPublicId(lookupIdentifier);
    assert(publicProp && publicProp.title.includes('Verified & Updated'), 'Public property reflects admin update');

    // -------------------------------------------------------------------------
    // Cleanup test records
    // -------------------------------------------------------------------------
    console.log('\n--- Cleaning up temporary test records ---');
    await db.execute('DELETE FROM property_images WHERE property_id IN (?, ?, ?)', [propOwner.id, propAgent.id, propBuilder.id]);
    await db.execute('DELETE FROM property_amenities WHERE property_id IN (?, ?, ?)', [propOwner.id, propAgent.id, propBuilder.id]);
    await db.execute('DELETE FROM listing_promotions WHERE listing_id IN (?, ?, ?)', [propOwner.id, propAgent.id, propBuilder.id]);
    await db.execute('DELETE FROM properties WHERE id IN (?, ?, ?)', [propOwner.id, propAgent.id, propBuilder.id]);
    console.log('  Cleaned up temporary test properties.\n');

  } catch (err) {
    console.error('Test Suite Error:', err);
    failed++;
  } finally {
    await app.close();
  }

  console.log('========================================================================');
  console.log(`ADMIN PROPERTY MANAGEMENT VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
