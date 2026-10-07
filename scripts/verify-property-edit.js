require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function main() {
  console.log('========================================================================');
  console.log('ODIBRICK — PROPERTY EDIT FUNCTIONALITY VERIFICATION SUITE');
  console.log('========================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const propertiesService = app.get(PropertiesService);
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

  // Define test actors
  const superAdmin = {
    id: 1,
    publicId: 'usr_superadmin_001',
    email: 'super_admin@demo.odibrick.test',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    permissions: ['property.create', 'property.moderate', 'property.read.private'],
  };

  const admin = {
    id: 2,
    publicId: 'usr_admin_002',
    email: 'admin@demo.odibrick.test',
    roles: ['ADMIN'],
    permissions: ['property.create', 'property.moderate', 'property.read.private'],
  };

  const ownerA = {
    id: 8,
    publicId: 'usr_owner_008',
    email: 'owner1@demo.odibrick.test',
    roles: ['OWNER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const ownerB = {
    id: 9,
    publicId: 'usr_owner_009',
    email: 'owner2@demo.odibrick.test',
    roles: ['OWNER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const agent = {
    id: 11,
    publicId: 'usr_agent_011',
    email: 'agent1@demo.odibrick.test',
    roles: ['AGENT'],
    permissions: ['property.create', 'property.update.own'],
  };

  const agentB = {
    id: 12,
    publicId: 'usr_agent_012',
    email: 'agent2@demo.odibrick.test',
    roles: ['AGENT'],
    permissions: ['property.create', 'property.update.own'],
  };

  const builder = {
    id: 14,
    publicId: 'usr_builder_014',
    email: 'builder1@demo.odibrick.test',
    roles: ['BUILDER'],
    permissions: ['property.create', 'property.update.own'],
  };

  const builderB = {
    id: 15,
    publicId: 'usr_builder_015',
    email: 'builder2@demo.odibrick.test',
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
    // Set up test properties
    // -------------------------------------------------------------------------
    console.log('--- 1. Setting up isolated test properties ---');
    const propA = await propertiesService.create(ownerA, {
      title: 'Owner A Test Property for Edit',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 2,
      bathrooms: 2,
      rentAmount: 35000,
      securityDeposit: 100000,
      addressLine1: '123 Marine Drive',
      locality: 'Nariman Point',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400021',
      description: 'Initial property description for testing edit workflow and field persistence.',
      amenityCodes: ['LIFT', 'SECURITY'],
    });
    assert(propA && propA.id, `Owner A created property #${propA.id}`);

    const propAgent = await propertiesService.create(agent, {
      title: 'Agent Managed Listing for Edit',
      listingType: 'RENT',
      propertyType: 'VILLA',
      bedrooms: 4,
      bathrooms: 4,
      rentAmount: 85000,
      securityDeposit: 250000,
      addressLine1: '45 Palm Beach Road',
      locality: 'Vashi',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      pincode: '400703',
      description: 'Agent listing description with extensive layout and verified amenities.',
      amenityCodes: ['GYM', 'POOL', 'CLUBHOUSE'],
    });
    assert(propAgent && propAgent.id, `Agent created property #${propAgent.id}`);

    const propBuilder = await propertiesService.create(builder, {
      title: 'Builder Inventory Unit for Edit',
      listingType: 'SALE',
      propertyType: 'APARTMENT',
      bedrooms: 3,
      bathrooms: 3,
      salePrice: 18500000,
      addressLine1: 'Prestige Boulevard Tower 1',
      locality: 'Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
      description: 'Builder premium inventory flat ready to move in prime locality.',
      amenityCodes: ['POWER_BACKUP', 'LIFT', 'PARKING_COVERED'],
    });
    assert(propBuilder && propBuilder.id, `Builder created property #${propBuilder.id}`);

    // -------------------------------------------------------------------------
    // Test 1: Owner edits own property
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Owner Editing Permissions ---');
    const updatedPropA = await propertiesService.update(ownerA, propA.id, {
      title: 'Owner A Luxury Renovated Sea-Facing 2 BHK',
      rentAmount: 38000,
      securityDeposit: 120000,
      carpetAreaSqft: 980,
      builtupAreaSqft: 1250,
      furnishing: 'FULLY_FURNISHED',
      facing: 'W',
      description: 'Updated description: Renovated 2 BHK with full Italian marble flooring and sunset sea view.',
      amenityCodes: ['LIFT', 'SECURITY', 'CCTV', 'GYM'],
    });
    assert(updatedPropA.title === 'Owner A Luxury Renovated Sea-Facing 2 BHK', 'Owner A successfully updated title');
    assert(Number(updatedPropA.rentAmount) === 38000, 'Owner A successfully updated rent to ₹38,000');
    assert(Number(updatedPropA.securityDeposit) === 120000, 'Owner A successfully updated deposit to ₹1,20,000');
    assert(updatedPropA.furnishing === 'FULLY_FURNISHED', 'Owner A successfully updated furnishing');
    assert(updatedPropA.amenityCodes.includes('CCTV') && updatedPropA.amenityCodes.includes('GYM'), 'Owner A amenities synced properly');

    // -------------------------------------------------------------------------
    // Test 2: Owner B denied editing Owner A property (IDOR Protection)
    // -------------------------------------------------------------------------
    let ownerBBlocked = false;
    try {
      await propertiesService.update(ownerB, propA.id, {
        title: 'Hacked Title by Owner B',
        rentAmount: 1000,
      });
    } catch (err) {
      if (err.status === 403 || err.message.includes('another account')) {
        ownerBBlocked = true;
      }
    }
    assert(ownerBBlocked, 'Owner B blocked with 403 Forbidden when trying to edit Owner A property (IDOR protected)');

    // -------------------------------------------------------------------------
    // Test 3: Agent edits authorized property
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Agent Editing Permissions ---');
    const updatedAgentProp = await propertiesService.update(agent, propAgent.id, {
      title: 'Agent Updated Villa with Private Garden',
      rentAmount: 90000,
      lockInMonths: 12,
      noticePeriodDays: 60,
    });
    assert(updatedAgentProp.title === 'Agent Updated Villa with Private Garden', 'Agent successfully updated own listing');
    assert(Number(updatedAgentProp.rentAmount) === 90000, 'Agent updated rent amount to ₹90,000');
    assert(updatedAgentProp.lockInMonths === 12, 'Agent updated lock-in to 12 months');

    // -------------------------------------------------------------------------
    // Test 4: Agent B denied editing Agent A property
    // -------------------------------------------------------------------------
    let agentBBlocked = false;
    try {
      await propertiesService.update(agentB, propAgent.id, {
        rentAmount: 50000,
      });
    } catch (err) {
      if (err.status === 403 || err.message.includes('another account')) {
        agentBBlocked = true;
      }
    }
    assert(agentBBlocked, 'Agent B blocked with 403 when trying to edit Agent A property');

    // -------------------------------------------------------------------------
    // Test 5: Builder edits authorized property
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Builder Editing Permissions ---');
    const updatedBuilderProp = await propertiesService.update(builder, propBuilder.id, {
      title: 'Builder Premium Unit 102 with Modular Kitchen',
      salePrice: 19000000,
      amenityCodes: ['POWER_BACKUP', 'LIFT', 'PARKING_COVERED', 'MODULAR_KITCHEN'],
    });
    assert(updatedBuilderProp.title === 'Builder Premium Unit 102 with Modular Kitchen', 'Builder updated property title');
    assert(Number(updatedBuilderProp.salePrice) === 19000000, 'Builder updated sale price to ₹1,90,00,000');
    assert(updatedBuilderProp.amenityCodes.includes('MODULAR_KITCHEN'), 'Builder synced amenity MODULAR_KITCHEN');

    // -------------------------------------------------------------------------
    // Test 6: Builder B denied editing Builder A property
    // -------------------------------------------------------------------------
    let builderBBlocked = false;
    try {
      await propertiesService.update(builderB, propBuilder.id, {
        salePrice: 1000000,
      });
    } catch (err) {
      if (err.status === 403 || err.message.includes('another account')) {
        builderBBlocked = true;
      }
    }
    assert(builderBBlocked, 'Builder B blocked with 403 when trying to edit Builder A property');

    // -------------------------------------------------------------------------
    // Test 7 & 8: Admin & Super Admin edit properties
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Admin & Super Admin Editing ---');
    const adminEditedProp = await propertiesService.update(admin, propA.id, {
      description: 'Description moderated and enhanced by Platform Admin with verified compliance note.',
    });
    assert(adminEditedProp.description.includes('Platform Admin'), 'Admin successfully edited property content');

    const superAdminEditedProp = await propertiesService.update(superAdmin, propAgent.id, {
      description: 'Super Admin reviewed and approved villa layout description with full verification.',
    });
    assert(superAdminEditedProp.description.includes('Super Admin'), 'Super Admin successfully edited property content');

    // -------------------------------------------------------------------------
    // Test 9, 10, 11: Tenant, Legal Team, KYC Team blocked with 403
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Negative Role Authorization (Tenant, Legal, KYC) ---');
    let tenantBlocked = false;
    try {
      await propertiesService.update(tenant, propA.id, { rentAmount: 10000 });
    } catch (err) {
      if (err.status === 403 || err.message.includes('permission') || err.message.includes('another account')) {
        tenantBlocked = true;
      }
    }
    assert(tenantBlocked, 'TENANT role blocked with 403 Forbidden on property edit');

    let legalBlocked = false;
    try {
      await propertiesService.update(legalUser, propA.id, { title: 'Legal Edited Title' });
    } catch (err) {
      if (err.status === 403 || err.message.includes('permission') || err.message.includes('another account')) {
        legalBlocked = true;
      }
    }
    assert(legalBlocked, 'LEGAL_TEAM role blocked with 403 Forbidden on property edit');

    let kycBlocked = false;
    try {
      await propertiesService.update(kycUser, propA.id, { rentAmount: 20000 });
    } catch (err) {
      if (err.status === 403 || err.message.includes('permission') || err.message.includes('another account')) {
        kycBlocked = true;
      }
    }
    assert(kycBlocked, 'KYC_TEAM role blocked with 403 Forbidden on property edit');

    // -------------------------------------------------------------------------
    // Test 12-19: Specific Field Updates & Validation
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Specific Field Editing & Integrity ---');
    const detailedUpdate = await propertiesService.update(ownerA, propA.id, {
      bedrooms: 3,
      bathrooms: 3,
      balconies: 2,
      floorNumber: 5,
      totalFloors: 14,
      carpetAreaSqft: 1100,
      builtupAreaSqft: 1420,
      maintenanceAmount: 4500,
      maintenancePeriod: 'MONTHLY',
      priceNegotiable: true,
      availableFrom: '2026-11-01',
      preferredTenants: ['FAMILY', 'COMPANY'],
      petsAllowed: true,
      nonVegAllowed: true,
      houseRules: 'No loud music after 10 PM. Cleanliness in common lobby mandatory.',
    });

    assert(detailedUpdate.bedrooms === 3, 'Bedrooms updated to 3');
    assert(detailedUpdate.bathrooms === 3, 'Bathrooms updated to 3');
    assert(detailedUpdate.balconies === 2, 'Balconies updated to 2');
    assert(detailedUpdate.floorNumber === 5, 'Floor number updated to 5');
    assert(detailedUpdate.totalFloors === 14, 'Total floors updated to 14');
    assert(Number(detailedUpdate.carpetAreaSqft) === 1100, 'Carpet area updated to 1100 sqft');
    assert(Number(detailedUpdate.builtupAreaSqft) === 1420, 'Built-up area updated to 1420 sqft');
    assert(Number(detailedUpdate.maintenanceAmount) === 4500, 'Maintenance amount updated to ₹4,500');
    assert(detailedUpdate.maintenancePeriod === 'MONTHLY', 'Maintenance period updated to MONTHLY');
    assert(detailedUpdate.priceNegotiable === true, 'Price negotiable flag updated to true');
    assert(detailedUpdate.availableFrom.startsWith('2026-11-01'), 'Available from date updated to 2026-11-01');
    assert(detailedUpdate.preferredTenants.includes('FAMILY') && detailedUpdate.preferredTenants.includes('COMPANY'), 'Preferred tenants updated');
    assert(detailedUpdate.petsAllowed === true, 'Pets allowed updated to true');
    assert(detailedUpdate.nonVegAllowed === true, 'Non-veg allowed updated to true');
    assert(detailedUpdate.houseRules.includes('No loud music'), 'House rules updated');

    // -------------------------------------------------------------------------
    // Test 20: Photo Integration
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Photo Management Integration ---');
    const attached1 = await propertiesService.attachImage(ownerA, propA.id, 'properties/test_living.jpg', 'Living Room', 'LIVING_ROOM');
    const attached2 = await propertiesService.attachImage(ownerA, propA.id, 'properties/test_master.jpg', 'Master Bedroom', 'BEDROOM');
    const attached3 = await propertiesService.attachImage(ownerA, propA.id, 'properties/test_kitchen.jpg', 'Kitchen', 'KITCHEN');
    const attached4 = await propertiesService.attachImage(ownerA, propA.id, 'properties/test_balcony.jpg', 'Balcony View', 'BALCONY');

    assert(attached1 && attached2 && attached3 && attached4, 'Attached 4 test photographs');

    // Test Set Cover
    const coverRes = await propertiesService.setCoverImage(ownerA, propA.id, attached2.id);
    assert(coverRes && (coverRes.success || coverRes.coverImageId === attached2.id), 'Master bedroom set as cover photograph');

    // Test Reorder
    const reorderRes = await propertiesService.reorderImages(ownerA, propA.id, [attached3.id, attached2.id, attached1.id, attached4.id]);
    assert(reorderRes && reorderRes.success, 'Reordered photographs successfully');

    // Test Get Images
    const currentImages = await propertiesService.getImages(ownerA, propA.id);
    assert(currentImages.length >= 4, `Retrieved ${currentImages.length} images for property`);

    // -------------------------------------------------------------------------
    // Test 21, 22, 23: Immutability of System Fields (Security & Anti-Forgery)
    // -------------------------------------------------------------------------
    console.log('\n--- 9. System Fields Forgery Protection ---');
    const rawBefore = await db.one('SELECT owner_id, listed_by_user_id, status FROM properties WHERE id = ?', [propA.id]);

    // Malicious attempt to forge owner_id, listed_by_user_id, status
    await propertiesService.update(ownerA, propA.id, {
      title: 'Title Attempting Status Forgery',
      owner_id: 9999,
      listed_by_user_id: 9999,
      status: 'ACTIVE',
    });

    const rawAfter = await db.one('SELECT owner_id, listed_by_user_id, status FROM properties WHERE id = ?', [propA.id]);
    assert(rawAfter.owner_id === rawBefore.owner_id, 'owner_id cannot be altered through edit payload');
    assert(rawAfter.listed_by_user_id === rawBefore.listed_by_user_id, 'listed_by_user_id cannot be altered through edit payload');
    assert(rawAfter.status === rawBefore.status, 'status cannot be forged to ACTIVE through edit payload');

    // -------------------------------------------------------------------------
    // Test 24: Audit Event Creation
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Audit Trail Verification ---');
    const auditEvents = await db.query(
      "SELECT action, object_id, created_at FROM audit_logs WHERE object_type = 'property' AND object_id = ? AND action = 'property.updated' ORDER BY id DESC LIMIT 5",
      [propA.id],
    );
    assert(auditEvents.length > 0, `Recorded ${auditEvents.length} 'property.updated' audit log event(s)`);

    // -------------------------------------------------------------------------
    // Test 25: Public Listing Reflects Changes
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Public Listing Fetch Verification ---');
    await propertiesService.update(ownerA, propA.id, {
      title: 'Owner A Luxury 3 BHK Renovated Sea-Facing Suite',
      rentAmount: 39000,
    });
    await db.update('properties', propA.id, { status: 'ACTIVE' });
    const publicProp = await propertiesService.findBySlugOrPublicId(propA.publicId);
    assert(publicProp.title === 'Owner A Luxury 3 BHK Renovated Sea-Facing Suite', 'Public listing reflects updated title');
    assert(Number(publicProp.rentAmount) === 39000, 'Public listing reflects updated rent ₹39,000');
    assert(publicProp.furnishing === 'FULLY_FURNISHED', 'Public listing reflects updated furnishing');

    // -------------------------------------------------------------------------
    // Cleanup test records
    // -------------------------------------------------------------------------
    console.log('\n--- Cleaning up test records ---');
    await db.execute('DELETE FROM property_images WHERE property_id IN (?, ?, ?)', [propA.id, propAgent.id, propBuilder.id]);
    await db.execute('DELETE FROM property_amenities WHERE property_id IN (?, ?, ?)', [propA.id, propAgent.id, propBuilder.id]);
    await db.execute('DELETE FROM properties WHERE id IN (?, ?, ?)', [propA.id, propAgent.id, propBuilder.id]);
    console.log('  Cleaned up temporary test properties.\n');

  } catch (err) {
    console.error('Test Suite Error:', err);
    failed++;
  } finally {
    await app.close();
  }

  console.log('========================================================================');
  console.log(`PROPERTY EDIT VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main();
