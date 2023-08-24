export interface AnalyticsData {
  positions: Position[];
}

export interface Position {
  state: number;
  type: StrategyType;
  purchaseDate: string;
  amount: number;
  amountUsd: number; // changed from SpotPrice, to amountUsd which is SpotPrice * amount
  premiumPaid: number;
}

export enum StrategyType {
  CALL = "CALL",
  PUT = "PUT",
  STRAP = "STRAP",
  STRIP = "STRIP",
  STRANGLE = "STRANGLE",
  STRADDLE = "STRADDLE",
  LongButterfly = "Long Butterfly",
  LongCondor = "Long Condor",
  BullCallSpread = "Bull Call Spread",
  BullPutSpread = "Bull Put Spread",
  BearPutSpread = "Bear Put Spread",
  BearCallSpread = "Bear Call Spread",
}
