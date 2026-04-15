/** Cost query parameters for cost explorer endpoints. */
export interface CostQueryParams {
  start: string;
  end: string;
  granularity: string;
  accounts?: string[];
  services?: string[];
  regions?: string[];
  tag_filters?: TagFilter[];
}

export interface TagFilter {
  key: string;
  values: string[];
}

/** Summary returned by GET /cost-explorer/summary. */
export interface CostSummary {
  total_cost: number;
  previous_cost: number;
  change_percent: number;
  top_service: CostItem;
  top_account: CostItem;
  currency: string;
  service_count: number;
  account_count: number;
}

export interface CostItem {
  name: string;
  cost: number;
}

/** Breakdown by service, account, or tag. */
export interface CostBreakdown {
  items: CostItem[];
  total: number;
  currency: string;
}

export interface CostTrendPoint {
  date: string;
  total: number;
  services: Record<string, number>;
}

export interface CostTrend {
  points: CostTrendPoint[];
  service_names: string[];
  currency: string;
}

export interface CostDetailRow {
  account: string;
  service: string;
  cost: number;
  currency: string;
}

export interface CostDetails {
  rows: CostDetailRow[];
  total: number;
  currency: string;
}

/** Comprehensive cost report from GET /cost-explorer/comprehensive. */
export interface ComprehensiveCost {
  accounts: AccountCost[];
  total_last_month: number;
  total_this_month: number;
  total_last_7_days: number;
  total_yesterday: number;
  total_day_before: number;
  service_breakdown: ServiceCostRow[];
  region_breakdown: RegionCostRow[];
  tag_breakdown: Record<string, TagCostRow[]>;
  daily_trend: DailyPoint[];
  top_cost_drivers: CostDriver[];
  currency: string;
}

export interface AccountCost {
  account_id: string;
  alias: string;
  last_month: number;
  this_month: number;
  last_7_days: number;
  yesterday: number;
}

export interface ServiceCostRow {
  service: string;
  account: string;
  last_month: number;
  this_month: number;
  last_7_days: number;
  yesterday: number;
}

export interface TagCostRow {
  value: string;
  account: string;
  last_month: number;
  this_month: number;
  last_7_days: number;
  yesterday: number;
}

export interface RegionCostRow {
  region: string;
  account: string;
  this_month: number;
  last_month: number;
}

export interface DailyPoint {
  date: string;
  cost: number;
}

export interface CostDriver {
  service: string;
  this_month: number;
  percentage: number;
  change: number;
}

/** Available filter options from GET /cost-explorer/filters. */
export interface CostFilters {
  accounts: CostAccountInfo[];
  services: string[];
  regions: string[];
  tag_keys: string[];
  tag_values: Record<string, string[]>;
}

export interface CostAccountInfo {
  account_id: string;
  alias: string;
  profile: string;
}
