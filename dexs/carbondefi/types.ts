interface CarbonAnalyticsItem {
  timestamp: string;
  feesUsd: number;
  volumeUsd: number;
}

export interface CarbonAnalyticsResponse extends Array<CarbonAnalyticsItem> {}
