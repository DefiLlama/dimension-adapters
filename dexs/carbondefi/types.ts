interface CarbonAnalyticsItem {
  timestamp: string;
  symbol?: string;
  address?: string;
  fees: number;
  volume: number;
  feesUsd: number;
  volumeUsd: number;
}

export interface CarbonAnalyticsResponse extends Array<CarbonAnalyticsItem> {}
