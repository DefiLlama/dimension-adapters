export interface ISafeBoxFeePaidEvent {
  safeBoxFee: bigint;
  safeBoxAmount: bigint;
  collateral: string;
}

export interface ISafeBoxSharePaidEvent {
  safeBoxShare: bigint;
  safeBoxAmount: bigint;
}
