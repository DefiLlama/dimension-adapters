export type PoolManagerConfig = {
  DEFAULT_LTV: bigint
  DEFAULT_RECOVERY_LTV: bigint
  DEFAULT_LIQUIDATION_THRESHOLD: bigint
  DEFAULT_BUFFER: bigint
  USDA: string
  FBTC0: string
  FBTC1: string
  FBTCOracle: string
  LiquidationBonusRate: bigint
  BASE_INTEREST_RATE: bigint
  PRIEMIUM_INTEREST_RATE: bigint
}

export type PoolManagerReserveInformation = {
  userAmount: bigint
  collateral: bigint
  debt: bigint
  claimableBTC: bigint
}

export type Reserve = {
  decimals: number
  symbol: string
}
