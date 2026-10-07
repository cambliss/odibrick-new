require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { MarketplaceOperationsService } = require('../apps/api/dist/modules/properties/marketplace-operations.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function main() {
  console.log('========================================================================');
  console.log('ODIBRICK — AUTHORITATIVE PROPERTY REMOVAL & ARCHIVE TEST SUITE');
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

  // Actors
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

  const agentA = {
    id: 11,
    publicId: 'usr_agent_011',
    email: 'agent1@demo.odibrick.test',
    fullName: 'Rajesh Mehra',
    roles: ['AGENT'],
    permissions: ['property.create', 'property.update.own'],
  };

  const agentB = {
    id: 12,
    publicId: 'usr_agent_012',
    email: 'agent2@demo.odibrick.test',
    fullName: 'Deepa Sharma',
    roles: ['AGENT'],
    permissions: ['property.create', 'property.update.own'],
  };

  const builderA = {
    id: 14,
    publicId: 'usr_builder_014',
    email: 'builder1@demo.odibrick.test',
    fullName: 'Prestige Group Rep',
    roles: ['BUILDER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const builderB = {
    id: 15,
    publicId: 'usr_builder_015',
    email: 'builder2@demo.odibrick.test',
    fullName: 'Brigade Rep',
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

  const createdProps = [];

  try {
    // -------------------------------------------------------------------------
    // 1. ACTIVE Property with No Protected History -> Removal Succeeds
    // -------------------------------------------------------------------------
    console.log('--- 1. ACTIVE Property with No Protected History ---');
    const activeNoHistory = await propertiesService.create(ownerA, {
      title: 'Active Property With No History',
      listingType: 'RENT',
      propertyType: 'VILLA',
      bedrooms: 3,
      rentAmount: 50000,
      locality: 'Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
      addressLine1: '100 Palm Meadows',
      description: 'Active villa with no history to test safe removal.',
    });
    createdProps.push(activeNoHistory.id);

    // Attach 4 images and approve to ACTIVE
    for (let i = 1; i <= 4; i++) {
      await propertiesService.attachImage(ownerA, activeNoHistory.id, `properties/active_no_hist_${i}.jpg`, `Photo ${i}`, 'LIVING_ROOM');
    }
    await marketplaceService.moderateListing(admin, activeNoHistory.id, { decision: 'APPROVE', reason: 'Verified' });

    // Verify ACTIVE in database
    const checkActive = await db.one('SELECT status FROM properties WHERE id = ?', [activeNoHistory.id]);
    assert(checkActive.status === 'ACTIVE', 'Property is in ACTIVE status on marketplace');

    // Check Removal Eligibility
    const eligActiveNoHist = await propertiesService.getPropertyDeletionEligibility(ownerA, activeNoHistory.id);
    assert(eligActiveNoHist.canHardDelete === true, 'Authoritative engine determines canHardDelete = true when 0 protected records exist');
    assert(eligActiveNoHist.action === 'DELETE', 'Recommended action is DELETE');
    assert(eligActiveNoHist.actionLabel === 'Delete permanently', 'Action label is "Delete permanently"');

    // Remove property via unified removeProperty
    const removeRes1 = await propertiesService.removeProperty(ownerA, activeNoHistory.id);
    assert(removeRes1.success === true && removeRes1.action === 'DELETE', 'ACTIVE property with no history is cleanly removed');

    const dbCheckDeleted = await db.one('SELECT * FROM properties WHERE id = ?', [activeNoHistory.id]);
    assert(!dbCheckDeleted, 'Property row deleted permanently from database');

    // -------------------------------------------------------------------------
    // 2. ACTIVE Property with Customer Enquiries -> Archival Removal
    // -------------------------------------------------------------------------
    console.log('\n--- 2. ACTIVE Property with Enquiries ---');
    const activeWithEnquiry = await propertiesService.create(ownerA, {
      title: 'Active Property With Enquiries',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 2,
      rentAmount: 32000,
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      addressLine1: '24 100 Feet Road',
    });
    createdProps.push(activeWithEnquiry.id);

    for (let i = 1; i <= 4; i++) {
      await propertiesService.attachImage(ownerA, activeWithEnquiry.id, `properties/enq_test_${i}.jpg`, `Photo ${i}`, 'LIVING_ROOM');
    }
    await marketplaceService.moderateListing(admin, activeWithEnquiry.id, { decision: 'APPROVE', reason: 'Verified' });

    await db.insert('enquiries', {
      public_id: 'enq_test_002',
      property_id: activeWithEnquiry.id,
      tenant_user_id: tenant.id,
      message: 'Can I visit this weekend?',
      status: 'NEW',
    });

    const eligEnquiry = await propertiesService.getPropertyDeletionEligibility(ownerA, activeWithEnquiry.id);
    assert(eligEnquiry.canHardDelete === false, 'Hard delete prevented due to existing enquiry');
    assert(eligEnquiry.action === 'ARCHIVE', 'Authoritative action resolves to ARCHIVE');
    assert(eligEnquiry.dependencies.enquiries === 1, 'Dependencies reflect 1 enquiry');

    // Remove property via unified removeProperty
    const removeRes2 = await propertiesService.removeProperty(ownerA, activeWithEnquiry.id, 'Taking off market for summer');
    assert(removeRes2.success === true && removeRes2.action === 'ARCHIVE', 'Removal succeeds through safe archival');

    const dbCheckArchived1 = await db.one('SELECT status FROM properties WHERE id = ?', [activeWithEnquiry.id]);
    assert(dbCheckArchived1.status === 'ARCHIVED', 'Property transitioned to ARCHIVED status');

    const enquiryCheck = await db.one('SELECT * FROM enquiries WHERE property_id = ?', [activeWithEnquiry.id]);
    assert(enquiryCheck !== null, 'Enquiry records preserved completely in database');

    // -------------------------------------------------------------------------
    // 3. ACTIVE Property with Rental Applications -> Archival Removal
    // -------------------------------------------------------------------------
    console.log('\n--- 3. ACTIVE Property with Rental Applications ---');
    const activeWithApp = await propertiesService.create(ownerA, {
      title: 'Active Property With Applications',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 3,
      rentAmount: 48000,
      locality: 'HSR Layout',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560102',
      addressLine1: '55 Sector 2',
    });
    createdProps.push(activeWithApp.id);

    for (let i = 1; i <= 4; i++) {
      await propertiesService.attachImage(ownerA, activeWithApp.id, `properties/app_test_${i}.jpg`, `Photo ${i}`, 'LIVING_ROOM');
    }
    await marketplaceService.moderateListing(admin, activeWithApp.id, { decision: 'APPROVE', reason: 'Verified' });

    await db.insert('applications', {
      public_id: 'app_test_002',
      property_id: activeWithApp.id,
      tenant_user_id: tenant.id,
      status: 'SUBMITTED',
      offered_rent: 48000,
      offered_deposit: 150000,
    });

    const eligApp = await propertiesService.getPropertyDeletionEligibility(ownerA, activeWithApp.id);
    assert(eligApp.canHardDelete === false, 'Hard delete prevented due to existing rental application');
    assert(eligApp.action === 'ARCHIVE', 'Authoritative action resolves to ARCHIVE');
    assert(eligApp.dependencies.applications === 1, 'Dependencies reflect 1 rental application');

    const removeRes3 = await propertiesService.removeProperty(ownerA, activeWithApp.id, 'Decided to use for family');
    assert(removeRes3.success === true && removeRes3.action === 'ARCHIVE', 'Property removed via archival; history preserved');

    const appCheck = await db.one('SELECT * FROM applications WHERE property_id = ?', [activeWithApp.id]);
    assert(appCheck !== null, 'Application record preserved');

    // -------------------------------------------------------------------------
    // 4. ACTIVE Property with Agreements, Tenancy, Payments, Disputes
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Properties with Tenancies, Agreements, Payments, Disputes ---');
    const propProtected = await propertiesService.create(ownerA, {
      title: 'Full Lifecycle Protected Property',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 2,
      rentAmount: 40000,
      locality: 'Koramangala',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034',
      addressLine1: '77 4th Block',
    });
    createdProps.push(propProtected.id);

    const tenancyId = await db.insert('tenancies', {
      public_id: 'ten_test_002',
      property_id: propProtected.id,
      owner_user_id: ownerA.id,
      tenant_user_id: tenant.id,
      stage: 'ACTIVE',
      rent_amount: 40000,
      deposit_amount: 120000,
      start_date: '2026-01-01',
    });

    await db.insert('agreements', {
      public_id: 'agr_test_002',
      tenancy_id: tenancyId,
      agreement_number: 'OD-AGR-2026-002',
      status: 'EXECUTED',
    });

    await db.insert('payments', {
      public_id: 'pay_test_002',
      reference_code: 'REF_PAY_TEST_002',
      property_id: propProtected.id,
      tenancy_id: tenancyId,
      payer_user_id: tenant.id,
      payee_user_id: ownerA.id,
      amount: 40000,
      total_amount: 40000,
      purpose: 'MONTHLY_RENT',
      status: 'PAID',
    });

    await db.insert('disputes', {
      public_id: 'disp_test_002',
      case_number: 'DISP-2026-002',
      tenancy_id: tenancyId,
      raised_by: tenant.id,
      against_user_id: ownerA.id,
      category: 'MAINTENANCE',
      status: 'OPEN',
      summary: 'Water heater dispute',
    });

    const eligProt = await propertiesService.getPropertyDeletionEligibility(ownerA, propProtected.id);
    assert(eligProt.canHardDelete === false, 'Hard delete blocked by tenancy, agreement, payment, and dispute');
    assert(eligProt.hasFinancialOrLegalHistory === true, 'Flagged hasFinancialOrLegalHistory = true');
    assert(eligProt.action === 'ARCHIVE', 'Action resolves to ARCHIVE');

    // Direct delete call throws 400 Bad Request
    let directDeleteBlocked = false;
    try {
      await propertiesService.deleteProperty(ownerA, propProtected.id);
    } catch (err) {
      if (err.status === 400) directDeleteBlocked = true;
    }
    assert(directDeleteBlocked, 'Direct deleteProperty throws 400 Bad Request explaining protected dependencies');

    // Unified remove safely archives
    const removeRes4 = await propertiesService.removeProperty(ownerA, propProtected.id, 'Tenancy ended');
    assert(removeRes4.success === true && removeRes4.action === 'ARCHIVE', 'removeProperty safely executes archival');

    const tenRow = await db.one('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    const payRow = await db.one('SELECT * FROM payments WHERE tenancy_id = ?', [tenancyId]);
    const agrRow = await db.one('SELECT * FROM agreements WHERE tenancy_id = ?', [tenancyId]);
    const dispRow = await db.one('SELECT * FROM disputes WHERE tenancy_id = ?', [tenancyId]);
    assert(tenRow && payRow && agrRow && dispRow, 'All tenancies, agreements, payments, and disputes preserved 100%');

    // -------------------------------------------------------------------------
    // 5. RENTED Property Removal / Archival
    // -------------------------------------------------------------------------
    console.log('\n--- 5. RENTED Property Removal ---');
    const rentedProp = await propertiesService.create(ownerA, {
      title: 'Currently Rented Property',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 2,
      rentAmount: 36000,
      locality: 'Bellandur',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560103',
      addressLine1: 'ORR Outer Ring',
    });
    createdProps.push(rentedProp.id);

    await db.update('properties', rentedProp.id, { status: 'RENTED' });

    const eligRented = await propertiesService.getPropertyDeletionEligibility(ownerA, rentedProp.id);
    assert(eligRented.canHardDelete === false, 'RENTED property cannot be hard deleted');
    assert(eligRented.action === 'ARCHIVE', 'RENTED property removal resolves to ARCHIVE');

    const removeRentedRes = await propertiesService.removeProperty(ownerA, rentedProp.id, 'De-listing rented property');
    assert(removeRentedRes.status === 'ARCHIVED', 'RENTED property successfully removed & archived');

    // -------------------------------------------------------------------------
    // 6. Role Authorization & Scoping
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Role Permissions & Scoping ---');

    // Agent property
    const agentProp = await propertiesService.create(agentA, {
      title: 'Agent Managed Commercial Space',
      listingType: 'RENT',
      propertyType: 'OFFICE',
      rentAmount: 95000,
      locality: 'MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      addressLine1: 'MG Road Central',
    });
    createdProps.push(agentProp.id);

    // Builder property
    const builderProp = await propertiesService.create(builderA, {
      title: 'Builder Highrise Suite',
      listingType: 'SALE',
      propertyType: 'APARTMENT',
      bedrooms: 3,
      salePrice: 18000000,
      locality: 'Hebbal',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560024',
      addressLine1: 'Prestige Heights',
    });
    createdProps.push(builderProp.id);

    // Agent A removes own property
    const agentRemove = await propertiesService.removeProperty(agentA, agentProp.id);
    assert(agentRemove.success === true, 'AGENT can remove their own managed property');

    // Builder A removes own property
    const builderRemove = await propertiesService.removeProperty(builderA, builderProp.id);
    assert(builderRemove.success === true, 'BUILDER can remove their own project property');

    // Admin removes any property
    const adminTargetProp = await propertiesService.create(ownerA, {
      title: 'Admin Removal Target',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      rentAmount: 25000,
      locality: 'BTM Layout',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560068',
      addressLine1: 'BTM 2nd Stage',
    });
    createdProps.push(adminTargetProp.id);

    const adminRemove = await propertiesService.removeProperty(admin, adminTargetProp.id, 'Admin platform cleanup');
    assert(adminRemove.success === true, 'ADMIN can remove properties across the platform');

    // Super Admin removes any property
    const superAdminTargetProp = await propertiesService.create(ownerA, {
      title: 'Super Admin Removal Target',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      rentAmount: 28000,
      locality: 'Jayanagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560041',
      addressLine1: 'Jayanagar 4th Block',
    });
    createdProps.push(superAdminTargetProp.id);

    const superAdminRemove = await propertiesService.removeProperty(superAdmin, superAdminTargetProp.id, 'Super Admin removal');
    assert(superAdminRemove.success === true, 'SUPER_ADMIN can remove properties across the platform');

    // Create property for authorization tests
    const authTestProp = await propertiesService.create(ownerA, {
      title: 'Owner A Property for Auth Tests',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      rentAmount: 30000,
      locality: 'Koramangala',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560034',
      addressLine1: 'Test St',
    });
    createdProps.push(authTestProp.id);

    // Negative tests: TENANT, LEGAL_TEAM, KYC_TEAM (403 Forbidden)
    let tenant403 = false;
    try {
      await propertiesService.removeProperty(tenant, authTestProp.id);
    } catch (err) {
      if (err.status === 403) tenant403 = true;
    }
    assert(tenant403, 'TENANT gets 403 Forbidden on property removal');

    let legal403 = false;
    try {
      await propertiesService.removeProperty(legalUser, authTestProp.id);
    } catch (err) {
      if (err.status === 403) legal403 = true;
    }
    assert(legal403, 'LEGAL_TEAM gets 403 Forbidden on property removal');

    let kyc403 = false;
    try {
      await propertiesService.removeProperty(kycUser, authTestProp.id);
    } catch (err) {
      if (err.status === 403) kyc403 = true;
    }
    assert(kyc403, 'KYC_TEAM gets 403 Forbidden on property removal');

    // IDOR Protection: Owner B cannot remove Owner A property
    let ownerIDOR403 = false;
    try {
      await propertiesService.removeProperty(ownerB, authTestProp.id);
    } catch (err) {
      if (err.status === 403) ownerIDOR403 = true;
    }
    assert(ownerIDOR403, 'Owner B blocked with 403 Forbidden from removing Owner A property (IDOR protected)');

    // -------------------------------------------------------------------------
    // 7. Audit Logging & Notification Integrity
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Audit & Timeline Tracking ---');
    const auditLogs = await db.query(
      "SELECT action, object_id, metadata FROM audit_logs WHERE action IN ('property.deleted', 'property.archived') ORDER BY id DESC LIMIT 10",
    );
    assert(auditLogs.length > 0, 'Central audit_logs recorded removal actions');

  } catch (err) {
    console.error('Test Suite Error:', err);
    failed++;
  } finally {
    // Cleanup temporary test records
    console.log('\n--- Cleaning up temporary test records ---');
    if (createdProps.length) {
      const placeholders = createdProps.map(() => '?').join(',');
      await db.execute(`DELETE FROM property_images WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM property_amenities WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM property_verifications WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM property_timeline WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM saved_properties WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM listing_promotions WHERE listing_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM property_views WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM property_interactions WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM disputes WHERE tenancy_id IN (SELECT id FROM tenancies WHERE property_id IN (${placeholders}))`, createdProps);
      await db.execute(`DELETE FROM payments WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM agreements WHERE tenancy_id IN (SELECT id FROM tenancies WHERE property_id IN (${placeholders}))`, createdProps);
      await db.execute(`DELETE FROM tenancies WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM applications WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM enquiries WHERE property_id IN (${placeholders})`, createdProps);
      await db.execute(`DELETE FROM properties WHERE id IN (${placeholders})`, createdProps);
      console.log(`  Cleaned up ${createdProps.length} temporary test properties.\n`);
    }
    await app.close();
  }

  console.log('========================================================================');
  console.log(`AUTHORITATIVE PROPERTY REMOVAL SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
