export type PositionFeeLog = {
  feeUsd: string | number;
};

export type PendingAmountLog = {
  priceType: string | number;
  pendingUsd: string | number;
};

export type CallPutFeeSummary = {
  tradeFeesUsd: number;
  riskPremiumUsd: number;
  feesUsd: number;
  revenueUsd: number;
  supplySideRevenueUsd: number;
};

// Vault and VaultUtils emit USD-denominated values with 1e30 precision.
const PRICE_PRECISION = 1e30;
// IVaultUtils.PriceType enum: MP = 0, RP = 1.
const RISK_PREMIUM_PRICE_TYPE = 1;

function fromPricePrecision(value: string | number): number {
  return Number(value) / PRICE_PRECISION;
}

export function summarizeCallPutFees(
  positionFeeLogs: PositionFeeLog[],
  pendingAmountLogs: PendingAmountLog[],
): CallPutFeeSummary {
  const tradeFeesUsd = positionFeeLogs.reduce(
    (sum, log) => sum + fromPricePrecision(log.feeUsd),
    0,
  );
  const riskPremiumUsd = pendingAmountLogs.reduce(
    (sum, log) =>
      sum +
      (Number(log.priceType) === RISK_PREMIUM_PRICE_TYPE
        ? fromPricePrecision(log.pendingUsd)
        : 0),
    0,
  );

  return {
    tradeFeesUsd,
    riskPremiumUsd,
    feesUsd: tradeFeesUsd + riskPremiumUsd,
    revenueUsd: tradeFeesUsd,
    supplySideRevenueUsd: riskPremiumUsd,
  };
}
