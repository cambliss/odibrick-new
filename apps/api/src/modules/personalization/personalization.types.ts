export type PropertyType =
  | 'APARTMENT'
  | 'INDEPENDENT_HOUSE'
  | 'VILLA'
  | 'STUDIO'
  | 'PG'
  | 'COMMERCIAL_OFFICE'
  | 'COMMERCIAL_RETAIL'
  | 'WAREHOUSE'
  | 'LAND';

export type FurnishingStatus = 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED';

export type RecommendationCategory =
  | 'FOR_YOU'
  | 'SIMILAR_TO_SAVED'
  | 'SIMILAR_TO_VIEWED'
  | 'NEW_MATCHES'
  | 'TRENDING_IN_AREA';

export type InteractionType =
  | 'VIEW'
  | 'SAVE'
  | 'UNSAVE'
  | 'ENQUIRY'
  | 'VISIT_REQUEST'
  | 'APPLICATION'
  | 'SHARE';

export interface UserPropertyPreferences {
  id?: number;
  userId: number;
  preferredCity?: string | null;
  preferredLocality?: string | null;
  propertyType?: PropertyType | null;
  minBhk?: number | null;
  maxBhk?: number | null;
  minRent?: number | null;
  maxRent?: number | null;
  furnishing?: FurnishingStatus | null;
  preferredAmenities?: string[] | null;
  minCarpetAreaSqft?: number | null;
  preferredLeaseDurationMonths?: number | null;
  moveInTimeframe?: string | null;
  tenantType?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SavedSearch {
  id: number;
  userId: number;
  name: string;
  city?: string | null;
  locality?: string | null;
  propertyType?: string | null;
  minBhk?: number | null;
  maxBhk?: number | null;
  minRent?: number | null;
  maxRent?: number | null;
  furnishing?: string | null;
  amenities?: string[] | null;
  filters?: Record<string, any> | null;
  isAlertEnabled: boolean;
  frequency: 'INSTANT' | 'DAILY' | 'WEEKLY';
  lastAlertedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchResult {
  matchPercentage: number;
  matchedCriteria: string[];
  unmatchedCriteria: string[];
  scoreBreakdown: {
    location: number;
    budget: number;
    bhk: number;
    propertyType: number;
    furnishing: number;
    amenities: number;
  };
}

export interface RecommendationItem {
  property: any;
  category: RecommendationCategory;
  explanation: string;
  matchResult: MatchResult;
}

export interface ProviderActionCentreOverview {
  summary: {
    totalListings: number;
    activeListings: number;
    pendingEnquiries: number;
    unansweredLeads: number;
    upcomingVisits: number;
    pendingApplications: number;
    expiringListings: number;
  };
  pendingEnquiries: any[];
  unansweredLeads: any[];
  upcomingVisits: any[];
  pendingApplications: any[];
  expiringListings: any[];
}

export interface ListingPerformanceMetrics {
  propertyId: number;
  title: string;
  locality: string;
  city: string;
  rentAmount: number;
  status: string;
  viewsCount: number;
  savesCount: number;
  enquiriesCount: number;
  leadsCount: number;
  visitsCount: number;
  applicationsCount: number;
  viewToEnquiryRate: number;
  enquiryToVisitRate: number;
  visitToAppRate: number;
  daysOnMarket: number;
}

export interface AggregateDemandInsights {
  topCities: Array<{ city: string; searchCount: number; preferenceSharePct: number }>;
  topLocalities: Array<{ locality: string; city: string; count: number }>;
  popularBhk: Array<{ bhk: number; count: number; sharePct: number }>;
  budgetDistribution: Array<{ range: string; count: number; sharePct: number }>;
  furnishingPreferences: Array<{ furnishing: string; count: number }>;
  topAmenities: Array<{ amenity: string; demandCount: number }>;
}

export interface CustomerDashboardOverview {
  preferences: UserPropertyPreferences | null;
  savedCount: number;
  savedSearchesCount: number;
  recentViewsCount: number;
  upcomingVisitsCount: number;
  activeApplicationsCount: number;
  recommendations: RecommendationItem[];
  savedProperties: any[];
  recentlyViewed: any[];
  savedSearches: SavedSearch[];
}
