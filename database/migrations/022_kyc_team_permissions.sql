-- =====================================================================
-- ODIBRICK · 022 · Grant KYC & Document verification permissions to KYC_TEAM
-- Fixes D-06: KYC_TEAM lacks required kyc.verify permission
-- =====================================================================
SET NAMES utf8mb4;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('kyc.verify', 'kyc.manage', 'document.read', 'document.verify', 'document.internal_note')
WHERE r.code = 'KYC_TEAM';
