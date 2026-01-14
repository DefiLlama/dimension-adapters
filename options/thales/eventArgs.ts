export interface ITicketCreatedEvent {
  ticket: string;
  recipient: string;
  buyInAmount: bigint;
  fees: bigint;
  payout: bigint;
  totalQuote: bigint;
  collateral: string;
}
  
export interface IBoughtFromAmmEvent {
  buyer: string;
  market: string;
  position: number;
  amount: bigint;
  sUSDPaid: bigint;
  susd: string;
  asset: string;
}

export interface IChainedMarketCreatedEvent {
  market: string;
  user: string;
  asset: string;
  timeFrame: bigint;
  strikeTime: bigint;
  strikePrice: bigint;
  directions: number[];
  buyinAmount: bigint;
  payoutMultiplier: bigint;
  safeBoxImpact: bigint;
}

export interface ISpeedMarketCreatedEvent {
  market: string;
  user: string;
  asset: string;
  strikeTime: bigint;
  pythPrice: bigint;
  direction: number;
  buyinAmount: bigint;
  safeBoxImpact: bigint;
  lpFeeWithSkew?: bigint;
}

export interface ISafeBoxFeePaidEvent {
  safeBoxFee: bigint;
  safeBoxAmount: bigint;
  collateral: string;
}

export interface ISafeBoxSharePaidEvent {
  safeBoxShare: bigint;
  safeBoxAmount: bigint;
}
  