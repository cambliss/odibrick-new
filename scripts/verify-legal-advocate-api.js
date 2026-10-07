require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { LegalService } = require('../apps/api/dist/modules/legal/legal.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const legalService = app.get(LegalService);
  const db = app.get(DatabaseService);

  const legalUser = {
    id: 3,
    publicId: '308427B174C5D71CB8E99EEAA3',
    email: 'legal_team@demo.odibrick.test',
    fullName: 'Adv. Shalini Menon',
    roles: ['LEGAL_TEAM'],
    permissions: ['legal.case.manage', 'agreement.draft', 'agreement.approve', 'document.read.any', 'kyc.read', 'dispute.manage', 'property.read.private'],
  };

  const adminUser = {
    id: 1,
    publicId: 'usr_admin_001',
    email: 'super_admin@demo.odibrick.test',
    fullName: 'Odibrick Admin',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    permissions: ['legal.case.manage', 'agreement.draft', 'agreement.approve'],
  };

  console.log('=== 1. VERIFYING LEGAL QUEUE API ===');
  const queue = await legalService.caseQueue(legalUser, undefined, false, 1, 50);
  console.log(`Total queue items: ${queue.data.length}`);
  
  const case1 = queue.data.find(c => c.case_number === 'ODB-LGL-2026-000001');
  const case2 = queue.data.find(c => c.case_number === 'ODB-LGL-2026-000002');
  const case43 = queue.data.find(c => c.case_number === 'ODB-LGL-2026-000043');

  console.log('Case ODB-LGL-2026-000001 in Queue:', {
    case_number: case1?.case_number,
    assigned_to: case1?.assigned_to,
    assignee_name: case1?.assignee_name,
    status: case1?.status
  });

  console.log('Case ODB-LGL-2026-000002 in Queue (Unassigned):', {
    case_number: case2?.case_number,
    assigned_to: case2?.assigned_to,
    assignee_name: case2?.assignee_name,
    status: case2?.status
  });

  console.log('Case ODB-LGL-2026-000043 in Queue:', {
    case_number: case43?.case_number,
    assigned_to: case43?.assigned_to,
    assignee_name: case43?.assignee_name,
    status: case43?.status
  });

  if (case1 && case1.assignee_name !== 'Adv. Shalini Menon') {
    throw new Error(`Expected Adv. Shalini Menon for case 1, got ${case1.assignee_name}`);
  }
  if (case2 && case2.assignee_name !== null) {
    throw new Error(`Expected null for case 2, got ${case2.assignee_name}`);
  }
  if (case43 && case43.assignee_name !== 'Adv. Shalini Menon') {
    throw new Error(`Expected Adv. Shalini Menon for case 43, got ${case43.assignee_name}`);
  }

  console.log('\n=== 2. VERIFYING LEGAL CASE DETAIL API ===');
  const detail1 = await legalService.caseDetail(legalUser, 1);
  console.log('Detail for Case 1:', {
    case_number: detail1.case.case_number,
    assigned_to: detail1.case.assigned_to,
    assignee_name: detail1.case.assignee_name,
    assignee_email: detail1.case.assignee_email,
  });
  if (detail1.case.assignee_name !== 'Adv. Shalini Menon' || detail1.case.assignee_email !== 'legal_team@demo.odibrick.test') {
    throw new Error(`Detail 1 assignee mismatch!`);
  }

  const detail2 = await legalService.caseDetail(legalUser, 2);
  console.log('Detail for Case 2 (Unassigned):', {
    case_number: detail2.case.case_number,
    assigned_to: detail2.case.assigned_to,
    assignee_name: detail2.case.assignee_name,
    assignee_email: detail2.case.assignee_email,
  });
  if (detail2.case.assignee_name !== null) {
    throw new Error(`Detail 2 should be unassigned!`);
  }

  console.log('\n=== 3. VERIFYING ADMIN ACCESS TO LEGAL QUEUE ===');
  const adminQueue = await legalService.caseQueue(adminUser, undefined, false, 1, 10);
  const adminCase1 = adminQueue.data.find(c => c.case_number === 'ODB-LGL-2026-000001');
  console.log('Admin sees Case 1 Assignee:', adminCase1?.assignee_name);
  if (adminCase1.assignee_name !== 'Adv. Shalini Menon') {
    throw new Error(`Admin queue assignee mismatch!`);
  }

  console.log('\n✅ ALL LEGAL ADVOCATE NAME VERIFICATIONS PASSED 100%!');
  await app.close();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
