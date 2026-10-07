-- Migration 018: Centralized Analytics, Reporting & Business Intelligence Engine
-- Odibrick Phase 16

-- 1. Register RBAC Permissions for Analytics & Reporting
INSERT IGNORE INTO `permissions` (`code`, `resource`, `action`, `description`) VALUES
('analytics.read', 'analytics', 'read', 'View centralized executive analytics, demand funnels, and performance metrics'),
('analytics.manage', 'analytics', 'manage', 'Configure analytics presets, benchmarks, and management dashboards'),
('reports.read', 'reports', 'read', 'View tabular business intelligence reports and operational breakdowns'),
('reports.export', 'reports', 'export', 'Export governed business intelligence reports as CSV');

-- 2. Grant Permissions to SUPER_ADMIN (1) and ADMIN (2)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions` WHERE `code` IN ('analytics.read', 'analytics.manage', 'reports.read', 'reports.export');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, id FROM `permissions` WHERE `code` IN ('analytics.read', 'analytics.manage', 'reports.read', 'reports.export');
