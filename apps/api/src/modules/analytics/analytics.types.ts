export type AnalyticsDateRange =
  | 'TODAY'
  | '7D'
  | '30D'
  | '90D'
  | '6M'
  | '1Y'
  | 'CUSTOM';

export interface DateFilterRange {
  range: AnalyticsDateRange;
  from?: string;
  to?: string;
  startDate: Date;
  endDate: Date;
}

export interface PlatformOverviewKpis {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  activeOwners: number;
  activeTenants: number;
  totalProperties: number;
  activeListings: number;
  pendingVerification: number;
  suspendedListings: number;
  rentedProperties: number;
  averageMonthlyRent: number;
  enquiriesCount: number;
  leadsCount: number;
  visitsCount: number;
  applicationsCount: number;
  activeTenancies: number;
  upcomingMoveIns: number;
  upcomingMoveOuts: number;
  renewalsCount: number;
  closedTenancies: number;
  grossTransactionVolume: number;
  platformRevenue: number;
  pendingReceivables: number;
  overduePayments: number;
  ownerPayouts: number;
  refundsTotal: number;
  openTasks: number;
  criticalTasks: number;
  slaBreaches: number;
  openDisputes: number;
  openMaintenance: number;
  kycPending: number;
  kycVerified: number;
  kycRejected: number;
  expiringDocuments: number;
  expiredDocuments: number;
  automationExecutions: number;
  automationFailures: number;
}

export interface PropertyFunnelMetrics {
  views: number;
  enquiries: number;
  leads: number;
  visits: number;
  applications: number;
  acceptedApplications: number;
  executedAgreements: number;
  activeTenancies: number;
  conversionRates: {
    enquiryToLead: number;
    leadToVisit: number;
    visitToApplication: number;
    applicationToAgreement: number;
    agreementToTenancy: number;
    overallFunnel: number;
  };
}

export interface ListingPerformanceItem {
  propertyId: number;
  title: string;
  city: string;
  monthlyRent: number;
  status: string;
  enquiries: number;
  leads: number;
  visits: number;
  applications: number;
  tenancies: number;
  conversionRate: number;
  promotionPackage: string | null;
  promotionSpend: number;
  attributedRevenue: number;
  createdAt: string;
}

export interface LeadAnalyticsMetrics {
  totalLeads: number;
  byStatus: {
    new: number;
    contacted: number;
    qualified: number;
    visitScheduled: number;
    applicationSubmitted: number;
    converted: number;
    lost: number;
  };
  bySource: {
    organic: number;
    promoted: number;
    featured: number;
    direct: number;
  };
  conversionRate: number;
  slaBreachedCount: number;
  averageAgingDays: number;
  recentTrends: Array<{ date: string; leads: number; converted: number }>;
}

export interface VisitAnalyticsMetrics {
  totalVisits: number;
  requested: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
  noShows: number;
  completionRate: number;
  noShowRate: number;
  cancellationRate: number;
  visitToApplicationRate: number;
  byHost: Array<{ hostId: number; hostName: string; totalVisits: number; completed: number }>;
}

export interface ApplicationAnalyticsMetrics {
  totalApplications: number;
  pending: number;
  underReview: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  acceptanceRate: number;
  rejectionRate: number;
  averageProcessingHours: number;
  applicationToAgreementRate: number;
}

export interface TenancyLifecycleMetrics {
  activeTenancies: number;
  upcomingRenewals: number;
  upcomingMoveIns: number;
  upcomingMoveOuts: number;
  closedTenancies: number;
  averageDurationMonths: number;
  renewalRate: number;
  depositSettlementsPending: number;
  disputesPerTenancyRate: number;
  stageDistribution: Record<string, number>;
}

export interface LegalAnalyticsMetrics {
  totalCases: number;
  queued: number;
  assigned: number;
  inReview: number;
  drafting: number;
  pendingSignatures: number;
  executed: number;
  casesOverdue: number;
  averageResolutionDays: number;
  agreementsDrafted: number;
  agreementsExecuted: number;
  averageExecutionHours: number;
}

export interface FinancialAnalyticsMetrics {
  grossTransactionVolume: number;
  platformRevenue: number;
  revenueByCategory: {
    commission: number;
    serviceFees: number;
    legalFees: number;
    marketingPackages: number;
  };
  directP2PVolume: {
    monthlyRent: number;
    securityDeposit: number;
    advanceRent: number;
  };
  ownerPayoutsTotal: number;
  refundsTotal: number;
  pendingReceivables: number;
  overdueReceivables: number;
  monthlyRevenueSeries: Array<{
    month: string;
    commission: number;
    marketing: number;
    services: number;
    legal: number;
    totalRevenue: number;
    grossVolume: number;
  }>;
}

export interface PaymentPerformanceMetrics {
  totalPayments: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  failedCount: number;
  cancelledCount: number;
  successRate: number;
  overdueRate: number;
  averageDaysOverdue: number;
  escalationCount: number;
  purposeBreakdown: Array<{ purpose: string; count: number; totalAmount: number; paidAmount: number }>;
}

export interface MaintenanceAnalyticsMetrics {
  totalTickets: number;
  open: number;
  inProgress: number;
  completed: number;
  closed: number;
  emergencyCount: number;
  totalCost: number;
  ownerBorneCost: number;
  tenantBorneCost: number;
  sharedCost: number;
  averageResolutionHours: number;
  overdueCount: number;
}

export interface DisputeAnalyticsMetrics {
  totalDisputes: number;
  open: number;
  underReview: number;
  escalatedToLegal: number;
  resolved: number;
  closed: number;
  totalDisputedAmount: number;
  averageResolutionDays: number;
  byCategory: Array<{ category: string; count: number; amount: number }>;
}

export interface ComplianceAnalyticsMetrics {
  totalKycRecords: number;
  kycPending: number;
  kycSubmitted: number;
  kycVerified: number;
  kycRejected: number;
  verificationRate: number;
  totalDocuments: number;
  documentsVerified: number;
  documentsExpiringSoon: number;
  documentsExpired: number;
  complianceExceptionsOpen: number;
}

export interface OperationsAnalyticsMetrics {
  totalTasks: number;
  openTasks: number;
  assignedTasks: number;
  inProgressTasks: number;
  escalatedTasks: number;
  resolvedTasks: number;
  closedTasks: number;
  criticalTasks: number;
  urgentTasks: number;
  slaBreaches: number;
  overdueTasks: number;
  unassignedTasks: number;
  averageResolutionHours: number;
  teamWorkload: Array<{ team: string; total: number; open: number; resolved: number }>;
  domainDistribution: Array<{ domain: string; count: number }>;
}

export interface AutomationAnalyticsMetrics {
  eventsReceived: number;
  workflowsExecuted: number;
  successfulExecutions: number;
  failedExecutions: number;
  pendingRetries: number;
  acknowledgedFailures: number;
  successRate: number;
  failureRate: number;
  eventsByType: Array<{ eventType: string; count: number }>;
}

export interface ReportPayload {
  reportType: string;
  generatedAt: string;
  dateRange: string;
  summary: Record<string, any>;
  columns: Array<{ key: string; header: string }>;
  rows: Array<Record<string, any>>;
  totalRows: number;
}
