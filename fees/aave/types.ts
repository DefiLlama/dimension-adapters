export type V1Reserve = {
  lifetimeFlashloanDepositorsFee: string
  lifetimeFlashloanProtocolFee: string
  lifetimeOriginationFee: string
  lifetimeDepositorsInterestEarned: string
  priceInUsd: string
  reserve: {
    decimals: number
    symbol: string
  }
}

export type V2Reserve = {
  lifetimeFlashLoanPremium: string
  lifetimeReserveFactorAccrued: string
  lifetimeDepositorsInterestEarned: string
  priceInUsd: string
  reserve: {
    decimals: number
    symbol: string
  }
}

export type V3Reserve = {
  lifetimeFlashLoanLPPremium : string
  lifetimeFlashLoanProtocolPremium: string
  lifetimePortalLPFee: string
  lifetimePortalProtocolFee: string
  // in v3 lifetimeReserveFactorAccrued contains the claimed amount and accruedToTreasury the currently claimable
  // for gas saving it's not automatically transfered to treasury any more
  lifetimeReserveFactorAccrued: string
  accruedToTreasury: string
  lifetimeDepositorsInterestEarned: string
  priceInUsd: string
  reserve: {
    decimals: number
    symbol: string
    underlyingAsset: string;
  }
}
