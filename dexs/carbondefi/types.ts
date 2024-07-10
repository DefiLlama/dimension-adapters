interface CarbonAnalyticsItem {
  timestamp: string;
  feesymbol: string;
  feeaddress: string;
  tradingfeeamount_real: number;
  tradingfeeamount_usd: number;
  targetsymbol: string;
  targetaddress: string;
  targetamount_real: number;
  targetamount_usd: number;
}

export interface CarbonAnalyticsResponse extends Array<CarbonAnalyticsItem> {}
