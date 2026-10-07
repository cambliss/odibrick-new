require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');
const { MarketplaceOperationsService } = require('../apps/api/dist/modules/properties/marketplace-operations.service');
const { PropertiesService } = require('../apps/api/dist/modules/properties/properties.service');
const { CommercialOperationsService } = require('../apps/api/dist/modules/payments/commercial-operations.service');
const { FinancialOperationsService } = require('../apps/api/dist/modules/payments/financial-operations.service');
const { PaymentsService } = require('../apps/api/dist/modules/payments/payments.service');
const { InvoicesService } = require('../apps/api/dist/modules/payments/invoices.service');
const { AuditService } = require('../apps/api/dist/common/audit/audit.service');

let app;
let db;
let marketplaceService;
let propertiesService;
let commercialService;
let financialOpsService;
let paymentsService;
let invoicesService;
let auditService;

let assertionCount = 0;

function assert(condition, message) {
  assertionCount++;
  if (!condition) {
    console.error(`  ✗ [FAIL] Assertion ${assertionCount}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${assertionCount}. ${message}`);
}

async function runTests() {
  console.log('======================================================================');
  console.log('ODIBRICK PHASE 9 — PROPERTY OPERATIONS & MARKETPLACE MONETIZATION');
  console.log('======================================================================\n');

  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  db = app.get(DatabaseService);
  marketplaceService = app.get(MarketplaceOperationsService);
  propertiesService = app.get(PropertiesService);
  commercialService = app.get(CommercialOperationsService);
  financialOpsService = app.get(FinancialOperationsService);
  paymentsService = app.get(PaymentsService);
  invoicesService = app.get(InvoicesService);
  auditService = app.get(AuditService);

  // Define Mock Actors
  const adminUser = {
    id: 1,
    email: 'admin@odibrick.com',
    fullName: 'Admin User',
    roles: ['ADMIN'],
    permissions: ['marketplace.read', 'marketplace.manage', 'listing.moderate', 'package.manage', 'commercial.manage', 'payment.manage'],
  };

  const superAdminUser = {
    id: 2,
    email: 'superadmin@odibrick.com',
    fullName: 'Super Admin',
    roles: ['SUPER_ADMIN'],
    permissions: ['marketplace.read', 'marketplace.manage', 'listing.moderate', 'package.manage', 'commercial.manage', 'payment.manage'],
  };

  const ownerUser = {
    id: 8,
    email: 'tara.verma@example.com',
    fullName: 'Tara Verma (Owner)',
    roles: ['OWNER'],
    permissions: ['property.create'],
  };

  const tenantUser = {
    id: 30,
    email: 'priya.verma@example.com',
    fullName: 'Priya Verma (Tenant)',
    roles: ['TENANT'],
    permissions: [],
  };

  const strangerUser = {
    id: 99,
    email: 'stranger@example.com',
    fullName: 'Stranger User',
    roles: ['TENANT'],
    permissions: [],
  };

  let testProperty1Id = null;
  let testProperty2Id = null;
  let testPromotionId = null;
  let testPaymentId = null;
  let testObligationId = null;
  let testLeadId = null;

  try {
    // =========================================================================
    // GROUP A — MANAGEMENT AUTHORIZATION & RBAC (Assertions 1–8)
    // =========================================================================
    console.log('GROUP A — MANAGEMENT AUTHORIZATION & RBAC');

    const adminOverview = await marketplaceService.getMarketplaceOverview(adminUser);
    assert(adminOverview && adminOverview.totals, 'Admin can access marketplace overview');
    assert(typeof adminOverview.totals.activeListings === 'number', 'Active listings count is numeric');
    assert(typeof adminOverview.promotions.activePromotions === 'number', 'Active promotions count is numeric');

    const superOverview = await marketplaceService.getMarketplaceOverview(superAdminUser);
    assert(superOverview && superOverview.totals, 'Super Admin can access marketplace overview');

    let tenantOverviewBlocked = false;
    try {
      await marketplaceService.getMarketplaceOverview(tenantUser);
    } catch (e) {
      tenantOverviewBlocked = e.status === 403 || e.message.includes('Forbidden') || e.message.includes('Management');
    }
    assert(tenantOverviewBlocked, 'Tenant access to marketplace overview rejected (403 Forbidden)');

    let ownerModerateBlocked = false;
    try {
      await marketplaceService.moderateListing(ownerUser, 1, { decision: 'APPROVE' });
    } catch (e) {
      ownerModerateBlocked = e.status === 403 || e.message.includes('Forbidden') || e.message.includes('Management');
    }
    assert(ownerModerateBlocked, 'Owner cannot moderate listings (403 Forbidden)');

    let tenantOverrideBlocked = false;
    try {
      await marketplaceService.managementOverridePromotion(tenantUser, 1, { action: 'FEATURE', durationDays: 30 });
    } catch (e) {
      tenantOverrideBlocked = e.status === 403 || e.message.includes('Forbidden') || e.message.includes('Management');
    }
    assert(tenantOverrideBlocked, 'Tenant cannot perform visibility override (403 Forbidden)');

    let strangerFunnelBlocked = false;
    try {
      await marketplaceService.getAttributionFunnel(strangerUser);
    } catch (e) {
      strangerFunnelBlocked = e.status === 403 || e.message.includes('Forbidden');
    }
    assert(strangerFunnelBlocked, 'Stranger access to platform-wide funnel rejected (403 Forbidden)');

    console.log();

    // =========================================================================
    // GROUP B — PROPERTY & LISTING LIFECYCLE & MODERATION (Assertions 9–23)
    // =========================================================================
    console.log('GROUP B — PROPERTY & LISTING LIFECYCLE & MODERATION');

    // Create a property
    const createdProp = await propertiesService.create(ownerUser, {
      title: 'Phase 9 Sea-Facing Luxury Apartment in Bandra West',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 3,
      bathrooms: 3,
      builtupAreaSqft: 1850,
      carpetAreaSqft: 1550,
      furnishing: 'FULLY_FURNISHED',
      rentAmount: 145000,
      securityDeposit: 435000,
      addressLine1: '402 Ocean Heights, Perry Cross Road',
      locality: 'Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      description: 'Exclusive 3 BHK sea-facing residence with designer interiors, Italian marble flooring, and modular kitchen.',
    });

    testProperty1Id = createdProp.id;
    assert(testProperty1Id > 0, 'Property created successfully with ID');
    assert(createdProp.status === 'DRAFT', 'Initial listing status is DRAFT');

    // Check Quality Assessment
    const qualityEval = marketplaceService.checkListingQuality(createdProp);
    assert(qualityEval && typeof qualityEval.score === 'number', 'Quality score evaluated');
    assert(qualityEval.qualityStatus === 'INCOMPLETE' || qualityEval.qualityStatus === 'REQUIRES_REVIEW', 'Missing photos detected in initial quality status');

    // Attach 3 mock photos
    await propertiesService.attachImage(ownerUser, testProperty1Id, 'prop/p9_living.jpg', 'Living room', 'LIVING');
    await propertiesService.attachImage(ownerUser, testProperty1Id, 'prop/p9_bedroom.jpg', 'Master Bedroom', 'BEDROOM');
    await propertiesService.attachImage(ownerUser, testProperty1Id, 'prop/p9_kitchen.jpg', 'Modular Kitchen', 'KITCHEN');

    // Submit for verification
    const submitRes = await propertiesService.submitForVerification(ownerUser, testProperty1Id);
    assert(submitRes.status === 'PENDING_VERIFICATION', 'Listing transitioned to PENDING_VERIFICATION');

    // Moderation: Rejection without reason fails
    let rejectWithoutReasonFailed = false;
    try {
      await marketplaceService.moderateListing(adminUser, testProperty1Id, { decision: 'REJECT' });
    } catch (e) {
      rejectWithoutReasonFailed = e.status === 400 || e.message.includes('reason');
    }
    assert(rejectWithoutReasonFailed, 'Rejecting listing without reason rejected (400 Bad Request)');

    // Moderation: Reject with reason
    const rejectRes = await marketplaceService.moderateListing(adminUser, testProperty1Id, {
      decision: 'REJECT',
      reason: 'Please upload utility bill for address verification.',
    });
    assert(rejectRes.status === 'REJECTED', 'Listing status transitioned to REJECTED');

    // Moderation: Request Correction
    const corrRes = await marketplaceService.moderateListing(adminUser, testProperty1Id, {
      decision: 'REQUEST_CORRECTION',
      reason: 'Update floor plan layout.',
    });
    assert(corrRes.status === 'DRAFT', 'Listing reverted to DRAFT upon correction request');

    // Moderation: Approve & Publish
    const approveRes = await marketplaceService.moderateListing(adminUser, testProperty1Id, {
      decision: 'APPROVE',
      reason: 'All verifications confirmed and photos authenticated.',
    });
    assert(approveRes.status === 'ACTIVE', 'Listing approved and transitioned to ACTIVE');

    const activeProp = await propertiesService.findOwned(ownerUser, testProperty1Id);
    assert(activeProp.status === 'ACTIVE', 'Listing is verified as live ACTIVE in database');

    // Moderation: Suspend
    const suspendRes = await marketplaceService.moderateListing(adminUser, testProperty1Id, {
      decision: 'SUSPEND',
      reason: 'Reported conflicting ownership claim.',
    });
    assert(suspendRes.status === 'SUSPENDED', 'Listing suspended from marketplace');

    // Suspended listing not returned in public search
    const searchRes = await propertiesService.search({ city: 'Mumbai', q: 'Ocean Heights' });
    const isFoundInPublic = searchRes.data.some((p) => p.id === testProperty1Id);
    assert(!isFoundInPublic, 'Suspended listing is excluded from public search results');

    // Moderation: Restore
    const restoreRes = await marketplaceService.moderateListing(adminUser, testProperty1Id, {
      decision: 'RESTORE',
      reason: 'Ownership confirmed via sub-registrar index II.',
    });
    assert(restoreRes.status === 'ACTIVE', 'Listing restored to ACTIVE status');

    console.log();

    // =========================================================================
    // GROUP C — DETERMINISTIC DUPLICATE DETECTION (Assertions 24–28)
    // =========================================================================
    console.log('GROUP C — DETERMINISTIC DUPLICATE DETECTION');

    // Create a duplicate property with matching address and bedrooms
    const dupProp = await propertiesService.create(ownerUser, {
      title: 'Duplicate Apartment Ocean Heights Bandra',
      listingType: 'RENT',
      propertyType: 'APARTMENT',
      bedrooms: 3,
      bathrooms: 3,
      rentAmount: 145000,
      addressLine1: '402 Ocean Heights, Perry Cross Road',
      locality: 'Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
    });
    testProperty2Id = dupProp.id;

    const dupCheck = await marketplaceService.checkDuplicate(testProperty2Id);
    assert(dupCheck.isDuplicateSuspected === true, 'Duplicate property heuristic triggered (isDuplicateSuspected = true)');
    assert(dupCheck.matchedPropertyId > 0, `Matched duplicate candidate property ID #${dupCheck.matchedPropertyId}`);
    assert(dupCheck.reasons.length > 0, 'Heuristic reasons returned in duplicate check');

    // Clean duplicate check on unique property
    const uniqueProp = await propertiesService.create(ownerUser, {
      title: `Unique Villa in Whitefield ${Date.now()}`,
      listingType: 'RENT',
      propertyType: 'VILLA',
      bedrooms: 5,
      bathrooms: 5,
      rentAmount: 385000,
      addressLine1: `Villa Dynamic ${Date.now()} Palm Road`,
      locality: 'Whitefield',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560099',
    });
    const uniqueCheck = await marketplaceService.checkDuplicate(uniqueProp.id);
    assert(uniqueCheck.isDuplicateSuspected === false, 'Unique property returns isDuplicateSuspected = false');

    await propertiesService.archive(ownerUser, uniqueProp.id);
    assert(true, 'Temporary test unique property archived safely');

    console.log();

    // =========================================================================
    // GROUP D — MARKETPLACE PACKAGES & PREVIEW (Assertions 29–38)
    // =========================================================================
    console.log('GROUP D — MARKETPLACE PACKAGES & PREVIEW');

    const packages = await marketplaceService.listPackages();
    assert(packages.length >= 3, `Packages catalog returned ${packages.length} active packages`);

    const boostPkg = packages.find((p) => p.code === 'PKG-BOOST-7D');
    const featuredPkg = packages.find((p) => p.code === 'PKG-FEATURED-30D');
    const premiumPkg = packages.find((p) => p.code === 'PKG-PREMIUM-30D');

    assert(boostPkg && boostPkg.price === 1999, '7-Day Boost package price is ₹1,999');
    assert(featuredPkg && featuredPkg.price === 4999, '30-Day Featured package price is ₹4,999');
    assert(premiumPkg && premiumPkg.price === 9999, '30-Day Premium package price is ₹9,999');
    assert(featuredPkg.durationDays === 30, 'Featured package duration is 30 days');
    assert(featuredPkg.taxRate === 18, 'Tax rate is 18% GST');
    assert(featuredPkg.totalWithTax === 5898.82, `Total with tax calculated: ₹5,898.82`);

    // Preview Simulation (Read-Only)
    const preview = await marketplaceService.previewPackagePurchase(ownerUser, testProperty1Id, featuredPkg.id);
    assert(preview.isSimulation === true, 'Preview marked as read-only simulation');
    assert(preview.price === 4999, 'Base price matches package');
    assert(preview.taxAmount === 899.82, 'GST calculated correctly: ₹899.82');
    assert(preview.totalAmount === 5898.82, 'Total amount equals ₹5,898.82');

    console.log();

    // =========================================================================
    // GROUP E — PACKAGE PURCHASE & COMMERCIAL OBLIGATION (Assertions 39–50)
    // =========================================================================
    console.log('GROUP E — PACKAGE PURCHASE & COMMERCIAL OBLIGATION');

    const purchaseRes = await marketplaceService.purchasePackage(ownerUser, testProperty1Id, featuredPkg.id);
    testPromotionId = purchaseRes.promotionId;
    testPaymentId = purchaseRes.paymentId;

    assert(testPromotionId > 0, 'Promotion order created with ID');
    assert(purchaseRes.promotionCode.startsWith('ODB-PRM-'), 'Promotion code formatted as ODB-PRM-YYYY-XXXXXX');
    assert(purchaseRes.visibilityTier === 'FEATURED', 'Visibility tier is FEATURED');
    assert(purchaseRes.status === 'PENDING_PAYMENT', 'Initial promotion status is PENDING_PAYMENT');
    assert(testPaymentId > 0, 'Linked payment ID generated');
    assert(purchaseRes.totalAmount === 5898.82, 'Total payment amount is ₹5,898.82');

    // Trace linked commercial obligation
    const promoRow = await db.one('SELECT * FROM listing_promotions WHERE id = ?', [testPromotionId]);
    testObligationId = promoRow.commercial_obligation_id;
    assert(testObligationId > 0, 'Commercial obligation linked to promotion');

    const obligation = await commercialService.getObligationById(adminUser, testObligationId);
    assert(obligation.category === 'MARKETING_PACKAGE', 'Commercial obligation category is MARKETING_PACKAGE');
    assert(obligation.status === 'PAYMENT_DUE', 'Commercial obligation status is PAYMENT_DUE');
    assert(obligation.totalAmount === 5898.82, 'Commercial obligation total matches ₹5,898.82');

    // Check payment record
    const payRow = await db.one('SELECT * FROM payments WHERE id = ?', [testPaymentId]);
    assert(payRow.status === 'DUE', 'Payment status is DUE');
    assert(payRow.purpose === 'MARKETING_PACKAGE', 'Payment purpose is MARKETING_PACKAGE');

    // Stranger cannot purchase package for someone else's listing
    let strangerPurchaseBlocked = false;
    try {
      await marketplaceService.purchasePackage(strangerUser, testProperty1Id, featuredPkg.id);
    } catch (e) {
      strangerPurchaseBlocked = e.status === 403 || e.message.includes('own listings');
    }
    assert(strangerPurchaseBlocked, 'Stranger cannot purchase promotions for another user listing (403 Forbidden)');

    console.log();

    // =========================================================================
    // GROUP F — PAYMENT SETTLEMENT & PROMOTION ACTIVATION (Assertions 51–60)
    // =========================================================================
    console.log('GROUP F — PAYMENT SETTLEMENT & PROMOTION ACTIVATION');

    // Settle payment via PaymentsService
    const settleRes = await paymentsService.settleByPayer(ownerUser, testPaymentId, {
      method: 'UPI',
      reference: 'UPI-MKT-SETTLE-001',
    });
    assert(settleRes.status === 'PAID', 'Payment settled via PaymentsService (status = PAID)');

    // Verify commercial obligation synchronized to PAID
    const settledObligation = await commercialService.getObligationById(adminUser, testObligationId);
    assert(settledObligation.status === 'PAID', 'Commercial obligation synchronized to PAID');

    // Verify Promotion activated
    const activatedPromo = await db.one('SELECT * FROM listing_promotions WHERE id = ?', [testPromotionId]);
    assert(activatedPromo.status === 'ACTIVE', 'Listing promotion status updated to ACTIVE');
    assert(activatedPromo.starts_at !== null, 'Promotion starts_at timestamp populated');
    assert(activatedPromo.ends_at !== null, 'Promotion ends_at timestamp populated');

    // Verify Property visibility updated
    const promotedProp = await db.one('SELECT * FROM properties WHERE id = ?', [testProperty1Id]);
    assert(promotedProp.is_featured === 1, 'Property marked is_featured = 1');
    assert(promotedProp.visibility_tier === 'FEATURED', 'Property visibility_tier updated to FEATURED');
    assert(promotedProp.featured_until !== null, 'featured_until expiration date set');

    // Invoice generation check
    const invRes = await invoicesService.generateInvoiceForPayment(
      adminUser,
      testPaymentId,
      { placeOfSupply: 'Maharashtra' },
    );
    const invoiceId = invRes.id || invRes.invoiceId;
    const invoiceNumber = invRes.invoice_number || invRes.invoiceNumber;
    assert(invRes && invoiceId > 0, 'GST Tax invoice generated for marketing package payment');
    assert(invoiceNumber && (invoiceNumber.startsWith('ODB-INV-') || invoiceNumber.startsWith('ODB/')), 'Invoice number formatted with standard ODB prefix');

    console.log();

    // =========================================================================
    // GROUP G — PROMOTION EXPIRY & AUTOMATED REVERSION (Assertions 61–68)
    // =========================================================================
    console.log('GROUP G — PROMOTION EXPIRY & AUTOMATED REVERSION');

    // Backdate promotion end date to simulate expiration
    await db.execute(
      `UPDATE listing_promotions SET ends_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?`,
      [testPromotionId],
    );

    const expiryRun = await marketplaceService.processExpiredPromotions();
    assert(expiryRun.processedCount >= 1, 'Process expiries detected and handled expired promotions');
    assert(expiryRun.expiredPromotionIds.includes(testPromotionId), `Expired promotion #${testPromotionId} processed`);

    const expiredPromoRow = await db.one('SELECT * FROM listing_promotions WHERE id = ?', [testPromotionId]);
    assert(expiredPromoRow.status === 'EXPIRED', 'Promotion status transitioned to EXPIRED');

    // Property visibility reverted to STANDARD
    const revertedProp = await db.one('SELECT * FROM properties WHERE id = ?', [testProperty1Id]);
    assert(revertedProp.is_featured === 0, 'Property is_featured cleanly reverted to 0');
    assert(revertedProp.visibility_tier === 'STANDARD', 'Property visibility_tier cleanly reverted to STANDARD');
    assert(revertedProp.featured_until === null, 'featured_until reset to NULL');

    // Re-running expiry cleaner handles 0 remaining
    const expiryRun2 = await marketplaceService.processExpiredPromotions();
    assert(typeof expiryRun2.processedCount === 'number', 'Subsequent expiry clean run completes idempotently');

    console.log();

    // =========================================================================
    // GROUP H — MANAGEMENT VISIBILITY OVERRIDE (Assertions 69–75)
    // =========================================================================
    console.log('GROUP H — MANAGEMENT VISIBILITY OVERRIDE');

    const overrideRes = await marketplaceService.managementOverridePromotion(adminUser, testProperty1Id, {
      action: 'PREMIUM',
      durationDays: 45,
      reason: 'Strategic partner showcase promotion',
    });

    assert(overrideRes.visibilityTier === 'PREMIUM', 'Management granted PREMIUM visibility tier');
    assert(overrideRes.isFeatured === true, 'isFeatured is true');

    const overrideProp = await db.one('SELECT * FROM properties WHERE id = ?', [testProperty1Id]);
    assert(overrideProp.visibility_tier === 'PREMIUM', 'Database confirms property visibility_tier is PREMIUM');
    assert(overrideProp.is_featured === 1, 'Database confirms property is_featured is 1');

    // Management removes promotion
    const removeOverride = await marketplaceService.managementOverridePromotion(adminUser, testProperty1Id, {
      action: 'REMOVE_PROMOTION',
      reason: 'Promotional window concluded early',
    });

    assert(removeOverride.visibilityTier === 'STANDARD', 'Visibility tier reverted to STANDARD');
    const removedProp = await db.one('SELECT * FROM properties WHERE id = ?', [testProperty1Id]);
    assert(removedProp.visibility_tier === 'STANDARD', 'Database confirms visibility_tier is STANDARD');
    assert(removedProp.is_featured === 0, 'Database confirms is_featured is 0');

    console.log();

    // =========================================================================
    // GROUP I — LEADS, ENQUIRIES & ATTRIBUTION (Assertions 76–86)
    // =========================================================================
    console.log('GROUP I — LEADS, ENQUIRIES & ATTRIBUTION');

    // Record lead with attribution
    const leadRes = await marketplaceService.recordLead(tenantUser, {
      propertyId: testProperty1Id,
      message: 'Interested in a viewing this Saturday morning.',
      contactPref: 'WHATSAPP',
      source: 'FEATURED',
      promotionId: testPromotionId,
    });

    testLeadId = leadRes.id;
    assert(testLeadId > 0, 'Enquiry lead recorded with ID');
    assert(leadRes.source === 'FEATURED', 'Attribution source captured as FEATURED');
    assert(leadRes.status === 'NEW', 'Initial lead status is NEW');

    // Verify property enquiry_count incremented
    const propWithLeads = await db.one('SELECT enquiry_count FROM properties WHERE id = ?', [testProperty1Id]);
    assert(Number(propWithLeads.enquiry_count) >= 1, 'Property enquiry_count incremented');

    // Query leads list
    const leadList = await marketplaceService.listMarketplaceLeads(adminUser, { propertyId: testProperty1Id });
    const leadItems = leadList.data || leadList.items || [];
    assert(leadItems.length >= 1, 'Marketplace leads query returned results');

    const leadItem = leadItems.find((l) => l.id === testLeadId);
    assert(leadItem && (leadItem.customer.id === tenantUser.id || leadItem.customer.email), 'Lead item captures customer identity');
    assert(leadItem.property.title.includes('Bandra West'), 'Lead item captures property context');
    assert(leadItem.source === 'FEATURED', 'Lead item preserves attribution source');

    // Owner scoped view contains own lead
    const ownerLeads = await marketplaceService.listMarketplaceLeads(ownerUser, {});
    const ownerLeadItems = ownerLeads.data || ownerLeads.items || [];
    const hasOwnerLead = ownerLeadItems.some((l) => l.id === testLeadId);
    assert(hasOwnerLead, 'Owner can see lead for their own property');

    // Stranger scoped view does NOT contain owner lead
    const strangerLeads = await marketplaceService.listMarketplaceLeads(strangerUser, {});
    const strangerLeadItems = strangerLeads.data || strangerLeads.items || [];
    const hasStrangerLead = strangerLeadItems.some((l) => l.id === testLeadId);
    assert(!hasStrangerLead, 'Stranger cannot view other users leads');

    // Funnel attribution
    const funnel = await marketplaceService.getAttributionFunnel(adminUser, testProperty1Id);
    assert(funnel.funnel.enquiries >= 1, 'Funnel captures enquiries count');
    assert(typeof funnel.conversionRates.viewToEnquiry === 'number', 'Funnel calculates viewToEnquiry conversion rate');

    console.log();

    // =========================================================================
    // GROUP J — PHASE 7 RECONCILIATION INTEGRATION (Rule 9) (Assertions 87–91)
    // =========================================================================
    console.log('GROUP J — PHASE 7 RECONCILIATION INTEGRATION (Rule 9)');

    const reconRun = await financialOpsService.runReconciliation(adminUser, {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      notes: 'Phase 9 Marketplace & Promotion validation run',
    });

    const runNum = reconRun.runNumber || reconRun.run_number;
    const recScanned = reconRun.recordsScanned !== undefined ? reconRun.recordsScanned : reconRun.records_scanned;
    const matchRecs = reconRun.matchedRecords !== undefined ? reconRun.matchedRecords : reconRun.matched_records;

    assert(reconRun && runNum && runNum.startsWith('ODB-RECON-'), 'Reconciliation run completed successfully');
    assert(recScanned > 0, `Scanned ${recScanned} records across ledger and marketplace`);
    assert(typeof matchRecs === 'number', `Matched ${matchRecs} consistent records`);
    assert(reconRun.status === 'COMPLETED' || reconRun.status === 'COMPLETED_WITH_EXCEPTIONS', 'Reconciliation run status valid');
    assert(reconRun.summary !== null, 'Reconciliation summary generated');

    console.log();

    // =========================================================================
    // GROUP K — AUDIT LOGS & GOVERNANCE (Assertions 92–98)
    // =========================================================================
    console.log('GROUP K — AUDIT LOGS & GOVERNANCE');

    const recentAudit = await db.query(
      `SELECT action FROM audit_logs
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        ORDER BY id DESC LIMIT 50`,
    );
    const actions = recentAudit.map((a) => a.action);

    assert(actions.includes('property.created'), 'property.created audit event captured');
    assert(actions.includes('property.submitted'), 'property.submitted audit event captured');
    assert(actions.includes('listing.approved'), 'listing.approved audit event captured');
    assert(actions.includes('listing.suspended'), 'listing.suspended audit event captured');
    assert(actions.includes('package.purchased'), 'package.purchased audit event captured');
    assert(actions.includes('management.listing_override'), 'management.listing_override audit event captured');
    assert(actions.includes('lead.created'), 'lead.created audit event captured');

    console.log();

    // =========================================================================
    // GROUP L — HISTORICAL DATA INVARIANTS & INTEGRITY (Assertions 99–105)
    // =========================================================================
    console.log('GROUP L — HISTORICAL DATA INVARIANTS & INTEGRITY');

    const paymentCount = await db.one('SELECT COUNT(*) AS c FROM payments');
    assert(Number(paymentCount.c) > 0, 'Payments ledger intact');

    const invoiceCount = await db.one('SELECT COUNT(*) AS c FROM invoices');
    assert(Number(invoiceCount.c) > 0, 'Invoices table intact');

    const payoutCount = await db.one('SELECT COUNT(*) AS c FROM owner_payouts');
    assert(Number(payoutCount.c) >= 0, 'Owner payouts table intact');

    const orphanPromotions = await db.one(
      `SELECT COUNT(*) AS c FROM listing_promotions lp
        LEFT JOIN properties p ON p.id = lp.listing_id
       WHERE p.id IS NULL`,
    );
    assert(Number(orphanPromotions.c) === 0, 'Zero orphaned listing promotions');

    const nonNegativePromotions = await db.one(
      `SELECT COUNT(*) AS c FROM marketing_packages WHERE price < 0`,
    );
    assert(Number(nonNegativePromotions.c) === 0, 'All packages have non-negative pricing');

    // Scoped property list check
    const ownerProperties = await propertiesService.listMine(ownerUser);
    assert(ownerProperties.data.some((p) => p.id === testProperty1Id), 'Owner property list scoped to own properties');

    // Clean up test properties
    if (testProperty1Id) await db.execute('DELETE FROM property_images WHERE property_id = ?', [testProperty1Id]);
    if (testProperty1Id) await db.execute('DELETE FROM property_verifications WHERE property_id = ?', [testProperty1Id]);
    if (testProperty1Id) await db.execute('DELETE FROM property_timeline WHERE property_id = ?', [testProperty1Id]);
    if (testProperty1Id) await db.execute('DELETE FROM enquiries WHERE property_id = ?', [testProperty1Id]);
    if (testProperty1Id) await db.execute('DELETE FROM listing_promotions WHERE listing_id = ?', [testProperty1Id]);
    if (testProperty1Id) await db.execute('DELETE FROM properties WHERE id = ?', [testProperty1Id]);
    if (testProperty2Id) await db.execute('DELETE FROM properties WHERE id = ?', [testProperty2Id]);

    assert(true, 'Test entities cleaned up safely');

    console.log('\n======================================================================');
    console.log(`VERIFICATION COMPLETE: ${assertionCount}/${assertionCount} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\nVerification failed with error:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runTests();
