import { runFrontendProfileLogicTests } from '../../../../web/app/dashboard/profile/profile-logic.spec';

describe('Frontend Profile Logic — Validation, Step 4 Completion & Payload Builder', () => {
  it('validates Tenant, Owner, Agent, and Builder profile rules and builds clean API payloads', () => {
    expect(() => runFrontendProfileLogicTests()).not.toThrow();
  });
});
