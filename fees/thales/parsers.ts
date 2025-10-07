import { Balances } from '@defillama/sdk';
import { ISafeBoxFeePaidEvent, ISafeBoxSharePaidEvent } from './eventArgs';

export function parseSafeBoxFeePaidEvent(
  log: ISafeBoxFeePaidEvent,
  dailyRevenue: Balances
) {
  const { safeBoxAmount, collateral } = log;
  dailyRevenue.addToken(collateral, safeBoxAmount);
}

export function parseSafeBoxSharePaidEvent(
  log: ISafeBoxSharePaidEvent,
  contractAddress: string,
  collateralMapping: Record<string, string>,
  dailyLPPerformanceFee: Balances
) {
  const { safeBoxAmount } = log;
  const collateral = collateralMapping[contractAddress.toLowerCase()];
  if (collateral) {
    dailyLPPerformanceFee.addToken(collateral, safeBoxAmount);
  }
}
